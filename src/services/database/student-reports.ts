import { toStudentReport } from "../../lib/db/mappers";
import type { AppSupabaseClient } from "../../lib/supabase/client";
import type { StudentReport } from "../../types/domain";
import {
  requireAuthenticatedTeacherId,
  throwIfSupabaseError,
} from "./shared";

const REPORT_BUCKET = "student-reports";

export interface ReportFileMetadata {
  path: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface SaveStudentReportInput {
  studentId: string;
  activityId: string;
  reportText: string;
  file: ReportFileMetadata | null;
}

export interface UploadReportFileInput {
  studentId: string;
  activityId: string;
  originalName: string;
  mimeType: string;
  body: Blob | File | ArrayBuffer | Uint8Array;
  overwrite?: boolean;
}

function getBodySize(
  body: Blob | File | ArrayBuffer | Uint8Array,
): number {
  return body instanceof Blob ? body.size : body.byteLength;
}

export function getReportStoragePath(
  teacherId: string,
  studentId: string,
  activityId: string,
): string {
  return `${teacherId}/${studentId}/${activityId}/report.pdf`;
}

export async function getStudentReport(
  client: AppSupabaseClient,
  studentId: string,
  activityId: string,
): Promise<StudentReport | null> {
  const { data, error } = await client
    .from("student_reports")
    .select("*")
    .eq("student_id", studentId)
    .eq("activity_id", activityId)
    .maybeSingle();
  throwIfSupabaseError("학생 보고서 조회 실패", error);
  return data ? toStudentReport(data) : null;
}

export async function saveStudentReport(
  client: AppSupabaseClient,
  input: SaveStudentReportInput,
): Promise<StudentReport> {
  const mutableColumns = {
    report_text: input.reportText,
    report_file_path: input.file?.path ?? null,
    report_file_name: input.file?.name ?? null,
    report_file_mime_type: input.file?.mimeType ?? null,
    report_file_size_bytes: input.file?.sizeBytes ?? null,
  };

  const { data: updated, error: updateError } = await client
    .from("student_reports")
    .update(mutableColumns)
    .eq("student_id", input.studentId)
    .eq("activity_id", input.activityId)
    .select("*")
    .maybeSingle();
  throwIfSupabaseError("학생 보고서 수정 실패", updateError);

  if (updated) {
    return toStudentReport(updated);
  }

  const teacherId = await requireAuthenticatedTeacherId(client);
  const { data, error } = await client
    .from("student_reports")
    .insert({
      teacher_id: teacherId,
      student_id: input.studentId,
      activity_id: input.activityId,
      ...mutableColumns,
    })
    .select("*")
    .single();
  throwIfSupabaseError("학생 보고서 생성 실패", error);
  return toStudentReport(data);
}

export async function deleteStudentReport(
  client: AppSupabaseClient,
  studentId: string,
  activityId: string,
): Promise<void> {
  const { error } = await client
    .from("student_reports")
    .delete()
    .eq("student_id", studentId)
    .eq("activity_id", activityId);
  throwIfSupabaseError("학생 보고서 삭제 실패", error);
}

export async function uploadReportFile(
  client: AppSupabaseClient,
  input: UploadReportFileInput,
): Promise<ReportFileMetadata> {
  const teacherId = await requireAuthenticatedTeacherId(client);
  const path = getReportStoragePath(
    teacherId,
    input.studentId,
    input.activityId,
  );
  const { data, error } = await client.storage
    .from(REPORT_BUCKET)
    .upload(path, input.body, {
      contentType: input.mimeType,
      upsert: input.overwrite ?? false,
    });
  throwIfSupabaseError("보고서 파일 업로드 실패", error);

  return {
    path: data.path,
    name: input.originalName,
    mimeType: input.mimeType,
    sizeBytes: getBodySize(input.body),
  };
}

export async function downloadReportFile(
  client: AppSupabaseClient,
  studentId: string,
  activityId: string,
): Promise<Blob> {
  const teacherId = await requireAuthenticatedTeacherId(client);
  const path = getReportStoragePath(teacherId, studentId, activityId);
  const { data, error } = await client.storage.from(REPORT_BUCKET).download(path);
  throwIfSupabaseError("보고서 파일 다운로드 실패", error);
  return data;
}

export async function createSignedReportUrl(
  client: AppSupabaseClient,
  studentId: string,
  activityId: string,
  expiresInSeconds = 60,
): Promise<string> {
  const teacherId = await requireAuthenticatedTeacherId(client);
  const path = getReportStoragePath(teacherId, studentId, activityId);
  const { data, error } = await client.storage
    .from(REPORT_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  throwIfSupabaseError("보고서 임시 URL 생성 실패", error);
  return data.signedUrl;
}

export async function deleteReportFile(
  client: AppSupabaseClient,
  studentId: string,
  activityId: string,
): Promise<void> {
  const teacherId = await requireAuthenticatedTeacherId(client);
  const path = getReportStoragePath(teacherId, studentId, activityId);
  const { error } = await client.storage.from(REPORT_BUCKET).remove([path]);
  throwIfSupabaseError("보고서 파일 삭제 실패", error);
}
