import "server-only";

import {
  AIConfigurationError,
  getActivityRecordDraftAIConfig,
  getGroqAIConfig,
  getReportAnalysisAIConfig,
} from "./config";
import { GeminiAIProvider } from "./gemini-provider";
import { GroqAIProvider } from "./groq-provider";
import { mockAIProvider } from "./mock-provider";
import type {
  ActivityRecordDraftProvider,
  ReportAnalysisProvider,
  ReportDocumentAnalysisProvider,
  ReportMaterialsAnalysisProvider,
  OneTopicDraftProvider,
  CurriculumCreativeDraftProvider,
} from "./provider";

let reportAnalysisProvider: ReportAnalysisProvider | undefined;
let activityRecordDraftProvider: ActivityRecordDraftProvider | undefined;
let reportDocumentAnalysisProvider: ReportDocumentAnalysisProvider | undefined;
let reportMaterialsAnalysisProvider: ReportMaterialsAnalysisProvider | undefined;

export function getReportAnalysisProvider(): ReportAnalysisProvider {
  if (reportAnalysisProvider) {
    return reportAnalysisProvider;
  }

  const config = getReportAnalysisAIConfig();
  reportAnalysisProvider =
    config.provider === "gemini" ? new GeminiAIProvider(config) : mockAIProvider;

  return reportAnalysisProvider;
}

export function getActivityRecordDraftProvider(): ActivityRecordDraftProvider {
  if (activityRecordDraftProvider) {
    return activityRecordDraftProvider;
  }

  const config = getActivityRecordDraftAIConfig();

  if (config.provider === "groq") {
    activityRecordDraftProvider = new GroqAIProvider(config);
  } else if (config.provider === "gemini") {
    activityRecordDraftProvider = new GeminiAIProvider(config);
  } else {
    activityRecordDraftProvider = mockAIProvider;
  }

  return activityRecordDraftProvider;
}

export function getOneTopicAnalysisProvider(): ReportAnalysisProvider {
  return new GroqAIProvider(getGroqAIConfig());
}

export function getOneTopicDraftProvider(): OneTopicDraftProvider {
  return new GroqAIProvider(getGroqAIConfig());
}

export function getCurriculumCreativeDraftProvider(): CurriculumCreativeDraftProvider {
  return new GroqAIProvider(getGroqAIConfig());
}

export function getReportDocumentAnalysisProvider(): ReportDocumentAnalysisProvider {
  if (reportDocumentAnalysisProvider) {
    return reportDocumentAnalysisProvider;
  }

  const config = getReportAnalysisAIConfig();
  if (config.provider !== "gemini") {
    throw new AIConfigurationError(
      "PDF 보고서 분석에는 Gemini Provider 설정이 필요합니다.",
    );
  }

  reportDocumentAnalysisProvider = new GeminiAIProvider(config);
  return reportDocumentAnalysisProvider;
}

export function getReportMaterialsAnalysisProvider(): ReportMaterialsAnalysisProvider {
  if (reportMaterialsAnalysisProvider) {
    return reportMaterialsAnalysisProvider;
  }

  const config = getReportAnalysisAIConfig();
  if (config.provider !== "gemini") {
    throw new AIConfigurationError(
      "여러 자료를 함께 분석하려면 Gemini Provider 설정이 필요합니다.",
    );
  }

  reportMaterialsAnalysisProvider = new GeminiAIProvider(config);
  return reportMaterialsAnalysisProvider;
}
