import { aiErrorResponse, readJson } from "../../../lib/ai/http";
import { parseAnalyzeReportRequest } from "../../../lib/ai/validation";
import { analyzeReport } from "../../../services/ai/report-analyzer";

export async function POST(request: Request): Promise<Response> {
  try {
    const input = parseAnalyzeReportRequest(await readJson(request));
    return Response.json(await analyzeReport(input));
  } catch (error: unknown) {
    return aiErrorResponse(error);
  }
}
