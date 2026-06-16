import { expect, test } from "bun:test";
import { parseKdbCourseSearchResponse, parseKdbSyllabus } from "../src/infrastructure/kdb-parsers";

test("parseKdbCourseSearchResponse extracts courses from KDB JSON list HTML", () => {
  const response = {
    status: "success",
    total: 1,
    list: `
      <table class="ut-list ut-result" e="GC11601" se="0">
        <tr>
          <td><p class="ut-course">GC11601</p></td>
          <td><p class="ut-title">Probability and Statistics</p></td>
          <td><p class="ut-style"><span s="1">1</span></p></td>
          <td><p class="ut-credit">2.0</p></td>
          <td><p class="ut-grade">2</p></td>
          <td><p class="ut-term">SprAB</p></td>
          <td><p class="ut-day">Wed1,2</p></td>
          <td><p class="ut-agent">Mikio Yamamoto</p></td>
          <td><p class="ut-body">統計学の基礎となる...</p></td>
          <td><p class="ut-remark">face-to-face(partially online)</p></td>
        </tr>
      </table>`,
  };

  expect(parseKdbCourseSearchResponse(response, "2026", "https://kdb.tsukuba.ac.jp")).toEqual([
    {
      code: "GC11601",
      subcourse: "0",
      title: "Probability and Statistics",
      credits: 2,
      grade: "2",
      term: "SprAB",
      dayPeriod: "Wed1,2",
      instructor: "Mikio Yamamoto",
      overview: "統計学の基礎となる...",
      remarks: "face-to-face(partially online)",
      year: "2026",
      syllabusUrl: "https://kdb.tsukuba.ac.jp/syllabi/2026/GC11601/jpn/0/",
    },
  ]);
});

test("parseKdbSyllabus extracts core syllabus fields", () => {
  const html = `
    <h1 id="course-title"><span id="course">GC11601</span> <span id="title">確率と統計</span></h1>
    <h2 id="summary-heading">授業概要</h2>
    <p id="summary-contents">統計学の基礎となる確率論を学ぶ。</p>
    <h2 id="aim-heading">授業の到達目標</h2>
    <p id="aim">確率論に慣れる。</p>
    <p id="keyword">確率分布, 確率変数</p>
    <div id="topic-assignments"><table><tr><th>第1回</th><td>確率入門</td></tr></table></div>
    <p id="textbook-textbook">薩摩順吉, 確率・統計</p>
    <p id="preoffice">manabaの授業資料参照。</p>`;

  expect(parseKdbSyllabus(html, "2026", "jpn")).toMatchObject({
    code: "GC11601",
    title: "確率と統計",
    year: "2026",
    language: "jpn",
    summary: "統計学の基礎となる確率論を学ぶ。",
    aims: "確率論に慣れる。",
    keywords: ["確率分布", "確率変数"],
    topics: [{ label: "第1回", title: "確率入門" }],
    textbooks: ["薩摩順吉, 確率・統計"],
    officeHours: "manabaの授業資料参照。",
  });
});
