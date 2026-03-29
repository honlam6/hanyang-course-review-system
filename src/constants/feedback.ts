export const FEEDBACK_SUBMISSION_TYPES = ['review', 'supplement', 'correction'] as const;
export type FeedbackSubmissionType = (typeof FEEDBACK_SUBMISSION_TYPES)[number];

export const FEEDBACK_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_ENUM_OPTIONS = {
  assignment: ['无', '普通', '多'],
  team_project: ['无', '普通', '多'],
  grading: ['宽容', '普通', '严格'],
  attendance: ['呼名点名', '电子出勤', '不点名', '混合点名', '指定坐席'],
  exam_count: ['无考试', '一次', '两次', '三次', '四次及以上'],
} as const;

export type StructuredFeedbackField = keyof typeof FEEDBACK_ENUM_OPTIONS;

export const SUPPLEMENTABLE_FIELDS = ['assignment', 'team_project', 'grading', 'attendance', 'exam_count'] as const;
export const CORRECTABLE_FIELDS = ['assignment', 'team_project', 'grading', 'attendance', 'exam_count'] as const;

export const FEEDBACK_FIELD_LABELS: Record<StructuredFeedbackField, string> = {
  assignment: '作业量',
  team_project: '小组项目',
  grading: '给分情况',
  attendance: '出勤方式',
  exam_count: '考试次数',
};

export const MISSING_FEEDBACK_VALUES = ['', '待补充', '미기재'] as const;

export function isFeedbackSubmissionType(value: unknown): value is FeedbackSubmissionType {
  return typeof value === 'string' && FEEDBACK_SUBMISSION_TYPES.includes(value as FeedbackSubmissionType);
}

export function isStructuredFeedbackField(value: unknown): value is StructuredFeedbackField {
  return typeof value === 'string' && value in FEEDBACK_ENUM_OPTIONS;
}

export function isMissingFeedbackValue(value: unknown): boolean {
  return value === null || value === undefined || MISSING_FEEDBACK_VALUES.includes(String(value).trim() as (typeof MISSING_FEEDBACK_VALUES)[number]);
}

export function isAllowedStructuredFeedbackValue(field: StructuredFeedbackField, value: unknown): boolean {
  return typeof value === 'string' && FEEDBACK_ENUM_OPTIONS[field].includes(value as never);
}
