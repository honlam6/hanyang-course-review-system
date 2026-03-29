import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  FEEDBACK_ENUM_OPTIONS,
  isMissingFeedbackValue,
  type StructuredFeedbackField,
} from "../src/constants/feedback.js";
import { normalizeStructuredFeedbackValue } from "../src/lib/utils.js";

export const MAX_DAILY_SUBMISSIONS_PER_IP = 20;
export const MAX_REVIEWS_PER_COURSE_PER_DAY = 1;
export const FEEDBACK_LIST_SELECT = `
  id,
  course_review_id,
  submission_type,
  status,
  created_at,
  reviewed_at,
  review_note,
  rating,
  pros,
  cons,
  advice,
  assignment,
  team_project,
  grading,
  attendance,
  exam_count,
  field_name,
  current_value_snapshot,
  proposed_value,
  course_reviews (
    id,
    course_name,
    professor,
    campus,
    semester,
    course_code,
    assignment,
    team_project,
    grading,
    attendance,
    exam_count
  )
`;

type StructuredField = keyof typeof FEEDBACK_ENUM_OPTIONS;

export function getSupabaseServiceClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export function getClientIp(req: any) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  if (Array.isArray(forwardedFor) && forwardedFor[0]) {
    return forwardedFor[0];
  }
  return req.socket?.remoteAddress || "unknown";
}

export function hashIp(ip: string) {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

export function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 3);
}

export function sanitizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getTopStrings(values: string[]) {
  const counts = new Map<string, { count: number; firstSeen: number }>();
  values.forEach((value, index) => {
    const current = counts.get(value);
    if (current) {
      current.count += 1;
      return;
    }
    counts.set(value, { count: 1, firstSeen: index });
  });

  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1].count !== a[1].count) return b[1].count - a[1].count;
      return a[1].firstSeen - b[1].firstSeen;
    })
    .slice(0, 3)
    .map(([value]) => value);
}

function getStrictMode(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return null;
  return sorted[0][0];
}

export async function aggregateApprovedReviews(supabase: any, courseReviewId: number) {
  const { data: feedbackRows, error } = await supabase
    .from("course_feedback_submissions")
    .select("rating, pros, cons, advice, assignment, team_project, grading, attendance, exam_count, created_at")
    .eq("course_review_id", courseReviewId)
    .eq("submission_type", "review")
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const updates: Record<string, unknown> = {};
  const ratings = (feedbackRows || [])
    .map((row: any) => Number(row.rating))
    .filter((value: number) => Number.isFinite(value) && value > 0);

  if (ratings.length > 0) {
    const average = ratings.reduce((sum: number, value: number) => sum + value, 0) / ratings.length;
    updates.overall_score = Number(average.toFixed(1));
  }

  const pros = getTopStrings(
    (feedbackRows || []).flatMap((row: any) =>
      Array.isArray(row.pros) ? row.pros.map((item: any) => String(item).trim()).filter(Boolean) : []
    )
  );
  if (pros.length > 0) {
    updates.pros = pros;
  }

  const cons = getTopStrings(
    (feedbackRows || []).flatMap((row: any) =>
      Array.isArray(row.cons) ? row.cons.map((item: any) => String(item).trim()).filter(Boolean) : []
    )
  );
  if (cons.length > 0) {
    updates.cons = cons;
  }

  const latestAdvice = (feedbackRows || []).find((row: any) => typeof row.advice === "string" && row.advice.trim());
  if (latestAdvice?.advice) {
    updates.advice = latestAdvice.advice.trim();
  }

  (Object.keys(FEEDBACK_ENUM_OPTIONS) as StructuredField[]).forEach((field) => {
    const values = (feedbackRows || [])
      .map((row: any) => row[field])
      .filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0);
    if (values.length === 0) return;

    const strictMode = getStrictMode(values);
    if (strictMode) {
      updates[field] = strictMode;
    }
  });

  if (Object.keys(updates).length === 0) {
    return;
  }

  const { error: updateError } = await supabase.from("course_reviews").update(updates).eq("id", courseReviewId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

export function normalizeCurrentValue(fieldName: StructuredFeedbackField, rawCurrentValue: unknown) {
  return normalizeStructuredFeedbackValue(
    fieldName,
    typeof rawCurrentValue === "string" ? rawCurrentValue : null
  );
}

export function toCurrentValueSnapshot(value: string | null) {
  return isMissingFeedbackValue(value) ? null : value;
}
