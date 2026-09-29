import { createClient } from "../../../../lib/supabase/server";
import { integrationErrorResponse } from "../../../../lib/ai/teacher-integration";
import {
  ensureCurrentTeacherActivities,
  getActivities,
  getCurrentTeacher,
  getStudents,
  requireAuthenticatedTeacherId,
  saveCurrentTeacher,
  saveStudent,
} from "../../../../services/database";
import type { AppSupabaseClient } from "../../../../lib/supabase/client";

const INITIAL_STUDENTS = [
  { name: "김하늘", grade: 2, classNo: 1, studentNo: 3 },
  { name: "이서준", grade: 2, classNo: 1, studentNo: 8 },
  { name: "박지민", grade: 2, classNo: 1, studentNo: 12 },
  { name: "최유진", grade: 2, classNo: 2, studentNo: 5 },
  { name: "정민서", grade: 2, classNo: 2, studentNo: 11 },
] as const;

async function getRecordSummaries(client: AppSupabaseClient) {
  const { data, error } = await client.from("activity_records")
    .select("student_id,activity_id,final_text,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    studentId: row.student_id,
    activityId: row.activity_id,
    completed: Boolean(row.final_text),
    updatedAt: row.updated_at,
  }));
}

export async function GET(): Promise<Response> {
  try {
    const client = await createClient();
    await requireAuthenticatedTeacherId(client);
    const teacher = await getCurrentTeacher(client);
    if (!teacher) {
      return Response.json({ error: { message: "교사 프로필을 먼저 생성해 주세요." } }, { status: 409 });
    }
    const [students, activities, records] = await Promise.all([
      getStudents(client),
      getActivities(client),
      getRecordSummaries(client),
    ]);
    return Response.json({ teacher, students, activities, records });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}

export async function POST(): Promise<Response> {
  try {
    const client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      return Response.json({ error: { message: "교사 로그인이 필요합니다." } }, { status: 401 });
    }
    const teacher = await saveCurrentTeacher(client, {
      name: typeof data.user.user_metadata?.name === "string" && data.user.user_metadata.name.trim()
        ? data.user.user_metadata.name.trim().slice(0, 100)
        : "체험 교사",
      email: data.user.email?.trim() || `anonymous-${data.user.id}@example.invalid`,
    });
    let students = await getStudents(client);
    if (students.length === 0) {
      for (const student of INITIAL_STUDENTS) {
        await saveStudent(client, student);
      }
      students = await getStudents(client);
    }
    const [activities, records] = await Promise.all([
      ensureCurrentTeacherActivities(client),
      getRecordSummaries(client),
    ]);
    return Response.json({ teacher, students, activities, records });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
