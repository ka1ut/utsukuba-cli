import type {
  AppConfig,
  AuthProfile,
  ContentPageSummary,
  CourseSummary,
  DownloadResult,
  FileAttachment,
  QuizSummary,
  ReportSummary,
  TaskSummary,
  TaskType,
} from "../domain/types";
import { AuthStore } from "../infrastructure/auth-store";
import { CredentialStore } from "../infrastructure/credential-store";
import { HttpError, ManabaHttpClient } from "../infrastructure/http-client";
import {
  parseAttachmentsFromAnyPage,
  parseContentDetail,
  parseContentList,
  parseCourseList,
  parseCourseShell,
  parseQuizDetail,
  parseQuizList,
  parseReportDetail,
  parseReportList,
  parseTasks,
} from "../infrastructure/parsers";
import { courseIdFromUrl, quizIdFromUrl, reportIdFromUrl } from "../infrastructure/url";

export type ManabaClient = {
  auth: AuthUseCases;
  courses: CourseUseCases;
  tasks: TaskUseCases;
  quizzes: QuizUseCases;
  reports: ReportUseCases;
  contents: ContentUseCases;
  files: FileUseCases;
};

export type LoginOptions = {
  username: string;
  password: string;
  saveCredentials?: boolean;
};

export function createManabaClient(
  config: AppConfig,
  deps: { http?: ManabaHttpClient; authStore?: AuthStore; credentialStore?: CredentialStore } = {},
): ManabaClient {
  const http = deps.http ?? new ManabaHttpClient(config);
  const authStore = deps.authStore ?? new AuthStore(config);
  const credentialStore = deps.credentialStore ?? new CredentialStore("utsukuba-cli");
  const auth = new AuthUseCases(config, http, authStore, credentialStore);

  return {
    auth,
    courses: new CourseUseCases(config, http, auth),
    tasks: new TaskUseCases(config, http, auth),
    quizzes: new QuizUseCases(config, http, auth),
    reports: new ReportUseCases(config, http, auth),
    contents: new ContentUseCases(config, http, auth),
    files: new FileUseCases(config, http, auth),
  };
}

export class AuthUseCases {
  constructor(
    private readonly config: AppConfig,
    private readonly http: ManabaHttpClient,
    private readonly store: AuthStore,
    private readonly credentials: CredentialStore,
  ) {}

  async login(options: LoginOptions): Promise<AuthProfile> {
    const cookies = await this.loginWithCredentials(options.username, options.password);
    const credentialStored = options.saveCredentials ?? true;
    if (credentialStored) {
      this.credentials.save(this.config.profile, {
        username: options.username,
        password: options.password,
      });
    }
    const profile: AuthProfile = {
      profile: this.config.profile,
      baseUrl: this.config.baseUrl,
      cookies,
      username: options.username,
      credentialStored,
      savedAt: new Date().toISOString(),
    };
    await this.store.save(profile);
    return profile;
  }

