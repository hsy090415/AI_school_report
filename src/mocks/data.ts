import { ACTIVITIES } from "../lib/activities";
import type {
  Activity,
  ActivityRecord,
  AnalyzeReportRequest,
  AnalyzeReportResponse,
  GenerateActivityRecordRequest,
  GenerateActivityRecordResponse,
  ReportAnalysis,
  Student,
  StudentReport,
  Teacher,
} from "../types";

export const mockTeachers: Teacher[] = [
  { id: "teacher-1", name: "김선생", email: "teacher@example.invalid", role: "TEACHER" },
];

export const mockStudents: Student[] = [
  { id: "student-1", name: "김하늘", grade: 2, classNo: 1, studentNo: 3 },
  { id: "student-2", name: "이서준", grade: 2, classNo: 1, studentNo: 8 },
  { id: "student-3", name: "박지민", grade: 2, classNo: 1, studentNo: 12 },
  { id: "student-4", name: "최유진", grade: 2, classNo: 2, studentNo: 5 },
  { id: "student-5", name: "정민서", grade: 2, classNo: 2, studentNo: 11 },
];

export const mockActivities: Activity[] = ACTIVITIES.map((definition, index) => ({
  ...definition,
  id: `activity-${index + 1}`,
  teacherId: "teacher-1",
}));

export const mockStudentReports: StudentReport[] = [
  {
    id: "report-1",
    studentId: "student-1",
    activityId: "activity-1",
    reportText: "교내 일회용품 사용을 주제로 급식실과 매점의 포장재를 관찰했다. 일주일간 사용 사례를 표로 정리하고, 재사용 가능한 대안을 비교해 발표했다.",
    reportFileUrl: null,
    createdAt: "2026-09-01T09:00:00+09:00",
    updatedAt: "2026-09-01T09:00:00+09:00",
  },
  {
    id: "report-2",
    studentId: "student-2",
    activityId: "activity-2",
    reportText: "모둠에서 교실 분리배출 안내문을 만들었다. 친구들이 자주 헷갈리는 품목을 조사하고, 안내문을 교실에 붙인 뒤 질문을 받아 내용을 고쳤다.",
    reportFileUrl: null,
    createdAt: "2026-09-02T09:00:00+09:00",
    updatedAt: "2026-09-02T09:00:00+09:00",
  },
  {
    id: "report-3",
    studentId: "student-3",
    activityId: "activity-3",
    reportText: "기상 관측에 관심을 갖고 기온과 강수량 자료를 찾아 월별 변화를 그래프로 나타냈다. 두 자료가 함께 변하는 시기를 확인하고 가능한 이유를 조사했다.",
    reportFileUrl: null,
    createdAt: "2026-09-03T09:00:00+09:00",
    updatedAt: "2026-09-03T09:00:00+09:00",
  },
];

export const mockReportAnalysis: ReportAnalysis = {
  topic: "교내 일회용품 사용과 재사용 대안",
  studentActions: [
    { action: "급식실과 매점의 포장재를 관찰함", evidence: "급식실과 매점의 포장재를 관찰했다" },
    { action: "사용 사례를 표로 정리하고 대안을 비교해 발표함", evidence: "일주일간 사용 사례를 표로 정리하고, 재사용 가능한 대안을 비교해 발표했다" },
  ],
  knowledge: ["교내 일회용품 사용 사례", "재사용 가능한 대안"],
  skills: [
    { name: "자료 정리", evidence: "일주일간 사용 사례를 표로 정리" },
  ],
  notablePoints: ["관찰 결과를 바탕으로 대안을 비교해 발표함"],
};

export const mockActivityRecords: ActivityRecord[] = [
  {
    id: "record-1",
    studentId: "student-1",
    activityId: "activity-1",
    teacherId: "teacher-1",
    analysis: mockReportAnalysis,
    aiDraft: "교내 일회용품 사용을 주제로 급식실과 매점의 포장재를 관찰하고, 일주일간 사용 사례를 표로 정리함. 재사용 가능한 대안을 비교하여 발표함.",
    finalText: "교내 일회용품 사용을 주제로 급식실과 매점의 포장재를 관찰함. 일주일간 수집한 사용 사례를 표로 정리하고 재사용 가능한 대안을 비교하여 발표함.",
    createdAt: "2026-09-04T09:00:00+09:00",
    updatedAt: "2026-09-05T09:00:00+09:00",
  },
];

export const mockAnalyzeReportRequest: AnalyzeReportRequest = {
  studentId: "student-1",
  activityId: "activity-1",
  activityCode: "AUTONOMOUS_ONE_TOPIC",
  activityTitle: "1인 1주제 융합활동",
  reportText: mockStudentReports[0]?.reportText ?? "",
};

export const mockAnalyzeReportResponse: AnalyzeReportResponse = mockReportAnalysis;

export const mockGenerateActivityRecordRequest: GenerateActivityRecordRequest = {
  studentId: "student-1",
  activityId: "activity-1",
  activityCode: "AUTONOMOUS_ONE_TOPIC",
  analysis: mockReportAnalysis,
};

export const mockGenerateActivityRecordResponse: GenerateActivityRecordResponse = {
  draft: mockActivityRecords[0]?.aiDraft ?? "",
  usedEvidence: mockReportAnalysis.studentActions.map((item) => item.evidence),
};
