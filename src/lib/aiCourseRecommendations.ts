import { buildAppliedCategorySummary, type CategoryFilters } from "./aiCategoryResolver";

type RecommendationCourse = {
  course_code?: string | null;
  course_name?: string | null;
  professor?: string | null;
  overall_score?: number | string | null;
  class_time?: string | null;
  classroom?: string | null;
  grade_and_credit?: string | null;
  course_type?: string | null;
  assignment?: string | null;
  team_project?: string | null;
  grading?: string | null;
  attendance?: string | null;
  exam_count?: string | null;
  advice?: string | null;
};

type StructuredRecommendation = {
  course_code?: string | null;
  reason?: string | null;
  fit?: string | null;
  caveat?: string | null;
};

type StructuredResponse = {
  summary?: string | null;
  recommendations?: StructuredRecommendation[] | null;
  closing_tip?: string | null;
};

type GenerateRecommendationTextParams = {
  ai: any;
  model: string;
  campusName: string;
  semester: string;
  message: string;
  filters: CategoryFilters;
  courses: RecommendationCourse[];
};

function sanitize(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeText(value: unknown, fallback = "未提供"): string {
  const text = sanitize(value);
  return text || fallback;
}

function sanitizeScore(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(1);
  }
  const text = sanitize(value);
  return text || "暂无";
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

function pickCourseContext(course: RecommendationCourse) {
  return {
    course_code: sanitize(course.course_code),
    course_name: sanitize(course.course_name),
    professor: sanitize(course.professor),
    overall_score: sanitizeScore(course.overall_score),
    class_time: sanitizeText(course.class_time),
    classroom: sanitizeText(course.classroom),
    grade_and_credit: sanitizeText(course.grade_and_credit),
    course_type: sanitizeText(course.course_type),
    assignment: sanitizeText(course.assignment),
    team_project: sanitizeText(course.team_project),
    grading: sanitizeText(course.grading),
    attendance: sanitizeText(course.attendance),
    exam_count: sanitizeText(course.exam_count),
    advice: sanitizeText(course.advice, ""),
  };
}

function buildStructuredPrompt(params: GenerateRecommendationTextParams, shortlist: ReturnType<typeof pickCourseContext>[]) {
  return `
你是一个汉阳大学 ${params.campusName} 的资深 AI 选课助手。
当前学期是 ${params.semester}。
实际生效的分类过滤条件：${buildAppliedCategorySummary(params.filters)}。

你只能从下面这批候选课里选择，不允许提及任何列表外的课程。

候选课程：
${JSON.stringify(shortlist, null, 2)}

用户问题：
"${params.message}"

请只返回 JSON 对象，不要返回 Markdown，不要返回额外说明。
JSON 结构固定为：
{
  "summary": "先给一句总体建议",
  "recommendations": [
    {
      "course_code": "必须来自候选课程",
      "reason": "为什么推荐",
      "fit": "适合什么诉求",
      "caveat": "注意点，没有就写空字符串"
    }
  ],
  "closing_tip": "最后给一句选课建议"
}

要求：
1. recommendations 最多 5 门。
2. course_code 必须严格取自候选课程。
3. 优先结合评分、作业、小组项目、考勤、考试次数和 advice。
4. 如果候选课里没有足够适合的课，也要基于候选课回答，不得编造课程。
`;
}

function renderMarkdown(
  campusName: string,
  semester: string,
  filters: CategoryFilters,
  summary: string,
  recommendations: Array<{ course: ReturnType<typeof pickCourseContext>; reason: string; fit: string; caveat: string }>,
  closingTip: string,
) {
  const lines: string[] = [];

  lines.push(`**范围**：${buildAppliedCategorySummary(filters)}`);
  lines.push("");
  lines.push(summary || `以下推荐都严格来自 ${campusName} ${semester} 当前筛选范围内的课程。`);
  lines.push("");

  lines.push("| 课程 | 教授 | 评分 | 时间 | 推荐理由 | 注意点 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const item of recommendations) {
    const courseLabel = escapeTableCell(`${item.course.course_name}（${item.course.course_code}）`);
    const professor = escapeTableCell(item.course.professor);
    const score = escapeTableCell(item.course.overall_score);
    const time = escapeTableCell(item.course.class_time);
    const reason = escapeTableCell(item.reason || item.fit || "符合当前筛选条件");
    const caveat = escapeTableCell(item.caveat || "无明显额外注意点");
    lines.push(`| ${courseLabel} | ${professor} | ${score} | ${time} | ${reason} | ${caveat} |`);
  }

  if (closingTip) {
    lines.push("");
    lines.push(`**建议**：${closingTip}`);
  }

  return lines.join("\n");
}

export async function generateCourseRecommendationText(params: GenerateRecommendationTextParams): Promise<string> {
  const shortlist = params.courses.slice(0, 12).map(pickCourseContext);

  if (shortlist.length === 0) {
    return `当前筛选范围是：${buildAppliedCategorySummary(params.filters)}。\n\n这个范围内暂时没有足够匹配的课程可以推荐。你可以放宽学院、学部/学科，或者放宽“不要早八/求稳/水课”等条件后再试。`;
  }

  const result = await params.ai.models.generateContent({
    model: params.model,
    contents: buildStructuredPrompt(params, shortlist),
    config: {
      responseMimeType: "application/json",
    },
  });

  let parsed: StructuredResponse;
  try {
    parsed = JSON.parse(result.text || "{}");
  } catch {
    throw new Error("AI structured recommendation parsing failed");
  }

  const courseMap = new Map(shortlist.map((course) => [course.course_code, course]));
  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations
        .map((item) => {
          const code = sanitize(item.course_code);
          const course = code ? courseMap.get(code) : null;
          if (!course) return null;
          return {
            course,
            reason: sanitize(item.reason) || "符合当前筛选条件",
            fit: sanitize(item.fit),
            caveat: sanitize(item.caveat),
          };
        })
        .filter((item): item is { course: ReturnType<typeof pickCourseContext>; reason: string; fit: string; caveat: string } => Boolean(item))
        .slice(0, 5)
    : [];

  if (recommendations.length === 0) {
    throw new Error("AI returned no valid in-scope recommendations");
  }

  return renderMarkdown(
    params.campusName,
    params.semester,
    params.filters,
    sanitize(parsed.summary),
    recommendations,
    sanitize(parsed.closing_tip),
  );
}
