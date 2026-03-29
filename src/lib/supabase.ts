import { createClient } from '@supabase/supabase-js';
import { CampusCode } from '../constants/campus';
import { FeedbackStatus, FeedbackSubmissionType, StructuredFeedbackField } from '../constants/feedback';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseAuthConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const supabaseAuth = isSupabaseAuthConfigured
  ? createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!)
  : null;

export interface CourseReview {
  id?: number;
  course_code?: string;    // 新增：课程代码
  course_name: string;
  course_name_ko_raw?: string;
  professor: string;
  campus: CampusCode;
  semester: string;
  course_type?: string;    // 新增：修读区分 (如：专业必修, 教养等)
  grade_and_credit?: string; // 新增：学年与学分 (如：3学分)
  class_time?: string;     // 新增：上课时间
  classroom?: string;      // 新增：教室
  category_top?: string | null;
  category_paths?: string[];
  category_colleges?: string[];
  category_departments?: string[];
  category_leaves?: string[];
  primary_category_path?: string | null;
  overall_score: number;
  pros: string[];
  cons: string[];
  advice: string;
  assignment: string;
  team_project: string;
  grading: string;
  attendance: string;
  exam_count: string;
  created_at?: string;
}

export interface CourseFeedbackSubmission {
  id?: number;
  course_review_id: number;
  submission_type: FeedbackSubmissionType;
  status: FeedbackStatus;
  submitter_ip_hash?: string;
  created_at?: string;
  reviewed_at?: string | null;
  review_note?: string | null;
  rating?: number | null;
  pros?: string[] | null;
  cons?: string[] | null;
  advice?: string | null;
  assignment?: string | null;
  team_project?: string | null;
  grading?: string | null;
  attendance?: string | null;
  exam_count?: string | null;
  field_name?: StructuredFeedbackField | null;
  current_value_snapshot?: string | null;
  proposed_value?: string | null;
}

export interface CourseFeedbackSubmissionWithCourse extends CourseFeedbackSubmission {
  course_reviews?: Pick<CourseReview, 'id' | 'course_name' | 'professor' | 'campus' | 'semester' | 'course_code' | 'assignment' | 'team_project' | 'grading' | 'attendance' | 'exam_count'> | null;
}
