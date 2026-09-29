import "server-only";

import type {
  ActivityRecordDraftContent,
  AnalyzeReportRequest,
  AnalyzeReportResponse,
} from "../../types";
import type { OneTopicReport } from "../../types/one-topic";
import type { CurriculumCreativeAnswers } from "../../types/curriculum-creative";
import type { GroqAIConfig } from "./config";
import { AiProviderError } from "./errors";
import type {
  ActivityRecordDraftGenerationInput,
  ActivityRecordDraftProvider,
  ReportAnalysisProvider,
  OneTopicDraftProvider,
  CurriculumCreativeDraftProvider,
} from "./provider";
import { buildActivityRecordDraftPrompt, buildAnalyzeReportPrompt, buildOneTopicSourceDraftPrompt, buildCurriculumCreativeDraftPrompt } from "./prompts";
import { createActivityRecordDraftJsonSchema, createOneTopicDraftJsonSchema, ONE_TOPIC_SOURCE_DRAFT_JSON_SCHEMA, CURRICULUM_CREATIVE_DRAFT_JSON_SCHEMA, REPORT_ANALYSIS_JSON_SCHEMA } from "./schemas";
import { isActivityRecordDraft, isReportAnalysis } from "./validation";

const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

interface GroqResponseBody {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelayMilliseconds(response: Response, attempt: number): number {
  const retryAfterSeconds = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1_000, 5_000);
  }

  return 500 * 2 ** attempt;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function providerHttpError(status: number, detail?: string): AiProviderError {
  if (status === 401 || status === 403) {
    return new AiProviderError(
      "Groq API 인증에 실패했습니다. API 키와 프로젝트 설정을 확인해 주세요.",
      "AI_PROVIDER_AUTH_ERROR",
      502,
    );
  }

  if (status === 429) {
    return new AiProviderError(
      "Groq API 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.",
      "AI_RATE_LIMITED",
      429,
    );
  }

  if (status >= 500) {
    return new AiProviderError(
      `Groq API가 일시적으로 응답하지 않습니다. (${status})`,
      "AI_SERVICE_ERROR",
      503,
    );
  }

  return new AiProviderError(
    `Groq API 요청을 처리할 수 없습니다. (${status}${detail ? `: ${detail}` : ""})`,
    "AI_SERVICE_ERROR",
    502,
  );
}

