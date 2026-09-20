import type { GenerateActivityRecordRequest, GenerateActivityRecordResponse } from "../../types";
import { AiProviderError, AiRequestError } from "../../lib/ai/errors";
import { mockAIProvider } from "../../lib/ai/mock-provider";
import type { AIProvider } from "../../lib/ai/provider";
import { isActivityRecordDraft } from "../../lib/ai/validation";

export async function writeActivityRecordDraft(
  input: GenerateActivityRecordRequest,
  provider: AIProvider = mockAIProvider,
): Promise<GenerateActivityRecordResponse> {
  if (input.analysis.studentActions.length === 0) {
    throw new AiRequestError(
      "INSUFFICIENT_EVIDENCE",
      "보고서에서 확인된 학생 행동이 없어 초안을 만들 수 없습니다.",
      422,
    );
  }

  const result: unknown = await provider.generateActivityRecord(input);
  if (!isActivityRecordDraft(result)) {
    throw new AiProviderError("AI 초안 응답 형식이 올바르지 않습니다.");
  }
  return result;
}
