import * as cheerio from "cheerio";
import type {
  ContentPageSummary,
  CourseSummary,
  CourseTab,
  FileAttachment,
  QuizSummary,
  ReportSummary,
  TaskSummary,
  TaskType,
} from "../domain/types";
import {
  absoluteUrl,
  attachmentIdFromUrl,
  contentPageIdFromUrl,
  courseIdFromUrl,
  filenameFromUrl,
  quizIdFromUrl,
  reportIdFromUrl,
  taskTypeFromHref,
} from "./url";

const tabNames: CourseTab[] = ["query", "survey", "report", "project", "grade", "topics", "page"];

export function parseTasks(html: string, baseUrl: string): TaskSummary[] {
  const $ = cheerio.load(html);
  const tasks: TaskSummary[] = [];

  $("tr").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.length < 3) return;

    const typeLink = $(cells[0]).find("a").first();
    const titleLink = $(cells[1]).find("a").first();
    const courseLink = $(cells[2]).find("a").first();
    const titleHref = titleLink.attr("href");
    const courseHref = courseLink.attr("href");
    if (!titleHref || !courseHref) return;

    const courseId = courseIdFromUrl(courseHref);
    if (!courseId) return;
    const type = normalizeTaskType(typeLink.text(), titleHref);
    if (type === "unknown" && !/course_\d+_/.test(titleHref)) return;

    tasks.push({
      id: quizIdFromUrl(titleHref) ?? reportIdFromUrl(titleHref) ?? attachmentIdFromUrl(titleHref) ?? titleHref,
      type,
      title: text(titleLink.text()),
      courseId,
      courseTitle: text(courseLink.text()),
      url: absoluteUrl(baseUrl, titleHref),
      startsAt: text($(cells[3]).text()) || undefined,
      endsAt: text($(cells[4]).text()) || undefined,
      status: text($(cells[5]).text()) || undefined,
    });
  });

  return tasks;
}

export function parseCourseList(html: string, baseUrl: string): CourseSummary[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const courses: CourseSummary[] = [];

  $("a[href^='course_']").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    if (!/^course_\d+$/.test(href)) return;
    const id = courseIdFromUrl(href);
    const title = text($(element).text());
    if (!id || !title || seen.has(id)) return;
    seen.add(id);
    courses.push({ id, title, url: absoluteUrl(baseUrl, href) });
  });

  return courses;
}

export function parseCourseShell(html: string, courseId: string, baseUrl: string): CourseSummary {
  const $ = cheerio.load(html);
  const title = text($(`a[href='course_${courseId}']`).last().text()) || `course_${courseId}`;
  const allText = text($.root().text());
  const code = /([A-Z]{1,4}\d{4,6})/.exec(allText)?.[1];
  const teacher = /担当教員:\s*([^0-9\n]+?)(?:\s{2,}|20\d{2}|$)/.exec(allText)?.[1]?.trim();
  const tabs: Partial<Record<CourseTab, string>> = {};

  for (const tab of tabNames) {
    const href = $(`a[href='course_${courseId}_${tab}']`).attr("href");
    if (href) tabs[tab] = absoluteUrl(baseUrl, href);
  }

  return {
    id: courseId,
    title,
    url: absoluteUrl(baseUrl, `course_${courseId}`),
    code,
    teacher,
    tabs,
  };
}

export function parseQuizList(html: string, courseId: string, baseUrl: string): QuizSummary[] {
  return parseAssessmentRows(html, courseId, baseUrl, "query") as QuizSummary[];
}

export function parseReportList(html: string, courseId: string, baseUrl: string): ReportSummary[] {
  return parseAssessmentRows(html, courseId, baseUrl, "report") as ReportSummary[];
}

export function parseQuizDetail(html: string, courseId: string, quizId: string, baseUrl: string): QuizSummary {
  const $ = cheerio.load(html);
  return {
    id: quizId,
    title: firstHeadingOrTableTitle($) || `quiz_${quizId}`,
    courseId,
    url: absoluteUrl(baseUrl, `course_${courseId}_query_${quizId}`),
    status: findRowValue($, "状態") || undefined,
    startsAt: findRowValue($, "受付開始日時") || undefined,
    endsAt: findRowValue($, "受付終了日時") || undefined,
    attachments: parseAttachments($, baseUrl, "attachment"),
  };
}

export function parseReportDetail(html: string, courseId: string, reportId: string, baseUrl: string): ReportSummary {
  const $ = cheerio.load(html);
  return {
    id: reportId,
    title: firstHeadingOrTableTitle($) || `report_${reportId}`,
    courseId,
    url: absoluteUrl(baseUrl, `course_${courseId}_report_${reportId}`),
    status: findRowValue($, "状態") || undefined,
    startsAt: findRowValue($, "受付開始日時") || undefined,
    endsAt: findRowValue($, "受付終了日時") || undefined,
    attachments: parseAttachments($, baseUrl, "attachment"),
  };
}

