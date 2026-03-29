export interface CategoryFilters {
  selectedCategoryTop?: string | null;
  selectedCategoryCollege?: string | null;
  selectedCategoryDepartment?: string | null;
  selectedCategoryLeaf?: string | null;
}

interface CategoryOptionRow {
  category_top?: string | null;
  category_paths?: string[] | null;
  category_colleges?: string[] | null;
  category_departments?: string[] | null;
  category_leaves?: string[] | null;
}

export interface CategoryOptionSnapshot {
  tops: string[];
  colleges: string[];
  departments: string[];
  leaves: string[];
  departmentsByCollege: Record<string, string[]>;
  collegeByDepartment: Record<string, string>;
}

interface ResolvedCategoryFilters {
  selectedCategoryTop: string | null;
  selectedCategoryCollege: string | null;
  selectedCategoryDepartment: string | null;
  selectedCategoryLeaf: string | null;
}

interface InferredCategoryFilters extends ResolvedCategoryFilters {
  needsClarification: boolean;
}

interface CategorizedCourseLike {
  category_top?: string | null;
  category_colleges?: string[] | null;
  category_departments?: string[] | null;
  category_leaves?: string[] | null;
}

const CATEGORY_OPTION_BATCH_SIZE = 1000;
const GENERAL_EDUCATION_TOP = '공통과목(교양)';
const MAJOR_TOP = '학과과목(전공)';
const CATEGORY_INTENT_REGEX = /教养|교양|专业|전공|学院|学部|学科|领域|영역|대학|학과|학부|系|商科|经营|經營|经济|經濟|工科|文科|理科|医|护理|設計|디자인|경영|경제/i;

function sanitize(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item)).filter(Boolean);
  }
  const text = sanitize(value);
  return text ? [text] : [];
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
}

function parseCategoryPath(path: string) {
  const parts = path.split('>').map((part) => sanitize(part)).filter(Boolean);
  if (parts.length < 2) return null;

  if (parts[0] === GENERAL_EDUCATION_TOP) {
    return {
      top: parts[0],
      leaf: parts[parts.length - 1],
    };
  }

  if (parts[0] === MAJOR_TOP && parts.length >= 3) {
    return {
      top: parts[0],
      college: parts[1],
      department: parts[2],
    };
  }

  return null;
}

function buildCategorySnapshot(rows: CategoryOptionRow[]): CategoryOptionSnapshot {
  const tops = new Set<string>();
  const colleges = new Set<string>();
  const departments = new Set<string>();
  const leaves = new Set<string>();
  const departmentsByCollegeMap = new Map<string, Set<string>>();
  const collegeByDepartmentMap = new Map<string, Set<string>>();

  for (const row of rows) {
    const top = sanitize(row.category_top);
    if (top) tops.add(top);

    for (const path of toStringArray(row.category_paths)) {
      const parsed = parseCategoryPath(path);
      if (!parsed) continue;

      tops.add(parsed.top);

      if ('leaf' in parsed) {
        leaves.add(parsed.leaf);
        continue;
      }

      colleges.add(parsed.college);
      departments.add(parsed.department);

      if (!departmentsByCollegeMap.has(parsed.college)) {
        departmentsByCollegeMap.set(parsed.college, new Set<string>());
      }
      departmentsByCollegeMap.get(parsed.college)!.add(parsed.department);

      if (!collegeByDepartmentMap.has(parsed.department)) {
        collegeByDepartmentMap.set(parsed.department, new Set<string>());
      }
      collegeByDepartmentMap.get(parsed.department)!.add(parsed.college);
    }

    if (top === GENERAL_EDUCATION_TOP) {
      for (const leaf of toStringArray(row.category_leaves)) {
        leaves.add(leaf);
      }
    }
  }

  const departmentsByCollege = Object.fromEntries(
    [...departmentsByCollegeMap.entries()].map(([college, departmentSet]) => [
      college,
      uniqueSorted(departmentSet),
    ]),
  );

  const collegeByDepartment = Object.fromEntries(
    [...collegeByDepartmentMap.entries()]
      .filter(([, collegeSet]) => collegeSet.size === 1)
      .map(([department, collegeSet]) => [department, [...collegeSet][0]]),
  );

  return {
    tops: uniqueSorted(tops),
    colleges: uniqueSorted(colleges),
    departments: uniqueSorted(departments),
    leaves: uniqueSorted(leaves),
    departmentsByCollege,
    collegeByDepartment,
  };
}

function normalizeTextForMatch(value: string): string {
  return value.toLowerCase().replace(/[\s()（）[\]【】·,，/\\:_-]+/g, '');
}

