# Data Source And Everytime Note

## Main Idea

The website data did not come from one manually written spreadsheet.

My own approach was:

1. use crawler scripts or browser developer tools to collect course-related information and user review data from relevant Everytime pages
2. group multiple user reviews for the same course
3. normalize the raw records into a stable course schema
4. use AI to summarize the grouped reviews into fields that are easier to display and retrieve
5. write the processed records into the website database
6. use those processed records for frontend display, search, and the AI assistant

## Why AI Summarization Was Used

Raw user reviews are noisy and uneven.

After collecting multiple reviews for the same course, AI summarization was used to generate clearer course-level fields such as:

- pros
- cons
- advice
- assignment load
- team project burden
- grading style
- attendance style
- exam count

This made the data more usable in three places at once:

- course cards on the frontend
- keyword and field-based search
- the later RAG pipeline for the AI assistant

## Important Practical Point

The website is not just showing raw scraped text from Everytime.

The data first goes through:

- collection
- grouping
- normalization
- AI summarization
- storage into the course schema

If you want to build on top of this project, you can follow the same general idea.
You can also use a different data collection method if that works better for you.