export function parseContentList(html: string, courseId: string, baseUrl: string): ContentPageSummary[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const pages: ContentPageSummary[] = [];
  $("a[href^='page_']").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    if (href.includes("/")) return;
    const id = contentPageIdFromUrl(href);
    const title = text($(element).text());
    if (!id || !title || seen.has(id)) return;
    seen.add(id);
    pages.push({ id, title, courseId, url: absoluteUrl(baseUrl, href) });
  });
  return pages;
}

export function parseContentDetail(
  html: string,
  courseId: string | undefined,
  pageUrl: string,
  baseUrl: string,
): ContentPageSummary {
  const $ = cheerio.load(html);
  const id = contentPageIdFromUrl(pageUrl) ?? pageUrl;
  const nextHref = $("a").filter((_, el) => text($(el).text()) === "次のページ").attr("href");
  const previousHref = $("a").filter((_, el) => text($(el).text()) === "前のページ").attr("href");

  return {
    id,
    title: firstHeading($) || id,
    courseId,
    url: absoluteUrl(baseUrl, pageUrl),
    attachments: parseAttachments($, baseUrl, "content"),
    nextUrl: nextHref ? absoluteUrl(baseUrl, nextHref) : undefined,
    previousUrl: previousHref ? absoluteUrl(baseUrl, previousHref) : undefined,
  };
}

export function parseAttachmentsFromAnyPage(html: string, baseUrl: string): FileAttachment[] {
  return parseAttachments(cheerio.load(html), baseUrl, "unknown");
}

function parseAssessmentRows(
  html: string,
  courseId: string,
  baseUrl: string,
  kind: "query" | "report",
): Array<QuizSummary | ReportSummary> {
  const $ = cheerio.load(html);
  const rows: Array<QuizSummary | ReportSummary> = [];

  $(`a[href^='course_${courseId}_${kind}_']`).each((_, element) => {
    const href = $(element).attr("href") ?? "";
    const id = kind === "query" ? quizIdFromUrl(href) : reportIdFromUrl(href);
    const title = text($(element).text());
    if (!id || !title) return;
    rows.push({
      id,
      title,
      courseId,
      url: absoluteUrl(baseUrl, href),
    });
  });

  return uniqueBy(rows, (row) => row.id);
}

function parseAttachments(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  kind: FileAttachment["kind"],
): FileAttachment[] {
  const files: FileAttachment[] = [];
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") ?? "";
    if (!isFileHref(href)) return;
    const filename = cleanFilename(text($(element).text()) || filenameFromUrl(href));
    if (!filename) return;
    files.push({
      id: attachmentIdFromUrl(href),
      filename,
      url: absoluteUrl(baseUrl, href),
      kind,
    });
  });
  return uniqueBy(files, (file) => file.url);
}

function isFileHref(href: string): boolean {
  return (
    href.includes("?view=full") ||
    href.includes("action=full") ||
    /\.(pdf|zip|png|jpe?g|gif|txt|csv|tsv|docx?|xlsx?|pptx?|tex|bib|c|cpp|py|java)(?:[?#]|$)/i.test(href)
  );
}

function cleanFilename(value: string): string {
  return value.replace(/\s+-\s+\d{4}-\d{2}-\d{2}.*$/, "").trim();
}

function normalizeTaskType(label: string, href: string): TaskType {
  const cleaned = text(label);
  if (cleaned === "小テスト") return "query";
  if (cleaned === "アンケート") return "survey";
  if (cleaned === "レポート") return "report";
  if (cleaned === "プロジェクト") return "project";
  if (cleaned === "ドリル") return "drill";
  if (cleaned === "外部教材") return "external";
  return taskTypeFromHref(href);
}

function findRowValue($: cheerio.CheerioAPI, label: string): string {
  let value = "";
  $("tr").each((_, row) => {
    const header = text($(row).children("th,td").first().text());
    if (header !== label) return;
    value = text($(row).children("td").last().text());
  });
  return value;
}

function firstHeadingOrTableTitle($: cheerio.CheerioAPI): string {
  return firstHeading($) || text($("tr").first().children("th").first().text());
}

function firstHeading($: cheerio.CheerioAPI): string {
  return text($("h1,h2,h3").first().text());
}

function text(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueBy<T>(items: T[], key: (item: T) => string | undefined): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const value = key(item);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(item);
  }
  return result;
}
