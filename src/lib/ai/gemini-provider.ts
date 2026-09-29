import "server-only";

import type {
  AnalyzeReportRequest,
  AnalyzeReportResponse,
  ActivityRecordDraftContent,
} from "../../types";
import type { GeminiAIConfig } from "./config";
import { AiProviderError } from "./errors";
import { createGeminiRequestTrace } from "./gemini-request-trace";
import type {
  AIProvider,
  ActivityRecordDraftGenerationInput,
  AnalyzeReportDocumentInput,
  AnalyzeReportDocumentResult,
  AnalyzeReportMaterialsInput,
  ReportDocumentAnalysisProvider,
  ReportMaterialsAnalysisProvider,
} from "./provider";
import {
  buildActivityRecordDraftPrompt,
  buildAnalyzeReportDocumentPrompt,
  buildAnalyzeReportMaterialsPrompt,
  buildAnalyzeReportPrompt,
} from "./prompts";
import {
  createActivityRecordDraftJsonSchema,
  REPORT_DOCUMENT_ANALYSIS_JSON_SCHEMA,
  REPORT_ANALYSIS_JSON_SCHEMA,
} from "./schemas";
import {
  isActivityRecordDraft,
  isReportAnalysis,
  isReportDocumentAnalysis,
} from "./validation";

const REQUEST_TIMEOUT_MS = 60_000;

interface GeminiTextPart {
  text?: unknown;
  thought?: unknown;
}

interface GeminiResponseBody {
  candidates?: Array<{
    content?: {
      parts?: GeminiTextPart[];
    };
    finishReason?: unknown;
  }>;
}

interface GeminiRequestOptions {
  systemInstruction: string;
  parts: GeminiRequestPart[];
  responseSchema: object;
  maxOutputTokens?: number;
  timeoutMs?: number | null;
  minimalThinking?: boolean;
}

type GeminiRequestPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function providerHttpError(status: number): AiProviderError {
  if (status === 401 || status === 403) {
    return new AiProviderError(
      "Gemini API 인증에 실패했습니다. API 키와 프로젝트 설정을 확인해 주세요.",
      "AI_PROVIDER_AUTH_ERROR",
      502,
    );
  }

  if (status === 429) {
    return new AiProviderError(
      "Gemini API 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.",
      "AI_RATE_LIMITED",
      429,
    );
  }

  if (status >= 500) {
    return new AiProviderError(
      `Gemini API가 일시적으로 응답하지 않습니다. (${status})`,
      "AI_SERVICE_ERROR",
      503,
    );
  }

  return new AiProviderError(
    `Gemini API 요청을 처리할 수 없습니다. (${status})`,
    "AI_SERVICE_ERROR",
    502,
  );
}

function extractResponseText(body: GeminiResponseBody): string {
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) =>
      part.thought !== true && typeof part.text === "string" ? part.text : "",
    )
    .join("")
    .trim();
}

function findFirstCompleteJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let isInsideString = false;
  let isEscaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (isInsideString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (character === "\\") {
        isEscaped = true;
      } else if (character === '"') {
        isInsideString = false;
      }
      continue;
    }

    if (character === '"') {
      isInsideString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

function parseJsonResponse(text: string): unknown {
  if (!text) {
    throw new AiProviderError("Gemini가 빈 응답을 반환했습니다.");
  }

  const jsonText = text
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();

  const candidates = [jsonText, findFirstCompleteJsonObject(jsonText)].filter(
    (candidate, index, values): candidate is string =>
      candidate !== null && values.indexOf(candidate) === index,
  );

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Gemini가 JSON 앞뒤에 설명을 붙인 경우 다음 후보를 확인한다.
    }
  }

  throw new AiProviderError("Gemini 응답이 올바른 JSON이 아닙니다.");
}

