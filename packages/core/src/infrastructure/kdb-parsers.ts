import * as cheerio from "cheerio";
import type { KdbCourse, KdbSyllabus } from "../domain/types";

type KdbSearchResponse = {
  status?: string;
  message?: string;
  total?: number;
  list?: string;
};

export function parseKdbCourseSearchResponse(response: KdbSearchResponse, year: string, baseUrl: string): KdbCourse[] {
  if (response.message) throw new Error(response.message);
  const $ = cheerio.load(response.list ?? "");
  const courses: KdbCourse[] = [];

  $("table.ut-result").each((_, table) => {
    const code = text($(table).attr("e") ?? $(table).find(".ut-course").first().text());
    const subcourse = text($(table).attr("se") ?? "0") || "0";
    const title = text($(table).find(".ut-title").first().text());
    if (!code || !title) return;
    courses.push({
      code,
      subcourse,
      title,
      credits: Number.parseFloat(text($(table).find(".ut-credit").first().text())) || 0,
      grade: optionalText($(table).find(".ut-grade").first().text()),
      term: optionalText($(table).find(".ut-term").first().text()),
      dayPeriod: optionalText($(table).find(".ut-day").first().text()),
      instructor: optionalText($(table).find(".ut-agent").first().text()),
      overview: optionalText($(table).find(".ut-body").first().text()),
      remarks: optionalText($(table).find(".ut-remark").first().text()),
      year,
      syllabusUrl: `${stripTrailingSlash(baseUrl)}/syllabi/${year}/${code}/jpn/${subcourse}/`,
    });
  });

  return courses;
}

export function parseKdbSyllabus(html: string, year: string, language: "jpn" | "eng"): KdbSyllabus {
  const $ = cheerio.load(html);
  const code = text($("#course").first().text());
  const title = text($("#title").first().text());
  if (!code || !title) {
    const heading = text($("h1").first().text());
    throw new Error(heading || "Syllabus not found.");
  }

  const topics: KdbSyllabus["topics"] = [];
  $("#topic-assignments tr").each((_, row) => {
    const label = text($(row).children("th").first().text());
    const topicTitle = text($(row).children("td").first().text());
    if (label || topicTitle) topics.push({ label, title: topicTitle });
  });

  const textbooks: string[] = [];
  $("[id^='textbook']").each((_, el) => {
    const value = text($(el).text());
    if (value) textbooks.push(value);
  });

  return {
    code,
    title,
    year,
    language,
    summary: optionalText($("#summary-contents").text()),
    aims: optionalText($("#aim").text()),
    keywords: text($("#keyword").text()).split(",").map((part) => text(part)).filter(Boolean),
    topics,
    textbooks,
    officeHours: optionalText($("#preoffice").text()),
  };
}

function optionalText(value: string): string | undefined {
  return text(value) || undefined;
}

function text(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
