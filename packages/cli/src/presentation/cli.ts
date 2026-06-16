import { Command } from "commander";
import ora from "ora";
import { createManabaClient, loadConfig } from "@manaba/core";
import { printData } from "./format";
import { printError } from "./output";
import { promptPassword, promptText } from "./prompts";
import type { AppConfig, ManabaClient, TaskType } from "@manaba/core";

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
    .name("manaba")
    .description("Read-only CLI for manaba")
    .option("--profile <name>", "auth profile name")
    .option("--base-url <url>", "manaba /ct base URL")
    .option("--json", "output compact JSON")
    .option("--pretty", "output pretty JSON")
    .option("--debug", "print HTTP method/status/url to stderr");

  const deps = (): Deps => {
    const opts = program.opts<GlobalOptions>();
    const config = loadConfig({
      profile: opts.profile,
      baseUrl: opts.baseUrl,
      debug: opts.debug,
    });
    return { opts, config, client: createManabaClient(config) };
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

  program
    .command("login")
    .description("Authenticate and save session cookies; credentials are stored in macOS Keychain by default")
    .option("--username <id>", "university user ID")
    .option("--password <password>", "password; prefer interactive prompt")
    .option("--no-save-credentials", "do not save ID/PASS in macOS Keychain for refresh")
    .option("--check", "only validate current saved auth")
    .action(async (cmd) => {
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
    });

  program.command("logout").description("Remove saved auth profile and Keychain credentials").action(run("Logging out", ({ client }) => client.auth.logout(), () => {
    console.log("Logged out.");
  }));

  program.command("doctor").description("Diagnose config and authentication").action(run("Running doctor", async ({ config, client }) => {
    const auth = await client.auth.check();
    return {
      package: "manaba-cli",
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

  return program;
}
