import { ACTIVITIES } from "../../lib/activities";
import { toActivity } from "../../lib/db/mappers";
import type { AppSupabaseClient } from "../../lib/supabase/client";
import type { Activity, ActivityCode } from "../../types/domain";
import {
  requireAuthenticatedTeacherId,
  throwIfSupabaseError,
} from "./shared";

export async function getActivities(
  client: AppSupabaseClient,
): Promise<Activity[]> {
  const { data, error } = await client
    .from("activities")
    .select("*")
    .order("category")
    .order("title");
  throwIfSupabaseError("활동 목록 조회 실패", error);
  return data.map(toActivity);
}

export async function getActivitiesByTeacher(
  client: AppSupabaseClient,
  teacherId: string,
): Promise<Activity[]> {
  const { data, error } = await client
    .from("activities")
    .select("*")
    .eq("teacher_id", teacherId)
    .order("category")
    .order("title");
  throwIfSupabaseError("교사별 활동 조회 실패", error);
  return data.map(toActivity);
}

export async function ensureCurrentTeacherActivities(
  client: AppSupabaseClient,
): Promise<Activity[]> {
  const teacherId = await requireAuthenticatedTeacherId(client);
  const current = await getActivitiesByTeacher(client, teacherId);
  const byCode = new Map<ActivityCode, Activity>(
    current.map((activity) => [activity.code, activity]),
  );

  for (const definition of ACTIVITIES) {
    const existing = byCode.get(definition.code);

    if (!existing) {
      const { error } = await client.from("activities").insert({
        teacher_id: teacherId,
        code: definition.code,
        category: definition.category,
        title: definition.title,
        description: definition.description,
      });
      throwIfSupabaseError("기본 활동 생성 실패", error);
      continue;
    }

    if (
      existing.title !== definition.title ||
      existing.description !== definition.description
    ) {
      const { error } = await client
        .from("activities")
        .update({
          title: definition.title,
          description: definition.description,
        })
        .eq("id", existing.id);
      throwIfSupabaseError("활동 표시 정보 갱신 실패", error);
    }
  }

  return getActivitiesByTeacher(client, teacherId);
}
