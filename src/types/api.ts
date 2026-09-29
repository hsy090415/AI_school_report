import type { Activity, ActivityCode, ActivityRecord, ReportAnalysis, Student, StudentReport, Teacher } from "./domain";
import type { GenerateOneTopicRecordRequest } from "./one-topic";
import type { GenerateCurriculumCreativeRecordRequest } from "./curriculum-creative";

export interface AnalyzeReportRequest {
  studentId: Student["id"];
  activityId: Activity["id"];
  activityCode: ActivityCode;
  activityTitle: Activity["title"];
  reportText: string;
}

export type AnalyzeReportResponse = ReportAnalysis;

export const SUPPORTED_REPORT_FILE_MIME_TYPES = ["application/pdf", "text/plain"] as const;
export type SupportedReportFileMimeType =
  (typeof SUPPORTED_REPORT_FILE_MIME_TYPES)[number];

export interface AnalyzeReportFileRequestFields {
  studentId: Student["id"];
  activityId: Activity["id"];
  activityCode: ActivityCode;
  activityTitle: Activity["title"];
}

export interface AnalyzeReportFileResponse {
  fileName: string;
  mimeType: SupportedReportFileMimeType;
  extractedText: string;
  analysis: ReportAnalysis;
}

export const CAREER_DNA_PRESENTATION_KINDS = ["READING", "RESEARCH"] as const;
export type CareerDnaPresentationKind =
  (typeof CAREER_DNA_PRESENTATION_KINDS)[number];

export interface CareerDnaAnswer {
  session: number;
  answer: string;
}

export interface CareerDnaPresentationSummary {
  kind: CareerDnaPresentationKind;
  fileName: string;
  mimeType: "application/pdf" | "application/vnd.openxmlformats-officedocument.presentationml.presentation";
}

export interface AnalyzeCareerDnaResponse {
  answeredSessions: number[];
  presentations: CareerDnaPresentationSummary[];
  extractedText: string;
  analysis: ReportAnalysis;
  cacheHit: boolean;
}

export interface GenerateActivityRecordRequest {
  studentId: Student["id"];
  activityId: Activity["id"];
  activityCode: ActivityCode;
  analysis: ReportAnalysis;
  maxLength?: number;
}

export interface ActivityRecordDraftContent {
  draft: string;
  usedEvidence: string[];
}

export interface GenerateActivityRecordResponse extends ActivityRecordDraftContent {
  characterCount: number;
  maxLength: number;
}

export interface IcanWecanPaperSummary {
  sheetName: string;
  studentName: string;
  title: string;
  author: string;
  publisher: string;
  publishedAt: string;
}

export interface GenerateIcanWecanRecordResponse extends GenerateActivityRecordResponse {
  fileName: string;
  papers: IcanWecanPaperSummary[];
  reflection: string;
  analysis: ReportAnalysis;
  reportText: string;
}

export type ActivityRecordDraftProgressStage =
  | "REQUESTING_DRAFT"
  | "CHECKING_LENGTH";

export interface ActivityRecordDraftProgress {
  stage: ActivityRecordDraftProgressStage;
  attempt: number;
  maxAttempts: number;
  message: string;
  characterCount?: number;
  requestedLength: number;
  maxLength: number;
}

export type GenerateActivityRecordStreamEvent =
  | { type: "progress"; progress: ActivityRecordDraftProgress }
  | { type: "result"; data: GenerateActivityRecordResponse }
  | { type: "error"; error: AiApiErrorResponse["error"] };

export const DEFAULT_ACTIVITY_RECORD_MAX_LENGTH = 250;
export const MIN_ACTIVITY_RECORD_MAX_LENGTH = 100;
export const MAX_ACTIVITY_RECORD_MAX_LENGTH = 1_500;
export const ACTIVITY_RECORD_REQUEST_OFFSET = 70;
export const ONE_TOPIC_ACTIVITY_RECORD_REQUEST_EXTRA = 0;

export type AiApiErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "INSUFFICIENT_EVIDENCE"
  | "INVALID_AI_RESPONSE"
  | "AI_CONFIGURATION_ERROR"
  | "AI_PROVIDER_AUTH_ERROR"
  | "AI_RATE_LIMITED"
  | "AI_TIMEOUT"
  | "AI_SERVICE_ERROR";

export interface AiApiErrorResponse {
  error: {
    code: AiApiErrorCode;
    message: string;
  };
}

export interface AiApiContract {
  "/api/generate-curriculum-creative-record": {
    method: "POST";
    request: GenerateCurriculumCreativeRecordRequest;
    response: GenerateActivityRecordResponse;
    error: AiApiErrorResponse;
  };
  "/api/generate-one-topic-record": {
    method: "POST";
    request: GenerateOneTopicRecordRequest;
    response: GenerateActivityRecordResponse;
    error: AiApiErrorResponse;
  };
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
  "/api/analyze-report-file": {
    method: "POST";
    request: AnalyzeReportFileRequestFields & { file: File };
    response: AnalyzeReportFileResponse;
    error: AiApiErrorResponse;
  };
  "/api/analyze-career-dna": {
    method: "POST";
    request: {
      studentId: Student["id"];
      answers: CareerDnaAnswer[];
      readingPresentation: File;
      researchPresentation: File;
    };
    response: AnalyzeCareerDnaResponse;
    error: AiApiErrorResponse;
  };
  "/api/generate-ican-wecan-record": {
    method: "POST";
    request: {
      studentId: Student["id"];
      reportFile: File;
      reflection: string;
      maxLength?: number;
    };
    response: GenerateIcanWecanRecordResponse;
    error: AiApiErrorResponse;
  };
}

export interface TeacherBootstrapResponse {
  teacher: Teacher;
  students: Student[];
  activities: Activity[];
  records: Array<{
    studentId: Student["id"];
    activityId: Activity["id"];
    completed: boolean;
    updatedAt: string;
  }>;
}

export interface TeacherWorkspaceSnapshot {
  activity: Activity;
  report: StudentReport | null;
  record: ActivityRecord | null;
}

export interface SaveTeacherWorkspaceRequest {
  studentId: Student["id"];
  activityId: Activity["id"];
  activityCode: ActivityCode;
  reportText: string;
  analysis: ReportAnalysis;
  aiDraft: string;
}

export interface SaveTeacherFinalTextRequest {
  studentId: Student["id"];
  activityId: Activity["id"];
  finalText: string;
}
