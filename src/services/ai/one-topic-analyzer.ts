import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type { OneTopicReport, AnalyzeOneTopicResponse } from "../../types/one-topic";
import { getOneTopicAnalysisProvider } from "../../lib/ai/provider-factory";
import { AiProviderError } from "../../lib/ai/errors";
import { isReportAnalysis } from "../../lib/ai/validation";
import { preserveOneTopicReportFacts } from "../../lib/ai/one-topic-analysis";

const directory = path.join(process.cwd(), ".ai-test-cache", "one-topic");
const pending = new Map<string, Promise<AnalyzeOneTopicResponse>>();

export async function analyzeOneTopic(report: OneTopicReport): Promise<AnalyzeOneTopicResponse> {
  const labels: Record<keyof OneTopicReport, string> = {
    area: "발표 영역", topic: "발표 주제", references: "참고자료", content: "발표 내용", reflection: "소감",
  };
  const reportText = (Object.keys(labels) as (keyof OneTopicReport)[])
    .filter((field) => report[field])
    .map((field) => `[${labels[field]}]\n${report[field]}`)
    .join("\n\n");
  const key = createHash("sha256").update(JSON.stringify(["one-topic-groq-v1", report])).digest("hex");
  const cachePath = path.join(directory, `${key}.json`);
  try {
    const cached = JSON.parse(await readFile(cachePath, "utf8")) as AnalyzeOneTopicResponse;
    if (cached && isReportAnalysis(cached.analysis) && typeof cached.extractedText === "string") {
      return { ...cached, analysis: preserveOneTopicReportFacts(cached.analysis, report), cacheHit: true };
    }
  } catch { /* 캐시가 없으면 사용자가 요청한 분석을 한 번 실행한다. */ }
  const active = pending.get(key);
  if (active) return active;
  const task = (async () => {
    const analysis = await getOneTopicAnalysisProvider().analyzeReport({
      studentId: "ai-test-student", activityId: "one-topic",
      activityCode: "AUTONOMOUS_ONE_TOPIC", activityTitle: "1인 1주제 융합활동", reportText,
    });
    const evidence = [...analysis.studentActions, ...analysis.skills].map((item) => item.evidence);
    if (evidence.some((quote) => !reportText.includes(quote))) {
      throw new AiProviderError("Groq 분석 근거가 보고서 원문과 일치하지 않습니다. 원문을 확인한 뒤 다시 요청해 주세요.");
    }
    const response: AnalyzeOneTopicResponse = {
      analysis: preserveOneTopicReportFacts(analysis, report), extractedText: reportText, cacheHit: false,
    };
    try {
      await mkdir(directory, { recursive: true });
      const temporary = `${cachePath}.${process.pid}-${Date.now()}.tmp`;
      await writeFile(temporary, JSON.stringify(response), "utf8");
      await rename(temporary, cachePath);
    } catch { /* 캐시 저장 실패가 분석 결과를 막지 않게 한다. */ }
    return response;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
