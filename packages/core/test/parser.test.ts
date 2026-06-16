import { expect, test } from "bun:test";
import {
  parseContentDetail,
  parseCourseShell,
  parseQuizList,
  parseReportDetail,
  parseTasks,
} from "../src/infrastructure/parsers";

test("parseTasks extracts unfinished task rows", () => {
  const html = `
    <table>
      <tr><th>タイプ</th><th>タイトル</th><th>コース</th><th>受付開始日時</th><th>受付終了日時</th><th>残り日数</th></tr>
      <tr>
        <td><a href="course_4128691_query">小テスト</a></td>
        <td><a href="course_4128691_query_4135379">第8回小テスト</a></td>
        <td><a href="course_4128691">確率と統計</a></td>
        <td>2026-04-21 12:58</td><td>2026-06-17 00:05</td><td>約13時間後</td>
      </tr>
    </table>`;

  expect(parseTasks(html, "https://manaba.tsukuba.ac.jp/ct")).toEqual([
    {
      id: "4135379",
      type: "query",
      title: "第8回小テスト",
      courseId: "4128691",
      courseTitle: "確率と統計",
      url: "https://manaba.tsukuba.ac.jp/ct/course_4128691_query_4135379",
      status: "約13時間後",
      startsAt: "2026-04-21 12:58",
      endsAt: "2026-06-17 00:05",
    },
  ]);
});

test("parseQuizList handles empty course quiz list", () => {
  const html = `<h1>小テスト一覧</h1><p>このコースには現在小テストはありません。</p>`;
  expect(parseQuizList(html, "3655105", "https://manaba.tsukuba.ac.jp/ct")).toEqual([]);
});

test("parseReportDetail extracts attachments", () => {
  const html = `
    <a href="course_4128712">プログラミング</a>
    <table>
      <tr><th>第一回レポート課題</th></tr>
      <tr><th>受付開始日時</th><td>2026-06-09 16:45</td></tr>
      <tr><th>受付終了日時</th><td>2026-06-16 15:00</td></tr>
      <tr><th>添付ファイル</th><td>
        <a href="course_4128712_report_4245496_af_3491411004/Programming2026Rep1.pdf?action=full&view=full">Programming2026Rep1.pdf</a>
      </td></tr>
      <tr><th>状態</th><td>受付中 提出済み</td></tr>
    </table>`;

  const detail = parseReportDetail(
    html,
    "4128712",
    "4245496",
    "https://manaba.tsukuba.ac.jp/ct",
  );

  expect(detail.id).toBe("4245496");
  expect(detail.title).toBe("第一回レポート課題");
  expect(detail.status).toBe("受付中 提出済み");
  expect(detail.attachments).toEqual([
    {
      id: "3491411004",
      filename: "Programming2026Rep1.pdf",
      url: "https://manaba.tsukuba.ac.jp/ct/course_4128712_report_4245496_af_3491411004/Programming2026Rep1.pdf?action=full&view=full",
      kind: "attachment",
    },
  ]);
});

test("parseContentDetail extracts downloadable files and page navigation", () => {
  const html = `
    <a href="course_4128715">コンピュータシステムとOS</a>
    <h1>第1回</h1>
    <a href="page_4142596c4128715_2417623150_2417623149/csos-01-1.pdf?view=full">csos-01-1.pdf</a>
    <a href="page_4142596c4128715_2417623150_2417623148/javaCASL2_2.0.zip?view=full">javaCASL2_2.0.zip - 2024-04-15</a>
    <a href="page_4142596c4128715_2417623153">次のページ</a>`;

  const detail = parseContentDetail(
    html,
    "4128715",
    "https://manaba.tsukuba.ac.jp/ct/page_4142596c4128715_2417623150",
    "https://manaba.tsukuba.ac.jp/ct",
  );

  expect(detail.title).toBe("第1回");
  expect(detail.attachments?.map((a) => a.filename)).toEqual(["csos-01-1.pdf", "javaCASL2_2.0.zip"]);
  expect(detail.nextUrl).toBe("https://manaba.tsukuba.ac.jp/ct/page_4142596c4128715_2417623153");
});

test("parseCourseShell extracts course metadata and tab URLs", () => {
  const html = `
    <span>GC11601</span>
    <a href="course_4128691">確率と統計</a>
    <a href="course_4128691_query">小テスト</a>
    <a href="course_4128691_report">レポート</a>
    <span>担当教員: 山本 幹雄</span>`;

  expect(parseCourseShell(html, "4128691", "https://manaba.tsukuba.ac.jp/ct")).toMatchObject({
    id: "4128691",
    title: "確率と統計",
    code: "GC11601",
    teacher: "山本 幹雄",
    tabs: {
      query: "https://manaba.tsukuba.ac.jp/ct/course_4128691_query",
      report: "https://manaba.tsukuba.ac.jp/ct/course_4128691_report",
    },
  });
});