  async check(): Promise<{ ok: boolean; profile: string; username?: string; reason?: string }> {
    const profile = await this.store.load();
    if (!profile) return { ok: false, profile: this.config.profile, reason: "not_configured" };
    try {
      await this.http.getHtml("home", profile.cookies);
      return { ok: true, profile: profile.profile, username: profile.username };
    } catch (error) {
      if (error instanceof HttpError && error.status === 401 && profile.credentialStored) {
        try {
          await this.refresh();
          return { ok: true, profile: profile.profile, username: profile.username };
        } catch (refreshError) {
          return {
            ok: false,
            profile: profile.profile,
            username: profile.username,
            reason: refreshError instanceof Error ? refreshError.message : String(refreshError),
          };
        }
      }
      return {
        ok: false,
        profile: profile.profile,
        username: profile.username,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async refresh(): Promise<AuthProfile> {
    const profile = await this.requireProfile();
    const stored = this.credentials.load(this.config.profile, profile.username);
    if (!stored) throw new Error("No saved Keychain credentials for this profile.");
    return this.login({ username: stored.username, password: stored.password, saveCredentials: true });
  }

  async logout(): Promise<void> {
    await this.store.remove();
    this.credentials.delete(this.config.profile);
  }

  async requireProfile(): Promise<AuthProfile> {
    const profile = await this.store.load();
    if (!profile) {
      throw new Error("Not logged in to manaba. Run `utsukuba login` or `utsukuba manaba login` first.");
    }
    return profile;
  }

  private async loginWithCredentials(username: string, password: string) {
    return this.http.loginWithCredentials(username, password);
  }
}

export class CourseUseCases {
  constructor(
    private readonly config: AppConfig,
    private readonly http: ManabaHttpClient,
    private readonly auth: AuthUseCases,
  ) {}

  async list(): Promise<CourseSummary[]> {
    const profile = await this.auth.requireProfile();
    const html = await this.http.getHtml("home_course", profile.cookies);
    return parseCourseList(html, this.config.baseUrl);
  }

  async show(courseId: string): Promise<CourseSummary> {
    const profile = await this.auth.requireProfile();
    const html = await this.http.getHtml(`course_${courseId}`, profile.cookies);
    return parseCourseShell(html, courseId, this.config.baseUrl);
  }
}

export class TaskUseCases {
  constructor(
    private readonly config: AppConfig,
    private readonly http: ManabaHttpClient,
    private readonly auth: AuthUseCases,
  ) {}

  async list(options: { type?: TaskType; hidden?: boolean } = {}): Promise<TaskSummary[]> {
    const profile = await this.auth.requireProfile();
    const html = await this.http.getHtml(options.hidden ? "home_library_query?hidden=1" : "home_library_query", profile.cookies);
    const tasks = parseTasks(html, this.config.baseUrl);
    if (!options.type || options.type === "all") return tasks;
    return tasks.filter((task) => task.type === options.type);
  }

  async show(taskUrlOrId: string): Promise<QuizSummary | ReportSummary | { url: string; attachments: FileAttachment[] }> {
    const profile = await this.auth.requireProfile();
    const html = await this.http.getHtml(taskUrlOrId, profile.cookies);
    const courseId = courseIdFromUrl(taskUrlOrId);
    const quizId = quizIdFromUrl(taskUrlOrId);
    const reportId = reportIdFromUrl(taskUrlOrId);
    if (courseId && quizId) return parseQuizDetail(html, courseId, quizId, this.config.baseUrl);
    if (courseId && reportId) return parseReportDetail(html, courseId, reportId, this.config.baseUrl);
    return { url: taskUrlOrId, attachments: parseAttachmentsFromAnyPage(html, this.config.baseUrl) };
  }
}

export class QuizUseCases {
  constructor(
    private readonly config: AppConfig,
    private readonly http: ManabaHttpClient,
    private readonly auth: AuthUseCases,
  ) {}

  async list(courseId: string): Promise<QuizSummary[]> {
    const profile = await this.auth.requireProfile();
    const html = await this.http.getHtml(`course_${courseId}_query`, profile.cookies);
    return parseQuizList(html, courseId, this.config.baseUrl);
  }

  async show(courseId: string, quizId: string): Promise<QuizSummary> {
    const profile = await this.auth.requireProfile();
    const html = await this.http.getHtml(`course_${courseId}_query_${quizId}`, profile.cookies);
    return parseQuizDetail(html, courseId, quizId, this.config.baseUrl);
  }
}

export class ReportUseCases {
  constructor(
    private readonly config: AppConfig,
    private readonly http: ManabaHttpClient,
    private readonly auth: AuthUseCases,
  ) {}

  async list(courseId: string): Promise<ReportSummary[]> {
    const profile = await this.auth.requireProfile();
    const html = await this.http.getHtml(`course_${courseId}_report`, profile.cookies);
    return parseReportList(html, courseId, this.config.baseUrl);
  }

  async show(courseId: string, reportId: string): Promise<ReportSummary> {
    const profile = await this.auth.requireProfile();
    const html = await this.http.getHtml(`course_${courseId}_report_${reportId}`, profile.cookies);
    return parseReportDetail(html, courseId, reportId, this.config.baseUrl);
  }
}

export class ContentUseCases {
  constructor(
    private readonly config: AppConfig,
    private readonly http: ManabaHttpClient,
    private readonly auth: AuthUseCases,
  ) {}

  async list(courseId: string): Promise<ContentPageSummary[]> {
    const profile = await this.auth.requireProfile();
    const html = await this.http.getHtml(`course_${courseId}_page`, profile.cookies);
    return parseContentList(html, courseId, this.config.baseUrl);
  }

  async show(pageUrlOrId: string): Promise<ContentPageSummary> {
    const profile = await this.auth.requireProfile();
    const html = await this.http.getHtml(pageUrlOrId, profile.cookies);
    const courseId = courseIdFromUrl(html) ?? undefined;
    return parseContentDetail(html, courseId, pageUrlOrId, this.config.baseUrl);
  }
}

export class FileUseCases {
  constructor(
    private readonly config: AppConfig,
    private readonly http: ManabaHttpClient,
    private readonly auth: AuthUseCases,
  ) {}

  async list(target: string): Promise<FileAttachment[]> {
    const profile = await this.auth.requireProfile();
    const path = /^\d+$/.test(target) ? `course_${target}_page` : target;
    const html = await this.http.getHtml(path, profile.cookies);
    return parseAttachmentsFromAnyPage(html, this.config.baseUrl);
  }

  async download(url: string, outDir: string, options: { overwrite?: boolean } = {}): Promise<DownloadResult> {
    const profile = await this.auth.requireProfile();
    return this.http.downloadFile(url, outDir, {
      cookies: profile.cookies,
      overwrite: options.overwrite ?? false,
    });
  }
}
