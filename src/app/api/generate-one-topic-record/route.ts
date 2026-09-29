import { AiRequestError } from "../../../lib/ai/errors";
import { aiErrorResponse, readJson } from "../../../lib/ai/http";
import { getOneTopicDraftProvider } from "../../../lib/ai/provider-factory";
import { saveOneTopicDraft } from "../../../lib/ai/one-topic-draft-history";
import { oneTopicReportText, oneTopicSourceAnalysis } from "../../../lib/ai/source-analysis";
import {
  DEFAULT_ACTIVITY_RECORD_MAX_LENGTH,
  MAX_ACTIVITY_RECORD_MAX_LENGTH,
  MIN_ACTIVITY_RECORD_MAX_LENGTH,
} from "../../../types";
import type { GenerateOneTopicRecordResponse, OneTopicReport } from "../../../types/one-topic";

export async function POST(request: Request): Promise<Response> {
  try {
    const value = await readJson(request);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new AiRequestError("INVALID_REQUEST", "보고서를 확인해 주세요.");
    }
    const fields = value as Record<string, unknown>;
    const source = fields.report;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new AiRequestError("INVALID_REQUEST", "보고서 원문이 필요합니다.");
    }
    const sourceFields = source as Record<string, unknown>;
    const report: OneTopicReport = { area: "", topic: "", references: "", content: "", reflection: "" };
    for (const key of Object.keys(report) as (keyof OneTopicReport)[]) {
      const text = sourceFields[key];
      if (typeof text !== "string" || text.length > 10_000) {
        throw new AiRequestError("INVALID_REQUEST", "보고서 각 항목은 10,000자 이하로 입력해 주세요.");
      }
      report[key] = text.trim();
    }
    if (!report.topic || !report.content) {
      throw new AiRequestError("INVALID_REQUEST", "발표 주제와 발표 내용을 작성해 주세요.");
    }
    if (Object.values(report).join("\n").length > 20_000) {
      throw new AiRequestError("INVALID_REQUEST", "보고서 내용은 전체 20,000자 이하로 입력해 주세요.");
    }
    const maxLength = fields.maxLength ?? DEFAULT_ACTIVITY_RECORD_MAX_LENGTH;
    if (typeof maxLength !== "number" || !Number.isInteger(maxLength) ||
      maxLength < MIN_ACTIVITY_RECORD_MAX_LENGTH || maxLength > MAX_ACTIVITY_RECORD_MAX_LENGTH) {
      throw new AiRequestError("INVALID_REQUEST", `초안 글자 수는 ${MIN_ACTIVITY_RECORD_MAX_LENGTH}~${MAX_ACTIVITY_RECORD_MAX_LENGTH}자로 설정해 주세요.`);
    }

    const result = await getOneTopicDraftProvider().generateOneTopicRecord(report, maxLength);
    const draft = result.draft.trim().replace(/\s+/gu, " ");
    const response: GenerateOneTopicRecordResponse = {
      draft,
      usedEvidence: result.usedEvidence,
      characterCount: Array.from(draft).length,
      maxLength,
      analysis: oneTopicSourceAnalysis(report),
      reportText: oneTopicReportText(report),
    };
    await saveOneTopicDraft(report, response);
    return Response.json(response);
  } catch (error: unknown) {
    return aiErrorResponse(error);
  }
}
