import type {
  AnalyzeReportRequest,
  AnalyzeReportResponse,
  GenerateActivityRecordRequest,
  GenerateActivityRecordResponse,
} from "../../types";
import { getAiActivityContext } from "./context";
import type { AIProvider } from "./provider";

const COMMON_ACTION_TERMS = ["했다", "하였다", "함", "수집", "발표", "기록", "검토"];

function reportSentences(reportText: string): string[] {
  return (reportText.match(/[^.!?。\r\n]+[.!?。]?/gu) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export class MockAIProvider implements AIProvider {
  async analyzeReport(input: AnalyzeReportRequest): Promise<AnalyzeReportResponse> {
    const context = getAiActivityContext(input.activityCode);
    const sentences = reportSentences(input.reportText);
    const actionTerms = [...COMMON_ACTION_TERMS, ...context.actionTerms];
    const studentActions = sentences
      .filter((sentence) => actionTerms.some((term) => sentence.includes(term)))
      .slice(0, 5)
      .map((sentence) => ({ action: sentence, evidence: sentence }));

    return {
      topic: sentences[0] ?? input.reportText.trim(),
      studentActions,
      knowledge: [],
      skills: [],
      notablePoints: [],
    };
  }

  async generateActivityRecord(
    input: GenerateActivityRecordRequest,
  ): Promise<GenerateActivityRecordResponse> {
    getAiActivityContext(input.activityCode);
    const usedEvidence = [
      ...new Set(input.analysis.studentActions.map((item) => item.evidence.trim())),
    ].filter(Boolean);

    return {
      draft: usedEvidence.join(" "),
      usedEvidence,
    };
  }
}

export const mockAIProvider: AIProvider = new MockAIProvider();
