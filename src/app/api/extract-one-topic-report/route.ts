import { extractOneTopicHwp } from "../../../lib/files/one-topic-hwp";
import { extractOneTopicReport } from "../../../lib/files/one-topic-docx";
import { AiRequestError } from "../../../lib/ai/errors";
import { aiErrorResponse } from "../../../lib/ai/http";

export async function POST(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    const file = form.get("reportFile");
    if (!(file instanceof File) || !(/\.(docx|hwp)$/iu.test(file.name)) || !file.size || file.size > 10 * 1024 * 1024) {
      throw new AiRequestError("INVALID_REQUEST", "10MB 이하의 DOCX 또는 HWP 보고서를 선택해 주세요.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    return Response.json(file.name.toLowerCase().endsWith(".hwp") ? extractOneTopicHwp(bytes) : extractOneTopicReport(bytes));
  } catch (error: unknown) { return aiErrorResponse(error); }
}
