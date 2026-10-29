import "server-only";

import type { IcwcDraftDirection } from "../../types";
import { getGroqAIConfig } from "../../lib/ai/config";
import { AiProviderError } from "../../lib/ai/errors";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_SOURCE_LENGTH = 20_000;

export interface IcwcSecondYearDraftInput {
  reportText: string;
  reflectionText: string;
  teacherComment: string;
  direction: IcwcDraftDirection;
  maxLength: number;
}

export interface IcwcSecondYearDraftResult {
  draft: string;
  characterCount: number;
  maxLength: number;
  warnings: string[];
}

function removeContactDetails(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, "[이메일 생략]")
    .replace(/01[016789][- ]?\d{3,4}[- ]?\d{4}/gu, "[연락처 생략]");
}

function conciseReport(text: string): string {
  if (text.length <= MAX_SOURCE_LENGTH) return text;
  return `${text.slice(0, 12_000)}\n[원문 중간 일부 생략]\n${text.slice(-8_000)}`;
}

function prompt(input: IcwcSecondYearDraftInput): string {
  const requestedLength = Math.max(80, input.maxLength - 70);
  const focus = input.direction === "탐구내용 중심"
    ? "연구 주제와 목적 → 학생이 이해·수행한 연구 설계와 결과 분석 → 확인되는 탐구 역량을 중심으로 쓴다. 팀 전체의 결과를 개인의 단독 성과로 돌리지 않는다."
    : "연구 주제를 짧게 제시한 뒤 학생의 실제 역할·협업·의견 조율·문제 해결을 중심으로 쓴다. 개인 소감문 또는 교사 코멘트에 협업 근거가 없다면 협력 역량을 지어내지 않는다.";

  return [
    "2학년 협동심화탐구프로젝트 학교생활기록부 검토용 초안을 작성한다.",
    "팀 보고서, 학생 개인 소감문, 교사 관찰 코멘트에 명시된 사실만 사용한다.",
    "보고서의 팀 성과와 해당 학생의 행동을 구분하고, 확인되지 않은 개인 기여·실험 결과·역량을 만들지 않는다.",
    `선택한 방향: ${input.direction}. ${focus}`,
    "첫 문장은 활동 참여와 실제 탐구 주제를, 이어지는 문장은 구체적인 탐구 과정·판단과 근거 있는 역량을 자연스럽게 연결한다.",
    "학생의 어려움과 해결 과정이 있으면 관찰 가능한 행동으로 표현하고, 근거 없는 칭찬이나 추상적 수식어를 피한다.",
    "모든 문장은 '~함.', '~분석함.', '~드러냄.'처럼 -(으)ㅁ 명사형으로 끝낸다. 3~4문장, 줄바꿈 없는 한 문단으로 작성한다.",
    `공백 포함 약 ${requestedLength}자를 목표로 한 번만 생성한다. 실제 기준은 ${input.maxLength}자이며, 길이는 교사가 수정할 수 있다.`,
    'JSON 객체 하나만 반환한다. 형식: {"draft":"완성된 한 문단"}',
    "\n<team_report>\n" + removeContactDetails(conciseReport(input.reportText)) + "\n</team_report>",
    "<student_reflection>\n" + removeContactDetails(input.reflectionText) + "\n</student_reflection>",
    "<teacher_comment>\n" + removeContactDetails(input.teacherComment) + "\n</teacher_comment>",
  ].join("\n");
}

export async function generateIcwcSecondYearDraft(
  input: IcwcSecondYearDraftInput,
): Promise<IcwcSecondYearDraftResult> {
  const config = getGroqAIConfig();
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
        temperature: 0.35,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "당신은 교사의 학교생활기록부 초안 작성을 돕는다. 입력에 없는 학생 행동이나 성과를 만들지 않는다." },
          { role: "user", content: prompt(input) },
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
      response.status === 429 ? "Groq 요청 한도에 도달했습니다. 자동 재요청은 하지 않았습니다." : `Groq 초안 생성에 실패했습니다. (${response.status})`,
      response.status === 429 ? "AI_RATE_LIMITED" : "AI_SERVICE_ERROR",
      response.status === 429 ? 429 : 503,
    );
  }

  let content: unknown;
  try {
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    content = body.choices?.[0]?.message?.content;
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

  const normalized = draft.replace(/\s+/gu, " ").trim();
  const characterCount = Array.from(normalized).length;
  const warnings: string[] = [];
  if (characterCount > input.maxLength) warnings.push(`설정한 ${input.maxLength}자를 초과했습니다. 교사가 수정해 주세요.`);
  if (!/(?:함|됨|음|봄|냄|임)\.$/u.test(normalized)) warnings.push("마지막 문장의 -(으)ㅁ 종결어미를 확인해 주세요.");
  return { draft: normalized, characterCount, maxLength: input.maxLength, warnings };
}
