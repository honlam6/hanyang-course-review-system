import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseCredit(gradeAndCredit: string | undefined | null): number {
  if (!gradeAndCredit) return 0;
  const str = gradeAndCredit.trim();
  
  // 1. Explicit credit marker (学分 or 학점)
  const explicitMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:学分|학점)/);
  if (explicitMatch) return parseFloat(explicitMatch[1]);
  
  // 2. Split by separator (- or /) and look at the second part
  if (str.includes('-') || str.includes('/')) {
    const parts = str.split(/[-/]/);
    const secondPart = parts[1] || '';
    const m = secondPart.match(/(\d+(?:\.\d+)?)/);
    if (m) return parseFloat(m[1]);
  }
  
  // 3. Fallback: remove grade markers (学年, 年级, 학년) and find the first remaining number
  const cleanedStr = str.replace(/\d+\s*(?:学年|年级|학년)/g, '');
  const fallbackMatch = cleanedStr.match(/(\d+(?:\.\d+)?)/);
  if (fallbackMatch) return parseFloat(fallbackMatch[1]);
  
  return 0;
}

export function splitCourseName(name: string) {
  // Matches "Korean Name (Chinese Name)" or "Korean Name（Chinese Name）"
  const match = name.match(/^(.*?)\s*[\(（](.*?)[\)）]$/);
  if (match) {
    return { original: match[1].trim(), translation: match[2].trim() };
  }
  return { original: name.trim(), translation: null };
}

export function normalizeAssignment(val: string | undefined): string {
  if (!val) return '待补充';
  const s = String(val).toLowerCase();
  if (s.includes('无') || s.includes('없음')) return '无';
  if (s.includes('多') || s.includes('많음')) return '多';
  if (s.includes('普通') || s.includes('보통')) return '普通';
  return '待补充';
}

export function normalizeTeamProject(val: string | undefined): string {
  if (!val) return '待补充';
  const s = String(val).toLowerCase();
  if (s.includes('无') || s.includes('없음')) return '无';
  if (s.includes('多') || s.includes('많음')) return '多';
  if (s.includes('普通') || s.includes('보통')) return '普通';
  return '待补充';
}

export function normalizeGrading(val: string | undefined): string {
  if (!val) return '待补充';
  const s = String(val).toLowerCase();
  if (s.includes('宽容') || s.includes('너그러움') || s.includes('好')) return '宽容';
  if (s.includes('严格') || s.includes('깐깐함') || s.includes('差')) return '严格';
  if (s.includes('普通') || s.includes('보통')) return '普通';
  return '待补充';
}

export function normalizeAttendance(val: string | undefined): string {
  if (!val) return '待补充';
  const s = String(val).toLowerCase();
  if (s.includes('呼名') || s.includes('직접호명') || s.includes('点名')) return '呼名点名';
  if (s.includes('电子') || s.includes('전자출결')) return '电子出勤';
  if (s.includes('指定') || s.includes('지정좌석')) return '指定坐席';
  if (s.includes('混合') || s.includes('혼합')) return '混合点名';
  return '待补充';
}

export function normalizeExamCount(val: string | undefined): string {
  if (!val) return '待补充';
  const s = String(val).toLowerCase();
  if (s.includes('无') || s.includes('없음') || s.includes('0')) return '无考试';
  if (s.includes('四') || s.includes('4') || s.includes('네번')) return '四次及以上';
  if (s.includes('三') || s.includes('3') || s.includes('세번')) return '三次';
  if (s.includes('两') || s.includes('二') || s.includes('2') || s.includes('두번')) return '两次';
  if (s.includes('一') || s.includes('1') || s.includes('한번')) return '一次';
  return '待补充';
}

export function normalizeStructuredFeedbackValue(
  field: 'assignment' | 'team_project' | 'grading' | 'attendance' | 'exam_count',
  value: string | undefined | null
): string {
  switch (field) {
    case 'assignment':
      return normalizeAssignment(value ?? undefined);
    case 'team_project':
      return normalizeTeamProject(value ?? undefined);
    case 'grading':
      return normalizeGrading(value ?? undefined);
    case 'attendance':
      return normalizeAttendance(value ?? undefined);
    case 'exam_count':
      return normalizeExamCount(value ?? undefined);
  }
}

interface CourseIdentityInput {
  course_code?: string | null;
  course_name?: string | null;
  professor?: string | null;
  campus?: string | null;
  semester?: string | null;
}

export function getCourseDisplayGroupKey(course: CourseIdentityInput): string {
  const campus = course.campus || '';
  const semester = course.semester || '';
  const courseCode = (course.course_code || '').trim();

  if (courseCode) {
    const baseCourseCode = courseCode.split('-')[0]?.trim() || courseCode;
    return `${campus}__${semester}__${baseCourseCode}`;
  }

  return `${campus}__${semester}__${splitCourseName(course.course_name || '').original}`;
}

export function getCourseIdentityKey(course: CourseIdentityInput): string {
  const campus = course.campus || '';
  const semester = course.semester || '';
  const courseCode = (course.course_code || '').trim();

  if (courseCode) {
    return `${campus}__${semester}__${courseCode}`;
  }

  return `${campus}__${semester}__${splitCourseName(course.course_name || '').original}__${(course.professor || '').trim()}`;
}
