import { toActivityRecord } from "../../lib/db/mappers";
import type { AppSupabaseClient } from "../../lib/supabase/client";
import type { Json } from "../../types/database";
import type {
  ActivityRecord,
  ReportAnalysis,
} from "../../types/domain";
import {
  requireAuthenticatedTeacherId,
  throwIfSupabaseError,
} from "./shared";

export interface SaveActivityRecordInput {
  studentId: string;
  activityId: string;
  analysis: ReportAnalysis;
  aiDraft: string;
}

function reportAnalysisToJson(analysis: ReportAnalysis): Json {
  return {
    topic: analysis.topic,
    studentActions: analysis.studentActions.map(({ action, evidence }) => ({
      action,
      evidence,
    })),
    knowledge: analysis.knowledge,
    skills: analysis.skills.map(({ name, evidence }) => ({
      name,
      evidence,
    })),
    notablePoints: analysis.notablePoints,
  };
}

export async function getActivityRecord(
  client: AppSupabaseClient,
  studentId: string,
  activityId: string,
): Promise<ActivityRecord | null> {
  const { data, error } = await client
    .from("activity_records")
    .select("*")
    .eq("student_id", studentId)
    .eq("activity_id", activityId)
    .maybeSingle();
  throwIfSupabaseError("활동 기록 조회 실패", error);
  return data ? toActivityRecord(data) : null;
}

export async function saveActivityRecord(
  client: AppSupabaseClient,
  input: SaveActivityRecordInput,
): Promise<ActivityRecord> {
  const teacherId = await requireAuthenticatedTeacherId(client);
  const { data, error } = await client
    .from("activity_records")
    .insert({
      teacher_id: teacherId,
      student_id: input.studentId,
      activity_id: input.activityId,
      analysis_json: reportAnalysisToJson(input.analysis),
      ai_draft: input.aiDraft,
      final_text: null,
    })
    .select("*")
    .single();
  throwIfSupabaseError("AI 활동 기록 원본 저장 실패", error);
  return toActivityRecord(data);
}

export async function updateActivityRecord(
  client: AppSupabaseClient,
  studentId: string,
  activityId: string,
  finalText: string,
): Promise<ActivityRecord> {
  const { data, error } = await client
    .from("activity_records")
    .update({ final_text: finalText })
    .eq("student_id", studentId)
    .eq("activity_id", activityId)
    .select("*")
    .single();
  throwIfSupabaseError("교사 최종 문구 저장 실패", error);
  return toActivityRecord(data);
}

export async function deleteActivityRecord(
  client: AppSupabaseClient,
  studentId: string,
  activityId: string,
): Promise<void> {
  const { error } = await client
    .from("activity_records")
    .delete()
    .eq("student_id", studentId)
    .eq("activity_id", activityId);
  throwIfSupabaseError("활동 기록 삭제 실패", error);
}