function assertEvidenceComesFromReport(
  analysis: AnalyzeReportResponse,
  reportText: string,
): void {
  const evidence = [
    ...analysis.studentActions.map((item) => item.evidence),
    ...analysis.skills.map((item) => item.evidence),
  ];

  if (evidence.some((item) => !reportText.includes(item))) {
    throw new AiProviderError("AI 분석에 보고서 원문에서 확인할 수 없는 근거가 포함됐습니다.");
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

export class GeminiAIProvider implements AIProvider, ReportDocumentAnalysisProvider, ReportMaterialsAnalysisProvider {
  constructor(private readonly config: GeminiAIConfig) {}

  async analyzeReport(input: AnalyzeReportRequest): Promise<AnalyzeReportResponse> {
    const prompt = buildAnalyzeReportPrompt(input);
    const value = await this.generateStructuredContent({
      systemInstruction: prompt.systemInstruction,
      parts: [{ text: prompt.userPrompt }],
      responseSchema: REPORT_ANALYSIS_JSON_SCHEMA,
    });

    if (!isReportAnalysis(value)) {
      throw new AiProviderError("Gemini 분석 응답 형식이 올바르지 않습니다.");
    }

    assertEvidenceComesFromReport(value, input.reportText);
    return value;
  }

  async analyzeReportDocument(
    input: AnalyzeReportDocumentInput,
  ): Promise<AnalyzeReportDocumentResult> {
    const prompt = buildAnalyzeReportDocumentPrompt(input);
    const value = await this.generateStructuredContent({
      systemInstruction: prompt.systemInstruction,
      parts: [
        { inlineData: { mimeType: input.mimeType, data: input.dataBase64 } },
        { text: prompt.userPrompt },
      ],
      responseSchema: REPORT_DOCUMENT_ANALYSIS_JSON_SCHEMA,
      maxOutputTokens: 8_192,
    });

    if (!isReportDocumentAnalysis(value)) {
      throw new AiProviderError("Gemini 문서 분석 응답 형식이 올바르지 않습니다.");
    }

    assertEvidenceComesFromReport(value.analysis, value.extractedText);
    return value;
  }

  async analyzeReportMaterials(
    input: AnalyzeReportMaterialsInput,
  ): Promise<AnalyzeReportDocumentResult> {
    const prompt = buildAnalyzeReportMaterialsPrompt(input);
    const documentParts: GeminiRequestPart[] = input.documents.flatMap((document) => [
      { text: `[첨부 발표자료: ${document.label} / ${document.fileName}]` },
      { inlineData: { mimeType: document.mimeType, data: document.dataBase64 } },
    ]);
    const value = await this.generateStructuredContent({
      systemInstruction: prompt.systemInstruction,
      parts: [
        { text: `<student_responses>\n${input.reportText}\n</student_responses>` },
        ...documentParts,
        { text: prompt.userPrompt },
      ],
      responseSchema: REPORT_DOCUMENT_ANALYSIS_JSON_SCHEMA,
      maxOutputTokens: 12_288,
      timeoutMs: input.activityCode === "AUTONOMOUS_ONE_TOPIC" ? null : REQUEST_TIMEOUT_MS,
      minimalThinking: input.activityCode === "AUTONOMOUS_ONE_TOPIC",
    });

    if (!isReportDocumentAnalysis(value)) {
      throw new AiProviderError("Gemini 통합 자료 분석 응답 형식이 올바르지 않습니다.");
    }

    const extractedText = [
      input.reportText,
      value.extractedText
        ? `[첨부 발표자료에서 사용한 근거]\n${value.extractedText}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const result = { ...value, extractedText };

    assertEvidenceComesFromReport(result.analysis, result.extractedText);
    return result;
  }

  async generateActivityRecord(
    input: ActivityRecordDraftGenerationInput,
  ): Promise<ActivityRecordDraftContent> {
    const prompt = buildActivityRecordDraftPrompt(input);
    const allowedEvidence = [
      ...input.analysis.studentActions.map((item) => item.evidence),
      ...input.analysis.skills.map((item) => item.evidence),
    ];
    const value = await this.generateStructuredContent({
      systemInstruction: prompt.systemInstruction,
      parts: [{ text: prompt.userPrompt }],
      responseSchema: createActivityRecordDraftJsonSchema(allowedEvidence),
    });

    if (!isActivityRecordDraft(value)) {
      throw new AiProviderError("Gemini 초안 응답 형식이 올바르지 않습니다.");
    }

    assertUsedEvidenceComesFromAnalysis(value, input);
    return value;
  }

  private async generateStructuredContent(options: GeminiRequestOptions): Promise<unknown> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.config.model)}:generateContent`;
    const requestBody = JSON.stringify({
      systemInstruction: {
        parts: [{ text: options.systemInstruction }],
      },
      contents: [{ role: "user", parts: options.parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: options.responseSchema,
        maxOutputTokens: options.maxOutputTokens ?? 4_096,
        temperature: 0.2,
        ...(options.minimalThinking && this.config.model === "gemini-3.5-flash"
          ? { thinkingConfig: { thinkingLevel: "minimal" } }
          : {}),
      },
    });
    const controller = new AbortController();
    const trace = createGeminiRequestTrace(this.config.model, Buffer.byteLength(requestBody));
    const timeoutMs = options.timeoutMs === null ? null : (options.timeoutMs ?? REQUEST_TIMEOUT_MS);
    const timeout = timeoutMs === null ? null : setTimeout(() => controller.abort(), timeoutMs);
    let body: GeminiResponseBody;

    try {
      const response = await trace.run(() => fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.config.apiKey,
        },
        body: requestBody,
        signal: controller.signal,
      }));
      trace.mark("headers_received", response.status);
      if (!response.ok) throw providerHttpError(response.status);
      try {
        body = (await response.json()) as GeminiResponseBody;
        trace.mark("body_received");
      } catch (error: unknown) {
        if (controller.signal.aborted || isAbortError(error)) throw error;
        throw new AiProviderError("Gemini API 응답을 읽을 수 없습니다.");
      }
    } catch (error: unknown) {
      if (controller.signal.aborted || isAbortError(error)) {
        const detail = trace.timeoutMessage();
        trace.mark("timeout");
        throw new AiProviderError(
          `Gemini 요청이 ${timeoutMs === null ? "중단" : `${timeoutMs / 1000}초를 초과`}했습니다. ${detail} 자동 재시도하지 않았습니다. 진단 번호: ${trace.id}`,
          "AI_TIMEOUT",
          504,
        );
      }
      trace.mark("request_failed");
      if (error instanceof AiProviderError) throw error;

      throw new AiProviderError(
        "Gemini API에 연결할 수 없습니다.",
        "AI_SERVICE_ERROR",
        503,
      );
    } finally {
      if (timeout !== null) clearTimeout(timeout);
      trace.close();
    }

    const text = extractResponseText(body);
    try {
      return parseJsonResponse(text);
    } catch (error: unknown) {
      if (body.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        throw new AiProviderError(
          "Gemini 응답이 길이 제한에 도달해 JSON이 완성되지 않았습니다. 자료를 줄여 다시 시도해 주세요.",
        );
      }
      throw error;
    }
  }
}
