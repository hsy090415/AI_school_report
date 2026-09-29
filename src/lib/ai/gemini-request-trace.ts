import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { channel } from "node:diagnostics_channel";
import { randomUUID } from "node:crypto";

// Log only transport metadata. Never log headers, URLs with credentials or content.
const context = new AsyncLocalStorage<object>();

export function createGeminiRequestTrace(model: string, bytes: number) {
  const identity = {};
  const id = randomUUID().slice(0, 8);
  const started = Date.now();
  const requests = new WeakSet<object>();
  let phase = "fetch_started";
  function mark(stage: string, status?: number) {
    phase = stage;
    console.info("[gemini-request]", JSON.stringify({ id, stage, elapsedMs: Date.now() - started, model, requestBytes: bytes, ...(status === undefined ? {} : { status }) }));
  }
  function requestObject(message: unknown): object | undefined {
    if (!message || typeof message !== "object" || !("request" in message)) return;
    const request = message.request;
    return request && typeof request === "object" ? request : undefined;
  }
  const created = (message: unknown) => {
    if (context.getStore() !== identity) return;
    const request = requestObject(message);
    if (request) { requests.add(request); mark("request_created"); }
  };
  const sent = (message: unknown) => {
    const request = requestObject(message);
    if (request && requests.has(request)) mark("body_sent");
  };
  channel("undici:request:create").subscribe(created);
  channel("undici:request:bodySent").subscribe(sent);
  mark("fetch_started");
  return {
    id,
    mark,
    run: <T>(work: () => Promise<T>) => context.run(identity, work),
    timeoutMessage: () => phase === "body_sent"
      ? "요청 본문 전송은 완료됐지만 Gemini 응답을 받지 못했습니다."
      : phase === "headers_received"
        ? "Gemini 응답 헤더는 받았지만 본문 수신이 완료되지 않았습니다."
        : "요청 본문 전송 완료를 확인하지 못했습니다. 연결 또는 업로드가 지연됐을 수 있습니다.",
    close: () => {
      channel("undici:request:create").unsubscribe(created);
      channel("undici:request:bodySent").unsubscribe(sent);
    },
  };
}
