import { createClient } from "../../../../lib/supabase/server";
import {
  assertActivityCode,
  IntegrationRequestError,
  integrationErrorResponse,
  isRecord,
  parseAnalysis,
  requiredString,
} from "../../../../lib/ai/teacher-integration";
import {
  getActivities,
  getActivityRecord,
  getStudentById,
  getStudentReport,
  requireAuthenticatedTeacherId,
  saveActivityRecord,
  saveStudentReport,
  updateActivityRecord,
} from "../../../../services/database";

async function context(studentId: string, activityId: string) {
  const client = await createClient();
  const teacherId = await requireAuthenticatedTeacherId(client);
  const [student, activities] = await Promise.all([
    getStudentById(client, studentId),
    getActivities(client),
  ]);
  const activity = activities.find((item) => item.id === activityId);
  if (!student || !activity || activity.teacherId !== teacherId) {
    throw new IntegrationRequestError("담당 학생 또는 활동을 찾을 수 없습니다.", 404);
  }
  return { client, student, activity };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const studentId = requiredString(url.searchParams.get("studentId"), "학생 ID", 100);
    const activityId = requiredString(url.searchParams.get("activityId"), "활동 ID", 100);
    const { client, activity } = await context(studentId, activityId);
    const [report, record] = await Promise.all([
      getStudentReport(client, studentId, activityId),
      getActivityRecord(client, studentId, activityId),
    ]);
    return Response.json({ activity, report, record });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    let body: unknown;
    try { body = await request.json(); }
    catch { throw new IntegrationRequestError("JSON 요청 본문을 읽을 수 없습니다."); }
    if (!isRecord(body)) throw new IntegrationRequestError("저장 요청이 올바르지 않습니다.");
    const studentId = requiredString(body.studentId, "학생 ID", 100);
    const activityId = requiredString(body.activityId, "활동 ID", 100);
    const reportText = requiredString(body.reportText, "보고서 원문", 150_000);
    const aiDraft = requiredString(body.aiDraft, "AI 초안", 5_000);
    const analysis = parseAnalysis(body.analysis);
    const { client, activity } = await context(studentId, activityId);
    assertActivityCode(activity, body.activityCode);
    if (await getActivityRecord(client, studentId, activityId)) {
      throw new IntegrationRequestError("이미 저장된 AI 원본 초안이 있습니다. 기존 기록을 먼저 확인해 주세요.", 409);
    }
    const existingReport = await getStudentReport(client, studentId, activityId);
    if (existingReport && existingReport.reportText !== reportText) {
      throw new IntegrationRequestError("이미 저장된 보고서가 있습니다. 기존 내용을 덮어쓰지 않습니다.", 409);
    }
    const report = existingReport ?? await saveStudentReport(client, {
      studentId, activityId, reportText, file: null,
    });
    const record = await saveActivityRecord(client, {
      studentId, activityId, analysis, aiDraft,
    });
    return Response.json({ report, record }, { status: 201 });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    let body: unknown;
    try { body = await request.json(); }
    catch { throw new IntegrationRequestError("JSON 요청 본문을 읽을 수 없습니다."); }
    if (!isRecord(body)) throw new IntegrationRequestError("수정 요청이 올바르지 않습니다.");
    const studentId = requiredString(body.studentId, "학생 ID", 100);
    const activityId = requiredString(body.activityId, "활동 ID", 100);
    const finalText = requiredString(body.finalText, "교사 최종 문구", 5_000);
    const { client } = await context(studentId, activityId);
    if (!await getActivityRecord(client, studentId, activityId)) {
      throw new IntegrationRequestError("먼저 AI 원본 초안을 저장해 주세요.", 404);
    }
    const record = await updateActivityRecord(client, studentId, activityId, finalText);
    return Response.json({ record });
  } catch (error) {
    return integrationErrorResponse(error);
  }
}