async function responseErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as unknown;
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "message" in body.error &&
      typeof body.error.message === "string"
    ) {
      return body.error.message.slice(0, 500);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function parseJsonResponse(text: string): unknown {
  if (!text) {
    throw new AiProviderError("Groq가 빈 응답을 반환했습니다.");
  }

  const jsonText = text
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();

  try {
    return JSON.parse(jsonText) as unknown;
  } catch {
    throw new AiProviderError("Groq 응답이 올바른 JSON이 아닙니다.");
  }
}

function assertUsedEvidenceComesFromAnalysis(
  result: ActivityRecordDraftContent,
  input: ActivityRecordDraftGenerationInput,
): void {
  const allowedEvidence = new Set([
    ...input.analysis.studentActions.map((item) => item.evidence),
    ...input.analysis.skills.map((item) => item.evidence),
  ]);

  if (result.usedEvidence.some((evidence) => !allowedEvidence.has(evidence))) {
    throw new AiProviderError("AI 초안이 검증된 분석 결과에 없는 근거를 사용했습니다.");
  }
}

function parseOneTopicDraft(
  value: unknown,
  input: ActivityRecordDraftGenerationInput,
  allowedEvidence: string[],
): ActivityRecordDraftContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AiProviderError("1인 1주제 초안 응답 형식이 올바르지 않습니다.");
  }
  const fields = value as Record<string, unknown>;
  const sentences = [fields.sentence1, fields.sentence2, fields.sentence3];
  if (sentences.some((sentence) => typeof sentence !== "string" || !sentence.trim())) {
    throw new AiProviderError("1인 1주제 초안의 세 문장이 모두 필요합니다.");
  }
  const first = (fields.sentence1 as string).trim();
  let second = (fields.sentence2 as string).trim();
  let third = (fields.sentence3 as string).trim();
  if ([first, second, third].some((sentence) => !sentence.endsWith(".") || /[.!?]\s+\S/u.test(sentence))) {
    throw new AiProviderError("1인 1주제 초안은 각 항목에 한 문장씩 작성되어야 합니다.");
  }
  const area = input.analysis.knowledge.find((item) => item.startsWith("[발표 영역] "))?.slice("[발표 영역] ".length);
  const topic = input.analysis.knowledge.find((item) => item.startsWith("[발표 주제] "))?.slice("[발표 주제] ".length) ?? input.analysis.topic;
  let sentence1 = first.replaceAll("[발표 영역]", area ?? "").replaceAll("[발표 주제]", topic);
  const lastTopicCharacter = Array.from(topic).at(-1) ?? "";
  const lastTopicCode = lastTopicCharacter.charCodeAt(0);
  const topicParticle = lastTopicCode >= 0xac00 && lastTopicCode <= 0xd7a3 && (lastTopicCode - 0xac00) % 28 !== 0
    ? "을" : "를";
  sentence1 = sentence1.replace(`'${topic}' 주제로`, `'${topic}'${topicParticle} 주제로`);
  sentence1 = sentence1.replace(/[가-힣]+(?:함|음|됨)\.$/u, "발표함.");
  if (area && !sentence1.includes(area)) {
    sentence1 = `${area} 관련 활동에서 ${sentence1}`;
  }
  if (!sentence1.includes(`'${topic}'`)) {
    if (sentence1.includes(topic)) {
      sentence1 = sentence1.replace(topic, `'${topic}'`);
    } else {
      const lastAreaCharacter = Array.from(area ?? "").at(-1) ?? "";
      const lastAreaCode = lastAreaCharacter.charCodeAt(0);
      const areaParticle = lastAreaCode >= 0xac00 && lastAreaCode <= 0xd7a3 && (lastAreaCode - 0xac00) % 28 !== 0
        ? "과" : "와";
      sentence1 = `${area ? `${area}${areaParticle} 연계하여 ` : ""}'${topic}'${topicParticle} 주제로 발표함.`;
    }
  }
  if (second.endsWith("발생함.")) {
    second = second.replace(/^(\S+)(은|는)\s/u, (_match, subject: string, particle: string) =>
      `${subject}${particle === "은" ? "이" : "가"} `,
    ).replace(/발생함\.$/u, "발생하는 과정을 분석함.");
  }
  third = third.replace(/(역량|능력)을 성찰함\.$/u, "$1을 드러냄.");
  const draft = [sentence1, second, third].join(" ");
  if (!Array.isArray(fields.usedEvidenceIndices) ||
    fields.usedEvidenceIndices.some((index: unknown) => typeof index !== "number" || !Number.isInteger(index))) {
    throw new AiProviderError("1인 1주제 초안의 근거 번호가 올바르지 않습니다.");
  }
  const usedEvidence = [...new Set(fields.usedEvidenceIndices
    .filter((index: number) => index >= 0 && index < allowedEvidence.length)
    .map((index: number) => allowedEvidence[index]))];
  const result = { draft, usedEvidence };
  if (!isActivityRecordDraft(result)) {
    throw new AiProviderError("1인 1주제 초안 응답 형식이 올바르지 않습니다.");
  }
  return result;
}

function koreanParticle(word: string, withFinal: string, withoutFinal: string): string {
  const last = Array.from(word.trim()).at(-1) ?? "";
  const code = last.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0
    ? withFinal : withoutFinal;
}

function oneTopicPresentationFocus(report: OneTopicReport, proposed: string): string {
  const focus = proposed.trim().replace(/[.!?]+$/u, "").replace(/에\s*대해$/u, "").trim();
  const topicKey = report.topic.replace(/[^A-Za-z0-9가-힣]/gu, "").toLowerCase();
  const focusKey = focus.replace(/[^A-Za-z0-9가-힣]/gu, "").toLowerCase();
  if (focusKey && focus.length <= 15 && focus.split(/\s+/u).length <= 2 &&
    !topicKey.includes(focusKey) && !focusKey.includes(topicKey)) {
    return focus;
  }

  const tokens = (report.content.match(/[A-Za-z0-9가-힣]+/gu) ?? [])
    .map((token) => token.replace(/(?:에서는|으로|에서|에게|까지|부터|처럼|보다|은|는|이|가|을|를|의|에|와|과|도|만)$/u, ""));
  const counts = new Map<string, number>();
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const first = tokens[index] ?? "";
    const second = tokens[index + 1] ?? "";
    if (first.length < 2 || second.length < 2 || first.length > 12 || second.length > 12) continue;
    const candidate = `${first} ${second}`;
    const candidateKey = candidate.replace(/\s/gu, "").toLowerCase();
    if (topicKey.includes(candidateKey) || candidateKey.includes(topicKey)) continue;
    counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  }
  const repeated = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  if (repeated && repeated[1] > 1) return repeated[0];
  return tokens.find((token) => token.length >= 2 && token.length <= 12 && !topicKey.includes(token.toLowerCase()))
    ?? "핵심 쟁점";
}

