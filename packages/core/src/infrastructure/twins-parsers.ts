import * as cheerio from "cheerio";
import type { StudentProfile, TwinGrade, TwinRegistration } from "../domain/types";

export type TwinsPortalConfig = {
  currentTabId: string;
  page: string;
  portalUrl: string;
  webUrl: string;
  rwfHash: string;
};

export type TwinsFeature = "profile" | "registrations" | "grades";

export type TwinsMenuItem = {
  label: string;
  url: string;
  flowId?: string;
};

export function parseTwinsPortalConfig(html: string): TwinsPortalConfig {
  return {
    currentTabId: matchString(html, /currentTabId\s*=\s*'([^']*)'/) ?? "home",
    page: matchString(html, /'page'\s*:\s*'([^']*)'/) ?? "",
    portalUrl: matchString(html, /'portalUrl'\s*:\s*'([^']*)'/) ?? "portal.do",
    webUrl: matchString(html, /'webUrl'\s*:\s*'([^']*)'/) ?? "campussquare.do",
    rwfHash: matchString(html, /'rwfHash'\s*:\s*'([^']*)'/) ?? "",
  };
}

export function buildTwinsLoginPayload(html: string, username: string, password: string): URLSearchParams {
  const $ = cheerio.load(html);
  const config = parseTwinsPortalConfig(html);
  const params = new URLSearchParams();
  $("#wf_PTW0060011_20120827233559-form").find("input").each((_, input) => {
    const name = $(input).attr("name");
    if (name) params.set(name, $(input).attr("value") ?? "");
  });
  params.set("userName", username);
  params.set("password", password);
  params.set("action", "rwf");
  params.set("tabId", config.currentTabId);
  params.set("page", config.page);
  params.set("rwfHash", config.rwfHash);
  return params;
}

