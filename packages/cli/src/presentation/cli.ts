import { Command } from "commander";
import ora from "ora";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  calculateAcademicSummary,
  calculateRequirementProgress,
  createKdbClient,
  createManabaClient,
  createTwinsClient,
  loadServiceConfig,
  recommendCourses,
} from "@manaba/core";
import { printData } from "./format";
import { printError } from "./output";
import { promptPassword, promptText } from "./prompts";
import type {
  AppConfig,
  KdbCourse,
  ManabaClient,
  RequirementSpec,
  TaskType,
  TwinGrade,
  TwinRegistration,
} from "@manaba/core";

type GlobalOptions = {
  profile?: string;
  baseUrl?: string;
  json?: boolean;
  pretty?: boolean;
  debug?: boolean;
};

type Deps = {
  opts: GlobalOptions;
  config: AppConfig;
  client: ManabaClient;
};

export function createCli(): Command {
  const program = new Command();
  program
    .name("utsukuba")
    .description("Read-only CLI for University of Tsukuba systems")
    .option("--profile <name>", "auth profile name")
    .option("--base-url <url>", "manaba /ct base URL")
    .option("--json", "output compact JSON")
    .option("--pretty", "output pretty JSON")
    .option("--debug", "print HTTP method/status/url to stderr");

  const deps = (): Deps => {
    const opts = program.opts<GlobalOptions>();
    const config = loadServiceConfig("manaba", {
      profile: opts.profile,
      baseUrl: opts.baseUrl,
      debug: opts.debug,
    });
    return { opts, config, client: createManabaClient(config) };
  };

  const serviceConfig = (service: "kdb" | "twins", baseUrl?: string): AppConfig => {
    const opts = program.opts<GlobalOptions>();
    return loadServiceConfig(service, {
      profile: opts.profile,
      baseUrl,
      debug: opts.debug,
    });
  };

  const run = <T>(label: string, action: (ctx: Deps) => Promise<T>, render?: (data: T, ctx: Deps) => void) => {
    return async () => {
      const ctx = deps();
      const spinner = ctx.opts.json || ctx.opts.pretty ? null : ora(label).start();
      try {
        const data = await action(ctx);
        spinner?.stop();
        if (render && !ctx.opts.json && !ctx.opts.pretty) render(data, ctx);
        else printData(data, ctx.opts);
      } catch (error) {
        spinner?.fail(label);
        printError(error);
        process.exitCode = 1;
      }
    };
  };

  const loginAction = async (cmd: { check?: boolean; username?: string; password?: string; saveCredentials?: boolean }) => {
    const ctx = deps();
    try {
      if (cmd.check) {
        const result = await ctx.client.auth.check();
        printData(result, ctx.opts);
        process.exitCode = result.ok ? 0 : 2;
        return;
      }

      const username = cmd.username ?? await promptText("manaba ID");
      const password = cmd.password ?? await promptPassword("Password");
      const profile = await ctx.client.auth.login({
        username,
        password,
        saveCredentials: cmd.saveCredentials,
      });
      printData({
        profile: profile.profile,
        username: profile.username,
        credentialStored: profile.credentialStored,
        cookies: profile.cookies.length,
        savedAt: profile.savedAt,
      }, ctx.opts);
    } catch (error) {
      printError(error);
      process.exitCode = 1;
    }
  };

  const addManabaCommands = (parent: Command) => {
    parent
      .command("login")
      .description("Authenticate and save session cookies; credentials are stored in macOS Keychain by default")
      .option("--username <id>", "university user ID")
      .option("--password <password>", "password; prefer interactive prompt")
      .option("--no-save-credentials", "do not save ID/PASS in macOS Keychain for refresh")
      .option("--check", "only validate current saved auth")
      .action(loginAction);

    parent.command("logout").description("Remove saved auth profile and Keychain credentials").action(run("Logging out", ({ client }) => client.auth.logout(), () => {
      console.log("Logged out.");
    }));

    parent.command("doctor").description("Diagnose config and authentication").action(run("Running doctor", async ({ config, client }) => {
      const auth = await client.auth.check();
      return {
        package: "utsukuba-cli",
        service: "manaba",
        baseUrl: config.baseUrl,
        profile: config.profile,
        authFile: config.authFile,
        auth,
      };
    }));

    const courses = parent.command("courses").description("Course commands");
    courses.command("list").description("List courses").action(run("Fetching courses", ({ client }) => client.courses.list()));
    courses.command("show <courseId>").description("Show course metadata").action((courseId) => run("Fetching course", ({ client }) => client.courses.show(courseId))());

    const tasks = parent.command("tasks").description("Task commands");
    tasks.command("list")
      .description("List unfinished tasks")
      .option("--type <type>", "all|query|survey|report|project", "all")
      .option("--hidden", "include hidden task page if available")
      .action((cmd) => run("Fetching tasks", ({ client }) => client.tasks.list({
        type: cmd.type as TaskType,
        hidden: cmd.hidden ?? false,
      }))());
    tasks.command("show <taskUrlOrId>").description("Show task detail").action((target) => run("Fetching task", ({ client }) => client.tasks.show(target))());

    const quizzes = parent.command("quizzes").description("Quiz commands");
    quizzes.command("list <courseId>").action((courseId) => run("Fetching quizzes", ({ client }) => client.quizzes.list(courseId))());
    quizzes.command("show <courseId> <quizId>").action((courseId, quizId) => run("Fetching quiz", ({ client }) => client.quizzes.show(courseId, quizId))());

    const reports = parent.command("reports").description("Report commands");
    reports.command("list <courseId>").action((courseId) => run("Fetching reports", ({ client }) => client.reports.list(courseId))());
    reports.command("show <courseId> <reportId>").action((courseId, reportId) => run("Fetching report", ({ client }) => client.reports.show(courseId, reportId))());

    const contents = parent.command("contents").description("Course content commands");
    contents.command("list <courseId>").action((courseId) => run("Fetching contents", ({ client }) => client.contents.list(courseId))());
    contents.command("show <pageUrlOrId>").action((target) => run("Fetching content", ({ client }) => client.contents.show(target))());

    const files = parent.command("files").description("File commands");
    files.command("list <target>").description("List files from a course/page/task").action((target) => run("Fetching files", ({ client }) => client.files.list(target))());
    files.command("download <url>")
      .description("Download an authenticated file")
      .requiredOption("--out <dir>", "output directory")
      .option("--overwrite", "overwrite existing files")
      .action((url, cmd) => run("Downloading file", ({ client }) => client.files.download(url, cmd.out, {
        overwrite: cmd.overwrite ?? false,
      }))());
  };

  program
    .command("login")
    .description("Authenticate and save session cookies; credentials are stored in macOS Keychain by default")
    .option("--username <id>", "university user ID")
    .option("--password <password>", "password; prefer interactive prompt")
    .option("--no-save-credentials", "do not save ID/PASS in macOS Keychain for refresh")
    .option("--check", "only validate current saved auth")
    .action(loginAction);

  program.command("logout").description("Remove saved auth profile and Keychain credentials").action(run("Logging out", ({ client }) => client.auth.logout(), () => {
    console.log("Logged out.");
  }));

  program.command("doctor").description("Diagnose config and authentication").action(run("Running doctor", async ({ config, client }) => {
    const auth = await client.auth.check();
    return {
      package: "utsukuba-cli",
      baseUrl: config.baseUrl,
      profile: config.profile,
      authFile: config.authFile,
      auth,
    };
  }));

  const courses = program.command("courses").description("Course commands");
  courses.command("list").description("List courses").action(run("Fetching courses", ({ client }) => client.courses.list()));
  courses.command("show <courseId>").description("Show course metadata").action((courseId) => run("Fetching course", ({ client }) => client.courses.show(courseId))());

  const tasks = program.command("tasks").description("Task commands");
  tasks.command("list")
    .description("List unfinished tasks")
    .option("--type <type>", "all|query|survey|report|project", "all")
    .option("--hidden", "include hidden task page if available")
    .action((cmd) => run("Fetching tasks", ({ client }) => client.tasks.list({
      type: cmd.type as TaskType,
      hidden: cmd.hidden ?? false,
    }))());
  tasks.command("show <taskUrlOrId>").description("Show task detail").action((target) => run("Fetching task", ({ client }) => client.tasks.show(target))());

  const quizzes = program.command("quizzes").description("Quiz commands");
  quizzes.command("list <courseId>").action((courseId) => run("Fetching quizzes", ({ client }) => client.quizzes.list(courseId))());
  quizzes.command("show <courseId> <quizId>").action((courseId, quizId) => run("Fetching quiz", ({ client }) => client.quizzes.show(courseId, quizId))());

  const reports = program.command("reports").description("Report commands");
  reports.command("list <courseId>").action((courseId) => run("Fetching reports", ({ client }) => client.reports.list(courseId))());
  reports.command("show <courseId> <reportId>").action((courseId, reportId) => run("Fetching report", ({ client }) => client.reports.show(courseId, reportId))());

  const contents = program.command("contents").description("Course content commands");
  contents.command("list <courseId>").action((courseId) => run("Fetching contents", ({ client }) => client.contents.list(courseId))());
  contents.command("show <pageUrlOrId>").action((target) => run("Fetching content", ({ client }) => client.contents.show(target))());

  const files = program.command("files").description("File commands");
  files.command("list <target>").description("List files from a course/page/task").action((target) => run("Fetching files", ({ client }) => client.files.list(target))());
  files.command("download <url>")
    .description("Download an authenticated file")
    .requiredOption("--out <dir>", "output directory")
    .option("--overwrite", "overwrite existing files")
    .action((url, cmd) => run("Downloading file", ({ client }) => client.files.download(url, cmd.out, {
      overwrite: cmd.overwrite ?? false,
    }))());

  addManabaCommands(program.command("manaba").description("manaba LMS commands"));

  const kdb = program.command("kdb").description("KDB syllabus and course catalog commands");
  kdb.command("courses")
    .description("Search KDB courses")
    .requiredOption("--year <year>", "academic year, e.g. 2026")
    .option("--query <text>", "keyword, course code, or teacher")
    .option("--term <code>", "KDB term code")
    .option("--day <code>", "KDB day code")
    .option("--period <code>", "KDB period code")
    .option("--include-syllabus", "search overview, remarks, and syllabi")
    .option("--english", "conducted in English")
    .option("--base-url <url>", "KDB base URL")
    .action((cmd) => run("Searching KDB", async () => {
      const client = createKdbClient(serviceConfig("kdb", cmd.baseUrl));
      return client.courses.search({
        year: cmd.year,
        query: cmd.query,
        term: cmd.term,
        day: cmd.day,
        period: cmd.period,
        includeSyllabus: cmd.includeSyllabus ?? false,
        conductedInEnglish: cmd.english ?? false,
      });
    })());

  const syllabus = kdb.command("syllabus").description("KDB syllabus commands");
  syllabus.command("show <courseCode>")
    .description("Show a structured syllabus")
    .requiredOption("--year <year>", "academic year, e.g. 2026")
    .option("--subcourse <id>", "subcourse id", "0")
    .option("--lang <lang>", "jpn|eng", "jpn")
    .option("--base-url <url>", "KDB base URL")
    .action((courseCode, cmd) => run("Fetching syllabus", async () => {
      const client = createKdbClient(serviceConfig("kdb", cmd.baseUrl));
      return client.syllabus.show(courseCode, {
        year: cmd.year,
        subcourse: cmd.subcourse,
        language: cmd.lang,
      });
    })());
  syllabus.command("html <courseCode>")
    .description("Print raw KDB syllabus HTML")
    .requiredOption("--year <year>", "academic year, e.g. 2026")
    .option("--subcourse <id>", "subcourse id", "0")
    .option("--lang <lang>", "jpn|eng", "jpn")
    .option("--base-url <url>", "KDB base URL")
    .action((courseCode, cmd) => run("Fetching syllabus HTML", async () => {
      const client = createKdbClient(serviceConfig("kdb", cmd.baseUrl));
      return client.syllabus.html(courseCode, {
        year: cmd.year,
        subcourse: cmd.subcourse,
        language: cmd.lang,
      });
    }, (html) => console.log(html))());

  const twins = program.command("twins").description("TWINS / CAMPUSSQUARE commands");
  twins.command("login")
    .description("Authenticate to TWINS; credentials are shared with utsukuba profile")
    .option("--username <id>", "university user ID")
    .option("--password <password>", "password; prefer interactive prompt")
    .option("--no-save-credentials", "do not save credentials in macOS Keychain")
    .option("--base-url <url>", "TWINS base URL")
    .action(async (cmd) => {
      const opts = program.opts<GlobalOptions>();
      const config = serviceConfig("twins", cmd.baseUrl);
      const client = createTwinsClient(config);
      try {
        const username = cmd.username ?? await promptText("TWINS ID");
        const password = cmd.password ?? await promptPassword("Password");
        const profile = await client.auth.login({ username, password, saveCredentials: cmd.saveCredentials });
        printData({
          profile: profile.profile,
          username: profile.username,
          credentialStored: profile.credentialStored,
          cookies: profile.cookies.length,
          savedAt: profile.savedAt,
        }, opts);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
  twins.command("doctor").description("Diagnose TWINS authentication").action(run("Checking TWINS", async () => {
    const config = serviceConfig("twins");
    const client = createTwinsClient(config);
    return { service: "twins", baseUrl: config.baseUrl, profile: config.profile, auth: await client.auth.check() };
  }));
  twins.command("html")
    .description("Fetch an authenticated TWINS page")
    .option("--url <pathOrUrl>", "path or URL", "portal.do?page=main")
    .action((cmd) => run("Fetching TWINS page", async () => createTwinsClient(serviceConfig("twins")).pages.html(cmd.url), (html) => {
      console.log(html);
    })());
  twins.command("menus")
    .description("List detected TWINS / CAMPUSSQUARE menu links")
    .action(() => run("Fetching TWINS menus", async () => createTwinsClient(serviceConfig("twins")).menus.list())());
  twins.command("profile")
    .description("Parse student profile from a TWINS page")
    .option("--url <pathOrUrl>", "path or URL; auto-detected from menu when omitted")
    .action((cmd) => run("Fetching TWINS profile", async () => createTwinsClient(serviceConfig("twins")).profile.show(cmd.url))());
  twins.command("registrations")
    .description("Parse current registrations from a TWINS page")
    .option("--url <pathOrUrl>", "path or URL containing registration table; auto-detected from menu when omitted")
    .action((cmd) => run("Fetching TWINS registrations", async () => createTwinsClient(serviceConfig("twins")).registrations.list(cmd.url))());
  twins.command("grades")
    .description("Parse grades from a TWINS page")
    .option("--url <pathOrUrl>", "path or URL containing grades table; auto-detected from menu when omitted")
    .action((cmd) => run("Fetching TWINS grades", async () => createTwinsClient(serviceConfig("twins")).grades.list(cmd.url))());
  twins.command("summary")
    .description("Calculate GPA and credit totals from TWINS grades")
    .option("--grades <file>", "TwinGrade JSON file; defaults to live TWINS")
    .option("--registrations <file>", "TwinRegistration JSON file; defaults to live TWINS")
    .action((cmd) => run("Calculating TWINS academic summary", async () => {
      const client = createTwinsClient(serviceConfig("twins"));
      const grades = cmd.grades ? readJson<TwinGrade[]>(cmd.grades) : await client.grades.list();
      const registrations = cmd.registrations ? readJson<TwinRegistration[]>(cmd.registrations) : await client.registrations.list();
      return calculateAcademicSummary({ grades, registrations });
    })());

  const requirements = program.command("requirements").description("Graduation requirement commands");
  requirements.command("init")
    .option("--file <path>", "output RequirementSpec JSON file", "requirements.json")
    .option("--program <name>", "program / college name", "未設定")
    .option("--admission-year <year>", "admission year", new Date().getFullYear().toString())
    .description("Create an editable RequirementSpec JSON template")
    .action((cmd) => run("Creating requirements template", async () => {
      if (existsSync(cmd.file)) throw new Error(`Requirements file already exists: ${cmd.file}`);
      const spec: RequirementSpec = {
        program: cmd.program,
        admissionYear: cmd.admissionYear,
        categories: [
          {
            id: "example",
            name: "要編集: 科目区分名",
            minCredits: 0,
            coursePrefixes: [],
            courseCodes: [],
          },
        ],
        courseRules: [],
        notes: [
          "このファイルを履修要件に合わせて編集してから `utsukuba requirements import --file requirements.json` を実行してください。",
          "公式ページは `utsukuba requirements fetch-handbook --year 2025 --pretty` で確認できます。",
        ],
      };
      writeFileSync(cmd.file, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
      return { file: cmd.file, next: `edit ${cmd.file}, then run: utsukuba requirements import --file ${cmd.file}` };
    })());
  requirements.command("fetch-handbook")
    .requiredOption("--year <year>", "handbook year, e.g. 2025")
    .description("Fetch the official Tsukuba graduate handbook page")
    .action((cmd) => run("Fetching handbook", async () => {
      const url = `https://www.tsukuba.ac.jp/education/g-courses-handbook/${cmd.year}rishu.html`;
      const res = await fetch(url);
      const html = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return { url, html };
    })());
  requirements.command("import")
    .requiredOption("--file <path>", "RequirementSpec JSON file")
    .option("--name <name>", "stored requirement name", "default")
    .description("Import a structured RequirementSpec JSON file")
    .action((cmd) => run("Importing requirements", async () => {
      const spec = readJson<RequirementSpec>(cmd.file, `Requirements file not found: ${cmd.file}. Create a template with: utsukuba requirements init --file ${cmd.file}`);
      const path = requirementPath(serviceConfig("twins"), cmd.name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
      return { name: cmd.name, path, program: spec.program, admissionYear: spec.admissionYear };
    })());
  requirements.command("show")
    .option("--name <name>", "stored requirement name", "default")
    .description("Show imported requirements")
    .action((cmd) => run("Loading requirements", async () => readRequirementSpec(serviceConfig("twins"), cmd.name))());

  const plan = program.command("plan").description("Course planning commands");
  plan.command("progress")
    .option("--requirements <name>", "stored requirement name", "default")
    .option("--grades <file>", "TwinGrade JSON file; defaults to live TWINS")
    .option("--registrations <file>", "TwinRegistration JSON file; defaults to live TWINS")
    .description("Calculate requirement progress")
    .action((cmd) => run("Calculating progress", async () => {
      const config = serviceConfig("twins");
      const requirement = readRequirementSpec(config, cmd.requirements);
      const client = createTwinsClient(config);
      const grades = cmd.grades ? readJson<TwinGrade[]>(cmd.grades) : await client.grades.list();
      const registrations = cmd.registrations ? readJson<TwinRegistration[]>(cmd.registrations) : await client.registrations.list();
      return calculateRequirementProgress(requirement, { grades, registrations });
    })());
  plan.command("recommend")
    .requiredOption("--courses <file>", "KdbCourse JSON file from `kdb courses --json`")
    .option("--requirements <name>", "stored requirement name", "default")
    .option("--grades <file>", "TwinGrade JSON file; defaults to live TWINS")
    .option("--registrations <file>", "TwinRegistration JSON file; defaults to live TWINS")
    .description("Recommend courses from KDB candidates and current progress")
    .action((cmd) => run("Recommending courses", async () => {
      const config = serviceConfig("twins");
      const requirement = readRequirementSpec(config, cmd.requirements);
      const courses = readJson<KdbCourse[]>(cmd.courses, `KDB course JSON not found: ${cmd.courses}. Create it with: utsukuba kdb courses --year <year> --query <query> --pretty > ${cmd.courses}`);
      const client = createTwinsClient(config);
      const grades = cmd.grades ? readJson<TwinGrade[]>(cmd.grades) : await client.grades.list();
      const registrations = cmd.registrations ? readJson<TwinRegistration[]>(cmd.registrations) : await client.registrations.list();
      return recommendCourses(requirement, courses, { grades, registrations });
    })());

  return program;
}

function readJson<T>(path: string, missingMessage?: string): T {
  if (!existsSync(path)) throw new Error(missingMessage ?? `JSON file not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readRequirementSpec(config: AppConfig, name: string): RequirementSpec {
  const path = requirementPath(config, name);
  return readJson<RequirementSpec>(
    path,
    `No imported requirements found for profile "${config.profile}" and name "${name}". Create/edit a template with \`utsukuba requirements init --file requirements.json\`, then import it with \`utsukuba requirements import --file requirements.json --name ${name}\`.`,
  );
}

function requirementPath(config: AppConfig, name: string): string {
  return join(config.homeDir, "profiles", config.profile, "requirements", `${name}.json`);
}
