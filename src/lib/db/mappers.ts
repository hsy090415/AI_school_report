import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CODES,
  type Activity,
  type ActivityCategory,
  type ActivityCode,
  type ActivityRecord,
  type EvidenceAction,
  type EvidenceSkill,
  type ReportAnalysis,
  type Student,
  type StudentReport,
  type Teacher,
} from "../../types";
import type { Tables } from "../../types/database";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isEvidenceAction(value: unknown): value is EvidenceAction {
  return (
    isRecord(value) &&
    typeof value.action === "string" &&
    typeof value.evidence === "string"
  );
}

function isEvidenceSkill(value: unknown): value is EvidenceSkill {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.evidence === "string"
  );
}

function parseReportAnalysis(value: unknown): ReportAnalysis {
  if (
    !isRecord(value) ||
    typeof value.topic !== "string" ||
    !Array.isArray(value.studentActions) ||
    !value.studentActions.every(isEvidenceAction) ||
    !isStringArray(value.knowledge) ||
    !Array.isArray(value.skills) ||
    !value.skills.every(isEvidenceSkill) ||
    !isStringArray(value.notablePoints)
  ) {
    throw new Error("DB의 analysis_json이 ReportAnalysis 구조와 일치하지 않습니다.");
  }

  return {
    topic: value.topic,
    studentActions: value.studentActions,
    knowledge: value.knowledge,
    skills: value.skills,
    notablePoints: value.notablePoints,
  };
}

function toActivityCode(value: string): ActivityCode {
  if (!ACTIVITY_CODES.some((code) => code === value)) {
    throw new Error(`지원하지 않는 activity code입니다: ${value}`);
  }
  return value as ActivityCode;
}

function toActivityCategory(value: string): ActivityCategory {
  if (!ACTIVITY_CATEGORIES.some((category) => category === value)) {
    throw new Error(`지원하지 않는 activity category입니다: ${value}`);
  }
  return value as ActivityCategory;
}

export function toTeacher(row: Tables<"teachers">): Teacher {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: "TEACHER",
  };
}

export function toStudent(row: Tables<"students">): Student {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    classNo: row.class_no,
    studentNo: row.student_no,
  };
}

export function toActivity(row: Tables<"activities">): Activity {
  return {
    id: row.id,
    code: toActivityCode(row.code),
    category: toActivityCategory(row.category),
    title: row.title,
    description: row.description,
    teacherId: row.teacher_id,
  };
}

export function toStudentReport(row: Tables<"student_reports">): StudentReport {
  return {
    id: row.id,
    studentId: row.student_id,
    activityId: row.activity_id,
    reportText: row.report_text,
    // 공통 타입의 필드명은 URL이지만 DB에는 비공개 Storage path를 저장한다.
    reportFileUrl: row.report_file_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toActivityRecord(row: Tables<"activity_records">): ActivityRecord {
  return {
    id: row.id,
    studentId: row.student_id,
    activityId: row.activity_id,
    teacherId: row.teacher_id,
    analysis: parseReportAnalysis(row.analysis_json),
    aiDraft: row.ai_draft,
    finalText: row.final_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
