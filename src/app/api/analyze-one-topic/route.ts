import { AiRequestError } from "../../../lib/ai/errors";
import { aiErrorResponse, readJson } from "../../../lib/ai/http";
import { analyzeOneTopic } from "../../../services/ai/one-topic-analyzer";
import type { OneTopicReport } from "../../../types/one-topic";


export async function POST(request: Request): Promise<Response> {
  try {
    const value = await readJson(request);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new AiRequestError("INVALID_REQUEST", "보고서를 확인해 주세요.");
    const fields = value as Record<string, unknown>;
    const report: OneTopicReport = { area: "", topic: "", references: "", content: "", reflection: "" };
    for (const key of Object.keys(report) as (keyof OneTopicReport)[]) {
      const text = fields[key];
      if (typeof text !== "string" || text.length > 10000) throw new AiRequestError("INVALID_REQUEST", "보고서 각 항목은 10,000자 이하로 입력해 주세요.");
      report[key] = text.trim();
    }
    if (!report.topic || !report.content) throw new AiRequestError("INVALID_REQUEST", "발표 주제와 발표 내용을 작성해 주세요. 빈 양식은 분석할 수 없습니다.");
    if (Object.values(report).join("\n").length > 20_000) throw new AiRequestError("INVALID_REQUEST", "보고서 내용은 전체 20,000자 이하로 입력해 주세요.");
    return Response.json(await analyzeOneTopic(report));
  } catch (error: unknown) { return aiErrorResponse(error); }
}
