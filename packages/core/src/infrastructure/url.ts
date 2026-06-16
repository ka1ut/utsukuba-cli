import { basename } from "node:path";

export function absoluteUrl(baseUrl: string, href: string): string {
  return new URL(href, `${baseUrl}/`).toString();
}

export function courseIdFromUrl(value: string): string | null {
  return /course_(\d+)/.exec(value)?.[1] ?? null;
}

export function quizIdFromUrl(value: string): string | null {
  return /course_\d+_query_(\d+)/.exec(value)?.[1] ?? null;
}

export function reportIdFromUrl(value: string): string | null {
  return /course_\d+_report_(\d+)/.exec(value)?.[1] ?? null;
}

export function attachmentIdFromUrl(value: string): string | undefined {
  return /(?:_af_)?(\d+)(?:\/[^/]+)?(?:[?#].*)?$/.exec(value)?.[1];
}

export function contentPageIdFromUrl(value: string): string | null {
  return /(page_[^/?#]+)/.exec(value)?.[1] ?? null;
}

export function filenameFromUrl(value: string): string {
  const path = new URL(value, "https://example.invalid").pathname;
  return decodeURIComponent(basename(path));
}

export function taskTypeFromHref(href: string): "query" | "survey" | "report" | "project" | "drill" | "unknown" {
  if (/_query(?:_|$)/.test(href)) return "query";
  if (/_survey(?:_|$)/.test(href)) return "survey";
  if (/_report(?:_|$)/.test(href)) return "report";
  if (/_project(?:_|$)/.test(href)) return "project";
  if (/_drill(?:_|$)/.test(href)) return "drill";
  return "unknown";
}
