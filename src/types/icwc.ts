export const ICWC_DRAFT_DIRECTIONS = [
  "탐구내용 중심",
  "공동체역량 중심",
] as const;

export type IcwcDraftDirection = (typeof ICWC_DRAFT_DIRECTIONS)[number];

export interface IcwcFileMetadata {
  path: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface IcwcTeam {
  id: string;
  teacherId: string;
  activityId: string;
  teamName: string;
  reportText: string;
  reportFile: IcwcFileMetadata | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IcwcTeamMember {
  teamId: string;
  teacherId: string;
  activityId: string;
  studentId: string;
  createdAt: string;
}

export interface IcwcStudentSubmission {
  id: string;
  teamId: string;
  teacherId: string;
  activityId: string;
  studentId: string;
  reflectionText: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IcwcStudentReview {
  id: string;
  submissionId: string;
  teamId: string;
  teacherId: string;
  activityId: string;
  studentId: string;
  teacherComment: string;
  draftFocus: IcwcDraftDirection | null;
  createdAt: string;
  updatedAt: string;
}

export interface IcwcDraftHistoryEntry {
  id: string;
  reviewId: string;
  teacherId: string;
  generationDirection: IcwcDraftDirection;
  draftText: string;
  createdAt: string;
}

export interface IcwcDraftReview {
  draft: string;
  characterCount: number;
  byteCount: number;
  maxLength: number;
  englishTerms: string[];
  specialCharacters: string[];
  nonNominalSentences: number[];
  warnings: string[];
}

export interface IcwcDraftGenerationResponse extends IcwcDraftReview {
  history: IcwcDraftHistoryEntry;
}

export interface IcwcFinalRecord {
  id: string;
  reviewId: string;
  teacherId: string;
  studentId: string;
  activityId: string;
  finalText: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinkedStudentAccount {
  id: string;
  teacherId: string;
  authUserId: string;
  name: string;
  grade: number;
  classNo: number;
  studentNo: number;
}
