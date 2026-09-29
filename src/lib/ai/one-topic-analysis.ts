import type { ReportAnalysis } from "../../types";
import type { OneTopicReport } from "../../types/one-topic";

function sourceExcerpt(value: string, maxLength: number): string {
  const text = value.trim().replace(/\s+/gu, " ");
  if (text.length <= maxLength) return text;
  const tailLength = Math.min(400, Math.floor(maxLength / 3));
  return `${text.slice(0, maxLength - tailLength - 3)} … ${text.slice(-tailLength)}`;
}

export function preserveOneTopicReportFacts(
  analysis: ReportAnalysis,
  report: OneTopicReport,
): ReportAnalysis {
  const facts = [
    report.area.trim() && `[발표 영역] ${report.area.trim()}`,
    report.topic.trim() && `[발표 주제] ${report.topic.trim()}`,
    report.content.trim() && `[발표 내용 원문] ${sourceExcerpt(report.content, 2_000)}`,
    report.reflection.trim() && `[소감 원문] ${sourceExcerpt(report.reflection, 1_000)}`,
  ].filter((value): value is string => Boolean(value));
  const otherKnowledge = analysis.knowledge.filter(
    (value) => !/^\[(?:발표 영역|발표 주제|발표 내용 원문|소감 원문)\]/u.test(value),
  );

  return {
    ...analysis,
    topic: report.topic.trim(),
    knowledge: [...facts, ...otherKnowledge].slice(0, 6),
  };
}
