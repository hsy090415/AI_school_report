import {
  SUPPORTED_REPORT_FILE_MIME_TYPES,
  type SupportedReportFileMimeType,
} from "../../../types";
import { AiRequestError } from "../../../lib/ai/errors";
import { aiErrorResponse } from "../../../lib/ai/http";
import { parseAnalyzeReportFileRequestFields } from "../../../lib/ai/validation";
import { analyzeReportFile } from "../../../services/ai/report-file-analyzer";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function isSupportedMimeType(value: string): value is SupportedReportFileMimeType {
  return SUPPORTED_REPORT_FILE_MIME_TYPES.some((mimeType) => mimeType === value);
}

function inferMimeType(file: File): SupportedReportFileMimeType | null {
  if (isSupportedMimeType(file.type)) {
    return file.type;
  }

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".pdf")) return "application/pdf";
  if (lowerName.endsWith(".txt")) return "text/plain";
  return null;
}

function formValue(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

export async function POST(request: Request): Promise<Response> {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new AiRequestError("INVALID_REQUEST", "파일 업로드 요청을 읽을 수 없습니다.");
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new AiRequestError("INVALID_REQUEST", "분석할 파일을 선택해 주세요.");
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new AiRequestError("INVALID_REQUEST", "파일은 10MB 이하만 업로드할 수 있습니다.");
    }

    const mimeType = inferMimeType(file);
    if (!mimeType) {
      throw new AiRequestError("INVALID_REQUEST", "현재 PDF와 TXT 파일만 지원합니다.");
    }

    const fields = parseAnalyzeReportFileRequestFields({
      studentId: formValue(formData, "studentId"),
      activityId: formValue(formData, "activityId"),
      activityCode: formValue(formData, "activityCode"),
      activityTitle: formValue(formData, "activityTitle"),
    });

    const result = await analyzeReportFile({
      ...fields,
      fileName: file.name.slice(0, 255),
      mimeType,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });

    return Response.json(result);
  } catch (error: unknown) {
    return aiErrorResponse(error);
  }
}