function normalizeRecordSentence(value: string): string {
  const sentence = value.trim().replace(/\s+/gu, " ").replace(/^학생(?:은|이)\s+/u, "").replace(/[.!?]+$/u, "")
    .replace(/관심을 갖음$/u, "관심을 가짐");
  if (/(?:함|음|됨|냄|임)$/u.test(sentence)) return `${sentence}.`;
  if (sentence.endsWith("할 것이다")) return `${sentence.slice(0, -5)}할 계획임.`;
  if (sentence.endsWith("고 싶다")) return `${sentence.slice(0, -4)}고자 함.`;
  if (sentence.endsWith("고자 한다")) return `${sentence.slice(0, -5)}고자 함.`;
  if (sentence.endsWith("불러일으켰다")) return `${sentence.slice(0, -6)}불러일으킴.`;
  if (sentence.endsWith("겠다")) return `${sentence.slice(0, -2)}고자 함.`;
  if (sentence.endsWith("느꼈다")) return `${sentence.slice(0, -3)}느낌.`;
  if (sentence.endsWith("깨달았다")) return `${sentence.slice(0, -4)}깨달음.`;
  if (sentence.endsWith("키웠다")) return `${sentence.slice(0, -3)}키움.`;
  if (sentence.endsWith("배웠다")) return `${sentence.slice(0, -3)}배움.`;
  if (sentence.endsWith("드러냈다")) return `${sentence.slice(0, -4)}드러냄.`;
  if (sentence.endsWith("되었다")) return `${sentence.slice(0, -3)}됨.`;
  if (sentence.endsWith("보였다")) return `${sentence.slice(0, -3)}보임.`;
  if (sentence.endsWith("나타났다")) return `${sentence.slice(0, -4)}나타남.`;
  if (sentence.endsWith("있다")) return `${sentence.slice(0, -2)}있음.`;
  if (sentence.endsWith("이다")) return `${sentence.slice(0, -2)}임.`;
  const normalized = sentence.replace(/([가-힣]+)(?:하였다|했다|한다)$/u, "$1함");
  if (normalized !== sentence) return `${normalized}.`;
  if (sentence.endsWith("다")) return `${sentence.slice(0, -1)}다고 정리함.`;
  return `${sentence}라고 정리함.`;
}

function oneTopicCaseExcerpt(report: OneTopicReport): { name: string; excerpt: string } | null {
  const content = report.content.replace(/\s+/gu, " ");
  const references = report.references.split(/[,;\n]/u).map((item) => item.trim()).filter(Boolean);
  for (const reference of references) {
    const matches = [reference, reference.split(/\s+/u)[0] ?? ""].filter((item) => item.length >= 2);
    const name = matches.find((item) => content.includes(item));
    if (!name) continue;
    const remaining = content.slice(content.indexOf(name));
    const phrase = remaining.match(/^.{1,55}?(?:사례|표현|평가|결과|현상)/u)?.[0]
      ?? remaining.split(/[,.;]/u)[0]?.slice(0, 45);
    if (phrase) return { name, excerpt: phrase.trim() };
  }
  return null;
}

