import { DEFAULT_SEMESTER, type CampusCode } from "../src/constants/campus.js";
import { fetchCategoryOptionSnapshot } from "../src/lib/aiCategoryResolver.js";
import { getSupabaseServiceClient } from "./_feedbackCore.js";

const SEARCH_FIELDS = ["course_name", "course_code", "professor", "advice"] as const;
const DEFAULT_PUBLIC_PAGE_SIZE = 120;
const DEFAULT_ADMIN_PAGE_SIZE = 120;
const MAX_PAGE_SIZE = 200;

export function isCampusCode(value: unknown): value is CampusCode {
  return value === "s" || value === "e";
}

export function normalizePage(value: unknown) {
  const page = Number(value);
  if (!Number.isFinite(page) || page <= 0) return 1;
  return Math.floor(page);
}

export function normalizePageSize(value: unknown, fallback = DEFAULT_PUBLIC_PAGE_SIZE) {
  const pageSize = Number(value);
  if (!Number.isFinite(pageSize) || pageSize <= 0) {
    return fallback;
  }

  return Math.min(MAX_PAGE_SIZE, Math.floor(pageSize));
}

export function resolveSemester(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_SEMESTER;
}

export function parseIdList(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return [];

  return value
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isInteger(entry) && entry > 0);
}

async function searchCourses({
  campus,
  semester,
  query,
  rangeEnd,
}: {
  campus: CampusCode;
  semester: string;
  query: string;
  rangeEnd: number;
}) {
  const supabase = getSupabaseServiceClient();
  const pattern = `%${query}%`;
  const resultSets = await Promise.all(
    SEARCH_FIELDS.map((field) =>
      supabase
        .from("course_reviews")
        .select("*")
        .eq("campus", campus)
        .eq("semester", semester)
        .ilike(field, pattern)
        .order("overall_score", { ascending: false })
        .order("created_at", { ascending: false })
        .range(0, rangeEnd),
    ),
  );

  const merged = resultSets.flatMap((result) => {
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result.data || [];
  });

  return Array.from(new Map(merged.map((item) => [item.id, item])).values());
}

export async function loadPublicCourses({
  campus,
  semester,
  page,
  pageSize,
  query,
}: {
  campus: CampusCode;
  semester: string;
  page: number;
  pageSize: number;
  query: string;
}) {
  const supabase = getSupabaseServiceClient();
  const trimmedQuery = query.trim();
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  if (trimmedQuery) {
    const searched = await searchCourses({
      campus,
      semester,
      query: trimmedQuery,
      rangeEnd: Math.max(end + pageSize, DEFAULT_PUBLIC_PAGE_SIZE),
    });

    return {
      items: searched.slice(start, end + 1),
      total: searched.length,
      hasMore: searched.length > end + 1,
    };
  }

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    supabase
      .from("course_reviews")
      .select("*")
      .eq("campus", campus)
      .eq("semester", semester)
      .order("overall_score", { ascending: false })
      .order("created_at", { ascending: false })
      .range(start, end),
    supabase
      .from("course_reviews")
      .select("id", { count: "exact", head: true })
      .eq("campus", campus)
      .eq("semester", semester),
  ]);

  if (error) {
    throw new Error(error.message);
  }
  if (countError) {
    throw new Error(countError.message);
  }

  return {
    items: data || [],
    total: count || 0,
    hasMore: Number(count || 0) > page * pageSize,
  };
}

export async function loadCoursesByIds({
  campus,
  semester,
  ids,
}: {
  campus: CampusCode;
  semester: string;
  ids: number[];
}) {
  if (ids.length === 0) {
    return [];
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("course_reviews")
    .select("*")
    .eq("campus", campus)
    .eq("semester", semester)
    .in("id", ids);

  if (error) {
    throw new Error(error.message);
  }

  const byId = new Map((data || []).map((item) => [Number(item.id), item]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function loadAdminCourses({
  page,
  pageSize,
  query,
}: {
  page: number;
  pageSize: number;
  query: string;
}) {
  const supabase = getSupabaseServiceClient();
  const trimmedQuery = query.trim();
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  if (trimmedQuery) {
    const pattern = `%${trimmedQuery}%`;
    const results = await Promise.all([
      supabase.from("course_reviews").select("*").ilike("course_name", pattern),
      supabase.from("course_reviews").select("*").ilike("course_code", pattern),
      supabase.from("course_reviews").select("*").ilike("professor", pattern),
    ]);

    const merged = results.flatMap((result) => {
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data || [];
    });

    const items = Array.from(new Map(merged.map((item) => [item.id, item])).values()).sort((left, right) => {
      const leftCreatedAt = left.created_at || "";
      const rightCreatedAt = right.created_at || "";
      return rightCreatedAt.localeCompare(leftCreatedAt);
    });

    return {
      items,
      total: items.length,
      hasMore: false,
    };
  }

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    supabase
      .from("course_reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .range(start, end),
    supabase
      .from("course_reviews")
      .select("id", { count: "exact", head: true }),
  ]);

  if (error) {
    throw new Error(error.message);
  }
  if (countError) {
    throw new Error(countError.message);
  }

  return {
    items: data || [],
    total: count || 0,
    hasMore: Number(count || 0) > page * pageSize,
  };
}

export async function loadCategorySnapshot(campus: CampusCode, semester: string) {
  const supabase = getSupabaseServiceClient();
  return fetchCategoryOptionSnapshot(supabase, campus, semester);
}

export const courseCoreDefaults = {
  DEFAULT_ADMIN_PAGE_SIZE,
  DEFAULT_PUBLIC_PAGE_SIZE,
};
