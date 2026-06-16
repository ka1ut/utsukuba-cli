export type CookieRecord = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string;
};

export type AuthProfile = {
  profile: string;
  baseUrl: string;
  cookies: CookieRecord[];
  username?: string;
  credentialStored: boolean;
  savedAt: string;
};

export type AppConfig = {
  baseUrl: string;
  profile: string;
  homeDir: string;
  authFile: string;
  debug: boolean;
};

export type CourseTab = "query" | "survey" | "report" | "project" | "grade" | "topics" | "page";

export type CourseSummary = {
  id: string;
  title: string;
  url: string;
  code?: string;
  teacher?: string;
  term?: string;
  tabs?: Partial<Record<CourseTab, string>>;
};

export type TaskType = "all" | "query" | "survey" | "report" | "project" | "drill" | "external" | "unknown";

export type TaskSummary = {
  id: string;
  type: TaskType;
  title: string;
  courseId: string;
  courseTitle: string;
  url: string;
  status?: string;
  startsAt?: string;
  endsAt?: string;
};

export type FileAttachment = {
  id?: string;
  filename: string;
  url: string;
  kind: "attachment" | "submitted" | "content" | "unknown";
};

export type QuizSummary = {
  id: string;
  title: string;
  courseId: string;
  url: string;
  status?: string;
  startsAt?: string;
  endsAt?: string;
  attachments?: FileAttachment[];
};

export type ReportSummary = {
  id: string;
  title: string;
  courseId: string;
  url: string;
  status?: string;
  startsAt?: string;
  endsAt?: string;
  attachments?: FileAttachment[];
};

export type ContentPageSummary = {
  id: string;
  title: string;
  courseId?: string;
  url: string;
  attachments?: FileAttachment[];
  nextUrl?: string;
  previousUrl?: string;
};

export type DownloadResult = {
  filename: string;
  path: string;
  bytes: number;
  url: string;
};
