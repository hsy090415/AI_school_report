import type { AiApiErrorResponse } from "../../types";
import { AiProviderError, AiRequestError } from "./errors";

export async function readJson(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw new AiRequestError("INVALID_JSON", "요청 본문이 올바른 JSON이 아닙니다.");
  }
}

export function aiErrorResponse(error: unknown): Response {
  if (error instanceof AiRequestError) {
    const body: AiApiErrorResponse = { error: { code: error.code, message: error.message } };
    return Response.json(body, { status: error.status });
  }
  if (error instanceof AiProviderError) {
    const body: AiApiErrorResponse = {
      error: { code: "INVALID_AI_RESPONSE", message: error.message },
    };
    return Response.json(body, { status: 502 });
  }
  const body: AiApiErrorResponse = {
    error: { code: "AI_SERVICE_ERROR", message: "AI 서비스 처리 중 오류가 발생했습니다." },
  };
  return Response.json(body, { status: 500 });
}
