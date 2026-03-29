export type CampusCode = 's' | 'e';

export const DEFAULT_SEMESTER = '2026-1';
export const CAMPUS_STORAGE_KEY = 'hanyang_selected_campus';

export const CAMPUS_LABELS: Record<CampusCode, string> = {
  s: '首尔校区 Seoul',
  e: 'ERICA 校区',
};
