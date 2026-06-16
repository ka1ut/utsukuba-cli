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

export type Service = "manaba" | "twins" | "kdb";

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

export type KdbCourse = {
  code: string;
  subcourse: string;
  title: string;
  credits: number;
  year: string;
  syllabusUrl: string;
  grade?: string;
  term?: string;
  dayPeriod?: string;
  instructor?: string;
  overview?: string;
  remarks?: string;
};

export type KdbSyllabus = {
  code: string;
  title: string;
  year: string;
  language: "jpn" | "eng";
  summary?: string;
  aims?: string;
  keywords: string[];
  topics: Array<{ label: string; title: string }>;
  textbooks: string[];
  officeHours?: string;
};

export type StudentProfile = {
  studentId?: string;
  affiliation?: string;
  program?: string;
  gradeYear?: number;
};

export type TwinRegistration = {
  courseCode: string;
  title: string;
  year?: string;
  term?: string;
  credits: number;
  status?: string;
};

export type TwinGrade = {
  courseCode: string;
  title: string;
  year?: string;
  credits: number;
  grade?: string;
  passed: boolean;
};

export type RequirementCategory = {
  id: string;
  name: string;
  minCredits: number;
  coursePrefixes?: string[];
  courseCodes?: string[];
};

export type RequirementSpec = {
  program: string;
  admissionYear: string;
  categories: RequirementCategory[];
  courseRules: Array<Record<string, unknown>>;
  notes: string[];
};

export type RequirementProgress = {
  categoryId: string;
  categoryName: string;
  requiredCredits: number;
  earnedCredits: number;
  inProgressCredits: number;
  shortageCredits: number;
  matchedCourses: string[];
};

export type AcademicYearSummary = {
  year: string;
  gpa?: number;
  gpaCredits: number;
  gpaPoints: number;
  earnedCredits: number;
  failedCredits: number;
  inProgressCredits: number;
};

export type AcademicSummary = {
  gpa?: number;
  gpaCredits: number;
  gpaPoints: number;
  earnedCredits: number;
  failedCredits: number;
  inProgressCredits: number;
  gradeRows: number;
  registrationCount: number;
  years: AcademicYearSummary[];
};

export type CourseRecommendation = {
  courseCode: string;
  title: string;
  credits: number;
  matchedCategoryIds: string[];
  reasons: string[];
  syllabusUrl: string;
};
