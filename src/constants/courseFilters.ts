export type FilterGroup = 'type' | 'attendance' | 'trait';

export interface FilterOption {
  id: string;
  label: string;
  field: 'course_type' | 'attendance' | 'team_project' | 'grading' | 'assignment' | 'exam_count' | 'overall_score';
  group: FilterGroup;
  matchWords?: string[];
  value?: string | number;
}

export interface CourseFilterTarget {
  course_type?: string | null;
  attendance?: string | null;
  team_project?: string | null;
  grading?: string | null;
  assignment?: string | null;
  exam_count?: string | null;
  overall_score?: number | string | null;
}

export const FILTER_OPTIONS: FilterOption[] = [
  { id: 'type-major-core', label: '专业核心 / 전공핵심', field: 'course_type', group: 'type', matchWords: ['专业核心', '전공핵심'] },
  { id: 'type-major-adv', label: '专业深化 / 전공심화', field: 'course_type', group: 'type', matchWords: ['专业深化', '전공심화'] },
  { id: 'type-major-basic', label: '专业基础(必修) / 전공기초', field: 'course_type', group: 'type', matchWords: ['专业基础', '专业基础(必修)', '전공기초', '전공기본'] },
  { id: 'type-ge-req', label: '教养必修 / 교양필수', field: 'course_type', group: 'type', matchWords: ['教养必修', '교양필수'] },
  { id: 'type-core-ge', label: '核心教养 / 핵심교양', field: 'course_type', group: 'type', matchWords: ['核心教养', '핵심교양'] },
  { id: 'type-teaching', label: '教职 / 교직', field: 'course_type', group: 'type', matchWords: ['教职', '교직', '教职必修', '教职选择', '教职选修', '교직필수', '교직선택'] },
  { id: 'type-rotc', label: 'ROTC', field: 'course_type', group: 'type', matchWords: ['rotc', 'ROTC必修', 'rotc필수'] },
  { id: 'type-other-ele', label: '其他专业选择 / 타전공선택', field: 'course_type', group: 'type', matchWords: ['其他专业', '타전공', '일반선택', '一般选择'] },
  { id: 'attendance-call', label: '呼名点名 / 호명출석', field: 'attendance', group: 'attendance', matchWords: ['呼名点名', '点名', '호명', '직접호명'] },
  { id: 'attendance-electronic', label: '电子签到 / 전자출결', field: 'attendance', group: 'attendance', matchWords: ['电子签到', '电子出勤', '전자출결'] },
  { id: 'attendance-none', label: '不点名 / 출결미반영', field: 'attendance', group: 'attendance', matchWords: ['不点名', '不反映', '출결미반영', '미반영'] },
  { id: 'attendance-mixed', label: '混合点名 / 혼합출석', field: 'attendance', group: 'attendance', matchWords: ['混合点名', '혼합'] },
  { id: 'attendance-seat', label: '指定座位 / 지정좌석', field: 'attendance', group: 'attendance', matchWords: ['指定座位', '指定坐席', '지정좌석'] },
  { id: 'attendance-pending', label: '待补充 / 미기재', field: 'attendance', group: 'attendance', matchWords: ['待补充', '미기재', '未记录'] },
  { id: 'no-team', label: '无小组', field: 'team_project', group: 'trait', value: '无' },
  { id: 'generous', label: '给分宽容', field: 'grading', group: 'trait', value: '宽容' },
  { id: 'no-assignment', label: '无作业', field: 'assignment', group: 'trait', value: '无' },
  { id: 'no-exam', label: '无考试', field: 'exam_count', group: 'trait', value: '无考试' },
  { id: 'high-score', label: '高分课', field: 'overall_score', group: 'trait', value: 4.5 },
];

export function tokenizedText(text: string) {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[/,，、|\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function matchByKeywords(value: string | undefined | null, words: string[] = []) {
  const normalizedValue = (value || '').toLowerCase();
  const tokens = tokenizedText(value || '');
  return words.some((word) => {
    const keyword = word.toLowerCase();
    if (normalizedValue.includes(keyword)) return true;
    return tokens.some((token) => token.includes(keyword) || keyword.includes(token));
  });
}

export function courseMatchesFilter(course: CourseFilterTarget, filter: FilterOption) {
  if (filter.id === 'high-score') {
    return Number(course.overall_score || 0) >= Number(filter.value || 0);
  }

  if (filter.field === 'course_type') {
    return matchByKeywords(course.course_type, filter.matchWords);
  }

  if (filter.field === 'attendance') {
    return matchByKeywords(course.attendance, filter.matchWords);
  }

  return course[filter.field] === filter.value;
}

export function applyCourseFilters<T extends CourseFilterTarget>(courses: T[], filterIds: string[]) {
  if (filterIds.length === 0) return courses;

  return courses.filter((course) => {
    const groups: Record<string, string[]> = {};

    for (const id of filterIds) {
      const filter = FILTER_OPTIONS.find((item) => item.id === id);
      if (!filter) continue;
      const groupKey = filter.group || filter.id;
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(id);
    }

    return Object.values(groups).every((ids) =>
      ids.some((id) => {
        const filter = FILTER_OPTIONS.find((item) => item.id === id);
        return filter ? courseMatchesFilter(course, filter) : false;
      }),
    );
  });
}
