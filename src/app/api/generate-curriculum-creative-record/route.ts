import { AiRequestError } from "../../../lib/ai/errors";
import { aiErrorResponse, readJson } from "../../../lib/ai/http";
import { getCurriculumCreativeDraftProvider } from "../../../lib/ai/provider-factory";
import { saveStandaloneActivityDraft } from "../../../lib/ai/activity-record-draft-history";
import { curriculumSourceAnalysis } from "../../../lib/ai/source-analysis";
import {
  DEFAULT_ACTIVITY_RECORD_MAX_LENGTH,
  MAX_ACTIVITY_RECORD_MAX_LENGTH,
  MIN_ACTIVITY_RECORD_MAX_LENGTH,
} from "../../../types";
import {
  CURRICULUM_CREATIVE_PARTS,
  type CurriculumCreativeAnswers,
  type GenerateCurriculumCreativeRecordResponse,
} from "../../../types/curriculum-creative";

export async function POST(request: Request): Promise<Response> {
  try {
    const value = await readJson(request);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new AiRequestError("INVALID_REQUEST", "교과창체 입력을 확인해 주세요.");
    }
    const fields = value as Record<string, unknown>;
    let source: CurriculumCreativeAnswers | string;
    if (typeof fields.freeText === "string") {
      source = fields.freeText.trim();
      if (source.length < 20 || source.length > 20_000) {
        throw new AiRequestError("INVALID_REQUEST", "교과창체 활동 내용은 20~20,000자로 입력해 주세요.");
      }
    } else {
      const answersValue = fields.answers;
      if (!answersValue || typeof answersValue !== "object" || Array.isArray(answersValue)) {
        throw new AiRequestError("INVALID_REQUEST", "6개 파트의 입력값이 필요합니다.");
      }
      const sourceFields = answersValue as Record<string, unknown>;
      const answers = {} as CurriculumCreativeAnswers;
      for (const part of CURRICULUM_CREATIVE_PARTS) {
        const answer = sourceFields[part.key];
        if (typeof answer !== "string" || answer.length > 5_000) {
          throw new AiRequestError("INVALID_REQUEST", "각 파트는 5,000자 이하의 텍스트로 입력해 주세요.");
        }
        answers[part.key] = answer.trim();
      }
      if (!answers.career || CURRICULUM_CREATIVE_PARTS.filter((part) => answers[part.key]).length < 2) {
        throw new AiRequestError("INVALID_REQUEST", "희망진로와 다른 파트 한 개 이상을 작성해 주세요.");
      }
      if (Object.values(answers).join("\n").length > 20_000) {
        throw new AiRequestError("INVALID_REQUEST", "전체 입력은 20,000자 이하로 작성해 주세요.");
      }
      source = answers;
    }
    const maxLength = fields.maxLength ?? DEFAULT_ACTIVITY_RECORD_MAX_LENGTH;
    if (typeof maxLength !== "number" || !Number.isInteger(maxLength) ||
      maxLength < MIN_ACTIVITY_RECORD_MAX_LENGTH || maxLength > MAX_ACTIVITY_RECORD_MAX_LENGTH) {
      throw new AiRequestError("INVALID_REQUEST", `초안 글자 수는 ${MIN_ACTIVITY_RECORD_MAX_LENGTH}~${MAX_ACTIVITY_RECORD_MAX_LENGTH}자로 설정해 주세요.`);
    }

    const generated = await getCurriculumCreativeDraftProvider().generateCurriculumCreativeRecord(source, maxLength);
    const draft = generated.draft.trim().replace(/\s+/gu, " ");
    const result: GenerateCurriculumCreativeRecordResponse = {
      draft,
      usedEvidence: generated.usedEvidence,
      characterCount: Array.from(draft).length,
      maxLength,
      analysis: curriculumSourceAnalysis(typeof source === "string" ? source : Object.values(source).filter(Boolean).join("\n")),
      reportText: typeof source === "string" ? source : Object.values(source).filter(Boolean).join("\n"),
    };
    await saveStandaloneActivityDraft({
      activityCode: "CAREER_CURRICULUM_CREATIVE",
      activityId: "career-curriculum-creative",
      topic: (typeof source === "string" ? source : source.career).slice(0, 120),
    }, result);
    return Response.json(result);
  } catch (error: unknown) {
    return aiErrorResponse(error);
  }
}
