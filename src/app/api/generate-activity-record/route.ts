import { aiErrorResponse, readJson } from "../../../lib/ai/http";
import { parseGenerateActivityRecordRequest } from "../../../lib/ai/validation";
import { writeActivityRecordDraft } from "../../../services/ai/activity-record-draft-writer";
import type { AiApiErrorResponse, GenerateActivityRecordStreamEvent } from "../../../types";

function streamEvent(event: GenerateActivityRecordStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const input = parseGenerateActivityRecordRequest(await readJson(request));
    const wantsProgressStream = new URL(request.url).searchParams.get("stream") === "1";
    if (wantsProgressStream) {
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            const result = await writeActivityRecordDraft(input, undefined, (progress) => {
              controller.enqueue(streamEvent({ type: "progress", progress }));
            });
            controller.enqueue(streamEvent({ type: "result", data: result }));
          } catch (error: unknown) {
            const errorResponse = aiErrorResponse(error);
            const body = (await errorResponse.json()) as AiApiErrorResponse;
            controller.enqueue(
              streamEvent({
                type: "error",
                error: body.error,
              }),
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }
    return Response.json(await writeActivityRecordDraft(input));
  } catch (error: unknown) {
    return aiErrorResponse(error);
  }
}
