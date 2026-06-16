import type {
  AcademicSummary,
  AcademicYearSummary,
  CourseRecommendation,
  KdbCourse,
  RequirementCategory,
  RequirementProgress,
  RequirementSpec,
  TwinGrade,
  TwinRegistration,
} from "../domain/types";

export type AcademicRecord = {
  grades: TwinGrade[];
  registrations: TwinRegistration[];
};

export function calculateAcademicSummary(record: AcademicRecord): AcademicSummary {
  const years = new Map<string, AcademicYearSummary>();
  const total: Omit<AcademicSummary, "gradeRows" | "registrationCount" | "years" | "gpa"> = {
    gpaCredits: 0,
    gpaPoints: 0,
    earnedCredits: 0,
    failedCredits: 0,
    inProgressCredits: 0,
  };

  for (const grade of record.grades) {
    const year = grade.year ?? "unknown";
    const yearSummary = years.get(year) ?? {
      year,
      gpaCredits: 0,
      gpaPoints: 0,
      earnedCredits: 0,
      failedCredits: 0,
      inProgressCredits: 0,
    };

    if (grade.passed) {
      total.earnedCredits += grade.credits;
      yearSummary.earnedCredits += grade.credits;
    }
    if (isFailedGrade(grade.grade)) {
      total.failedCredits += grade.credits;
      yearSummary.failedCredits += grade.credits;
    }
    if (grade.grade === "履修中") {
      total.inProgressCredits += grade.credits;
      yearSummary.inProgressCredits += grade.credits;
    }

    const points = gradePoint(grade.grade);
    if (points !== undefined) {
      const gradePoints = grade.credits * points;
      total.gpaCredits += grade.credits;
      total.gpaPoints += gradePoints;
      yearSummary.gpaCredits += grade.credits;
      yearSummary.gpaPoints += gradePoints;
    }
    years.set(year, yearSummary);
  }

  return {
    ...roundSummary(total),
    gpa: calculateGpa(total.gpaPoints, total.gpaCredits),
    gradeRows: record.grades.length,
    registrationCount: record.registrations.length,
    years: [...years.values()]
      .sort((a, b) => a.year.localeCompare(b.year))
      .map((year) => ({
        ...roundSummary(year),
        year: year.year,
        gpa: calculateGpa(year.gpaPoints, year.gpaCredits),
      })),
  };
}

export function calculateRequirementProgress(requirement: RequirementSpec, record: AcademicRecord): RequirementProgress[] {
  return requirement.categories.map((category) => {
    const passed = record.grades.filter((grade) => grade.passed && matchesCategory(grade.courseCode, category));
    const inProgress = mergeInProgress(
      record.registrations.filter((registration) => matchesCategory(registration.courseCode, category)),
      record.grades.filter((grade) => grade.grade === "履修中" && matchesCategory(grade.courseCode, category)),
    );
    const earnedCredits = sumUniqueCredits(passed);
    const inProgressCredits = sumUniqueCredits(inProgress.filter((registration) => !passed.some((grade) => grade.courseCode === registration.courseCode)));
    const totalUsable = earnedCredits + inProgressCredits;
    return {
      categoryId: category.id,
      categoryName: category.name,
      requiredCredits: category.minCredits,
      earnedCredits,
      inProgressCredits,
      shortageCredits: Math.max(0, category.minCredits - totalUsable),
      matchedCourses: unique([...passed.map((grade) => grade.courseCode), ...inProgress.map((registration) => registration.courseCode)]),
    };
  });
}

export function recommendCourses(requirement: RequirementSpec, courses: KdbCourse[], record: AcademicRecord): CourseRecommendation[] {
  const completedOrActive = new Set([
    ...record.grades.filter((grade) => grade.passed).map((grade) => grade.courseCode),
    ...record.registrations.map((registration) => registration.courseCode),
  ]);
  const progress = calculateRequirementProgress(requirement, record);
  const shortages = progress.filter((item) => item.shortageCredits > 0);

  return courses
    .filter((course) => !completedOrActive.has(course.code))
    .map((course) => {
      const matched = shortages.filter((shortage) => {
        const category = requirement.categories.find((item) => item.id === shortage.categoryId);
        return category ? matchesCategory(course.code, category) : false;
      });
      return {
        courseCode: course.code,
        title: course.title,
        credits: course.credits,
        matchedCategoryIds: matched.map((item) => item.categoryId),
        reasons: matched.map((item) => `${item.categoryName}の不足 ${item.shortageCredits} 単位に充当可能`),
        syllabusUrl: course.syllabusUrl,
      };
    })
    .filter((recommendation) => recommendation.matchedCategoryIds.length > 0)
    .sort((a, b) => b.matchedCategoryIds.length - a.matchedCategoryIds.length || b.credits - a.credits);
}

function matchesCategory(courseCode: string, category: RequirementCategory): boolean {
  return Boolean(
    category.courseCodes?.includes(courseCode) ||
      category.coursePrefixes?.some((prefix) => courseCode.startsWith(prefix)),
  );
}

function sumUniqueCredits(items: Array<{ courseCode: string; credits: number }>): number {
  const seen = new Set<string>();
  let total = 0;
  for (const item of items) {
    if (seen.has(item.courseCode)) continue;
    seen.add(item.courseCode);
    total += item.credits;
  }
  return total;
}

function mergeInProgress(registrations: TwinRegistration[], grades: TwinGrade[]): Array<{ courseCode: string; credits: number }> {
  const creditsByCode = new Map(grades.map((grade) => [grade.courseCode, grade.credits]));
  const merged = registrations.map((registration) => ({
    courseCode: registration.courseCode,
    credits: registration.credits || creditsByCode.get(registration.courseCode) || 0,
  }));
  const seen = new Set(merged.map((item) => item.courseCode));
  for (const grade of grades) {
    if (seen.has(grade.courseCode)) continue;
    merged.push({ courseCode: grade.courseCode, credits: grade.credits });
  }
  return merged;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function gradePoint(grade: string | undefined): number | undefined {
  if (!grade) return undefined;
  const table: Record<string, number> = {
    "A+": 4.3,
    A: 4,
    B: 3,
    C: 2,
    D: 0,
  };
  return table[grade.trim()];
}

function isFailedGrade(grade: string | undefined): boolean {
  return Boolean(grade && /^(D|F|不可|不合格|未修得)$/.test(grade.trim()));
}

function calculateGpa(points: number, credits: number): number | undefined {
  if (credits === 0) return undefined;
  return round(points / credits);
}

function roundSummary<T extends { gpaCredits: number; gpaPoints: number; earnedCredits: number; failedCredits: number; inProgressCredits: number }>(summary: T): T {
  return {
    ...summary,
    gpaCredits: round(summary.gpaCredits),
    gpaPoints: round(summary.gpaPoints),
    earnedCredits: round(summary.earnedCredits),
    failedCredits: round(summary.failedCredits),
    inProgressCredits: round(summary.inProgressCredits),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
