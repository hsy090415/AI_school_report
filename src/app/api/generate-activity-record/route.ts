import { aiErrorResponse, readJson } from "../../../lib/ai/http";
import { parseGenerateActivityRecordRequest } from "../../../lib/ai/validation";
import { writeActivityRecordDraft } from "../../../services/ai/activity-record-draft-writer";

export async function POST(request: Request): Promise<Response> {
  try {
    const input = parseGenerateActivityRecordRequest(await readJson(request));
    return Response.json(await writeActivityRecordDraft(input));
  } catch (error: unknown) {
    return aiErrorResponse(error);
  }
}
