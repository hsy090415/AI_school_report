import {
  toIcwcDraftHistoryEntry,
  toIcwcFinalRecord,
  toIcwcStudentReview,
  toIcwcStudentSubmission,
  toIcwcTeam,
  toIcwcTeamMember,
  toLinkedStudentAccount,
} from "../../lib/db/mappers";
import type { AppSupabaseClient } from "../../lib/supabase/client";
import {
  ICWC_DRAFT_DIRECTIONS,
  type IcwcDraftDirection,
  type IcwcDraftHistoryEntry,
  type IcwcFileMetadata,
  type IcwcFinalRecord,
  type IcwcStudentReview,
  type IcwcStudentSubmission,
  type IcwcTeam,
  type IcwcTeamMember,
  type LinkedStudentAccount,
} from "../../types";
import type { TablesUpdate } from "../../types/database";
import {
  DatabaseOperationError,
  requireAuthenticatedTeacherId,
  requireAuthenticatedUserId,
  throwIfSupabaseError,
} from "./shared";

const REPORT_BUCKET = "student-reports";
const MAX_REPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const HWP_MIME_TYPES = new Set([
  "application/haansofthwp",
  "application/x-hwp",
  "application/vnd.hancom.hwp",
]);

export interface CreateIcwcTeamInput {
  activityId: string;
  teamName: string;
  studentIds: string[];
}

export interface SaveIcwcTeamReportInput {
  teamId: string;
  reportText: string;
  file?: IcwcFileMetadata | null;
  submit: boolean;
}

export interface UploadIcwcTeamReportFileInput {
  teamId: string;
  originalName: string;
  mimeType: string;
  body: Blob | File | ArrayBuffer | Uint8Array;
}

export interface SaveCurrentStudentReflectionInput {
  teamId: string;
  reflectionText: string;
  submit: boolean;
}

export interface SaveIcwcStudentReviewInput {
  submissionId: string;
  teacherComment: string;
  draftFocus: IcwcDraftDirection | null;
}

export interface AddIcwcDraftInput {
  reviewId: string;
  generationDirection: IcwcDraftDirection;
  draftText: string;
}

function assertDraftDirection(value: string): asserts value is IcwcDraftDirection {
  if (!ICWC_DRAFT_DIRECTIONS.some((direction) => direction === value)) {
    throw new DatabaseOperationError(
      "ICWC 초안 방향 확인 실패",
      `허용되지 않은 값입니다: ${value}`,
    );
  }
}

function getBodySize(
  body: Blob | File | ArrayBuffer | Uint8Array,
): number {
  return body instanceof Blob ? body.size : body.byteLength;
}

function getReportExtension(mimeType: string): ".docx" | ".hwp" | ".hwpx" {
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return ".docx";
  }
  if (mimeType === "application/vnd.hancom.hwpx") {
    return ".hwpx";
  }
  if (HWP_MIME_TYPES.has(mimeType)) {
    return ".hwp";
  }

  throw new DatabaseOperationError(
    "ICWC 보고서 파일 확인 실패",
    "HWP, HWPX 또는 DOCX 파일만 업로드할 수 있습니다.",
  );
}

async function requireCurrentStudentAccount(
  client: AppSupabaseClient,
): Promise<LinkedStudentAccount> {
  const authUserId = await requireAuthenticatedUserId(client);
  const { data, error } = await client
    .from("students")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  throwIfSupabaseError("연결된 학생 계정 조회 실패", error);

  if (!data) {
    throw new DatabaseOperationError(
      "연결된 학생 계정 조회 실패",
      "관리자가 기존 학생 명단과 연결한 계정이 필요합니다.",
    );
  }

  return toLinkedStudentAccount(data);
}

export async function getCurrentLinkedStudent(
  client: AppSupabaseClient,
): Promise<LinkedStudentAccount> {
  return requireCurrentStudentAccount(client);
}

export async function getIcwcTeams(
  client: AppSupabaseClient,
): Promise<IcwcTeam[]> {
  await requireAuthenticatedUserId(client);
  const { data, error } = await client
    .from("icwc_teams")
    .select("*")
    .order("created_at");
  throwIfSupabaseError("ICWC 팀 목록 조회 실패", error);
  return data.map(toIcwcTeam);
}

export async function getIcwcTeamById(
  client: AppSupabaseClient,
  teamId: string,
): Promise<IcwcTeam | null> {
  await requireAuthenticatedUserId(client);
  const { data, error } = await client
    .from("icwc_teams")
    .select("*")
    .eq("id", teamId)
    .maybeSingle();
  throwIfSupabaseError("ICWC 팀 조회 실패", error);
  return data ? toIcwcTeam(data) : null;
}

