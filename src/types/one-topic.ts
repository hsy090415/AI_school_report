import type { ReportAnalysis } from "./domain";
import type { GenerateActivityRecordResponse } from "./api";

export interface OneTopicReport {
  area: string;
  topic: string;
  references: string;
  content: string;
  reflection: string;
}

export interface AnalyzeOneTopicResponse {
  analysis: ReportAnalysis;
  extractedText: string;
  cacheHit: boolean;
}

export interface GenerateOneTopicRecordRequest {
  report: OneTopicReport;
  maxLength?: number;
}

export interface GenerateOneTopicRecordResponse extends GenerateActivityRecordResponse {
  analysis: ReportAnalysis;
  reportText: string;
}
