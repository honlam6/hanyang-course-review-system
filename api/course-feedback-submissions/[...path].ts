import {
  CORRECTABLE_FIELDS,
  FEEDBACK_ENUM_OPTIONS,
  FEEDBACK_SUBMISSION_TYPES,
  SUPPLEMENTABLE_FIELDS,
  isAllowedStructuredFeedbackValue,
  isFeedbackSubmissionType,
  isMissingFeedbackValue,
  isStructuredFeedbackField,
} from "../../src/constants/feedback.js";
import {
  FEEDBACK_LIST_SELECT,
  MAX_DAILY_SUBMISSIONS_PER_IP,
  MAX_REVIEWS_PER_COURSE_PER_DAY,
  aggregateApprovedReviews,
  getClientIp,
  getSupabaseServiceClient,
  hashIp,
  normalizeCurrentValue,
  sanitizeOptionalString,
  sanitizeStringArray,
  toCurrentValueSnapshot,
} from "../_feedbackCore.js";
import { requireAdminRequest } from "../_auth.js";

type StructuredField = keyof typeof FEEDBACK_ENUM_OPTIONS;

function getPathSegments(req: any) {
  const value = req.query?.path;
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return [value];

  const rawPath = typeof req.path === "string"
    ? req.path
    : typeof req.url === "string"
      ? req.url.split("?")[0]
      : "";
  const segments = rawPath
    .split("/")
    .filter(Boolean);

  const feedbackIndex = segments.lastIndexOf("course-feedback-submissions");
  if (feedbackIndex >= 0) {
    return segments.slice(feedbackIndex + 1);
  }

  return [];
}

async function handleSubmit(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

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
    const rating = req.body.rating === null || typeof req.body.rating === "undefined" ? null : Number(req.body.rating);
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

    const { error: insertError } = await supabase.from("course_feedback_submissions").insert({
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
    });

    if (insertError) {
      return res.status(400).json({ error: insertError.message });
    }

    return res.status(200).json({ success: true, message: "已提交，等待审核" });
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

  const normalizedCurrentValue = normalizeCurrentValue(fieldName, course[fieldName]);

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

  const { error: insertError } = await supabase.from("course_feedback_submissions").insert({
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
    current_value_snapshot: toCurrentValueSnapshot(normalizedCurrentValue),
    proposed_value: proposedValue,
  });

  if (insertError) {
    return res.status(400).json({ error: insertError.message });
  }

  return res.status(200).json({ success: true, message: "已提交，等待审核" });
}

async function handleAdminList(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const adminContext = await requireAdminRequest(req, res);
  if (!adminContext) return;

  const { status, submissionType, query } = req.body;

  const supabase = getSupabaseServiceClient();
  let feedbackQuery = supabase
    .from("course_feedback_submissions")
    .select(FEEDBACK_LIST_SELECT)
    .order("created_at", { ascending: false })
    .limit(300);

  if (typeof status === "string" && status !== "all") {
    feedbackQuery = feedbackQuery.eq("status", status);
  }
  if (typeof submissionType === "string" && submissionType !== "all" && FEEDBACK_SUBMISSION_TYPES.includes(submissionType as never)) {
    feedbackQuery = feedbackQuery.eq("submission_type", submissionType);
  }

  const { data, error } = await feedbackQuery;
  if (error) {
    return res.status(400).json({ error: error.message });
  }

  const normalizedQuery = typeof query === "string" ? query.trim().toLowerCase() : "";
  const filtered = normalizedQuery
    ? (data || []).filter((item: any) => {
        const course = item.course_reviews || {};
        return [course.course_name, course.professor, course.course_code, item.field_name, item.proposed_value]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));
      })
    : data || [];

  return res.status(200).json({ success: true, data: filtered });
}

async function handleAdminReview(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const adminContext = await requireAdminRequest(req, res);
  if (!adminContext) return;

  const { submissionId, action, reviewNote } = req.body;
  if (!Number.isInteger(submissionId)) {
    return res.status(400).json({ error: "无效反馈 ID" });
  }
  if (action !== "approve" && action !== "reject") {
    return res.status(400).json({ error: "无效审核动作" });
  }

  const supabase = getSupabaseServiceClient();
  const { data: feedback, error: feedbackError } = await supabase
    .from("course_feedback_submissions")
    .select(FEEDBACK_LIST_SELECT)
    .eq("id", submissionId)
    .single();

  if (feedbackError || !feedback) {
    return res.status(404).json({ error: "反馈不存在" });
  }
  if (feedback.status !== "pending") {
    return res.status(400).json({ error: "该反馈已经处理过了" });
  }

  if (action === "reject") {
    const { error: rejectError } = await supabase
      .from("course_feedback_submissions")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        review_note: sanitizeOptionalString(reviewNote),
      })
      .eq("id", submissionId);

    if (rejectError) {
      return res.status(400).json({ error: rejectError.message });
    }

    return res.status(200).json({ success: true });
  }

  if (feedback.submission_type === "review") {
    const { error: approveError } = await supabase
      .from("course_feedback_submissions")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        review_note: sanitizeOptionalString(reviewNote),
      })
      .eq("id", submissionId);

    if (approveError) {
      return res.status(400).json({ error: approveError.message });
    }

    await aggregateApprovedReviews(supabase, Number(feedback.course_review_id));
    return res.status(200).json({ success: true });
  }

  if (!isStructuredFeedbackField(feedback.field_name) || !feedback.proposed_value) {
    return res.status(400).json({ error: "反馈字段不完整，无法通过" });
  }

  const { error: courseUpdateError } = await supabase
    .from("course_reviews")
    .update({ [feedback.field_name]: feedback.proposed_value })
    .eq("id", feedback.course_review_id);

  if (courseUpdateError) {
    return res.status(400).json({ error: courseUpdateError.message });
  }

  const { error: approveError } = await supabase
    .from("course_feedback_submissions")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      review_note: sanitizeOptionalString(reviewNote),
    })
    .eq("id", submissionId);

  if (approveError) {
    return res.status(400).json({ error: approveError.message });
  }

  return res.status(200).json({ success: true });
}

export default async function handler(req: any, res: any) {
  try {
    const segments = getPathSegments(req);

    if (segments.length === 0) {
      return await handleSubmit(req, res);
    }
    if (segments[0] === "admin" && segments[1] === "list") {
      return await handleAdminList(req, res);
    }
    if (segments[0] === "admin" && segments[1] === "review") {
      return await handleAdminReview(req, res);
    }

    return res.status(404).json({ error: "Not Found" });
  } catch (error: any) {
    console.error("Course feedback catch-all error:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