export async function createIcwcTeam(
  client: AppSupabaseClient,
  input: CreateIcwcTeamInput,
): Promise<IcwcTeam> {
  const teacherId = await requireAuthenticatedTeacherId(client);
  const { data: team, error: teamError } = await client
    .from("icwc_teams")
    .insert({
      teacher_id: teacherId,
      activity_id: input.activityId,
      team_name: input.teamName,
    })
    .select("*")
    .single();
  throwIfSupabaseError("ICWC 팀 생성 실패", teamError);

  const studentIds = [...new Set(input.studentIds)];
  if (studentIds.length > 0) {
    const { error: memberError } = await client.from("icwc_team_members").insert(
      studentIds.map((studentId) => ({
        team_id: team.id,
        teacher_id: teacherId,
        activity_id: team.activity_id,
        student_id: studentId,
      })),
    );
    throwIfSupabaseError("ICWC 팀원 연결 실패", memberError);
  }

  return toIcwcTeam(team);
}

export async function deleteIcwcTeam(
  client: AppSupabaseClient,
  teamId: string,
): Promise<void> {
  await requireAuthenticatedTeacherId(client);
  const { error } = await client.from("icwc_teams").delete().eq("id", teamId);
  throwIfSupabaseError("ICWC 팀 삭제 실패", error);
}

export async function getIcwcTeamMembers(
  client: AppSupabaseClient,
  teamId: string,
): Promise<IcwcTeamMember[]> {
  await requireAuthenticatedUserId(client);
  const { data, error } = await client
    .from("icwc_team_members")
    .select("*")
    .eq("team_id", teamId)
    .order("created_at");
  throwIfSupabaseError("ICWC 팀원 조회 실패", error);
  return data.map(toIcwcTeamMember);
}

export async function saveIcwcTeamReport(
  client: AppSupabaseClient,
  input: SaveIcwcTeamReportInput,
): Promise<IcwcTeam> {
  await requireAuthenticatedUserId(client);
  const updates: TablesUpdate<"icwc_teams"> = {
    report_text: input.reportText,
    submitted_at: input.submit ? new Date().toISOString() : null,
  };

  if (input.file !== undefined) {
    updates.report_file_path = input.file?.path ?? null;
    updates.report_file_name = input.file?.name ?? null;
    updates.report_file_mime_type = input.file?.mimeType ?? null;
    updates.report_file_size_bytes = input.file?.sizeBytes ?? null;
  }

  const { data, error } = await client
    .from("icwc_teams")
    .update(updates)
    .eq("id", input.teamId)
    .select("*")
    .single();
  throwIfSupabaseError("ICWC 팀 보고서 저장 실패", error);
  return toIcwcTeam(data);
}

export async function uploadIcwcTeamReportFile(
  client: AppSupabaseClient,
  input: UploadIcwcTeamReportFileInput,
): Promise<IcwcFileMetadata> {
  await requireAuthenticatedUserId(client);
  const sizeBytes = getBodySize(input.body);
  if (sizeBytes <= 0 || sizeBytes > MAX_REPORT_FILE_SIZE_BYTES) {
    throw new DatabaseOperationError(
      "ICWC 보고서 파일 확인 실패",
      "파일 크기는 0바이트보다 크고 10MiB 이하여야 합니다.",
    );
  }

  const extension = getReportExtension(input.mimeType);
  const path = `icwc/${input.teamId}/${crypto.randomUUID()}${extension}`;
  const { data, error } = await client.storage
    .from(REPORT_BUCKET)
    .upload(path, input.body, {
      contentType: input.mimeType,
      upsert: false,
    });
  throwIfSupabaseError("ICWC 팀 보고서 파일 업로드 실패", error);

  return {
    path: data.path,
    name: input.originalName,
    mimeType: input.mimeType,
    sizeBytes,
  };
}

export async function createSignedIcwcTeamReportUrl(
  client: AppSupabaseClient,
  teamId: string,
  expiresInSeconds = 60,
): Promise<string> {
  await requireAuthenticatedUserId(client);
  const { data: team, error: teamError } = await client
    .from("icwc_teams")
    .select("report_file_path")
    .eq("id", teamId)
    .maybeSingle();
  throwIfSupabaseError("ICWC 파일 metadata 조회 실패", teamError);

  if (!team?.report_file_path) {
    throw new DatabaseOperationError(
      "ICWC 파일 metadata 조회 실패",
      "저장된 원본 파일이 없습니다.",
    );
  }

  const { data, error } = await client.storage
    .from(REPORT_BUCKET)
    .createSignedUrl(team.report_file_path, expiresInSeconds);
  throwIfSupabaseError("ICWC 보고서 임시 URL 생성 실패", error);
  return data.signedUrl;
}

