import { expect, test } from "bun:test";
import { calculateAcademicSummary, calculateRequirementProgress, recommendCourses } from "../src/application/requirements";
import type { KdbCourse, RequirementSpec, TwinGrade, TwinRegistration } from "../src/domain/types";

const requirement: RequirementSpec = {
  program: "情報学群 情報科学類",
  admissionYear: "2025",
  categories: [
    { id: "math", name: "数学", minCredits: 4, coursePrefixes: ["GB", "GC"] },
    { id: "major", name: "専門", minCredits: 2, coursePrefixes: ["GE"] },
  ],
  courseRules: [],
  notes: [],
};

test("calculateRequirementProgress counts passed grades and in-progress registrations", () => {
  const grades: TwinGrade[] = [
    { courseCode: "GB10101", title: "線形代数A", year: "2025", credits: 2, grade: "A", passed: true },
    { courseCode: "GB10102", title: "線形代数B", year: "2025", credits: 2, grade: "D", passed: false },
  ];
  const registrations: TwinRegistration[] = [
    { courseCode: "GC11601", title: "確率と統計", year: "2026", term: "SprAB", credits: 2, status: "履修中" },
  ];

  expect(calculateRequirementProgress(requirement, { grades, registrations })).toEqual([
    {
      categoryId: "math",
      categoryName: "数学",
      requiredCredits: 4,
      earnedCredits: 2,
      inProgressCredits: 2,
      shortageCredits: 0,
      matchedCourses: ["GB10101", "GC11601"],
    },
    {
      categoryId: "major",
      categoryName: "専門",
      requiredCredits: 2,
      earnedCredits: 0,
      inProgressCredits: 0,
      shortageCredits: 2,
      matchedCourses: [],
    },
  ]);
});

test("recommendCourses excludes completed and in-progress courses and ranks requirement matches", () => {
  const courses: KdbCourse[] = [
    { code: "GC11601", subcourse: "0", title: "確率と統計", credits: 2, year: "2026", syllabusUrl: "https://kdb.tsukuba.ac.jp/syllabi/2026/GC11601/jpn/0/" },
    { code: "GE20001", subcourse: "0", title: "専門演習", credits: 2, year: "2026", syllabusUrl: "https://kdb.tsukuba.ac.jp/syllabi/2026/GE20001/jpn/0/" },
  ];

  expect(recommendCourses(requirement, courses, {
    grades: [{ courseCode: "GC11601", title: "確率と統計", year: "2025", credits: 2, grade: "A", passed: true }],
    registrations: [],
  })).toEqual([
    {
      courseCode: "GE20001",
      title: "専門演習",
      credits: 2,
      matchedCategoryIds: ["major"],
      reasons: ["専門の不足 2 単位に充当可能"],
      syllabusUrl: "https://kdb.tsukuba.ac.jp/syllabi/2026/GE20001/jpn/0/",
    },
  ]);
});

test("calculateAcademicSummary reports GPA, earned credits, failed credits, and active credits", () => {
  const summary = calculateAcademicSummary({
    grades: [
      { courseCode: "A", title: "A plus", year: "2025", credits: 2, grade: "A+", passed: true },
      { courseCode: "B", title: "B grade", year: "2025", credits: 1, grade: "B", passed: true },
      { courseCode: "P", title: "Pass", year: "2025", credits: 1, grade: "P", passed: true },
      { courseCode: "D", title: "D grade", year: "2025", credits: 2, grade: "D", passed: false },
      { courseCode: "F", title: "F grade", year: "2026", credits: 1, grade: "F", passed: false },
      { courseCode: "IP", title: "In progress", year: "2026", credits: 2, grade: "履修中", passed: false },
    ],
    registrations: [
      { courseCode: "IP", title: "In progress", year: "2026", term: "春B", credits: 0, status: "履修中" },
      { courseCode: "NOW", title: "Current", year: "2026", term: "春B", credits: 0, status: "履修中" },
    ],
  });

  expect(summary).toEqual({
    gpa: 2.32,
    gpaCredits: 5,
    gpaPoints: 11.6,
    earnedCredits: 4,
    failedCredits: 3,
    inProgressCredits: 2,
    gradeRows: 6,
    registrationCount: 2,
    years: [
      { year: "2025", gpa: 2.32, gpaCredits: 5, gpaPoints: 11.6, earnedCredits: 4, failedCredits: 2, inProgressCredits: 0 },
      { year: "2026", gpa: undefined, gpaCredits: 0, gpaPoints: 0, earnedCredits: 0, failedCredits: 1, inProgressCredits: 2 },
    ],
  });
});
