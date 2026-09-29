import type { CareerDnaAnswer, CareerDnaPresentationKind } from "../../../types";
import { AiRequestError } from "../../../lib/ai/errors";
import { aiErrorResponse } from "../../../lib/ai/http";
import { CAREER_DNA_QUESTIONS } from "../../../lib/career-dna-form";
import {
  analyzeCareerDna,
  PPTX_MIME_TYPE,
  type CareerDnaPresentationInput,
} from "../../../services/ai/career-dna-analyzer";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_ANSWER_LENGTH = 5_000;
const REQUIRED_SESSIONS = CAREER_DNA_QUESTIONS.map((question) => question.session);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAnswers(value: FormDataEntryValue | null): CareerDnaAnswer[] {
  if (typeof value !== "string") {
    throw new AiRequestError("INVALID_REQUEST", "차시별 답변을 확인해 주세요.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new AiRequestError("INVALID_REQUEST", "차시별 답변 형식이 올바르지 않습니다.");
  }

  if (!Array.isArray(parsed)) {
    throw new AiRequestError("INVALID_REQUEST", "차시별 답변 형식이 올바르지 않습니다.");
  }

  const answers = parsed.map((item): CareerDnaAnswer => {
    if (
      !isObject(item) ||
      typeof item.session !== "number" ||
      !Number.isInteger(item.session) ||
      typeof item.answer !== "string" ||
      item.answer.trim().length === 0 ||
      item.answer.length > MAX_ANSWER_LENGTH
    ) {
      throw new AiRequestError("INVALID_REQUEST", "각 차시의 답변을 5,000자 이하로 작성해 주세요.");
    }
    return { session: item.session, answer: item.answer.trim() };
  });

  const sessions = new Set(answers.map((answer) => answer.session));
  if (
    answers.length !== REQUIRED_SESSIONS.length ||
    REQUIRED_SESSIONS.some((session) => !sessions.has(session))
  ) {
    throw new AiRequestError("INVALID_REQUEST", "DNA 필수 차시 답변을 모두 작성해 주세요.");
  }

  return answers.sort((left, right) => left.session - right.session);
}

function presentation(
  formData: FormData,
  fieldName: string,
  kind: CareerDnaPresentationKind,
): CareerDnaPresentationInput {
  const file = formData.get(fieldName);
  if (!(file instanceof File) || file.size === 0) {
    throw new AiRequestError("INVALID_REQUEST", `${kind === "READING" ? "독서" : "융합"} 탐구 발표자료를 첨부해 주세요.`);
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new AiRequestError("INVALID_REQUEST", "발표자료는 파일당 20MB 이하만 업로드할 수 있습니다.");
  }

  const lowerName = file.name.toLowerCase();
  const mimeType = lowerName.endsWith(".pdf")
    ? "application/pdf"
    : lowerName.endsWith(".pptx")
      ? PPTX_MIME_TYPE
      : null;
  if (!mimeType) {
    throw new AiRequestError("INVALID_REQUEST", "발표자료는 PDF 또는 PPTX 형식만 지원합니다.");
  }

  return {
    kind,
    fileName: file.name.slice(0, 255),
    mimeType,
    bytes: new Uint8Array(),
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new AiRequestError("INVALID_REQUEST", "DNA 자료 업로드 요청을 읽을 수 없습니다.");
    }
    const studentId = formData.get("studentId");
    if (typeof studentId !== "string" || studentId.trim().length === 0) {
      throw new AiRequestError("INVALID_REQUEST", "학생 식별 정보가 필요합니다.");
    }

    const answers = parseAnswers(formData.get("answers"));
    const reading = presentation(formData, "readingPresentation", "READING");
    const research = presentation(formData, "researchPresentation", "RESEARCH");
    const readingFile = formData.get("readingPresentation") as File;
    const researchFile = formData.get("researchPresentation") as File;

    const result = await analyzeCareerDna({
      studentId: studentId.trim(),
      answers,
      presentations: [
        { ...reading, bytes: new Uint8Array(await readingFile.arrayBuffer()) },
        { ...research, bytes: new Uint8Array(await researchFile.arrayBuffer()) },
      ],
    });

    return Response.json(result, {
      headers: { "X-AI-Cache": result.cacheHit ? "HIT" : "MISS" },
    });
  } catch (error: unknown) {
    return aiErrorResponse(error);
  }
}
