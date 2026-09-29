import type {
  GenerateIcanWecanRecordResponse,
  ReportAnalysis,
} from "../../types";
import type { IcanWecanPaper } from "../../lib/files/ican-wecan-xlsx";
import { writeActivityRecordDraft } from "./activity-record-draft-writer";

export interface GenerateIcanWecanRecordInput {
  studentId: string;
  fileName: string;
  reflection: string;
  maxLength: number;
  papers: IcanWecanPaper[];
}

function paperKnowledge(paper: IcanWecanPaper): string {
  return [
    `논문: ${paper.title}${paper.author ? ` (${paper.author})` : ""}`,
    paper.publisher ? `발행처: ${paper.publisher}` : "",
    paper.publishedAt ? `발행 연도: ${paper.publishedAt}` : "",
    `목적: ${paper.purpose}`,
    `검증 방법: ${paper.method}`,
    `연구 결과: ${paper.result}`,
    `결론: ${paper.conclusion}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildIcanWecanAnalysis(papers: IcanWecanPaper[], reflection: string): ReportAnalysis {
  return {
    topic: papers.map((paper) => paper.title).join(" / "),
    studentActions: [
      ...papers.flatMap((paper) => [
        {
          action: `전문학술자료 '${paper.title}'의 연구 목적과 검증 방법을 분석함`,
          evidence: paper.method || paper.purpose || paper.result || paper.conclusion,
        },
        {
          action: "연구 결과와 결론을 바탕으로 핵심 원리와 적용 가능성을 고찰함",
          evidence: paper.result || paper.conclusion || paper.method || paper.purpose,
        },
      ]),
      {
        action: "탐구 과정에서 겪은 어려움과 이를 해결한 학습 과정을 성찰함",
        evidence: reflection,
      },
    ],
    knowledge: papers.map(paperKnowledge),
    skills: [
      ...papers.map((paper) => ({
        name: "전문학술자료 분석 능력",
        evidence: paper.method || paper.purpose || paper.result || paper.conclusion,
      })),
      {
        name: "자기주도적 탐구 및 융합적 사고",
        evidence: reflection,
      },
    ],
    notablePoints: [reflection],
  };
}

export async function generateIcanWecanRecord(
  input: GenerateIcanWecanRecordInput,
): Promise<GenerateIcanWecanRecordResponse> {
  const result = await writeActivityRecordDraft({
    studentId: input.studentId,
    activityId: "autonomous-ican-wecan",
    activityCode: "AUTONOMOUS_ICAN_WECAN",
    analysis: buildIcanWecanAnalysis(input.papers, input.reflection),
    maxLength: input.maxLength,
  });

  return {
    ...result,
    fileName: input.fileName,
    papers: input.papers.map(
      ({ sheetName, studentName, title, author, publisher, publishedAt }) => ({
        sheetName,
        studentName,
        title,
        author,
        publisher,
        publishedAt,
      }),
    ),
    reflection: input.reflection,
    analysis: buildIcanWecanAnalysis(input.papers, input.reflection),
    reportText: [
      ...input.papers.map(paperKnowledge),
      `학생 느낀점: ${input.reflection}`,
    ].join("\n\n"),
  };
}
