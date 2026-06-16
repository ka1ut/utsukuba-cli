---
name: utsukuba-requirements
description: Convert University of Tsukuba curriculum handbooks, uploaded requirement documents, PDFs, HTML pages, or user notes into structured RequirementSpec JSON for utsukuba CLI. Use when calculating graduation/completion requirements, importing user-provided requirement rules, extracting required credits by category, or reviewing whether a requirement file is suitable for `utsukuba requirements import`.
---

# Utsukuba Requirements

Use this skill to turn human-readable Tsukuba requirement material into a conservative `RequirementSpec` JSON document for `utsukuba requirements import --file`.

## Workflow

1. Identify the student's program, admission year, and source year. If TWINS data is available, prefer `utsukuba twins profile --pretty` for affiliation/program.
2. Gather official context with `utsukuba requirements fetch-handbook --year <year> --pretty` when the user references the handbook URL. The URL pattern is `https://www.tsukuba.ac.jp/education/g-courses-handbook/<year>rishu.html`.
3. Extract only rules that are explicit in the source. Do not infer hidden substitutions, exceptions, advisor approvals, or transfer-credit treatment.
4. Produce a JSON object matching this shape:

```json
{
  "program": "情報学群 情報科学類",
  "admissionYear": "2025",
  "categories": [
    {
      "id": "major-required",
      "name": "専門必修",
      "minCredits": 20,
      "coursePrefixes": ["GE"],
      "courseCodes": ["GE10101"]
    }
  ],
  "courseRules": [],
  "notes": ["Source: ..."]
}
```

## Rules

- Use stable ASCII keys and Japanese display names.
- Include `coursePrefixes` only when the source defines a clear course-number family.
- Include `courseCodes` only for named courses.
- Put ambiguous or prose-only constraints in `notes`; do not encode them as executable rules.
- If the source has undergraduate and graduate sections, keep only the section matching the user's program.
- Before telling the user the file is ready, check it with `utsukuba requirements import --file <file> --name <name>` or by parsing JSON locally.

## Output

Return the path to the JSON file and a short list of assumptions. If any requirement is ambiguous, clearly mark it as not encoded and quote a short source label rather than silently guessing.