function groundOneTopicSecondSentence(sentence: string, report: OneTopicReport): string {
  let grounded = sentence;
  const topicIndex = grounded.indexOf(`'${report.topic.trim()}'`);
  if (topicIndex >= 0 && topicIndex < 60) {
    const introductionEnd = grounded.indexOf("주제로", topicIndex);
    if (introductionEnd >= 0 && introductionEnd < 100) {
      grounded = grounded.slice(introductionEnd + "주제로".length).trim();
    }
  }
  const example = oneTopicCaseExcerpt(report);
  const referenceNames = report.references.split(/[,;\n]/u)
    .flatMap((item) => [item.trim(), item.trim().split(/\s+/u)[0] ?? ""])
    .filter((item) => item.length >= 2 && report.content.includes(item));
  if (!example || referenceNames.some((name) => grounded.includes(name))) return grounded;
  const ending = grounded.match(/^(.*?)(?:(구조적으로|논리적으로|구체적으로)\s*)?(분석|설명|서술|고찰|비교)함\.$/u);
  if (!ending?.[1] || !ending[3]) return grounded;
  const prefix = ending[1].trimEnd();
  const connector = /[을를]$/u.test(prefix) ? " " : "을 ";
  const manner = ending[2] ?? "구체적으로";
  return `${prefix}${connector}${example.excerpt} 사례와 연결해 ${manner} ${ending[3]}함.`;
}

export class GroqAIProvider implements ActivityRecordDraftProvider, ReportAnalysisProvider, OneTopicDraftProvider, CurriculumCreativeDraftProvider {
  constructor(private readonly config: GroqAIConfig) {}

