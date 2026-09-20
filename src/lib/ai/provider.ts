import type {
  AnalyzeReportRequest,
  AnalyzeReportResponse,
  GenerateActivityRecordRequest,
  GenerateActivityRecordResponse,
} from "../../types";

export interface AIProvider {
  analyzeReport(input: AnalyzeReportRequest): Promise<AnalyzeReportResponse>;
  generateActivityRecord(
    input: GenerateActivityRecordRequest,
  ): Promise<GenerateActivityRecordResponse>;
}
