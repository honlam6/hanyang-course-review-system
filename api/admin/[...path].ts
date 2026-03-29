import { GoogleGenAI } from "@google/genai";
import { courseCoreDefaults, loadAdminCourses, normalizePage, normalizePageSize } from "../_courseCore.js";
import { getAdminRequestContext, requireAdminRequest } from "../_auth.js";

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

  const adminIndex = segments.lastIndexOf("admin");
  if (adminIndex >= 0) {
    return segments.slice(adminIndex + 1);
  }

  return [];
}

async function handleStatus(req: any, res: any) {
  const context = await getAdminRequestContext(req);

  return res.status(200).json({
    authenticated: Boolean(context.user),
    isAdmin: context.isAdmin,
    email: context.email,
    user: context.user
      ? {
          id: context.user.id,
          email: context.user.email || null,
        }
      : null,
  });
}

async function handleCourses(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const adminContext = await requireAdminRequest(req, res);
  if (!adminContext) return;

  const page = normalizePage(req.query.page);
  const pageSize = normalizePageSize(req.query.pageSize, courseCoreDefaults.DEFAULT_ADMIN_PAGE_SIZE);
  const query = typeof req.query.q === "string" ? req.query.q : "";
  const result = await loadAdminCourses({ page, pageSize, query });

  return res.status(200).json({
    success: true,
    data: result.items,
    pagination: {
      page,
      pageSize,
      total: result.total,
      hasMore: result.hasMore,
    },
  });
}

async function handleDuplicateCheck(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const adminContext = await requireAdminRequest(req, res);
  if (!adminContext) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured" });
  }

  const existingCourses = Array.isArray(req.body?.existingCourses) ? req.body.existingCourses : [];
  const pendingCourses = Array.isArray(req.body?.pendingCourses) ? req.body.pendingCourses : [];

  if (pendingCourses.length === 0) {
    return res.status(400).json({ error: "pendingCourses is required" });
  }

  const ai = new GoogleGenAI({ apiKey });
  const result = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: [
      {
        parts: [
          {
            text: `你是一个课程数据审计专家。我会给你两组数据：
1. 数据库中已有的课程列表
2. 准备上传的新课程列表

请分析新课程列表中，哪些课程在语义上与已有课程重复（即使名称或教授拼写略有不同，但指向同一门课）。
注意：不同校区(campus)或不同学期(semester)不能判定为重复。

已有课程（部分）：
${existingCourses
  .slice(0, 100)
  .map((course: any) => `- ${course.course_name} (${course.professor}) [${course.campus}/${course.semester}]`)
  .join("\n")}

待检查的新课程：
${pendingCourses
  .map((course: any, index: number) => `${index}. ${course.course_name} (${course.professor}) [${course.campus}/${course.semester}]`)
  .join("\n")}

请以 JSON 数组格式返回结果，每个对象包含：
- index: 待检查课程的索引
- is_duplicate: boolean
- reason: 简短理由
- confidence: 0-1 之间的置信度

只返回 JSON 数组，不要有其他文字。`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  const aiResults = JSON.parse(result.text || "[]");
  return res.status(200).json({ success: true, data: aiResults });
}

export default async function handler(req: any, res: any) {
  try {
    const [route] = getPathSegments(req);

    if (route === "status") {
      return await handleStatus(req, res);
    }
    if (route === "courses") {
      return await handleCourses(req, res);
    }
    if (route === "duplicate-check") {
      return await handleDuplicateCheck(req, res);
    }

    return res.status(404).json({ error: "Not Found" });
  } catch (error: any) {
    console.error("Admin catch-all error:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
