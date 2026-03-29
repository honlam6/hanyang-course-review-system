export interface HomepageCourseRankingTarget {
  id?: number | string | null;
  course_code?: string | null;
  course_name?: string | null;
  overall_score?: number | string | null;
  assignment?: string | null;
  team_project?: string | null;
  grading?: string | null;
  pros?: string[] | null;
  cons?: string[] | null;
  advice?: string | null;
  review_preview?: {
    pros?: string[] | null;
    cons?: string[] | null;
    advice?: string | null;
  } | null;
}

const PLACEHOLDER_TEXTS = new Set([
  '',
  '待补充',
  '未补充',
  '未记录',
  '暂无',
  '未知',
  '미기재',
  '미입력',
  '없음',
  '--',
  '-',
  'n/a',
]);

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeText(entry)).filter(Boolean);
}

function hasStructuredValue(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized.length > 0 && !PLACEHOLDER_TEXTS.has(normalized);
}

function getReviewPayload(course: HomepageCourseRankingTarget) {
  return {
    pros: normalizeList(course.pros ?? course.review_preview?.pros),
    cons: normalizeList(course.cons ?? course.review_preview?.cons),
    advice: normalizeText(course.advice ?? course.review_preview?.advice),
  };
}

function getStableHash(input: string) {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getStableRandomUnit(seed: string, course: HomepageCourseRankingTarget) {
  const identity = [
    course.id ?? '',
    normalizeText(course.course_code),
    normalizeText(course.course_name),
  ].join('::');

  return getStableHash(`${seed}::${identity}`) / 4294967295;
}

export function createHomepageSeed(prefix = 'home') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getHomepagePriorityScore(course: HomepageCourseRankingTarget) {
  const score = Number(course.overall_score || 0);
  const structuredCount = [
    course.assignment,
    course.team_project,
    course.grading,
  ].filter(hasStructuredValue).length;
  const reviewPayload = getReviewPayload(course);
  const reviewCount = [
    reviewPayload.pros.length > 0,
    reviewPayload.cons.length > 0,
    reviewPayload.advice.length > 0,
  ].filter(Boolean).length;
  const isHighScore = score >= 4.5;

  let priorityScore = score * 4;
  priorityScore += structuredCount * 35;
  priorityScore += reviewCount * 40;

  if (isHighScore) {
    priorityScore += 160;
  }
  if (structuredCount === 3) {
    priorityScore += 40;
  }
  if (reviewCount === 3) {
    priorityScore += 50;
  }

  return priorityScore;
}

export function sortCoursesForHomepage<T extends HomepageCourseRankingTarget>(courses: T[], seed: string) {
  return [...courses].sort((left, right) => {
    const rightPriority = getHomepagePriorityScore(right) + getStableRandomUnit(seed, right) * 24;
    const leftPriority = getHomepagePriorityScore(left) + getStableRandomUnit(seed, left) * 24;

    if (rightPriority !== leftPriority) {
      return rightPriority - leftPriority;
    }

    return Number(right.id || 0) - Number(left.id || 0);
  });
}
