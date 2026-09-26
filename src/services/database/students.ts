import { toStudent } from "../../lib/db/mappers";
import type { AppSupabaseClient } from "../../lib/supabase/client";
import type { Student } from "../../types/domain";
import {
  requireAuthenticatedTeacherId,
  throwIfSupabaseError,
} from "./shared";

export interface SaveStudentInput {
  id?: string;
  name: string;
  grade: number;
  classNo: number;
  studentNo: number;
}

export async function getStudents(
  client: AppSupabaseClient,
): Promise<Student[]> {
  const { data, error } = await client
    .from("students")
    .select("*")
    .order("grade")
    .order("class_no")
    .order("student_no");
  throwIfSupabaseError("학생 목록 조회 실패", error);
  return data.map(toStudent);
}

export async function getStudentById(
  client: AppSupabaseClient,
  id: string,
): Promise<Student | null> {
  const { data, error } = await client
    .from("students")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  throwIfSupabaseError("학생 조회 실패", error);
  return data ? toStudent(data) : null;
}

export async function saveStudent(
  client: AppSupabaseClient,
  input: SaveStudentInput,
): Promise<Student> {
  if (input.id) {
    const { data, error } = await client
      .from("students")
      .update({
        name: input.name,
        grade: input.grade,
        class_no: input.classNo,
        student_no: input.studentNo,
      })
      .eq("id", input.id)
      .select("*")
      .single();
    throwIfSupabaseError("학생 수정 실패", error);
    return toStudent(data);
  }

  const teacherId = await requireAuthenticatedTeacherId(client);
  const { data, error } = await client
    .from("students")
    .insert({
      teacher_id: teacherId,
      name: input.name,
      grade: input.grade,
      class_no: input.classNo,
      student_no: input.studentNo,
    })
    .select("*")
    .single();
  throwIfSupabaseError("학생 생성 실패", error);
  return toStudent(data);
}

export async function deleteStudent(
  client: AppSupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await client.from("students").delete().eq("id", id);
  throwIfSupabaseError("학생 삭제 실패", error);
}
