import { toTeacher } from "../../lib/db/mappers";
import type { AppSupabaseClient } from "../../lib/supabase/client";
import type { Teacher } from "../../types/domain";
import {
  requireAuthenticatedTeacherId,
  throwIfSupabaseError,
} from "./shared";

export interface SaveCurrentTeacherInput {
  name: string;
  email: string;
}

export async function getCurrentTeacher(
  client: AppSupabaseClient,
): Promise<Teacher | null> {
  const teacherId = await requireAuthenticatedTeacherId(client);
  const { data, error } = await client
    .from("teachers")
    .select("*")
    .eq("id", teacherId)
    .maybeSingle();
  throwIfSupabaseError("교사 조회 실패", error);
  return data ? toTeacher(data) : null;
}

export async function saveCurrentTeacher(
  client: AppSupabaseClient,
  input: SaveCurrentTeacherInput,
): Promise<Teacher> {
  const teacherId = await requireAuthenticatedTeacherId(client);
  const current = await getCurrentTeacher(client);

  if (current) {
    const { data, error } = await client
      .from("teachers")
      .update({ name: input.name, email: input.email })
      .eq("id", teacherId)
      .select("*")
      .single();
    throwIfSupabaseError("교사 수정 실패", error);
    return toTeacher(data);
  }

  const { data, error } = await client
    .from("teachers")
    .insert({ id: teacherId, name: input.name, email: input.email })
    .select("*")
    .single();
  throwIfSupabaseError("교사 생성 실패", error);
  return toTeacher(data);
}
