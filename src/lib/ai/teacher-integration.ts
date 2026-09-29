import type { Activity, ActivityCode, ReportAnalysis } from "../../types";
import { isReportAnalysis } from "./validation";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredString(value: unknown, label: string, maxLength = 20_000): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new IntegrationRequestError(`${label} 값이 올바르지 않습니다.`);
  }
  return value.trim();
}

export class IntegrationRequestError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "IntegrationRequestError";
  }
}

export function parseAnalysis(value: unknown): ReportAnalysis {
  if (!isReportAnalysis(value)) {
    throw new IntegrationRequestError("분석 결과가 ReportAnalysis 형식과 일치하지 않습니다.");
  }
  return value;
}

export function assertActivityCode(activity: Activity, code: unknown): asserts code is ActivityCode {
  if (code !== activity.code) {
    throw new IntegrationRequestError("활동 ID와 코드가 일치하지 않습니다.");
  }
}

export function integrationErrorResponse(error: unknown): Response {
  if (error instanceof IntegrationRequestError) {
    return Response.json({ error: { message: error.message } }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
  if (message.includes("로그인이 필요합니다") || message.includes("Auth session missing")) {
    return Response.json({ error: { message: "교사 로그인이 필요합니다." } }, { status: 401 });
  }
  if (message.includes("환경변수가 필요합니다")) {
    return Response.json({ error: { message: "Supabase 연결 설정이 필요합니다." } }, { status: 503 });
  }
  console.error("Teacher integration failed", error);
  return Response.json({ error: { message: "DB 요청을 처리하지 못했습니다." } }, { status: 500 });
}