function safeJsonParse<T>(input: string): T | null {
  const trimmed = input.trim();
  const fenced = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  const candidate = start >= 0 && end >= start ? fenced.slice(start, end + 1) : fenced;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

export function normalizeSelectedCategoryFilters(filters: CategoryFilters): ResolvedCategoryFilters {
  let selectedCategoryTop = sanitize(filters.selectedCategoryTop) || null;
  let selectedCategoryCollege = sanitize(filters.selectedCategoryCollege) || null;
  let selectedCategoryDepartment = sanitize(filters.selectedCategoryDepartment) || null;
  let selectedCategoryLeaf = sanitize(filters.selectedCategoryLeaf) || null;

  if (selectedCategoryCollege || selectedCategoryDepartment) {
    selectedCategoryTop = MAJOR_TOP;
    selectedCategoryLeaf = null;
  }

  if (selectedCategoryLeaf) {
    selectedCategoryTop = GENERAL_EDUCATION_TOP;
    selectedCategoryCollege = null;
    selectedCategoryDepartment = null;
  }

  return {
    selectedCategoryTop,
    selectedCategoryCollege,
    selectedCategoryDepartment,
    selectedCategoryLeaf,
  };
}

export function hasCategoryIntent(message: string, filters: CategoryFilters): boolean {
  const normalized = normalizeSelectedCategoryFilters(filters);
  if (
    normalized.selectedCategoryTop ||
    normalized.selectedCategoryCollege ||
    normalized.selectedCategoryDepartment ||
    normalized.selectedCategoryLeaf
  ) {
    return true;
  }
  return CATEGORY_INTENT_REGEX.test(message);
}

export async function fetchCategoryOptionSnapshot(
  supabase: any,
  campus: string,
  semester: string,
): Promise<CategoryOptionSnapshot> {
  const rows: CategoryOptionRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('course_reviews')
      .select('category_top,category_paths,category_colleges,category_departments,category_leaves')
      .eq('campus', campus)
      .eq('semester', semester)
      .range(from, from + CATEGORY_OPTION_BATCH_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch category options: ${error.message}`);
    }

    if (!data || data.length === 0) break;
    rows.push(...(data as CategoryOptionRow[]));
    if (data.length < CATEGORY_OPTION_BATCH_SIZE) break;
    from += CATEGORY_OPTION_BATCH_SIZE;
  }

  return buildCategorySnapshot(rows);
}

function validateOption(option: string | null, candidates: string[]): string | null {
  if (!option) return null;
  return candidates.includes(option) ? option : null;
}

export async function inferCategoryFiltersWithAI(
  ai: any,
  message: string,
  options: CategoryOptionSnapshot,
): Promise<InferredCategoryFilters> {
  const fallback: InferredCategoryFilters = {
    selectedCategoryTop: null,
    selectedCategoryCollege: null,
    selectedCategoryDepartment: null,
    selectedCategoryLeaf: null,
    needsClarification: false,
  };

  if (!CATEGORY_INTENT_REGEX.test(message)) {
    return fallback;
  }

  const prompt = `
你是课程筛选参数提取器。你的任务是从用户问题中提取课程分类过滤条件。

规则：
1. 只能从给定选项中挑选完全匹配的值，不能编造。
2. 如果用户只明确说“教养/교양/general education”，可以只返回 selectedCategoryTop="${GENERAL_EDUCATION_TOP}"。
3. 如果用户只明确说“专业/전공/major”，可以只返回 selectedCategoryTop="${MAJOR_TOP}"。
4. 如果用户说了模糊概念，例如“商科”“经营类”“工科”但无法唯一映射到一个学院或学部，则 needsClarification=true。
5. 如果用户已经足够明确，比如“经营学部/경영학부”，优先返回对应学部。
6. 返回严格 JSON，不要加解释。

可选顶层:
${JSON.stringify(options.tops)}

可选学院:
${JSON.stringify(options.colleges)}

可选学部/学科:
${JSON.stringify(options.departments)}

可选教养领域:
${JSON.stringify(options.leaves)}

用户问题:
${JSON.stringify(message)}

输出格式:
{
  "selectedCategoryTop": string | null,
  "selectedCategoryCollege": string | null,
  "selectedCategoryDepartment": string | null,
  "selectedCategoryLeaf": string | null,
  "needsClarification": boolean
}
  `.trim();

  const result = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite-preview',
    contents: prompt,
  });

  const parsed = safeJsonParse<InferredCategoryFilters>(result.text || '');
  if (!parsed) {
    return {
      ...fallback,
      needsClarification: true,
    };
  }

  const resolvedTop = validateOption(sanitize(parsed.selectedCategoryTop) || null, options.tops);
  const resolvedCollege = validateOption(sanitize(parsed.selectedCategoryCollege) || null, options.colleges);
  const resolvedDepartment = validateOption(sanitize(parsed.selectedCategoryDepartment) || null, options.departments);
  const resolvedLeaf = validateOption(sanitize(parsed.selectedCategoryLeaf) || null, options.leaves);

  if (resolvedLeaf) {
    return {
      selectedCategoryTop: GENERAL_EDUCATION_TOP,
      selectedCategoryCollege: null,
      selectedCategoryDepartment: null,
      selectedCategoryLeaf: resolvedLeaf,
      needsClarification: false,
    };
  }

  if (resolvedDepartment) {
    const parentCollege = options.collegeByDepartment[resolvedDepartment] || null;

    if (!parentCollege) {
      return {
        ...fallback,
        needsClarification: true,
      };
    }

    return {
      selectedCategoryTop: MAJOR_TOP,
      selectedCategoryCollege: parentCollege,
      selectedCategoryDepartment: resolvedDepartment,
      selectedCategoryLeaf: null,
      needsClarification: false,
    };
  }

  if (resolvedCollege) {
    return {
      selectedCategoryTop: MAJOR_TOP,
      selectedCategoryCollege: resolvedCollege,
      selectedCategoryDepartment: null,
      selectedCategoryLeaf: null,
      needsClarification: false,
    };
  }

  const normalized = normalizeSelectedCategoryFilters({
    selectedCategoryTop: resolvedTop,
  });

  return {
    ...normalized,
    needsClarification: Boolean(parsed.needsClarification),
  };
}

export function resolveEffectiveCategoryFilters(
  selected: CategoryFilters,
  inferred: InferredCategoryFilters,
): ResolvedCategoryFilters {
  const normalizedSelected = normalizeSelectedCategoryFilters(selected);

  return {
    selectedCategoryTop: normalizedSelected.selectedCategoryTop || inferred.selectedCategoryTop,
    selectedCategoryCollege: normalizedSelected.selectedCategoryCollege || inferred.selectedCategoryCollege,
    selectedCategoryDepartment: normalizedSelected.selectedCategoryDepartment || inferred.selectedCategoryDepartment,
    selectedCategoryLeaf: normalizedSelected.selectedCategoryLeaf || inferred.selectedCategoryLeaf,
  };
}

export function shouldAskForCategoryClarification(
  message: string,
  selected: CategoryFilters,
  inferred: InferredCategoryFilters,
  resolved: ResolvedCategoryFilters,
): boolean {
  if (!CATEGORY_INTENT_REGEX.test(message)) return false;

  const normalizedSelected = normalizeSelectedCategoryFilters(selected);
  if (
    normalizedSelected.selectedCategoryTop ||
    normalizedSelected.selectedCategoryCollege ||
    normalizedSelected.selectedCategoryDepartment ||
    normalizedSelected.selectedCategoryLeaf
  ) {
    return false;
  }

  if (resolved.selectedCategoryTop === GENERAL_EDUCATION_TOP) {
    return false;
  }

  return inferred.needsClarification;
}

export function buildCategoryClarificationMessage(): string {
  return '你是想找教养课还是专业课？如果是专业课，请告诉我学院或学部；也可以直接用助手上方的筛选器先选。';
}

export function buildAppliedCategorySummary(filters: CategoryFilters): string {
  const normalized = normalizeSelectedCategoryFilters(filters);
  const parts = [
    normalized.selectedCategoryTop ? `顶层=${normalized.selectedCategoryTop}` : '',
    normalized.selectedCategoryCollege ? `学院=${normalized.selectedCategoryCollege}` : '',
    normalized.selectedCategoryDepartment ? `学部/学科=${normalized.selectedCategoryDepartment}` : '',
    normalized.selectedCategoryLeaf ? `领域=${normalized.selectedCategoryLeaf}` : '',
  ].filter(Boolean);

  return parts.length > 0 ? parts.join('，') : '未启用分类过滤';
}

export function pickByNormalizedMatch(candidates: string[], input: string): string | null {
  const target = normalizeTextForMatch(input);
  if (!target) return null;
  return candidates.find((candidate) => normalizeTextForMatch(candidate) === target) || null;
}

export function matchesResolvedCategoryFilters(
  course: CategorizedCourseLike,
  filters: CategoryFilters,
): boolean {
  const normalized = normalizeSelectedCategoryFilters(filters);

  if (normalized.selectedCategoryTop && sanitize(course.category_top) !== normalized.selectedCategoryTop) {
    return false;
  }

  const colleges = new Set(toStringArray(course.category_colleges));
  if (normalized.selectedCategoryCollege && !colleges.has(normalized.selectedCategoryCollege)) {
    return false;
  }

  const departments = new Set(toStringArray(course.category_departments));
  if (normalized.selectedCategoryDepartment && !departments.has(normalized.selectedCategoryDepartment)) {
    return false;
  }

  const leaves = new Set(toStringArray(course.category_leaves));
  if (normalized.selectedCategoryLeaf && !leaves.has(normalized.selectedCategoryLeaf)) {
    return false;
  }

  return true;
}
