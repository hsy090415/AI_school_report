import "server-only";

export type AIProviderName = "mock" | "gemini" | "groq";

interface MockAIConfig {
  provider: "mock";
}

export interface GeminiAIConfig {
  provider: "gemini";
  apiKey: string;
  model: string;
}

export interface GroqAIConfig {
  provider: "groq";
  apiKey: string;
  model: string;
}

export type ReportAnalysisAIConfig = MockAIConfig | GeminiAIConfig;
export type ActivityRecordDraftAIConfig = MockAIConfig | GeminiAIConfig | GroqAIConfig;

export class AIConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIConfigurationError";
  }
}

function readRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new AIConfigurationError(`필수 환경 변수 ${name}이(가) 설정되지 않았습니다.`);
  }

  return value;
}

function selectedProvider(environmentVariable: string): string {
  return (
    process.env[environmentVariable]?.trim() ||
    process.env.AI_PROVIDER?.trim() ||
    "mock"
  );
}

function geminiConfig(): GeminiAIConfig {
  return {
    provider: "gemini",
    apiKey: readRequiredEnvironmentVariable("GEMINI_API_KEY"),
    model: readRequiredEnvironmentVariable("GEMINI_MODEL"),
  };
}

export function getReportAnalysisAIConfig(): ReportAnalysisAIConfig {
  const provider = selectedProvider("AI_ANALYSIS_PROVIDER");

  if (provider === "mock") {
    return { provider };
  }

  if (provider === "gemini") {
    return geminiConfig();
  }

  throw new AIConfigurationError(
    `지원하지 않는 보고서 분석 Provider입니다: ${provider}. mock 또는 gemini를 사용하세요.`,
  );
}

export function getActivityRecordDraftAIConfig(): ActivityRecordDraftAIConfig {
  const provider = selectedProvider("AI_DRAFT_PROVIDER");

  if (provider === "mock") {
    return { provider };
  }

  if (provider === "gemini") {
    return geminiConfig();
  }

  if (provider === "groq") {
    return getGroqAIConfig();
  }

  throw new AIConfigurationError(
    `지원하지 않는 초안 생성 Provider입니다: ${provider}. mock, gemini 또는 groq를 사용하세요.`,
  );
}

export function getGroqAIConfig(): GroqAIConfig {
  return {
    provider: "groq",
    apiKey: readRequiredEnvironmentVariable("GROQ_API_KEY"),
    model: readRequiredEnvironmentVariable("GROQ_MODEL"),
  };
}
