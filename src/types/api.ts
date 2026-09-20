import type { Activity, ActivityCode, ReportAnalysis, Student } from "./domain";

export interface AnalyzeReportRequest {
  studentId: Student["id"];
  activityId: Activity["id"];
  activityCode: ActivityCode;
  activityTitle: Activity["title"];
  reportText: string;
}

export type AnalyzeReportResponse = ReportAnalysis;

export interface GenerateActivityRecordRequest {
  studentId: Student["id"];
  activityId: Activity["id"];
  activityCode: ActivityCode;
  analysis: ReportAnalysis;
}

export interface GenerateActivityRecordResponse {
  draft: string;
  usedEvidence: string[];
}

export type AiApiErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "INSUFFICIENT_EVIDENCE"
  | "INVALID_AI_RESPONSE"
  | "AI_SERVICE_ERROR";

export interface AiApiErrorResponse {
  error: {
    code: AiApiErrorCode;
    message: string;
  };
}

export interface AiApiContract {
  "/api/analyze-report": {
    method: "POST";
    request: AnalyzeReportRequest;
    response: AnalyzeReportResponse;
    error: AiApiErrorResponse;
  };
  "/api/generate-activity-record": {
    method: "POST";
    request: GenerateActivityRecordRequest;
    response: GenerateActivityRecordResponse;
    error: AiApiErrorResponse;
  };
}
