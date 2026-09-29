import type {
  AnalyzeReportRequest,
  AnalyzeReportResponse,
  GenerateActivityRecordRequest,
  ActivityRecordDraftContent,
  ReportAnalysis,
  SupportedReportFileMimeType,
} from "../../types";
import type { OneTopicReport } from "../../types/one-topic";
import type { CurriculumCreativeAnswers } from "../../types/curriculum-creative";

export interface ActivityRecordDraftGenerationInput
  extends GenerateActivityRecordRequest {
  requestedLength?: number;
}

export interface AnalyzeReportDocumentInput {
  activityCode: AnalyzeReportRequest["activityCode"];
  activityTitle: AnalyzeReportRequest["activityTitle"];
  fileName: string;
  mimeType: SupportedReportFileMimeType;
  dataBase64: string;
}

export interface AnalyzeReportDocumentResult {
  extractedText: string;
  analysis: ReportAnalysis;
}

export interface AnalyzeReportMaterialDocument {
  label: string;
  fileName: string;
  mimeType: "application/pdf";
  dataBase64: string;
}

export interface AnalyzeReportMaterialsInput {
  activityCode: AnalyzeReportRequest["activityCode"];
  activityTitle: AnalyzeReportRequest["activityTitle"];
  reportText: string;
  documents: AnalyzeReportMaterialDocument[];
}

export interface AIProvider {
  analyzeReport(input: AnalyzeReportRequest): Promise<AnalyzeReportResponse>;
  generateActivityRecord(
    input: ActivityRecordDraftGenerationInput,
  ): Promise<ActivityRecordDraftContent>;
}

export type ReportAnalysisProvider = Pick<AIProvider, "analyzeReport">;
export type ActivityRecordDraftProvider = Pick<AIProvider, "generateActivityRecord">;

export interface OneTopicDraftProvider {
  generateOneTopicRecord(report: OneTopicReport, maxLength: number): Promise<ActivityRecordDraftContent>;
}

export interface CurriculumCreativeDraftProvider {
  generateCurriculumCreativeRecord(
    answers: CurriculumCreativeAnswers | string,
    maxLength: number,
  ): Promise<ActivityRecordDraftContent>;
}

export interface ReportDocumentAnalysisProvider {
  analyzeReportDocument(
    input: AnalyzeReportDocumentInput,
  ): Promise<AnalyzeReportDocumentResult>;
}

export interface ReportMaterialsAnalysisProvider {
  analyzeReportMaterials(
    input: AnalyzeReportMaterialsInput,
  ): Promise<AnalyzeReportDocumentResult>;
}
