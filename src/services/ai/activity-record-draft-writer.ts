import {
  ACTIVITY_RECORD_REQUEST_OFFSET,
  ONE_TOPIC_ACTIVITY_RECORD_REQUEST_EXTRA,
  DEFAULT_ACTIVITY_RECORD_MAX_LENGTH,
  type ActivityRecordDraftProgress,
  type GenerateActivityRecordRequest,
  type GenerateActivityRecordResponse,
} from "../../types";
import { AiProviderError, AiRequestError } from "../../lib/ai/errors";
import type { ActivityRecordDraftProvider } from "../../lib/ai/provider";
import { getActivityRecordDraftProvider } from "../../lib/ai/provider-factory";
import { isActivityRecordDraft } from "../../lib/ai/validation";
import { saveActivityRecordDraft } from "../../lib/ai/activity-record-draft-history";

function countCharacters(value: string): number {
  return Array.from(value).length;
}

function normalizeDraft(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

export async function writeActivityRecordDraft(
  input: GenerateActivityRecordRequest,
  provider: ActivityRecordDraftProvider = getActivityRecordDraftProvider(),
  onProgress?: (progress: ActivityRecordDraftProgress) => void,
): Promise<GenerateActivityRecordResponse> {
  if (input.analysis.studentActions.length === 0) {
    throw new AiRequestError(
      "INSUFFICIENT_EVIDENCE",
      "보고서에서 확인된 학생 행동이 없어 초안을 만들 수 없습니다.",
      422,
    );
  }

  const configuredLength = input.maxLength ?? DEFAULT_ACTIVITY_RECORD_MAX_LENGTH;
  const requestedLength = input.activityCode === "AUTONOMOUS_ONE_TOPIC"
    ? configuredLength + ONE_TOPIC_ACTIVITY_RECORD_REQUEST_EXTRA
    : Math.max(1, configuredLength - ACTIVITY_RECORD_REQUEST_OFFSET);
  onProgress?.({
    stage: "REQUESTING_DRAFT",
    attempt: 1,
    maxAttempts: 1,
    message: `Groq에 ${requestedLength}자 분량의 초안을 한 번 요청하고 있습니다.`,
    requestedLength,
    maxLength: configuredLength,
  });

  const result: unknown = await provider.generateActivityRecord({
    ...input,
    maxLength: configuredLength,
    requestedLength,
  });
  if (!isActivityRecordDraft(result)) {
    throw new AiProviderError("AI 초안 응답 형식이 올바르지 않습니다.");
  }

  const draft = normalizeDraft(result.draft);
  const characterCount = countCharacters(draft);
  onProgress?.({
    stage: "CHECKING_LENGTH",
    attempt: 1,
    maxAttempts: 1,
    message: `서버에서 초안의 실제 글자 수를 확인했습니다. 교사가 직접 수정할 수 있도록 결과를 표시합니다.`,
    characterCount,
    requestedLength,
    maxLength: configuredLength,
  });

  const response: GenerateActivityRecordResponse = {
    draft,
    usedEvidence: result.usedEvidence,
    characterCount,
    maxLength: configuredLength,
  };
  await saveActivityRecordDraft(input, response);
  return response;
}
