import { expect, test } from "bun:test";
import {
  buildTwinsLoginPayload,
  parseTwinsMenuItems,
  parseTwinsPortalConfig,
  parseTwinsStudentProfile,
  parseTwinsRegistrations,
  parseTwinsGrades,
  resolveTwinsFeatureUrl,
  isTwinsAuthErrorHtml,
} from "../src/infrastructure/twins-parsers";

test("buildTwinsLoginPayload includes CAMPUSSQUARE ajax fields", () => {
  const html = `var currentTabId = 'home'; var portalConf = { 'page': '', 'rwfHash': 'abc123' };
    <form id="wf_PTW0060011_20120827233559-form">
      <input type="hidden" name="wfId" value="nwf_PTW0060002_login">
      <input type="hidden" name="locale" value="ja_JP">
    </form>`;

  expect(Object.fromEntries(buildTwinsLoginPayload(html, "0012025101433", "secret"))).toEqual({
    wfId: "nwf_PTW0060002_login",
    locale: "ja_JP",
    userName: "0012025101433",
    password: "secret",
    action: "rwf",
    tabId: "home",
    page: "",
    rwfHash: "abc123",
  });
});

test("parseTwinsPortalConfig reads dynamic portal values", () => {
  expect(parseTwinsPortalConfig("var currentTabId = 'home'; 'rwfHash' : 'hash-value', 'portalUrl' : 'portal.do'")).toEqual({
    currentTabId: "home",
    page: "",
    portalUrl: "portal.do",
    webUrl: "campussquare.do",
    rwfHash: "hash-value",
  });
});

test("parseTwinsStudentProfile extracts affiliation and grade", () => {
  const html = `<table><tr><th>学生番号</th><td>0012025101433</td></tr><tr><th>所属</th><td>情報学群 情報科学類</td></tr><tr><th>年次</th><td>2</td></tr></table>`;

  expect(parseTwinsStudentProfile(html)).toEqual({
    studentId: "0012025101433",
    affiliation: "情報学群 情報科学類",
    program: "情報学群 情報科学類",
    gradeYear: 2,
  });
});

test("parseTwinsRegistrations and parseTwinsGrades extract tables", () => {
  const registrations = `<table><tr><th>科目番号</th><th>科目名</th><th>年度</th><th>学期</th><th>単位</th><th>状態</th></tr>
    <tr><td>GC11601</td><td>確率と統計</td><td>2026</td><td>SprAB</td><td>2.0</td><td>履修中</td></tr></table>`;
  const grades = `<table><tr><th>科目番号</th><th>科目名</th><th>年度</th><th>単位</th><th>評価</th></tr>
    <tr><td>GB10101</td><td>線形代数A</td><td>2025</td><td>1.0</td><td>A</td></tr>
    <tr><td>GB10102</td><td>再履修</td><td>2025</td><td>1.0</td><td>D</td></tr></table>`;

  expect(parseTwinsRegistrations(registrations)).toEqual([
    { courseCode: "GC11601", title: "確率と統計", year: "2026", term: "SprAB", credits: 2, status: "履修中" },
  ]);
  expect(parseTwinsGrades(grades)).toEqual([
    { courseCode: "GB10101", title: "線形代数A", year: "2025", credits: 1, grade: "A", passed: true },
    { courseCode: "GB10102", title: "再履修", year: "2025", credits: 1, grade: "D", passed: false },
  ]);
});

test("parseTwinsGrades reads CAMPUSSQUARE grade status from 総合 column", () => {
  const html = `<table><tr><th>No.</th><th>年度</th><th>学期</th><th>科目区分</th><th>科目番号</th><th>科目名</th><th>主担当教員</th><th>単位数</th><th>春学期</th><th>秋学期</th><th>評点</th><th>総合</th></tr>
    <tr><td>1</td><td>2026</td><td>春AB</td><td>専門基礎科目</td><td>GC11601</td><td>確率と統計</td><td>山本 幹雄</td><td>2.0</td><td></td><td></td><td></td><td>履修中</td></tr>
    <tr><td>2</td><td>2025</td><td>春A</td><td>専門基礎科目</td><td>GA15131</td><td>情報数学A</td><td>教員</td><td>2.0</td><td>A</td><td></td><td>85</td><td>A</td></tr></table>`;

  expect(parseTwinsGrades(html)).toEqual([
    { courseCode: "GC11601", title: "確率と統計", year: "2026", credits: 2, grade: "履修中", passed: false },
    { courseCode: "GA15131", title: "情報数学A", year: "2025", credits: 2, grade: "A", passed: true },
  ]);
});

test("parseTwinsRegistrations extracts registered timetable cells", () => {
  const html = `<td width="130" align="center">2026年度　春B</td>
    <td background="/campusweb//theme/default/image/rs_tab_new.png" class="rishu-tab-sel" title="春Bを表示しています">春B</td>
    <table class="rishu-koma-inner"><tr><td>
      GC11601<br>確率と統計<br>山本 幹雄
    </td></tr></table>
    <table class="rishu-koma-inner"><tr><td>未登録</td></tr></table>
    <table class="rishu-koma-inner"><tr><td>
      GC11601<br>確率と統計<br>山本 幹雄
    </td></tr></table>`;

  expect(parseTwinsRegistrations(html)).toEqual([
    { courseCode: "GC11601", title: "確率と統計", year: "2026", term: "春B", credits: 0, status: "履修中" },
  ]);
});

test("parseTwinsMenuItems extracts campussquare flow links from authenticated portal HTML", () => {
  const html = `
    <a href="campussquare.do?_flowId=RSW0001000-flow">履修登録・登録状況照会</a>
    <a href="javascript:void(0)" onclick="loadPortletMenu('main','campussquare.do?_flowId=GRD0001000-flow&_campus_new_portal=true')">成績照会</a>
    <a href="javascript:void(0)" onclick="loadWebMain('PRF0001000-flow')">学生情報</a>`;

  expect(parseTwinsMenuItems(html)).toEqual([
    {
      label: "履修登録・登録状況照会",
      url: "campussquare.do?_flowId=RSW0001000-flow",
      flowId: "RSW0001000-flow",
    },
    {
      label: "成績照会",
      url: "campussquare.do?_flowId=GRD0001000-flow&_campus_new_portal=true",
      flowId: "GRD0001000-flow",
    },
    {
      label: "学生情報",
      url: "campussquare.do?_flowId=PRF0001000-flow",
      flowId: "PRF0001000-flow",
    },
  ]);
});

test("resolveTwinsFeatureUrl chooses registration and grade menu candidates", () => {
  const html = `
    <a href="campussquare.do?_flowId=RSW0001000-flow">履修登録・登録状況照会</a>
    <a href="campussquare.do?_flowId=GRD0001000-flow">成績照会</a>`;

  expect(resolveTwinsFeatureUrl(html, "registrations")).toBe("campussquare.do?_flowId=RSW0001000-flow");
  expect(resolveTwinsFeatureUrl(html, "grades")).toBe("campussquare.do?_flowId=GRD0001000-flow");
});

test("isTwinsAuthErrorHtml detects login and authorization error pages", () => {
  expect(isTwinsAuthErrorHtml("<title>認証エラー</title>")).toBe(true);
  expect(isTwinsAuthErrorHtml('<body class="login-inactive"><input id="passwordInput"></body>')).toBe(true);
  expect(isTwinsAuthErrorHtml('<main class="login-active"><span>成績照会</span></main>')).toBe(false);
});
