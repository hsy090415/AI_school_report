import type {
  AnalyzeReportFileRequestFields,
  AnalyzeReportFileResponse,
  SupportedReportFileMimeType,
} from "../../types";
import { AiRequestError } from "../../lib/ai/errors";
import { getReportDocumentAnalysisProvider } from "../../lib/ai/provider-factory";
import { parseAnalyzeReportRequest } from "../../lib/ai/validation";
import { analyzeReport } from "./report-analyzer";

interface AnalyzeReportFileInput extends AnalyzeReportFileRequestFields {
  fileName: string;
  mimeType: SupportedReportFileMimeType;
  bytes: Uint8Array;
}

export async function analyzeReportFile(
  input: AnalyzeReportFileInput,
): Promise<AnalyzeReportFileResponse> {
  if (input.mimeType === "text/plain") {
    let extractedText: string;

    try {
      extractedText = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes).trim();
    } catch {
      throw new AiRequestError("INVALID_REQUEST", "TXT 파일은 UTF-8 형식이어야 합니다.");
    }

    const analysisInput = parseAnalyzeReportRequest({
      studentId: input.studentId,
      activityId: input.activityId,
      activityCode: input.activityCode,
      activityTitle: input.activityTitle,
      reportText: extractedText,
    });

    return {
      fileName: input.fileName,
      mimeType: input.mimeType,
      extractedText,
      analysis: await analyzeReport(analysisInput),
    };
  }

  const result = await getReportDocumentAnalysisProvider().analyzeReportDocument({
    activityCode: input.activityCode,
    activityTitle: input.activityTitle,
    fileName: input.fileName,
    mimeType: input.mimeType,
    dataBase64: Buffer.from(input.bytes).toString("base64"),
  });

  return {
    fileName: input.fileName,
    mimeType: input.mimeType,
    ...result,
  };
}
