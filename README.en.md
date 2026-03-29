# Hanyang University Course Review System

[中文](./README.md) | [한국어](./README.ko.md)

A course review, timetable, and AI-assisted course selection website for Hanyang University students.

- Live demo: <https://hanyang.eu.cc>
- GitHub metadata: [docs/github-metadata.md](./docs/github-metadata.md)
- Architecture and site logic: [docs/architecture.md](./docs/architecture.md)
- Data model: [docs/data-model.md](./docs/data-model.md)
- Data source note: [docs/data-source.md](./docs/data-source.md)
- Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Security: [SECURITY.md](./SECURITY.md)

## Preview

### Desktop

![Desktop Demo](./docs/images/homepage-desktop.png)

### Mobile

![Mobile Demo](./docs/images/homepage-mobile.png)

## What The Project Does

The current project includes:

- course browsing, search, and filtering
- course detail pages
- timetable management
- class-time conflict detection
- user submissions for reviews, supplements, and corrections
- admin review workflow
- AI course assistant
- RAG retrieval with Supabase `pgvector`

## The Core Is Not Just “Taking Data From Everytime”

The more important part is the processing pipeline.

My own approach was roughly this:

1. use crawler scripts or browser developer tools to collect course-related information and user review data from relevant Everytime pages
2. group multiple user reviews for the same course
3. use AI to turn those raw reviews into fixed course fields such as:
   - `pros`
   - `cons`
   - `advice`
   - `assignment`
   - `team_project`
   - `grading`
   - `attendance`
   - `exam_count`
4. generate embeddings from the processed course records
5. store them in the website tables and vector retrieval flow
6. use them for display, search, and the AI assistant

So the site is not a plain mirror of Everytime content. The raw review signals are normalized into a consistent course-level format and then connected to search and AI answering.

If you have another way to prepare the data, that is also fine.

More details:

- [docs/data-source.md](./docs/data-source.md)
- [docs/architecture.md](./docs/architecture.md)

## AI Assistant, Embeddings, And Google API

This is one of the more important layers in the project.

The flow is roughly:

1. the user asks a course-selection question
2. Google Gemini API generates the query embedding
3. `match_courses` retrieves relevant courses from the vector store
4. campus, semester, and category filters are applied
5. Gemini generates the final answer from the matched course summaries

So this is not only a chat UI. It combines:

- Google Gemini API
- AI-generated course summary fields
- embedding retrieval
- Supabase `pgvector`
- RAG answer generation

## Timetable And Conflict Detection

The website also includes a timetable feature.

Users can add courses into a timetable, and the system automatically detects class-time conflicts based on parsed course schedules. The timetable view can also be exported as an image.

Relevant implementation:

- [`src/components/Timetable.tsx`](./src/components/Timetable.tsx)
- [`src/components/UserView.tsx`](./src/components/UserView.tsx)
- [`src/lib/courseTime.ts`](./src/lib/courseTime.ts)

## Data Model

The core pieces are:

- `course_reviews`
- `course_feedback_submissions`
- `match_courses`

Detailed field descriptions:

- [docs/data-model.md](./docs/data-model.md)

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Default URLs:

- Frontend: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin`

Database setup:

- Run [`supabase_setup.sql`](./supabase_setup.sql) in Supabase SQL Editor

## Adapting It To Other Korean Universities

The current project is built around Hanyang University, but the structure is not limited to Hanyang.

If you want to adapt it to another Korean university, you would usually change:

- school name and wording
- campus definitions
- category system
- data collection method
- normalization rules
- AI summarization rules
- embedding generation process

So the accurate description is:

- current project: Hanyang University course review system
- architecture: adaptable to a broader Korean university course review platform
