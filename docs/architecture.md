# Architecture

## Product Scope

This repository is the web version of a Hanyang University course review and AI-assisted course selection system.

The core pieces are:

- Web frontend
- Admin dashboard
- Core APIs
- Runtime AI / RAG logic
- Supabase schema and vector retrieval function

## Core Site Logic

The site is organized around four major flows.

### 1. Public Course Discovery

Users can:

- choose a campus
- search by course name, code, professor, and review text
- filter by category, attendance style, and course traits
- inspect structured summaries such as assignment load, team project burden, grading strictness, attendance, and exam count

Public course browsing is primarily served by:

- [`api/courses/index.ts`](../api/courses/index.ts)
- [`api/_courseCore.ts`](../api/_courseCore.ts)
- [`src/components/UserView.tsx`](../src/components/UserView.tsx)

### 2. User Feedback Submission

The website accepts three feedback types:

- `review`: user-written course review
- `supplement`: fill in a missing structured field
- `correction`: correct an existing structured field

Submission flow:

1. User submits feedback from the frontend.
2. The backend validates rate limits and allowed values.
3. The record is stored in `course_feedback_submissions` with `pending` status.
4. An admin reviews the submission.
5. Approved changes are merged into `course_reviews`.
6. Approved review records can also update aggregate course signals.

Relevant files:

- [`api/course-feedback-submissions/[...path].ts`](../api/course-feedback-submissions/[...path].ts)
- [`api/_feedbackCore.ts`](../api/_feedbackCore.ts)
- [`src/components/AdminDashboard.tsx`](../src/components/AdminDashboard.tsx)

### 3. Admin Moderation and Course Management

Admins authenticate through Supabase Auth and an allowlist check.

The admin dashboard supports:

- course search and editing
- moderation of user submissions
- duplicate checking helpers
- direct publishing back to Supabase

Relevant files:

- [`api/_auth.ts`](../api/_auth.ts)
- [`api/admin/[...path].ts`](../api/admin/[...path].ts)
- [`api/publish.ts`](../api/publish.ts)
- [`src/components/AdminDashboard.tsx`](../src/components/AdminDashboard.tsx)

### 4. AI / RAG Assistant

The AI assistant does not answer from a generic prompt alone.

Runtime flow:

1. The user asks a course-selection question.
2. Gemini generates a 768-dimensional embedding for the query.
3. Supabase `match_courses` retrieves semantically relevant courses from `course_reviews.embedding`.
4. The backend applies campus, semester, and category filters.
5. Candidate courses are formatted into structured context.
6. Gemini generates the final answer from the retrieved course set.

Relevant files:

- [`api/_chatCore.ts`](../api/_chatCore.ts)
- [`src/lib/aiCategoryResolver.ts`](../src/lib/aiCategoryResolver.ts)
- [`src/lib/aiCourseRecommendations.ts`](../src/lib/aiCourseRecommendations.ts)
- [`supabase_setup.sql`](../supabase_setup.sql)

## Data Processing Logic

A practical version of the data flow looks like this:

1. collect course-related information and user review data from Everytime using crawler scripts or browser developer tools
2. group multiple reviews that belong to the same course
3. normalize those records into a stable schema
4. use AI to summarize the grouped reviews into course-level fields such as:
   - pros
   - cons
   - advice
   - assignment load
   - team project burden
   - grading style
   - attendance style
   - exam count
5. store those summarized fields in `course_reviews`
6. use the resulting records for frontend display, search, and RAG retrieval

This matters because the site is not driven only by raw review text. It uses processed course-level summaries that are easier to read and easier to retrieve.

## Why This Can Generalize Beyond Hanyang

The current product is Hanyang-specific in naming, content, and campus assumptions.

But the underlying architecture is based on reusable concepts:

- campus
- semester
- course metadata
- category tree
- user feedback moderation
- AI-generated course summaries
- vector retrieval
- RAG answer generation

That is why the accurate positioning is:

- product: Hanyang University course review system
- architecture: adaptable to other Korean universities
