import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CODES,
  type Activity,
  type ActivityCategory,
  type ActivityCode,
  type ActivityRecord,
  type EvidenceAction,
  type EvidenceSkill,
  ICWC_DRAFT_DIRECTIONS,
  type IcwcDraftDirection,
  type IcwcDraftHistoryEntry,
  type IcwcFinalRecord,
  type IcwcStudentReview,
  type IcwcStudentSubmission,
  type IcwcTeam,
  type IcwcTeamMember,
  type LinkedStudentAccount,
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

function toIcwcDraftDirection(value: string): IcwcDraftDirection {
  if (!ICWC_DRAFT_DIRECTIONS.some((direction) => direction === value)) {
    throw new Error(`지원하지 않는 ICWC 초안 방향입니다: ${value}`);
  }
  return value as IcwcDraftDirection;
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

export function toLinkedStudentAccount(
  row: Tables<"students">,
): LinkedStudentAccount {
  if (!row.auth_user_id) {
    throw new Error("학생 명단에 Auth 계정이 연결되어 있지 않습니다.");
  }

  return {
    id: row.id,
    teacherId: row.teacher_id,
    authUserId: row.auth_user_id,
    name: row.name,
    grade: row.grade,
    classNo: row.class_no,
    studentNo: row.student_no,
  };
}

export function toIcwcTeam(row: Tables<"icwc_teams">): IcwcTeam {
  const reportFile = row.report_file_path
    ? {
        path: row.report_file_path,
        name: row.report_file_name ?? "",
        mimeType: row.report_file_mime_type ?? "",
        sizeBytes: row.report_file_size_bytes ?? 0,
      }
    : null;

  return {
    id: row.id,
    teacherId: row.teacher_id,
    activityId: row.activity_id,
    teamName: row.team_name,
    reportText: row.report_text,
    reportFile,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toIcwcTeamMember(
  row: Tables<"icwc_team_members">,
): IcwcTeamMember {
  return {
    teamId: row.team_id,
    teacherId: row.teacher_id,
    activityId: row.activity_id,
    studentId: row.student_id,
    createdAt: row.created_at,
  };
}

export function toIcwcStudentSubmission(
  row: Tables<"icwc_student_submissions">,
): IcwcStudentSubmission {
  return {
    id: row.id,
    teamId: row.team_id,
    teacherId: row.teacher_id,
    activityId: row.activity_id,
    studentId: row.student_id,
    reflectionText: row.reflection_text,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toIcwcStudentReview(
  row: Tables<"icwc_student_reviews">,
): IcwcStudentReview {
  return {
    id: row.id,
    submissionId: row.submission_id,
    teamId: row.team_id,
    teacherId: row.teacher_id,
    activityId: row.activity_id,
    studentId: row.student_id,
    teacherComment: row.teacher_comment,
    draftFocus: row.draft_focus
      ? toIcwcDraftDirection(row.draft_focus)
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toIcwcDraftHistoryEntry(
  row: Tables<"icwc_draft_history">,
): IcwcDraftHistoryEntry {
  return {
    id: row.id,
    reviewId: row.review_id,
    teacherId: row.teacher_id,
    generationDirection: toIcwcDraftDirection(row.generation_direction),
    draftText: row.draft_text,
    createdAt: row.created_at,
  };
}

export function toIcwcFinalRecord(
  row: Tables<"icwc_final_records">,
): IcwcFinalRecord {
  return {
    id: row.id,
    reviewId: row.review_id,
    teacherId: row.teacher_id,
    studentId: row.student_id,
    activityId: row.activity_id,
    finalText: row.final_text,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
