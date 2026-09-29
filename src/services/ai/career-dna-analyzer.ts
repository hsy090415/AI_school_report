import type {
  AnalyzeCareerDnaResponse,
  CareerDnaAnswer,
  CareerDnaPresentationKind,
} from "../../types";
import { CAREER_DNA_QUESTIONS } from "../../lib/career-dna-form";
import { extractPptxText } from "../../lib/files/pptx-text";
import {
  getReportAnalysisProvider,
  getReportMaterialsAnalysisProvider,
} from "../../lib/ai/provider-factory";
import {
  createCareerDnaCacheKey,
  readCareerDnaTestCache,
  writeCareerDnaTestCache,
} from "../../lib/ai/career-dna-test-cache";

export const CAREER_DNA_ACTIVITY_ID = "career-dna";
export const CAREER_DNA_ACTIVITY_TITLE = "DNA";
export const PPTX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation" as const;

type PresentationMimeType = "application/pdf" | typeof PPTX_MIME_TYPE;

export interface CareerDnaPresentationInput {
  kind: CareerDnaPresentationKind;
  fileName: string;
  mimeType: PresentationMimeType;
  bytes: Uint8Array;
}

export interface AnalyzeCareerDnaInput {
  studentId: string;
  answers: CareerDnaAnswer[];
  presentations: CareerDnaPresentationInput[];
}

const PRESENTATION_LABELS: Record<CareerDnaPresentationKind, string> = {
  READING: "활동 A: 독서 기반 심화 탐구 발표자료(3~9차시)",
  RESEARCH: "활동 B: 융합 탐구 발표자료(10~18차시)",
};

function serializeAnswers(answers: CareerDnaAnswer[]): string {
  return answers
    .map((answer) => {
      const question = CAREER_DNA_QUESTIONS.find((item) => item.session === answer.session);
      return [
        `[${answer.session}차시] ${question?.title ?? "활동 응답"}`,
        `학생 답변: ${answer.answer}`,
      ].join("\n");
    })
    .join("\n\n");
}

export async function analyzeCareerDna(
  input: AnalyzeCareerDnaInput,
): Promise<AnalyzeCareerDnaResponse> {
  const cacheKey = createCareerDnaCacheKey(input);
  const cachedResult = await readCareerDnaTestCache(cacheKey);
  if (cachedResult) return cachedResult;

  const answerText = serializeAnswers(input.answers);
  const pptxSections: string[] = [];
  const pdfDocuments = [];

  for (const presentation of input.presentations) {
    const label = PRESENTATION_LABELS[presentation.kind];
    if (presentation.mimeType === PPTX_MIME_TYPE) {
      pptxSections.push(
        `[${label}: ${presentation.fileName}]\n${extractPptxText(presentation.bytes)}`,
      );
    } else {
      pdfDocuments.push({
        label,
        fileName: presentation.fileName,
        mimeType: presentation.mimeType,
        dataBase64: Buffer.from(presentation.bytes).toString("base64"),
      });
    }
  }

  const combinedText = [answerText, ...pptxSections].filter(Boolean).join("\n\n");
  const result =
    pdfDocuments.length > 0
      ? await getReportMaterialsAnalysisProvider().analyzeReportMaterials({
          activityCode: "CAREER_DNA",
          activityTitle: CAREER_DNA_ACTIVITY_TITLE,
          reportText: combinedText,
          documents: pdfDocuments,
        })
      : {
          extractedText: combinedText,
          analysis: await getReportAnalysisProvider().analyzeReport({
            studentId: input.studentId,
            activityId: CAREER_DNA_ACTIVITY_ID,
            activityCode: "CAREER_DNA",
            activityTitle: CAREER_DNA_ACTIVITY_TITLE,
            reportText: combinedText,
          }),
        };

  const response: AnalyzeCareerDnaResponse = {
    answeredSessions: input.answers.map((answer) => answer.session),
    presentations: input.presentations.map(({ kind, fileName, mimeType }) => ({
      kind,
      fileName,
      mimeType,
    })),
    ...result,
    cacheHit: false,
  };

  await writeCareerDnaTestCache(cacheKey, response);
  return response;
}
