# Data Source And Processing Note

## Main Idea

The important part is not simply collecting data from Everytime.

The more important part is turning scattered review signals into a stable course-level format that the website and AI layer can actually use.

A practical version of the flow looks like this:

1. use crawler scripts or browser developer tools to collect course-related information and user review data from relevant Everytime pages
2. group multiple user reviews that belong to the same course
3. normalize the raw records into a stable course schema
4. use AI to summarize the grouped reviews into fixed fields such as:
   - `pros`
   - `cons`
   - `advice`
   - `assignment`
   - `team_project`
   - `grading`
   - `attendance`
   - `exam_count`
5. generate embeddings from the processed course records
6. write those records into the website database and retrieval flow
7. use them for frontend display, search, and the AI assistant

If you build on top of this project, you can follow the same general approach or swap in your own collection method.

## Why AI Summarization Matters

Raw review text is noisy.

Different students describe the same course in different ways, with different detail levels and different vocabulary.

AI summarization makes the data usable at the course level:

- one course can be represented by a stable summary instead of a pile of raw comments
- the frontend can show fixed fields consistently
- search becomes easier because the records are normalized
- RAG retrieval gets cleaner context than raw review fragments alone

In other words, the site is not based on a direct dump of Everytime text. It is based on AI-processed course records.

## Google API And Embeddings

The project also depends on embeddings, not only text summaries.

The processed course records are embedded and stored for vector retrieval, and user questions are embedded at runtime through Google Gemini API.

That makes it possible to:

- retrieve semantically related courses
- combine retrieval with campus and category filters
- pass cleaner context into the final AI answer stage

So the key stack here is:

- Everytime-related source pages
- AI summarization into fixed course fields
- Google Gemini API
- embeddings
- Supabase `pgvector`
- RAG answer generation
