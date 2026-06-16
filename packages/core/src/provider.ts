import type {
  ContentPageSummary,
  CourseSummary,
  DownloadResult,
  FileAttachment,
  QuizSummary,
  ReportSummary,
  TaskSummary,
  TaskType,
} from "./domain/types";

export interface LmsProvider {
  courses: {
    list(): Promise<CourseSummary[]>;
    show(courseId: string): Promise<CourseSummary>;
  };
  tasks: {
    list(options?: { type?: TaskType; hidden?: boolean }): Promise<TaskSummary[]>;
    show(taskUrlOrId: string): Promise<unknown>;
  };
  quizzes: {
    list(courseId: string): Promise<QuizSummary[]>;
    show(courseId: string, quizId: string): Promise<QuizSummary>;
  };
  reports: {
    list(courseId: string): Promise<ReportSummary[]>;
    show(courseId: string, reportId: string): Promise<ReportSummary>;
  };
  contents: {
    list(courseId: string): Promise<ContentPageSummary[]>;
    show(pageUrlOrId: string): Promise<ContentPageSummary>;
  };
  files: {
    list(target: string): Promise<FileAttachment[]>;
    download(url: string, outDir: string, options?: { overwrite?: boolean }): Promise<DownloadResult>;
  };
}
