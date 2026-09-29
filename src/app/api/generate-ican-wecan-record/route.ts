import {
  DEFAULT_ACTIVITY_RECORD_MAX_LENGTH,
  MAX_ACTIVITY_RECORD_MAX_LENGTH,
  MIN_ACTIVITY_RECORD_MAX_LENGTH,
} from "../../../types";
import { AiRequestError } from "../../../lib/ai/errors";
import { aiErrorResponse } from "../../../lib/ai/http";
import { extractIcanWecanWorkbook } from "../../../lib/files/ican-wecan-xlsx";
import { generateIcanWecanRecord } from "../../../services/ai/ican-wecan-draft-writer";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_REFLECTION_LENGTH = 5_000;

function parseMaxLength(value: FormDataEntryValue | null): number {
  if (value === null || value === "") return DEFAULT_ACTIVITY_RECORD_MAX_LENGTH;
  if (typeof value !== "string") {
    throw new AiRequestError("INVALID_REQUEST", "글자 수 설정이 올바르지 않습니다.");
  }
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_ACTIVITY_RECORD_MAX_LENGTH ||
    parsed > MAX_ACTIVITY_RECORD_MAX_LENGTH
  ) {
    throw new AiRequestError(
      "INVALID_REQUEST",
      `초안 글자 수는 ${MIN_ACTIVITY_RECORD_MAX_LENGTH}자부터 ${MAX_ACTIVITY_RECORD_MAX_LENGTH}자까지 설정할 수 있습니다.`,
    );
  }
  return parsed;
}

export async function POST(request: Request): Promise<Response> {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new AiRequestError("INVALID_REQUEST", "엑셀 업로드 요청을 읽을 수 없습니다.");
    }

    const studentId = formData.get("studentId");
    const reflection = formData.get("reflection");
    const reportFile = formData.get("reportFile");
    if (typeof studentId !== "string" || !studentId.trim()) {
      throw new AiRequestError("INVALID_REQUEST", "학생 식별 정보가 필요합니다.");
    }
    if (
      typeof reflection !== "string" ||
      !reflection.trim() ||
      reflection.length > MAX_REFLECTION_LENGTH
    ) {
      throw new AiRequestError(
        "INVALID_REQUEST",
        "느낀점을 1자 이상 5,000자 이하로 입력해 주세요.",
      );
    }
    if (!(reportFile instanceof File) || reportFile.size === 0) {
      throw new AiRequestError("INVALID_REQUEST", "I CAN WE CAN 엑셀 보고서를 첨부해 주세요.");
    }
    if (!reportFile.name.toLowerCase().endsWith(".xlsx")) {
      throw new AiRequestError("INVALID_REQUEST", "보고서는 XLSX 형식만 지원합니다.");
    }
    if (reportFile.size > MAX_FILE_SIZE_BYTES) {
      throw new AiRequestError("INVALID_REQUEST", "엑셀 보고서는 10MB 이하만 업로드할 수 있습니다.");
    }

    const bytes = new Uint8Array(await reportFile.arrayBuffer());
    const papers = extractIcanWecanWorkbook(bytes);
    const result = await generateIcanWecanRecord({
      studentId: studentId.trim(),
      fileName: reportFile.name.slice(0, 255),
      reflection: reflection.trim(),
      maxLength: parseMaxLength(formData.get("maxLength")),
      papers,
    });
    return Response.json(result);
  } catch (error: unknown) {
    return aiErrorResponse(error);
  }
}
