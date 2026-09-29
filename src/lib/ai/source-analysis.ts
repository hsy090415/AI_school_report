import type { ReportAnalysis } from "../../types";
import type { OneTopicReport } from "../../types/one-topic";

function excerpt(value: string, limit = 500): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, limit);
}

export function oneTopicReportText(report: OneTopicReport): string {
  return [
    `[발표 영역] ${report.area}`,
    `[발표 주제] ${report.topic}`,
    `[참고 자료] ${report.references}`,
    `[발표 내용] ${report.content}`,
    `[소감] ${report.reflection}`,
  ].join("\n");
}

export function oneTopicSourceAnalysis(report: OneTopicReport): ReportAnalysis {
  return {
    topic: report.topic,
    studentActions: [{ action: "융합활동 보고서에 발표 내용을 정리함", evidence: excerpt(report.content) }],
    knowledge: [report.area, report.references].filter(Boolean),
    skills: [],
    notablePoints: report.reflection ? [excerpt(report.reflection)] : [],
  };
}

export function curriculumSourceAnalysis(source: string): ReportAnalysis {
  return {
    topic: excerpt(source, 120),
    studentActions: [{ action: "진로 관련 활동과 계획을 기술함", evidence: excerpt(source) }],
    knowledge: [],
    skills: [],
    notablePoints: [],
  };
}
