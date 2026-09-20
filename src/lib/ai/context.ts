import type { ActivityCode } from "../../types";

export interface AiActivityContext {
  guidance: string;
  actionTerms: readonly string[];
}

export const AI_COMMON_RULES = [
  "제공된 보고서와 활동 정보만 사용한다.",
  "학생이 하지 않은 활동이나 보고서에 없는 결과를 만들지 않는다.",
  "근거 없는 능력, 인성, 리더십, 진로를 추측하지 않는다.",
  "실제 행동과 보고서의 근거를 우선한다.",
  "결과는 교사가 검토하고 수정할 초안이다.",
] as const;

export const AI_ACTIVITY_CONTEXTS: Record<ActivityCode, AiActivityContext> = {
  AUTONOMOUS_ONE_TOPIC: {
    guidance: "주제 설정과 융합 탐구 과정에서 보고서에 명시된 행동을 중심으로 기록한다.",
    actionTerms: ["탐구", "조사", "분석", "비교", "관찰", "정리"],
  },
  AUTONOMOUS_ICAN_WECAN: {
    guidance: "실천과 공동체 참여 과정에서 보고서에 명시된 행동을 중심으로 기록한다.",
    actionTerms: ["참여", "실천", "제작", "작성", "수정", "협의"],
  },
  CAREER_DNA: {
    guidance: "관심 분야 탐색과 관련 탐구를 다루되 희망 진로는 추측하지 않는다.",
    actionTerms: ["탐색", "조사", "분석", "탐구", "관찰", "정리"],
  },
  CAREER_CURRICULUM_CREATIVE: {
    guidance: "교과와 창체의 연결 과정에서 확인된 탐구·실천만 기록한다.",
    actionTerms: ["탐구", "조사", "분석", "연결", "발표", "적용"],
  },
};

export function getAiActivityContext(code: ActivityCode): AiActivityContext {
  return AI_ACTIVITY_CONTEXTS[code];
}
