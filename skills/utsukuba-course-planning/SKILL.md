---
name: utsukuba-course-planning
description: Analyze TWINS grades/registrations, KDB course candidates, and imported RequirementSpec data to compute remaining credits and recommend read-only course plans. Use when the user asks for 履修計画, 単位計算, graduation progress, recommended courses, timetable-aware course choices, or how to satisfy Tsukuba requirements using `utsukuba` CLI outputs.
---

# Utsukuba Course Planning

Use this skill for advisory planning only. Never perform TWINS enrollment or claim that a plan is officially approved.

## Inputs

Prefer structured CLI outputs:

```sh
utsukuba twins grades --pretty > grades.json
utsukuba twins registrations --pretty > registrations.json
utsukuba kdb courses --year 2026 --query "<keyword>" --include-syllabus --pretty > courses.json
utsukuba plan progress --grades grades.json --registrations registrations.json --pretty
utsukuba plan recommend --courses courses.json --grades grades.json --registrations registrations.json --pretty
```

If live TWINS extraction is not available, accept uploaded JSON exports or pasted tables and normalize them to `TwinGrade[]`, `TwinRegistration[]`, and `KdbCourse[]`.

## Planning Process

1. Confirm the active requirement file with `utsukuba requirements show --pretty`.
2. Calculate current progress before recommending anything.
3. Treat passed grades as earned credits, failed grades as zero credits, and current registrations as in-progress credits.
4. Exclude courses already passed or currently registered.
5. Prefer courses that satisfy explicit shortages, have matching prefixes/codes, and expose a KDB syllabus URL.
6. Flag time conflicts using KDB `term` and `dayPeriod` when available. If terms are unclear, say so instead of resolving conflicts by guesswork.

## Response Style

- Start with remaining credits by category.
- Then list recommended courses with course code, title, credits, matched requirement category, term/time, and syllabus URL.
- Include caveats for advisor approval, special program rules, transfer credits, or prose-only notes from the requirement file.
- Keep final recommendations read-only and phrase them as candidates, not registration instructions.
