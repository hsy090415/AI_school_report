import "server-only";

import type { IcwcDraftReview } from "../../types";
import { getGeminiAIConfig } from "../../lib/ai/config";
import { AiProviderError } from "../../lib/ai/errors";
import { inspectIcwcDraft } from "./icwc-draft-validation";
import { buildIcwcSecondYearDraftPrompt, type IcwcSecondYearDraftInput } from "./icwc-second-year-prompt";

interface GeminiResponseBody {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: unknown; thought?: unknown }> };
    finishReason?: unknown;
  }>;
}

export async function generateIcwcSecondYearGeminiDraft(
  input: IcwcSecondYearDraftInput,
): Promise<IcwcDraftReview> {
  const config = getGeminiAIConfig();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "당신은 교사의 학교생활기록부 초안 작성을 돕는다. 입력에 없는 학생 행동이나 성과를 만들지 않는다." }],
        },
        contents: [{ role: "user", parts: [{ text: buildIcwcSecondYearDraftPrompt(input) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            properties: { draft: { type: "string" } },
            required: ["draft"],
            additionalProperties: false,
          },
          maxOutputTokens: 4_096,
          temperature: 0.2,
          ...(config.model === "gemini-3.5-flash"
            ? { thinkingConfig: { thinkingLevel: "minimal" } }
            : {}),
        },
      }),
      signal: AbortSignal.timeout(90_000),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new AiProviderError(
      timedOut
        ? "Gemini 응답을 90초 안에 받지 못했습니다. 자동 재요청은 하지 않았습니다."
        : "Gemini API에 연결할 수 없습니다. 자동 재요청은 하지 않았습니다.",
      "AI_SERVICE_ERROR",
      timedOut ? 504 : 503,
    );
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new AiProviderError("Gemini 요청 한도에 도달했습니다. 자동 재요청은 하지 않았습니다.", "AI_RATE_LIMITED", 429);
    }
    if (response.status === 401 || response.status === 403) {
      throw new AiProviderError("Gemini API 인증에 실패했습니다. 서버의 API 키를 확인해 주세요.", "AI_PROVIDER_AUTH_ERROR", 502);
    }
    throw new AiProviderError(
      response.status === 503
        ? "Gemini 모델이 현재 혼잡합니다. 자동 재요청은 하지 않았습니다."
        : `Gemini 초안 생성 요청에 실패했습니다. (${response.status}) 자동 재요청은 하지 않았습니다.`,
      "AI_SERVICE_ERROR",
      response.status >= 500 ? 503 : 502,
    );
  }

  let body: GeminiResponseBody;
  try {
    body = (await response.json()) as GeminiResponseBody;
  } catch {
    throw new AiProviderError("Gemini 응답을 읽을 수 없습니다. 자동 재요청은 하지 않았습니다.");
  }

  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.thought !== true && typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
  if (!text) {
    throw new AiProviderError(
      body.candidates?.[0]?.finishReason === "MAX_TOKENS"
        ? "Gemini 응답이 길이 제한에 도달했습니다. 자동 재요청은 하지 않았습니다."
        : "Gemini가 빈 초안을 반환했습니다. 자동 재요청은 하지 않았습니다.",
    );
  }

  let draft: unknown;
  try {
    const parsed = JSON.parse(text) as { draft?: unknown };
    draft = parsed.draft;
  } catch {
    throw new AiProviderError("Gemini 응답의 JSON 형식이 올바르지 않습니다. 자동 재요청은 하지 않았습니다.");
  }
  if (typeof draft !== "string" || !draft.trim()) {
    throw new AiProviderError("Gemini 응답에 초안 문장이 없습니다. 자동 재요청은 하지 않았습니다.");
  }

  const normalized = draft.replace(/[ \t]+/gu, " ").replace(/\n{3,}/gu, "\n\n").trim();
  if (Array.from(normalized).length < Math.ceil(input.maxLength * 0.6) || !/[가-힣]/u.test(normalized)) {
    throw new AiProviderError("Gemini가 완성되지 않은 짧은 초안을 반환했습니다. 저장하지 않았으며 자동 재요청도 하지 않았습니다.");
  }
  return inspectIcwcDraft(normalized, input.maxLength);
}
