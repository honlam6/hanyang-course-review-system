-- 1. Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- 2. Add a vector column to the course_reviews table
-- gemini-embedding-2-preview configured to output 768 dimensions
alter table course_reviews add column if not exists embedding vector(768);
alter table course_reviews add column if not exists campus text;
alter table course_reviews add column if not exists semester text;
alter table course_reviews add column if not exists course_name_ko_raw text;
alter table course_reviews add column if not exists category_top text;
alter table course_reviews add column if not exists category_paths text[];
alter table course_reviews add column if not exists category_colleges text[];
alter table course_reviews add column if not exists category_departments text[];
alter table course_reviews add column if not exists category_leaves text[];
alter table course_reviews add column if not exists primary_category_path text;

-- 3. Create a function to search for courses
create or replace function match_courses (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_campus text default null,
  filter_semester text default null,
  filter_category_top text default null,
  filter_category_colleges text[] default null,
  filter_category_departments text[] default null,
  filter_category_leaves text[] default null
)
returns table (
  id bigint,
  course_code text,
  course_name text,
  professor text,
  course_type text,
  grade_and_credit text,
  class_time text,
  classroom text,
  overall_score float,
  advice text,
  pros jsonb,
  cons jsonb,
  assignment text,
  team_project text,
  grading text,
  attendance text,
  exam_count text,
  course_name_ko_raw text,
  category_top text,
  category_paths text[],
  category_colleges text[],
  category_departments text[],
  category_leaves text[],
  primary_category_path text,
  campus text,
  semester text,
  similarity float
)
language sql stable
as $$
  select
    course_reviews.id,
    course_reviews.course_code,
    course_reviews.course_name,
    course_reviews.professor,
    course_reviews.course_type,
    course_reviews.grade_and_credit,
    course_reviews.class_time,
    course_reviews.classroom,
    case
      when trim(course_reviews.overall_score::text) ~ '^-?\d+(\.\d+)?$'
        then course_reviews.overall_score::double precision
      else null
    end as overall_score,
    course_reviews.advice,
    course_reviews.pros,
    course_reviews.cons,
    course_reviews.assignment,
    course_reviews.team_project,
    course_reviews.grading,
    course_reviews.attendance,
    course_reviews.exam_count,
    course_reviews.course_name_ko_raw,
    course_reviews.category_top,
    course_reviews.category_paths,
    course_reviews.category_colleges,
    course_reviews.category_departments,
    course_reviews.category_leaves,
    course_reviews.primary_category_path,
    course_reviews.campus,
    course_reviews.semester,
    1 - (course_reviews.embedding <=> query_embedding) as similarity
  from course_reviews
  where 1 - (course_reviews.embedding <=> query_embedding) > match_threshold
    and (filter_campus is null or course_reviews.campus = filter_campus)
    and (filter_semester is null or course_reviews.semester = filter_semester)
    and (filter_category_top is null or course_reviews.category_top = filter_category_top)
    and (
      filter_category_colleges is null
      or coalesce(course_reviews.category_colleges, '{}'::text[]) && filter_category_colleges
    )
    and (
      filter_category_departments is null
      or coalesce(course_reviews.category_departments, '{}'::text[]) && filter_category_departments
    )
    and (
      filter_category_leaves is null
      or coalesce(course_reviews.category_leaves, '{}'::text[]) && filter_category_leaves
    )
  order by similarity desc
  limit match_count;
$$;

create index if not exists idx_course_reviews_campus_semester
  on course_reviews(campus, semester);

create index if not exists idx_course_reviews_campus_semester_created_at
  on course_reviews(campus, semester, created_at desc);

create index if not exists idx_course_reviews_campus_semester_code
  on course_reviews(campus, semester, course_code);

create index if not exists idx_course_reviews_category_top
  on course_reviews(category_top);

create index if not exists idx_course_reviews_category_colleges_gin
  on course_reviews using gin(category_colleges);

create index if not exists idx_course_reviews_category_departments_gin
  on course_reviews using gin(category_departments);

create index if not exists idx_course_reviews_category_leaves_gin
  on course_reviews using gin(category_leaves);

create table if not exists course_feedback_submissions (
  id bigserial primary key,
  course_review_id bigint not null references course_reviews(id) on delete cascade,
  submission_type text not null check (submission_type in ('review', 'supplement', 'correction')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitter_ip_hash text not null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_note text,
  rating numeric(2,1),
  pros text[],
  cons text[],
  advice text,
  assignment text,
  team_project text,
  grading text,
  attendance text,
  exam_count text,
  field_name text,
  current_value_snapshot text,
  proposed_value text
);

create index if not exists idx_course_feedback_status_created_at
  on course_feedback_submissions(status, created_at desc);

create index if not exists idx_course_feedback_type_created_at
  on course_feedback_submissions(submission_type, created_at desc);

create index if not exists idx_course_feedback_course_created_at
  on course_feedback_submissions(course_review_id, created_at desc);

create index if not exists idx_course_feedback_submitter_created_at
  on course_feedback_submissions(submitter_ip_hash, created_at desc);
