import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import adminHandler from "./api/admin/[...path]";
import publicCoursesHandler from "./api/courses/index";
import publishHandler from "./api/publish";
import courseFeedbackHandler from "./api/course-feedback-submissions/[...path]";
import {
  CORRECTABLE_FIELDS,
  FEEDBACK_ENUM_OPTIONS,
  FEEDBACK_SUBMISSION_TYPES,
  SUPPLEMENTABLE_FIELDS,
  isAllowedStructuredFeedbackValue,
  isFeedbackSubmissionType,
  isMissingFeedbackValue,
  isStructuredFeedbackField,
} from "./src/constants/feedback";
import {
  buildCategoryClarificationMessage,
  fetchCategoryOptionSnapshot,
  hasCategoryIntent,
  inferCategoryFiltersWithAI,
  matchesResolvedCategoryFilters,
  resolveEffectiveCategoryFilters,
  shouldAskForCategoryClarification,
} from "./src/lib/aiCategoryResolver";
import { generateCourseRecommendationText } from "./src/lib/aiCourseRecommendations";
import { normalizeStructuredFeedbackValue } from "./src/lib/utils";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_DAILY_SUBMISSIONS_PER_IP = 20;
const MAX_REVIEWS_PER_COURSE_PER_DAY = 1;
const FEEDBACK_LIST_SELECT = `
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

function getSupabaseServiceClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase credentials not configured");
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

function getClientIp(req: express.Request) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  if (Array.isArray(forwardedFor) && forwardedFor[0]) {
    return forwardedFor[0];
  }
  return req.ip || "unknown";
}

function hashIp(ip: string) {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 3);
}

function sanitizeOptionalString(value: unknown) {
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

async function aggregateApprovedReviews(supabase: any, courseReviewId: number) {
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
    .map((row) => Number(row.rating))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (ratings.length > 0) {
    const average = ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
    updates.overall_score = Number(average.toFixed(1));
  }

  const pros = getTopStrings(
    (feedbackRows || []).flatMap((row) =>
      Array.isArray(row.pros) ? row.pros.map((item) => String(item).trim()).filter(Boolean) : []
    )
  );
  if (pros.length > 0) {
    updates.pros = pros;
  }

  const cons = getTopStrings(
    (feedbackRows || []).flatMap((row) =>
      Array.isArray(row.cons) ? row.cons.map((item) => String(item).trim()).filter(Boolean) : []
    )
  );
  if (cons.length > 0) {
    updates.cons = cons;
  }

  const latestAdvice = (feedbackRows || []).find((row) => typeof row.advice === "string" && row.advice.trim());
  if (latestAdvice?.advice) {
    updates.advice = latestAdvice.advice.trim();
  }

  (Object.keys(FEEDBACK_ENUM_OPTIONS) as StructuredField[]).forEach((field) => {
    const values = (feedbackRows || [])
      .map((row) => row[field])
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (values.length === 0) return;

    const strictMode = getStrictMode(values);
    if (strictMode) {
      updates[field] = strictMode;
    }
  });

  if (Object.keys(updates).length === 0) {
    return;
  }

  const { error: updateError } = await supabase
    .from("course_reviews")
    .update(updates)
    .eq("id", courseReviewId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set("trust proxy", true);
  app.use(express.json());

  app.get("/api/admin/status", (req, res) => {
    req.query.path = ["status"];
    return adminHandler(req, res);
  });
  app.get("/api/admin/courses", (req, res) => {
    req.query.path = ["courses"];
    return adminHandler(req, res);
  });
  app.post("/api/admin/duplicate-check", (req, res) => {
    req.query.path = ["duplicate-check"];
    return adminHandler(req, res);
  });
  app.get("/api/courses", (req, res) => publicCoursesHandler(req, res));

  // API Route for Supabase Publishing (Using Service Role Key)
  app.post("/api/publish", (req, res) => publishHandler(req, res));

  app.post("/api/course-feedback-submissions", async (req, res) => {
    try {
      const { courseReviewId, submissionType } = req.body;

      if (!Number.isInteger(courseReviewId)) {
        return res.status(400).json({ error: "无效课程 ID" });
      }
      if (!isFeedbackSubmissionType(submissionType)) {
        return res.status(400).json({ error: "无效反馈类型" });
      }

      const supabase = getSupabaseServiceClient();
      const ipHash = hashIp(getClientIp(req));
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { count: dailyCount, error: dailyCountError } = await supabase
        .from("course_feedback_submissions")
        .select("id", { count: "exact", head: true })
        .eq("submitter_ip_hash", ipHash)
        .gte("created_at", last24Hours);

      if (dailyCountError) {
        return res.status(400).json({ error: dailyCountError.message });
      }
      if ((dailyCount || 0) >= MAX_DAILY_SUBMISSIONS_PER_IP) {
        return res.status(429).json({ error: "提交过于频繁，请明天再试" });
      }

      const { data: course, error: courseError } = await supabase
        .from("course_reviews")
        .select("id, campus, semester, course_code, assignment, team_project, grading, attendance, exam_count")
        .eq("id", courseReviewId)
        .single();

      if (courseError || !course) {
        return res.status(404).json({ error: "课程不存在" });
      }

      if (submissionType === "review") {
        const rating = req.body.rating === null || typeof req.body.rating === "undefined"
          ? null
          : Number(req.body.rating);
        const pros = sanitizeStringArray(req.body.pros);
        const cons = sanitizeStringArray(req.body.cons);
        const advice = sanitizeOptionalString(req.body.advice);
        const structuredValues: Partial<Record<StructuredField, string>> = {};

        for (const field of Object.keys(FEEDBACK_ENUM_OPTIONS) as StructuredField[]) {
          const fieldValue = req.body[field];
          if (typeof fieldValue === "undefined" || fieldValue === null || fieldValue === "") continue;
          if (!isAllowedStructuredFeedbackValue(field, fieldValue)) {
            return res.status(400).json({ error: `${field} 的值不合法` });
          }
          structuredValues[field] = fieldValue;
        }

        const hasMeaningfulContent =
          (rating !== null && Number.isFinite(rating) && rating > 0) ||
          pros.length > 0 ||
          cons.length > 0 ||
          Boolean(advice) ||
          Object.keys(structuredValues).length > 0;

        if (!hasMeaningfulContent) {
          return res.status(400).json({ error: "请至少填写一项有效内容" });
        }
        if (rating !== null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) {
          return res.status(400).json({ error: "评分必须在 1 到 5 之间" });
        }

        const { count: reviewCount, error: reviewCountError } = await supabase
          .from("course_feedback_submissions")
          .select("id", { count: "exact", head: true })
          .eq("submitter_ip_hash", ipHash)
          .eq("course_review_id", courseReviewId)
          .eq("submission_type", "review")
          .gte("created_at", last24Hours);

        if (reviewCountError) {
          return res.status(400).json({ error: reviewCountError.message });
        }
        if ((reviewCount || 0) >= MAX_REVIEWS_PER_COURSE_PER_DAY) {
          return res.status(429).json({ error: "同一门课当天只能提交一次评价" });
        }

        const insertPayload = {
          course_review_id: courseReviewId,
          submission_type: submissionType,
          status: "pending",
          submitter_ip_hash: ipHash,
          rating,
          pros: pros.length > 0 ? pros : null,
          cons: cons.length > 0 ? cons : null,
          advice,
          assignment: structuredValues.assignment || null,
          team_project: structuredValues.team_project || null,
          grading: structuredValues.grading || null,
          attendance: structuredValues.attendance || null,
          exam_count: structuredValues.exam_count || null,
          field_name: null,
          current_value_snapshot: null,
          proposed_value: null,
        };

        const { error: insertError } = await supabase
          .from("course_feedback_submissions")
          .insert(insertPayload);

        if (insertError) {
          return res.status(400).json({ error: insertError.message });
        }

        return res.json({ success: true, message: "已提交，等待审核" });
      }

      const { fieldName, proposedValue } = req.body;

      if (!isStructuredFeedbackField(fieldName)) {
        return res.status(400).json({ error: "无效字段" });
      }
      if (!isAllowedStructuredFeedbackValue(fieldName, proposedValue)) {
        return res.status(400).json({ error: "提交的值不在允许范围内" });
      }
      if (submissionType === "supplement" && !SUPPLEMENTABLE_FIELDS.includes(fieldName)) {
        return res.status(400).json({ error: "该字段不允许补充" });
      }
      if (submissionType === "correction" && !CORRECTABLE_FIELDS.includes(fieldName)) {
        return res.status(400).json({ error: "该字段不允许更正" });
      }

      const rawCurrentValue = course[fieldName];
      const normalizedCurrentValue = normalizeStructuredFeedbackValue(fieldName, typeof rawCurrentValue === "string" ? rawCurrentValue : null);

      if (submissionType === "supplement" && !isMissingFeedbackValue(normalizedCurrentValue)) {
        return res.status(400).json({ error: "该字段当前不是缺失状态，不能补充" });
      }
      if (submissionType === "correction" && isMissingFeedbackValue(normalizedCurrentValue)) {
        return res.status(400).json({ error: "缺失字段请使用补充信息，而不是更正信息" });
      }
      if (normalizedCurrentValue === proposedValue) {
        return res.status(400).json({ error: "新值与当前值相同，无需提交" });
      }

      const { count: fieldSubmissionCount, error: fieldSubmissionCountError } = await supabase
        .from("course_feedback_submissions")
        .select("id", { count: "exact", head: true })
        .eq("submitter_ip_hash", ipHash)
        .eq("course_review_id", courseReviewId)
        .eq("field_name", fieldName)
        .in("submission_type", ["supplement", "correction"])
        .gte("created_at", last7Days);

      if (fieldSubmissionCountError) {
        return res.status(400).json({ error: fieldSubmissionCountError.message });
      }
      if ((fieldSubmissionCount || 0) > 0) {
        return res.status(429).json({ error: "同一字段 7 天内只能提交一次" });
      }

      const { error: insertError } = await supabase
        .from("course_feedback_submissions")
        .insert({
          course_review_id: courseReviewId,
          submission_type: submissionType,
          status: "pending",
          submitter_ip_hash: ipHash,
          rating: null,
          pros: null,
          cons: null,
          advice: null,
          assignment: null,
          team_project: null,
          grading: null,
          attendance: null,
          exam_count: null,
          field_name: fieldName,
          current_value_snapshot: isMissingFeedbackValue(normalizedCurrentValue) ? null : normalizedCurrentValue,
          proposed_value: proposedValue,
        });

      if (insertError) {
        return res.status(400).json({ error: insertError.message });
      }

      return res.json({ success: true, message: "已提交，等待审核" });
    } catch (error) {
      console.error("Course feedback submit error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.post("/api/course-feedback-submissions", (req, res) => {
    req.query.path = undefined;
    return courseFeedbackHandler(req, res);
  });
  app.post("/api/course-feedback-submissions/admin/list", (req, res) => {
    req.query.path = ["admin", "list"];
    return courseFeedbackHandler(req, res);
  });
  app.post("/api/course-feedback-submissions/admin/review", (req, res) => {
    req.query.path = ["admin", "review"];
    return courseFeedbackHandler(req, res);
  });

  // API Route for AI Chat (Matches Vercel logic)
  app.post("/api/chat", async (req, res) => {
    try {
      const {
        message,
        campus,
        semester,
        selectedCategoryTop,
        selectedCategoryCollege,
        selectedCategoryDepartment,
        selectedCategoryLeaf,
      } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: "Missing required environment variables" });
      }
      if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "Invalid message" });
      }
      if (typeof campus !== 'undefined' && campus !== 's' && campus !== 'e') {
        return res.status(400).json({ error: "Invalid campus. Use s or e." });
      }

      const resolvedCampus = campus === 's' || campus === 'e' ? campus : 'e';
      const resolvedSemester = typeof semester === 'string' && semester.trim() ? semester.trim() : '2026-1';
      const campusName = resolvedCampus === 's' ? '首尔校区' : 'ERICA 校区';

      const ai = new GoogleGenAI({ apiKey });
      const supabase = getSupabaseServiceClient();
      const model = "gemini-3.1-flash-lite-preview";

      let effectiveFilters = {
        selectedCategoryTop: selectedCategoryTop || null,
        selectedCategoryCollege: selectedCategoryCollege || null,
        selectedCategoryDepartment: selectedCategoryDepartment || null,
        selectedCategoryLeaf: selectedCategoryLeaf || null,
      };

      if (hasCategoryIntent(message, effectiveFilters)) {
        const categoryOptions = await fetchCategoryOptionSnapshot(supabase, resolvedCampus, resolvedSemester);
        const inferredFilters = await inferCategoryFiltersWithAI(ai, message, categoryOptions);
        effectiveFilters = resolveEffectiveCategoryFilters(effectiveFilters, inferredFilters);

        if (shouldAskForCategoryClarification(message, {
          selectedCategoryTop,
          selectedCategoryCollege,
          selectedCategoryDepartment,
          selectedCategoryLeaf,
        }, inferredFilters, effectiveFilters)) {
          return res.json({ text: buildCategoryClarificationMessage() });
        }
      }

      const embeddingResult = await ai.models.embedContent({
        model: "gemini-embedding-2-preview",
        contents: message,
        config: { outputDimensionality: 768 },
      });
      const queryEmbedding = embeddingResult.embeddings?.[0]?.values;

      if (!queryEmbedding) {
        return res.status(500).json({ error: "Failed to generate embedding for the query" });
      }

      const { data: matchedCourses, error: matchError } = await supabase.rpc("match_courses", {
        query_embedding: queryEmbedding,
        match_threshold: 0.2,
        match_count: 16,
        filter_campus: resolvedCampus,
        filter_semester: resolvedSemester,
        filter_category_top: effectiveFilters.selectedCategoryTop,
        filter_category_colleges: effectiveFilters.selectedCategoryCollege ? [effectiveFilters.selectedCategoryCollege] : null,
        filter_category_departments: effectiveFilters.selectedCategoryDepartment ? [effectiveFilters.selectedCategoryDepartment] : null,
        filter_category_leaves: effectiveFilters.selectedCategoryLeaf ? [effectiveFilters.selectedCategoryLeaf] : null,
      });

      if (matchError) {
        console.error("Supabase RPC Error:", matchError);
        const hint = matchError.message.includes("match_courses")
          ? "match_courses 函数可能还是旧版本，请把新的 supabase_setup.sql 里的函数定义重新执行一次。"
          : "Failed to retrieve matching courses";
        return res.status(500).json({ error: hint });
      }

      const strictlyMatchedCourses = (matchedCourses || []).filter((course: any) =>
        matchesResolvedCategoryFilters(course, effectiveFilters),
      );

      const text = await generateCourseRecommendationText({
        ai,
        model,
        campusName,
        semester: resolvedSemester,
        message,
        filters: effectiveFilters,
        courses: strictlyMatchedCourses,
      });

      res.json({ text });
    } catch (error) {
      console.error("Local API Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