export async function getCurrentStudentIcwcSubmission(
  client: AppSupabaseClient,
  teamId: string,
): Promise<IcwcStudentSubmission | null> {
  const student = await requireCurrentStudentAccount(client);
  const { data, error } = await client
    .from("icwc_student_submissions")
    .select("*")
    .eq("team_id", teamId)
    .eq("student_id", student.id)
    .maybeSingle();
  throwIfSupabaseError("ICWC 개인 소감문 조회 실패", error);
  return data ? toIcwcStudentSubmission(data) : null;
}

export async function saveCurrentStudentIcwcReflection(
  client: AppSupabaseClient,
  input: SaveCurrentStudentReflectionInput,
): Promise<IcwcStudentSubmission> {
  const student = await requireCurrentStudentAccount(client);
  const { data: membership, error: membershipError } = await client
    .from("icwc_team_members")
    .select("team_id,teacher_id,activity_id,student_id")
    .eq("team_id", input.teamId)
    .eq("student_id", student.id)
    .maybeSingle();
  throwIfSupabaseError("ICWC 팀원 연결 확인 실패", membershipError);

  if (!membership) {
    throw new DatabaseOperationError(
      "ICWC 팀원 연결 확인 실패",
      "현재 학생이 해당 ICWC 팀에 연결되어 있지 않습니다.",
    );
  }

  const mutableColumns = {
    reflection_text: input.reflectionText,
    submitted_at: input.submit ? new Date().toISOString() : null,
  };
  const { data: updated, error: updateError } = await client
    .from("icwc_student_submissions")
    .update(mutableColumns)
    .eq("student_id", student.id)
    .eq("activity_id", membership.activity_id)
    .select("*")
    .maybeSingle();
  throwIfSupabaseError("ICWC 개인 소감문 수정 실패", updateError);

  if (updated) {
    return toIcwcStudentSubmission(updated);
  }

  const { data, error } = await client
    .from("icwc_student_submissions")
    .insert({
      team_id: membership.team_id,
      teacher_id: membership.teacher_id,
      activity_id: membership.activity_id,
      student_id: student.id,
      ...mutableColumns,
    })
    .select("*")
    .single();
  throwIfSupabaseError("ICWC 개인 소감문 생성 실패", error);
  return toIcwcStudentSubmission(data);
}

export async function getIcwcTeacherSubmissions(
  client: AppSupabaseClient,
  teamId?: string,
): Promise<IcwcStudentSubmission[]> {
  await requireAuthenticatedTeacherId(client);
  let query = client
    .from("icwc_student_submissions")
    .select("*")
    .order("updated_at", { ascending: false });
  if (teamId) {
    query = query.eq("team_id", teamId);
  }

  const { data, error } = await query;
  throwIfSupabaseError("ICWC 교사용 제출 목록 조회 실패", error);
  return data.map(toIcwcStudentSubmission);
}

export async function getIcwcStudentReview(
  client: AppSupabaseClient,
  submissionId: string,
): Promise<IcwcStudentReview | null> {
  await requireAuthenticatedTeacherId(client);
  const { data, error } = await client
    .from("icwc_student_reviews")
    .select("*")
    .eq("submission_id", submissionId)
    .maybeSingle();
  throwIfSupabaseError("ICWC 학생 검토 조회 실패", error);
  return data ? toIcwcStudentReview(data) : null;
}

export async function saveIcwcStudentReview(
  client: AppSupabaseClient,
  input: SaveIcwcStudentReviewInput,
): Promise<IcwcStudentReview> {
  await requireAuthenticatedTeacherId(client);
  if (input.draftFocus) {
    assertDraftDirection(input.draftFocus);
  }

  const mutableColumns = {
    teacher_comment: input.teacherComment,
    draft_focus: input.draftFocus,
  };
  const { data: updated, error: updateError } = await client
    .from("icwc_student_reviews")
    .update(mutableColumns)
    .eq("submission_id", input.submissionId)
    .select("*")
    .maybeSingle();
  throwIfSupabaseError("ICWC 학생 검토 수정 실패", updateError);

  if (updated) {
    return toIcwcStudentReview(updated);
  }

  const { data: submission, error: submissionError } = await client
    .from("icwc_student_submissions")
    .select("id,team_id,teacher_id,activity_id,student_id")
    .eq("id", input.submissionId)
    .single();
  throwIfSupabaseError("ICWC 검토 대상 조회 실패", submissionError);

  const { data, error } = await client
    .from("icwc_student_reviews")
    .insert({
      submission_id: submission.id,
      team_id: submission.team_id,
      teacher_id: submission.teacher_id,
      activity_id: submission.activity_id,
      student_id: submission.student_id,
      ...mutableColumns,
    })
    .select("*")
    .single();
  throwIfSupabaseError("ICWC 학생 검토 생성 실패", error);
  return toIcwcStudentReview(data);
}

