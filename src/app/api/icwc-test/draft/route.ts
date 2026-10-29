import {
  ICWC_DRAFT_DIRECTIONS,
  MAX_ACTIVITY_RECORD_MAX_LENGTH,
  MIN_ACTIVITY_RECORD_MAX_LENGTH,
} from "../../../../types";
import { AiProviderError, AiRequestError } from "../../../../lib/ai/errors";
import { aiErrorResponse, readJson } from "../../../../lib/ai/http";
import { AIConfigurationError } from "../../../../lib/ai/config";
import { createClient } from "../../../../lib/supabase/server";
import { generateIcwcSecondYearDraft } from "../../../../services/ai/icwc-second-year-draft-writer";
import { addIcwcDraftHistoryEntry, requireAuthenticatedTeacherId } from "../../../../services/database";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await readJson(request)) as { submissionId?: unknown; maxLength?: unknown };
    const submissionId = typeof body.submissionId === "string" ? body.submissionId.trim() : "";
    const maxLength = body.maxLength;
    if (!/^[a-f\d-]{36}$/iu.test(submissionId)) {
      throw new AiRequestError("INVALID_REQUEST", "제출물 ID가 올바르지 않습니다.");
    }
    if (typeof maxLength !== "number" || !Number.isInteger(maxLength) || maxLength < MIN_ACTIVITY_RECORD_MAX_LENGTH || maxLength > MAX_ACTIVITY_RECORD_MAX_LENGTH) {
      throw new AiRequestError("INVALID_REQUEST", "초안 글자 수 설정을 확인해 주세요.");
    }

    const client = await createClient();
    const teacherId = await requireAuthenticatedTeacherId(client);
    const { data: submission, error: submissionError } = await client.from("icwc_student_submissions")
      .select("id,team_id,teacher_id,reflection_text,submitted_at")
      .eq("id", submissionId).maybeSingle();
    if (submissionError || !submission || submission.teacher_id !== teacherId) {
      return Response.json({ error: { message: "담당 학생의 제출물을 찾을 수 없습니다." } }, { status: 404 });
    }
    const [{ data: team }, { data: review }] = await Promise.all([
      client.from("icwc_teams").select("report_text,submitted_at").eq("id", submission.team_id).maybeSingle(),
      client.from("icwc_student_reviews").select("id,teacher_comment,draft_focus").eq("submission_id", submissionId).maybeSingle(),
    ]);
    if (!team?.submitted_at || !submission.submitted_at || !team.report_text.trim() || !submission.reflection_text.trim()) {
      return Response.json({ error: { message: "보고서와 학생 소감문이 모두 제출되어야 합니다." } }, { status: 409 });
    }
    if (!review || !review.teacher_comment.trim() || !ICWC_DRAFT_DIRECTIONS.some((item) => item === review.draft_focus)) {
      return Response.json({ error: { message: "교사 코멘트와 초안 방향을 먼저 저장해 주세요." } }, { status: 409 });
    }
    const direction = review.draft_focus as (typeof ICWC_DRAFT_DIRECTIONS)[number];
    const generated = await generateIcwcSecondYearDraft({
      reportText: team.report_text,
      reflectionText: submission.reflection_text,
      teacherComment: review.teacher_comment,
      direction,
      maxLength,
    });
    const history = await addIcwcDraftHistoryEntry(client, {
      reviewId: review.id,
      generationDirection: direction,
      draftText: generated.draft,
    });
    return Response.json({ ...generated, history });
  } catch (error) {
    if (error instanceof AiRequestError || error instanceof AiProviderError || error instanceof AIConfigurationError) {
      return aiErrorResponse(error);
    }
    return Response.json({ error: { message: "초안 생성에 실패했습니다. 교사 계정 연결과 제출 상태를 확인해 주세요." } }, { status: 500 });
  }
}
