import {
  ACTIVITY_CODES,
  type AnalyzeReportFileRequestFields,
  type AnalyzeReportRequest,
  type GenerateActivityRecordRequest,
  type ReportAnalysis,
  type ActivityRecordDraftContent,
  DEFAULT_ACTIVITY_RECORD_MAX_LENGTH,
  MAX_ACTIVITY_RECORD_MAX_LENGTH,
  MIN_ACTIVITY_RECORD_MAX_LENGTH,
} from "../../types";
import type { AnalyzeReportDocumentResult } from "./provider";
import { getActivityDefinition } from "../activities";
import { AiRequestError } from "./errors";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isActivityCode(value: unknown): value is AnalyzeReportRequest["activityCode"] {
  return typeof value === "string" && ACTIVITY_CODES.some((code) => code === value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

export function isReportAnalysis(value: unknown): value is ReportAnalysis {
  return (
    isObject(value) &&
    isNonEmptyString(value.topic) &&
    Array.isArray(value.studentActions) &&
    value.studentActions.every(
      (item: unknown) =>
        isObject(item) && isNonEmptyString(item.action) && isNonEmptyString(item.evidence),
    ) &&
    isStringList(value.knowledge) &&
    Array.isArray(value.skills) &&
    value.skills.every(
      (item: unknown) =>
        isObject(item) && isNonEmptyString(item.name) && isNonEmptyString(item.evidence),
    ) &&
    isStringList(value.notablePoints)
  );
}

export function isActivityRecordDraft(value: unknown): value is ActivityRecordDraftContent {
  return isObject(value) && isNonEmptyString(value.draft) && isStringList(value.usedEvidence);
}

export function isReportDocumentAnalysis(
  value: unknown,
): value is AnalyzeReportDocumentResult {
  return (
    isObject(value) &&
    isNonEmptyString(value.extractedText) &&
    isReportAnalysis(value.analysis)
  );
}

export function parseAnalyzeReportFileRequestFields(
  value: unknown,
): AnalyzeReportFileRequestFields {
  if (
    !isObject(value) ||
    !isNonEmptyString(value.studentId) ||
    !isNonEmptyString(value.activityId) ||
    !isActivityCode(value.activityCode) ||
    !isNonEmptyString(value.activityTitle)
  ) {
    throw new AiRequestError("INVALID_REQUEST", "파일 분석 요청 정보가 올바르지 않습니다.");
  }

  if (value.activityTitle !== getActivityDefinition(value.activityCode).title) {
    throw new AiRequestError("INVALID_REQUEST", "활동 코드와 활동 이름이 일치하지 않습니다.");
  }

  return value as unknown as AnalyzeReportFileRequestFields;
}

export function parseAnalyzeReportRequest(value: unknown): AnalyzeReportRequest {
  if (
    !isObject(value) ||
    !isNonEmptyString(value.studentId) ||
    !isNonEmptyString(value.activityId) ||
    !isActivityCode(value.activityCode) ||
    !isNonEmptyString(value.activityTitle) ||
    !isNonEmptyString(value.reportText)
  ) {
    throw new AiRequestError("INVALID_REQUEST", "필수 입력값 또는 활동 코드가 올바르지 않습니다.");
  }

  if (value.activityTitle !== getActivityDefinition(value.activityCode).title) {
    throw new AiRequestError("INVALID_REQUEST", "활동 코드와 활동 이름이 일치하지 않습니다.");
  }

  if (value.reportText.length > 20_000) {
    throw new AiRequestError("INVALID_REQUEST", "보고서는 20,000자 이하로 입력해 주세요.");
  }

  return value as unknown as AnalyzeReportRequest;
}

export function parseGenerateActivityRecordRequest(value: unknown): GenerateActivityRecordRequest {
  if (
    !isObject(value) ||
    !isNonEmptyString(value.studentId) ||
    !isNonEmptyString(value.activityId) ||
    !isActivityCode(value.activityCode) ||
    !isReportAnalysis(value.analysis)
  ) {
    throw new AiRequestError("INVALID_REQUEST", "필수 입력값 또는 분석 결과가 올바르지 않습니다.");
  }

  const maxLength = value.maxLength ?? DEFAULT_ACTIVITY_RECORD_MAX_LENGTH;
  if (
    typeof maxLength !== "number" ||
    !Number.isInteger(maxLength) ||
    maxLength < MIN_ACTIVITY_RECORD_MAX_LENGTH ||
    maxLength > MAX_ACTIVITY_RECORD_MAX_LENGTH
  ) {
    throw new AiRequestError(
      "INVALID_REQUEST",
      `초안 글자 수는 ${MIN_ACTIVITY_RECORD_MAX_LENGTH}자부터 ${MAX_ACTIVITY_RECORD_MAX_LENGTH}자까지 설정할 수 있습니다.`,
    );
  }

  return {
    studentId: value.studentId,
    activityId: value.activityId,
    activityCode: value.activityCode,
    analysis: value.analysis,
    maxLength,
  };
}
