import "server-only";

import type { IcwcDraftReview } from "../../types";
import { getGroqAIConfig } from "../../lib/ai/config";
import { AiProviderError } from "../../lib/ai/errors";
import { inspectIcwcDraft } from "./icwc-draft-validation";
import { buildIcwcSecondYearDraftPrompt, type IcwcSecondYearDraftInput } from "./icwc-second-year-prompt";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function generateIcwcSecondYearDraft(
  input: IcwcSecondYearDraftInput,
): Promise<IcwcDraftReview> {
  const config = getGroqAIConfig();
  const supportsStrictSchema = config.model === "openai/gpt-oss-20b" || config.model === "openai/gpt-oss-120b";
  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        ...(supportsStrictSchema ? { reasoning_effort: "low" } : {}),
        max_completion_tokens: 2_048,
        response_format: supportsStrictSchema ? {
          type: "json_schema",
          json_schema: {
            name: "icwc_second_year_draft",
            strict: true,
            schema: {
              type: "object",
              properties: {
                draft: {
                  type: "string",
                  description: "보고서, 개인 소감문, 교사 코멘트에 근거한 완결된 한국어 학교생활기록부 검토용 초안. 기호나 한 글자만 쓰지 말 것.",
                },
              },
              required: ["draft"],
              additionalProperties: false,
            },
          },
        } : { type: "json_object" },
        messages: [
          { role: "system", content: "당신은 교사의 학교생활기록부 초안 작성을 돕는다. 입력에 없는 학생 행동이나 성과를 만들지 않는다." },
          { role: "user", content: buildIcwcSecondYearDraftPrompt(input) },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
  } catch {
    throw new AiProviderError("Groq 요청이 시간 내에 완료되지 않았습니다. 자동 재요청은 하지 않았습니다.", "AI_SERVICE_ERROR", 504);
  }

  if (!response.ok) {
    throw new AiProviderError(
      response.status === 429
        ? "Groq 요청 한도에 도달했습니다. 자동 재요청은 하지 않았습니다."
        : response.status === 400
          ? "Groq가 초안 요청 형식을 거부했습니다. 모델과 출력 설정을 확인해 주세요. 자동 재요청은 하지 않았습니다."
          : `Groq 초안 생성에 실패했습니다. (${response.status})`,
      response.status === 429 ? "AI_RATE_LIMITED" : "AI_SERVICE_ERROR",
      response.status === 429 ? 429 : 503,
    );
  }

  let content: unknown;
  let finishReason: unknown;
  let completionTokens: unknown;
  try {
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
      usage?: { completion_tokens?: unknown };
    };
    content = body.choices?.[0]?.message?.content;
    finishReason = body.choices?.[0]?.finish_reason;
    completionTokens = body.usage?.completion_tokens;
  } catch {
    throw new AiProviderError("Groq 응답을 읽을 수 없습니다. 자동 재요청은 하지 않았습니다.");
  }
  if (typeof content !== "string" || !content.trim()) {
    throw new AiProviderError("Groq가 빈 초안을 반환했습니다. 자동 재요청은 하지 않았습니다.");
  }

  let draft: unknown;
  try {
    const parsed = JSON.parse(content) as { draft?: unknown };
    draft = parsed.draft;
  } catch {
    throw new AiProviderError("Groq 응답의 JSON 형식이 올바르지 않습니다. 자동 재요청은 하지 않았습니다.");
  }
  if (typeof draft !== "string" || !draft.trim()) {
    throw new AiProviderError("Groq 응답에 초안 문장이 없습니다. 자동 재요청은 하지 않았습니다.");
  }

  const normalized = draft.replace(/[ \t]+/gu, " ").replace(/\n{3,}/gu, "\n\n").trim();
  const minimumLength = Math.ceil(input.maxLength * 0.6);
  if (Array.from(normalized).length < minimumLength || !/[가-힣]/u.test(normalized)) {
    console.warn("ICWC Groq returned an incomplete draft", {
      characterCount: Array.from(normalized).length,
      finishReason,
      completionTokens,
    });
    throw new AiProviderError("Groq가 완성되지 않은 짧은 초안을 반환했습니다. 저장하지 않았으며 자동 재요청도 하지 않았습니다.");
  }
  return inspectIcwcDraft(normalized, input.maxLength);
}
