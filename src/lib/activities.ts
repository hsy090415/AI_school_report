import { ACTIVITY_CODES, type ActivityCategory, type ActivityCode } from "../types";

export interface ActivityDefinition {
  code: ActivityCode;
  category: ActivityCategory;
  title: string;
  description: string;
}

const ACTIVITY_DEFINITIONS = {
  AUTONOMOUS_ONE_TOPIC: {
    category: "AUTONOMOUS",
    title: "1인 1주제 융합활동",
    description: "학생이 하나의 주제를 정해 여러 관점에서 탐구하는 자율활동",
  },
  AUTONOMOUS_ICAN_WECAN: {
    category: "AUTONOMOUS",
    title: "I can we can",
    description: "학생의 실천과 공동체 참여를 기록하는 자율활동",
  },
  CAREER_DNA: {
    category: "CAREER",
    title: "DNA",
    description: "관심 분야를 탐색하고 관련 주제를 탐구하는 진로활동",
  },
  CAREER_CURRICULUM_CREATIVE: {
    category: "CAREER",
    title: "교과창체",
    description: "교과와 창의적 체험활동을 연결하는 진로활동",
  },
} as const satisfies Record<ActivityCode, Omit<ActivityDefinition, "code">>;

export const ACTIVITIES: ActivityDefinition[] = ACTIVITY_CODES.map((code) => ({
  code,
  ...ACTIVITY_DEFINITIONS[code],
}));

export function getActivityDefinition(code: ActivityCode): ActivityDefinition {
  const activity = ACTIVITIES.find((item) => item.code === code);
  if (!activity) throw new Error(`Unknown activity code: ${code}`);
  return activity;
}
