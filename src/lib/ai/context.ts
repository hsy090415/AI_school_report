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
    guidance: "협동심화탐구프로젝트에서 전문학술자료의 목적·방법·결과·결론을 분석한 과정과 학생의 느낀점에서 확인되는 학습 확장 및 자기주도적 문제 해결을 중심으로 기록한다.",
    actionTerms: ["논문", "분석", "해석", "탐구", "고찰", "자료", "강의"],
  },
  CAREER_DNA: {
    guidance: "독서 기반 심화 탐구와 그 결과를 확장한 융합 탐구를 서로 연결된 두 활동으로 구분한다. 각 활동의 주제·행동·근거를 따로 확인한 뒤, 첫 활동의 이론과 문제의식이 두 번째 활동의 비교 분석과 대안으로 이어진 과정을 살핀다. 희망 진로와 연결 관계는 자료에 명시된 범위에서만 기록한다.",
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
