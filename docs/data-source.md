# Data Source And Everytime Note

## Important Boundary

This repository does not include the production crawling implementation.

However, the public documentation should still state the real origin of the production data clearly.

## Original Production Data Source

In the original production workflow, course-related source signals were collected from relevant pages in the Korean student community software Everytime.

That includes, at a high level:

- course-related page content
- historical student review signals
- category-oriented browsing information used during internal processing

The public repository intentionally omits:

- the actual Everytime crawling scripts
- login/session handling details
- extraction heuristics
- production normalization rules
- production sync procedures

## What Happened After Collection

The raw information was not exposed directly to end users in its original form.

In production, the pipeline continued with additional processing:

1. raw course-related information was normalized into a stable schema
2. multiple user review signals for the same course were analyzed and summarized with AI
3. the AI-generated summaries produced cleaner fields such as:
   - pros
   - cons
   - advice
   - assignment load
   - team project burden
   - grading strictness
   - attendance style
   - exam count
4. those summarized fields were then stored in the website data model
5. the resulting records were used to improve:
   - frontend readability
   - course search quality
   - AI assistant context quality
   - later RAG retrieval quality

This is the important public explanation: the website did not just mirror raw scraped text. The production workflow turned raw Everytime-derived signals into structured and summarized course records.

## How To Describe It Publicly

Accurate wording:

> Production course and review signals were originally collected and organized from relevant pages in the Korean student community software Everytime. After collection, multiple user review signals were AI-analyzed and summarized into structured course fields such as pros, cons, and advice. This public repository does not include the private crawling and data-maintenance pipeline.

This is the right balance:

- it tells people where the production data came from
- it explains that the website uses AI summarization over multiple review signals
- it does not pretend the OSS repo ships with the crawler
- it does not leak private operational details

## What The OSS Repo Still Provides

Even without the private Everytime pipeline, the public repository still provides:

- the website shell
- the admin review workflow
- the AI / RAG runtime logic
- the database schema and vector retrieval definition
- the contract for how course data should look

## If Someone Wants To Rebuild The Dataset

They need to implement their own pipeline for:

1. collecting course records
2. collecting or importing review signals
3. normalizing fields into the public schema
4. summarizing review signals into usable course-level fields
5. generating embeddings
6. writing records into Supabase

That pipeline may or may not use Everytime. The OSS repo does not enforce a specific private ingestion implementation.