export function parseTwinsMenuItems(html: string): TwinsMenuItem[] {
  const $ = cheerio.load(html);
  const items: TwinsMenuItem[] = [];

  $("a,button,[onclick]").each((_, element) => {
    const label = clean($(element).text() || $(element).attr("title") || $(element).attr("aria-label") || "");
    const candidates = [
      $(element).attr("href"),
      $(element).attr("onclick"),
      $(element).attr("data-url"),
    ].filter((value): value is string => Boolean(value));

    for (const candidate of candidates) {
      const url = extractTwinsMenuUrl(candidate);
      if (!url) continue;
      const flowId = /_flowId=([^&'")]+)/.exec(url)?.[1];
      items.push({ label, url, flowId });
      break;
    }
  });

  return uniqueBy(items.filter((item) => item.label && item.url), (item) => `${item.label}\n${item.url}`);
}

export function resolveTwinsFeatureUrl(html: string, feature: TwinsFeature): string | undefined {
  const items = parseTwinsMenuItems(html);
  const keywords = featureKeywords[feature];
  const scored = items
    .map((item) => ({ item, score: scoreMenuItem(item, keywords) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.item.url;
}

export function isTwinsAuthErrorHtml(html: string): boolean {
  return /<title>\s*認証エラー\s*<\/title>/i.test(html) ||
    /authorization-error-flow/.test(html) ||
    /login-inactive|ログインフォーム|passwordInput/.test(html);
}

export function parseTwinsStudentProfile(html: string): StudentProfile {
  const studentId = findTableValue(html, ["学生番号", "学籍番号", "Student ID"]);
  const affiliation = findTableValue(html, ["所属", "Affiliation", "College", "School"]);
  const gradeText = findTableValue(html, ["年次", "学年", "Grade"]);
  return {
    studentId,
    affiliation,
    program: affiliation,
    gradeYear: gradeText ? Number.parseInt(gradeText, 10) || undefined : undefined,
  };
}

export function parseTwinsRegistrations(html: string): TwinRegistration[] {
  const rows = parseRows(html).map((row) => ({
    courseCode: value(row, ["科目番号", "科目コード", "Course Number", "Course Code"]),
    title: value(row, ["科目名", "Course Name"]),
    year: optional(value(row, ["年度", "Year"])),
    term: optional(value(row, ["学期", "Term"])),
    credits: Number.parseFloat(value(row, ["単位", "Credits"])) || 0,
    status: optional(value(row, ["状態", "Status"])),
  })).filter((row) => row.courseCode && row.title);
  if (rows.length > 0) return rows;
  return parseRegistrationTimetable(html);
}

export function parseTwinsGrades(html: string): TwinGrade[] {
  return parseRows(html).map((row) => {
    const grade = firstValue(row, ["総合", "評価", "成績", "評語", "Grade", "春学期", "秋学期", "評点"]);
    return {
      courseCode: value(row, ["科目番号", "科目コード", "Course Number", "Course Code"]),
      title: value(row, ["科目名", "Course Name"]),
      year: optional(value(row, ["年度", "Year"])),
      credits: Number.parseFloat(value(row, ["単位", "単位数", "Credits"])) || 0,
      grade,
      passed: isPassingGrade(grade),
    };
  }).filter((row) => row.courseCode && row.title);
}

function findTableValue(html: string, labels: string[]): string | undefined {
  const $ = cheerio.load(html);
  let result: string | undefined;
  $("tr").each((_, row) => {
    const cells = $(row).children("th,td");
    const label = clean($(cells[0]).text());
    if (!labels.some((candidate) => label.includes(candidate))) return;
    result = clean($(cells[1]).text());
  });
  return result;
}

function parseRows(html: string): Array<Record<string, string>> {
  const $ = cheerio.load(html);
  const rows: Array<Record<string, string>> = [];
  $("table").each((_, table) => {
    const headers = $(table).find("tr").first().children("th,td").map((__, cell) => clean($(cell).text())).get();
    if (headers.length === 0) return;
    $(table).find("tr").slice(1).each((__, row) => {
      const values = $(row).children("td,th").map((___, cell) => clean($(cell).text())).get();
      if (values.length === 0) return;
      rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
    });
  });
  return rows;
}

function value(row: Record<string, string>, labels: string[]): string {
  for (const label of labels) {
    const key = Object.keys(row).find((candidate) => candidate.includes(label));
    if (key) return row[key] ?? "";
  }
  return "";
}

function firstValue(row: Record<string, string>, labels: string[]): string | undefined {
  for (const label of labels) {
    const found = value(row, [label]);
    if (found) return found;
  }
  return undefined;
}

function parseRegistrationTimetable(html: string): TwinRegistration[] {
  const $ = cheerio.load(html);
  const year = /(\d{4})年度/.exec(clean($.root().text()))?.[1];
  const selectedTerm = clean($(".rishu-tab-sel").first().text());
  const titleTerm = /(\S+)を表示しています/.exec($(".rishu-tab-sel").attr("title") ?? "")?.[1] ?? "";
  const pageTerm = /(?:\d{4})年度\s*([^\s]+)/.exec(clean($.root().text()))?.[1] ?? "";
  const term = optional(selectedTerm || titleTerm || pageTerm);
  const registrations: TwinRegistration[] = [];

  $(".rishu-koma-inner td").each((_, cell) => {
    const lines = ($(cell).html() ?? "")
      .split(/<br\s*\/?>/i)
      .map((part) => clean(cheerio.load(part).text()))
      .filter(Boolean);
    const courseCode = lines.find((line) => /^[A-Z0-9]{5,}$/.test(line) && line !== "未登録");
    if (!courseCode) return;
    const codeIndex = lines.indexOf(courseCode);
    const title = lines[codeIndex + 1] ?? "";
    if (!title || title === "未登録") return;
    registrations.push({ courseCode, title, year, term, credits: 0, status: "履修中" });
  });

  return uniqueBy(registrations, (item) => `${item.courseCode}\n${item.title}\n${item.term ?? ""}`);
}

function isPassingGrade(grade: string | undefined): boolean {
  if (!grade) return false;
  return !/^(D|F|不可|不合格|未修得|履修中|未確定|未評価|保留|-|0)$/.test(grade.trim());
}

function optional(value: string): string | undefined {
  return value || undefined;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function matchString(value: string, pattern: RegExp): string | undefined {
  return pattern.exec(value)?.[1];
}

const featureKeywords: Record<TwinsFeature, string[]> = {
  profile: ["学生情報", "個人情報", "学籍", "Student Information", "Student Profile"],
  registrations: ["履修登録", "履修状況", "履修", "登録状況", "Course Registration", "Registration"],
  grades: ["成績照会", "成績", "修得単位", "Grade", "Grades", "Academic Record"],
};

function extractTwinsMenuUrl(value: string): string | undefined {
  if (/^campussquare\.do\?/.test(value)) return value;
  const directUrl = /(campussquare\.do\?[^'")\s]+)/.exec(value)?.[1];
  if (directUrl) return directUrl.replace(/&amp;/g, "&");
  const flowFromLoadWebMain = /loadWebMain\(['"]([^'"]+)['"]/.exec(value)?.[1];
  if (flowFromLoadWebMain) return `campussquare.do?_flowId=${flowFromLoadWebMain}`;
  const flowId = /_flowId=([^&'")\s]+)/.exec(value)?.[1];
  if (flowId) return `campussquare.do?_flowId=${flowId}`;
  return undefined;
}

function scoreMenuItem(item: TwinsMenuItem, keywords: string[]): number {
  const label = item.label.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (label.includes(keyword.toLowerCase())) score += keyword.length;
  }
  if (item.url.includes("_flowId=")) score += 1;
  return score;
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(item);
  }
  return result;
}
