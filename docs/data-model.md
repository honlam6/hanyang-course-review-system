# Data Model

## Overview

The public system revolves around two main tables and one retrieval function.

- `course_reviews`
- `course_feedback_submissions`
- `match_courses`

## `course_reviews`

Main course entity used by the public website, timetable, admin dashboard, and AI retrieval.

Representative fields:

- `id`
- `course_code`
- `course_name`
- `course_name_ko_raw`
- `professor`
- `campus`
- `semester`
- `course_type`
- `grade_and_credit`
- `class_time`
- `classroom`
- `overall_score`
- `pros`
- `cons`
- `advice`
- `assignment`
- `team_project`
- `grading`
- `attendance`
- `exam_count`
- `category_top`
- `category_paths`
- `category_colleges`
- `category_departments`
- `category_leaves`
- `primary_category_path`
- `embedding`
- `created_at`

Frontend type reference:

- [`src/lib/supabase.ts`](../src/lib/supabase.ts)

### Role In The Site

This table powers:

- public course search
- structured course cards
- timetable rendering inputs
- AI retrieval source records
- admin-side course editing
- aggregate course stats after moderation

### Why The Summary Fields Matter

Fields like `pros`, `cons`, `advice`, `assignment`, and `grading` are central to the product.

They are produced after multiple reviews for the same course are grouped and AI-summarized into a fixed course-level format.

That makes them useful in several places at once:

- frontend readability
- filterable course summaries
- search quality
- RAG context quality

### Why `embedding` Matters

The `embedding` field is what connects processed course records to retrieval.

Instead of only searching with plain text matching, the system stores vector representations for course-level records and uses them during AI-assisted course search.

## `course_feedback_submissions`

Moderation queue for user-submitted reviews and structured corrections.

Representative fields:

- `id`
- `course_review_id`
- `submission_type`
- `status`
- `submitter_ip_hash`
- `rating`
- `pros`
- `cons`
- `advice`
- `assignment`
- `team_project`
- `grading`
- `attendance`
- `exam_count`
- `field_name`
- `current_value_snapshot`
- `proposed_value`
- `review_note`
- `created_at`
- `reviewed_at`

### Submission Semantics

- `review`: qualitative and structured review signal
- `supplement`: fill missing structured data
- `correction`: correct existing structured data

### Status Semantics

- `pending`: waiting for admin review
- `approved`: accepted and optionally merged into `course_reviews`
- `rejected`: rejected by admin

## `match_courses`

Supabase SQL function for RAG retrieval.

Inputs include:

- query embedding
- similarity threshold
- result count
- campus filter
- semester filter
- top-level category filter
- college filter
- department filter
- leaf filter

Outputs include:

- course metadata
- structured summary fields
- similarity score

Definition:

- [`supabase_setup.sql`](../supabase_setup.sql)

## Data Example

```json
{
  "id": 1024,
  "course_code": "GENE3021",
  "course_name": "자료구조",
  "professor": "Kim",
  "campus": "s",
  "semester": "2026-1",
  "overall_score": 4.2,
  "pros": ["讲解清楚", "资料完整"],
  "cons": ["作业偏多"],
  "advice": "适合想打基础的学生",
  "assignment": "多",
  "team_project": "普通",
  "grading": "普通",
  "attendance": "电子出勤",
  "exam_count": "两次",
  "category_top": "专攻",
  "category_departments": ["计算机学部"]
}
```
