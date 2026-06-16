---
name: utsukuba-manaba-context
description: Combine manaba course/task/content data with KDB syllabus information for University of Tsukuba courses. Use when the user wants to enrich manaba courses with syllabus context, explain what a manaba course is about, connect assignments/materials to syllabus topics, or prepare contextual data for another agent from `utsukuba manaba` and `utsukuba kdb` outputs.
---

# Utsukuba Manaba Context

Use this skill to create useful course context from read-only manaba and KDB data.

## Workflow

1. Get manaba courses or tasks:

```sh
utsukuba courses list --pretty
utsukuba tasks list --pretty
utsukuba contents list <courseId> --pretty
```

2. For each manaba course with a course code, fetch KDB syllabus data:

```sh
utsukuba kdb syllabus show <courseCode> --year <year> --lang jpn --pretty
```

3. If the course code is missing from manaba, search KDB by title or teacher:

```sh
utsukuba kdb courses --year <year> --query "<course title>" --include-syllabus --pretty
```

4. Build a compact context object with:
   - manaba course id/title/url
   - KDB course code/title/credits/term/instructor
   - syllabus summary, aims, topics, textbooks, office hours
   - active tasks, reports, quizzes, and content attachments

## Rules

- Do not merge two courses unless course code or title/instructor/year strongly match.
- Keep source URLs in the output so later agents can verify provenance.
- If multiple KDB candidates match, present candidates and ask the user to choose before using the context for high-stakes planning.
- Use summaries, not full copied syllabus text, unless the user explicitly asks for raw CLI JSON.