export async function getIcwcDraftHistory(
  client: AppSupabaseClient,
  reviewId: string,
): Promise<IcwcDraftHistoryEntry[]> {
  await requireAuthenticatedTeacherId(client);
  const { data, error } = await client
    .from("icwc_draft_history")
    .select("*")
    .eq("review_id", reviewId)
    .order("created_at", { ascending: false });
  throwIfSupabaseError("ICWC AI 초안 이력 조회 실패", error);
  return data.map(toIcwcDraftHistoryEntry);
}

export async function addIcwcDraftHistoryEntry(
  client: AppSupabaseClient,
  input: AddIcwcDraftInput,
): Promise<IcwcDraftHistoryEntry> {
  const teacherId = await requireAuthenticatedTeacherId(client);
  assertDraftDirection(input.generationDirection);
  const { data: review, error: reviewError } = await client
    .from("icwc_student_reviews")
    .select("id,teacher_id")
    .eq("id", input.reviewId)
    .single();
  throwIfSupabaseError("ICWC AI 초안 검토 대상 조회 실패", reviewError);

  if (review.teacher_id !== teacherId) {
    throw new DatabaseOperationError(
      "ICWC AI 초안 저장 실패",
      "담당 교사의 검토가 아닙니다.",
    );
  }

  const { data, error } = await client
    .from("icwc_draft_history")
    .insert({
      review_id: review.id,
      teacher_id: teacherId,
      generation_direction: input.generationDirection,
      draft_text: input.draftText,
    })
    .select("*")
    .single();
  throwIfSupabaseError("ICWC AI 초안 저장 실패", error);
  return toIcwcDraftHistoryEntry(data);
}

export async function saveIcwcFinalRecord(
  client: AppSupabaseClient,
  reviewId: string,
  finalText: string,
): Promise<IcwcFinalRecord> {
  await requireAuthenticatedTeacherId(client);
  const { data: review, error: reviewError } = await client
    .from("icwc_student_reviews")
    .select("id,teacher_id,student_id,activity_id")
    .eq("id", reviewId)
    .single();
  throwIfSupabaseError("ICWC 최종 문장 검토 대상 조회 실패", reviewError);

  const { data: updated, error: updateError } = await client
    .from("icwc_final_records")
    .update({ final_text: finalText })
    .eq("review_id", review.id)
    .select("*")
    .maybeSingle();
  throwIfSupabaseError("ICWC 최종 문장 수정 실패", updateError);

  if (updated) {
    return toIcwcFinalRecord(updated);
  }

  const { data, error } = await client
    .from("icwc_final_records")
    .insert({
      review_id: review.id,
      teacher_id: review.teacher_id,
      student_id: review.student_id,
      activity_id: review.activity_id,
      final_text: finalText,
      published_at: null,
    })
    .select("*")
    .single();
  throwIfSupabaseError("ICWC 최종 문장 저장 실패", error);
  return toIcwcFinalRecord(data);
}

export async function setIcwcFinalRecordPublished(
  client: AppSupabaseClient,
  reviewId: string,
  published: boolean,
): Promise<IcwcFinalRecord> {
  await requireAuthenticatedTeacherId(client);
  const { data, error } = await client
    .from("icwc_final_records")
    .update({ published_at: published ? new Date().toISOString() : null })
    .eq("review_id", reviewId)
    .select("*")
    .single();
  throwIfSupabaseError("ICWC 최종 문장 공개 상태 저장 실패", error);
  return toIcwcFinalRecord(data);
}

export async function getPublishedIcwcFinalRecordsForCurrentStudent(
  client: AppSupabaseClient,
): Promise<IcwcFinalRecord[]> {
  const student = await requireCurrentStudentAccount(client);
  const { data, error } = await client
    .from("icwc_final_records")
    .select("*")
    .eq("student_id", student.id)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });
  throwIfSupabaseError("공개된 ICWC 최종 문장 조회 실패", error);
  return data.map(toIcwcFinalRecord);
}
