import {
  courseCoreDefaults,
  isCampusCode,
  loadCategorySnapshot,
  loadCoursesByIds,
  loadPublicCourses,
  normalizePage,
  normalizePageSize,
  parseIdList,
  resolveSemester,
} from "../_courseCore.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const campus = isCampusCode(req.query.campus) ? req.query.campus : "e";
    const semester = resolveSemester(req.query.semester);

    if (req.query.includeCategorySnapshot === "1") {
      const snapshot = await loadCategorySnapshot(campus, semester);
      return res.status(200).json({ success: true, data: snapshot });
    }

    const ids = parseIdList(req.query.ids);
    if (ids.length > 0) {
      const items = await loadCoursesByIds({ campus, semester, ids });
      return res.status(200).json({ success: true, data: items });
    }

    const page = normalizePage(req.query.page);
    const pageSize = normalizePageSize(req.query.pageSize, courseCoreDefaults.DEFAULT_PUBLIC_PAGE_SIZE);
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const result = await loadPublicCourses({
      campus,
      semester,
      page,
      pageSize,
      query,
    });

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
  } catch (error: any) {
    console.error("Public courses error:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
