import { createClient } from "../../../../lib/supabase/server";
import {
  IntegrationRequestError,
  integrationErrorResponse,
  isRecord,
  requiredString,
} from "../../../../lib/ai/teacher-integration";
import { getStudents, requireAuthenticatedTeacherId, saveStudent } from "../../../../services/database";

function boundedInteger(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new IntegrationRequestError(`${label}은 ${min}~${max} 사이의 정수여야 합니다.`);
  }
  return value;
}

export async function GET(): Promise<Response> {
  try {
    const client = await createClient();
    await requireAuthenticatedTeacherId(client);
    return Response.json({ students: await getStudents(client) });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    let body: unknown;
    try { body = await request.json(); }
    catch { throw new IntegrationRequestError("JSON 요청 본문을 읽을 수 없습니다."); }
    if (!isRecord(body)) throw new IntegrationRequestError("학생 정보가 올바르지 않습니다.");
    const client = await createClient();
    await requireAuthenticatedTeacherId(client);
    const student = await saveStudent(client, {
      name: requiredString(body.name, "학생 이름", 100),
      grade: boundedInteger(body.grade, "학년", 1, 3),
      classNo: boundedInteger(body.classNo, "반", 1, 30),
      studentNo: boundedInteger(body.studentNo, "번호", 1, 50),
    });
    return Response.json({ student }, { status: 201 });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
