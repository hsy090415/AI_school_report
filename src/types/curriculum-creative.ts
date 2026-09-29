import type { GenerateActivityRecordResponse } from "./api";
import type { ReportAnalysis } from "./domain";

export const CURRICULUM_CREATIVE_PARTS = [
  {
    key: "career",
    title: "나의 희망진로 소개",
    guide: "희망 직업·분야와 실제로 하는 일",
  },
  {
    key: "motivation",
    title: "진로 선택 이유와 나의 강점",
    guide: "끌리는 이유, 성격·흥미·강점, 학교생활 속 경험",
  },
  {
    key: "research",
    title: "진로 관련 조사",
    guide: "필요한 전공·학과, 자격증·능력, 업무 환경이나 전망",
  },
  {
    key: "roleModel",
    title: "롤모델 또는 실제 사례",
    guide: "존경하는 인물, 인터뷰·영상·기사, 인상 깊었던 점",
  },
  {
    key: "preparation",
    title: "현재 준비 과정",
    guide: "과목 선택, 동아리·독서·탐구·봉사·자격증·체험 등 지금 하는 노력",
  },
  {
    key: "plan",
    title: "앞으로의 계획과 다짐",
    guide: "진학 계획이나 로드맵, 부족한 점과 보완 계획",
  },
] as const;

export type CurriculumCreativePartKey = (typeof CURRICULUM_CREATIVE_PARTS)[number]["key"];
export type CurriculumCreativeAnswers = Record<CurriculumCreativePartKey, string>;

export type GenerateCurriculumCreativeRecordRequest =
  | { answers: CurriculumCreativeAnswers; maxLength?: number }
  | { freeText: string; maxLength?: number };

export interface GenerateCurriculumCreativeRecordResponse extends GenerateActivityRecordResponse {
  analysis: ReportAnalysis;
  reportText: string;
}
