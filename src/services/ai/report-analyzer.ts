import type { AnalyzeReportRequest, AnalyzeReportResponse } from "../../types";
import { AiProviderError } from "../../lib/ai/errors";
import type { ReportAnalysisProvider } from "../../lib/ai/provider";
import { getReportAnalysisProvider } from "../../lib/ai/provider-factory";
import { isReportAnalysis } from "../../lib/ai/validation";

export async function analyzeReport(
  input: AnalyzeReportRequest,
  provider: ReportAnalysisProvider = getReportAnalysisProvider(),
): Promise<AnalyzeReportResponse> {
  const analysis: unknown = await provider.analyzeReport(input);
  if (!isReportAnalysis(analysis)) {
    throw new AiProviderError("AI 분석 응답 형식이 올바르지 않습니다.");
  }
  return analysis;
}