  async generateCurriculumCreativeRecord(
    answers: CurriculumCreativeAnswers | string,
    maxLength: number,
  ): Promise<ActivityRecordDraftContent> {
    const prompt = buildCurriculumCreativeDraftPrompt(answers, maxLength);
    const requestBody = JSON.stringify({
      model: this.config.model,
      messages: [
        { role: "system", content: prompt.systemInstruction },
        { role: "user", content: prompt.userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "curriculum_creative_draft", strict: true, schema: CURRICULUM_CREATIVE_DRAFT_JSON_SCHEMA },
      },
      temperature: 0.2,
      reasoning_effort: "low",
      max_completion_tokens: 2_048,
      stream: false,
    });
    const value = await this.requestStructuredContent(requestBody, 1);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new AiProviderError("교과창체 초안 응답 형식이 올바르지 않습니다.");
    }
    const fields = value as Record<string, unknown>;
    const keys = ["motivationAndPerspective", "explorationAndPreparation", "growthAndDirection"] as const;
    if (keys.some((key) => typeof fields[key] !== "string") ||
      !(fields.motivationAndPerspective as string).trim()) {
      throw new AiProviderError("교과창체 초안의 문장별 응답 형식이 올바르지 않습니다.");
    }
    const sentences = keys.map((key) => (fields[key] as string).trim())
      .filter(Boolean)
      .map((sentence) => normalizeRecordSentence(sentence.replace(/[.!?]\s+(?=\S)/gu, ", ")));
    return { draft: sentences.join(" "), usedEvidence: [] };
  }

  async generateOneTopicRecord(report: OneTopicReport, maxLength: number): Promise<ActivityRecordDraftContent> {
    const prompt = buildOneTopicSourceDraftPrompt(report, maxLength);
    const requestBody = JSON.stringify({
      model: this.config.model,
      messages: [
        { role: "system", content: prompt.systemInstruction },
        { role: "user", content: prompt.userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "one_topic_source_draft", strict: true, schema: ONE_TOPIC_SOURCE_DRAFT_JSON_SCHEMA },
      },
      temperature: 0.2,
      reasoning_effort: "low",
      max_completion_tokens: 2_048,
      stream: false,
    });
    const value = await this.requestStructuredContent(requestBody, 1);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new AiProviderError("1인 1주제 초안 응답 형식이 올바르지 않습니다.");
    }
    const fields = value as Record<string, unknown>;
    if (typeof fields.presentationFocus !== "string" ||
      typeof fields.sentence2 !== "string" || typeof fields.sentence3 !== "string" ||
      !fields.sentence2.trim() || !fields.sentence3.trim()) {
      throw new AiProviderError("1인 1주제 초안 응답 항목이 올바르지 않습니다.");
    }
    const focus = oneTopicPresentationFocus(report, fields.presentationFocus);
    const area = report.area.trim();
    const topic = report.topic.trim();
    const sentence1 = `${area ? `${area}${koreanParticle(area, "과", "와")} 연계하여 ` : ""}'${topic}'${koreanParticle(topic, "을", "를")} 주제로 ${focus}에 대해 발표함.`;
    const second = groundOneTopicSecondSentence(normalizeRecordSentence(fields.sentence2), report);
    const draft = [sentence1, second, normalizeRecordSentence(fields.sentence3)].join(" ");
    return { draft, usedEvidence: [] };
  }

  async analyzeReport(input: AnalyzeReportRequest): Promise<AnalyzeReportResponse> {
    const prompt = buildAnalyzeReportPrompt(input);
    const requestBody = JSON.stringify({
      model: this.config.model,
      messages: [
        { role: "system", content: prompt.systemInstruction },
        { role: "user", content: prompt.userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "report_analysis", strict: true, schema: REPORT_ANALYSIS_JSON_SCHEMA },
      },
      temperature: 0.2,
      reasoning_effort: "low",
      max_completion_tokens: 4_096,
      stream: false,
    });
    const value = await this.requestStructuredContent(requestBody, 1);
    if (!isReportAnalysis(value)) {
      throw new AiProviderError("Groq 분석 응답 형식이 올바르지 않습니다.");
    }
    return value;
  }

  async generateActivityRecord(
    input: ActivityRecordDraftGenerationInput,
  ): Promise<ActivityRecordDraftContent> {
    const prompt = buildActivityRecordDraftPrompt(input);
    const allowedEvidence = [
      ...input.analysis.studentActions.map((item) => item.evidence),
      ...input.analysis.skills.map((item) => item.evidence),
    ];
    const isOneTopic = input.activityCode === "AUTONOMOUS_ONE_TOPIC";
    const requestBody = JSON.stringify({
      model: this.config.model,
      messages: [
        { role: "system", content: prompt.systemInstruction },
        { role: "user", content: prompt.userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: isOneTopic ? "one_topic_draft" : "activity_record_draft",
          strict: true,
          schema: isOneTopic
            ? createOneTopicDraftJsonSchema()
            : createActivityRecordDraftJsonSchema(allowedEvidence),
        },
      },
      temperature: 0.2,
      reasoning_effort: "low",
      max_completion_tokens: 4_096,
      stream: false,
    });

    const value = await this.requestStructuredContent(requestBody, isOneTopic ? 1 : MAX_ATTEMPTS);
    const result = isOneTopic ? parseOneTopicDraft(value, input, allowedEvidence) : value;
    if (!isActivityRecordDraft(result)) {
      throw new AiProviderError("Groq 초안 응답 형식이 올바르지 않습니다.");
    }

    assertUsedEvidenceComesFromAnalysis(result, input);
    return result;
  }

  private async requestStructuredContent(requestBody: string, maxAttempts: number): Promise<unknown> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;

      try {
        response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: requestBody,
          signal: controller.signal,
        });
      } catch (error: unknown) {
        if (isAbortError(error)) {
          throw new AiProviderError(
            "Groq API 응답 시간이 초과됐습니다.",
            "AI_TIMEOUT",
            504,
          );
        }

        if (attempt < maxAttempts - 1) {
          await wait(500 * 2 ** attempt);
          continue;
        }

        throw new AiProviderError(
          "Groq API에 연결할 수 없습니다.",
          "AI_SERVICE_ERROR",
          503,
        );
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const detail = await responseErrorDetail(response);
        const isStructuredOutputFailure =
          response.status === 400 && detail?.includes("Failed to validate JSON");
        if (
          (RETRYABLE_STATUS_CODES.has(response.status) || isStructuredOutputFailure) &&
          attempt < maxAttempts - 1
        ) {
          await wait(retryDelayMilliseconds(response, attempt));
          continue;
        }

        throw providerHttpError(response.status, detail);
      }

      let body: GroqResponseBody;
      try {
        body = (await response.json()) as GroqResponseBody;
      } catch {
        throw new AiProviderError("Groq API 응답을 읽을 수 없습니다.");
      }

      const content = body.choices?.[0]?.message?.content;
      return parseJsonResponse(typeof content === "string" ? content : "");
    }

    throw new AiProviderError(
      "Groq API 요청을 완료하지 못했습니다.",
      "AI_SERVICE_ERROR",
      503,
    );
  }
}
