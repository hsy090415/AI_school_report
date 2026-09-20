export const ACTIVITY_CATEGORIES = ["AUTONOMOUS", "CAREER"] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const ACTIVITY_CODES = [
  "AUTONOMOUS_ONE_TOPIC",
  "AUTONOMOUS_ICAN_WECAN",
  "CAREER_DNA",
  "CAREER_CURRICULUM_CREATIVE",
] as const;
export type ActivityCode = (typeof ACTIVITY_CODES)[number];

export interface Teacher {
  id: string;
  name: string;
  email: string;
  role: "TEACHER";
}

export interface Student {
  id: string;
  name: string;
  grade: number;
  classNo: number;
  studentNo: number;
}

export interface Activity {
  id: string;
  code: ActivityCode;
  category: ActivityCategory;
  title: string;
  description: string;
  teacherId: string;
}

export interface StudentReport {
  id: string;
  studentId: Student["id"];
  activityId: Activity["id"];
  reportText: string;
  reportFileUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceAction {
  action: string;
  evidence: string;
}

export interface EvidenceSkill {
  name: string;
  evidence: string;
}

export interface ReportAnalysis {
  topic: string;
  studentActions: EvidenceAction[];
  knowledge: string[];
  skills: EvidenceSkill[];
  notablePoints: string[];
}

export interface ActivityRecord {
  id: string;
  studentId: Student["id"];
  activityId: Activity["id"];
  teacherId: Teacher["id"];
  analysis: ReportAnalysis;
  aiDraft: string;
  finalText: string | null;
  createdAt: string;
  updatedAt: string;
}
