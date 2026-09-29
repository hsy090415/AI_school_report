export const REPORT_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    topic: {
      type: "string",
      description: "보고서에서 직접 확인되는 핵심 탐구 또는 활동 주제",
      maxLength: 120,
    },
    studentActions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "학생이 실제로 수행한 행동",
            maxLength: 60,
          },
          evidence: {
            type: "string",
            description: "보고서 원문에서 그대로 인용한 행동의 근거",
            maxLength: 120,
          },
        },
        required: ["action", "evidence"],
        additionalProperties: false,
      },
    },
    knowledge: {
      type: "array",
      maxItems: 6,
      items: { type: "string", maxLength: 140 },
      description: "보고서에서 직접 확인되는 지식이나 개념",
    },
    skills: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "보고서의 행동으로 확인되는 기능",
            maxLength: 50,
          },
          evidence: {
            type: "string",
            description: "보고서 원문에서 그대로 인용한 기능의 근거",
            maxLength: 120,
          },
        },
        required: ["name", "evidence"],
        additionalProperties: false,
      },
    },
    notablePoints: {
      type: "array",
      maxItems: 2,
      items: { type: "string", maxLength: 140 },
      description: "교사가 검토할 가치가 있는 보고서 기반 특징",
    },
  },
  required: ["topic", "studentActions", "knowledge", "skills", "notablePoints"],
  additionalProperties: false,
} as const;

export const ACTIVITY_RECORD_DRAFT_JSON_SCHEMA = {
  type: "object",
  properties: {
    draft: {
      type: "string",
      description: "교사가 검토하고 수정할 활동 기록 초안",
    },
    usedEvidence: {
      type: "array",
      items: { type: "string" },
      description: "초안 작성에 사용한 분석 결과의 evidence 원문",
    },
  },
  required: ["draft", "usedEvidence"],
  additionalProperties: false,
} as const;

export function createActivityRecordDraftJsonSchema(evidence: string[]): object {
  return {
    ...ACTIVITY_RECORD_DRAFT_JSON_SCHEMA,
    properties: {
      ...ACTIVITY_RECORD_DRAFT_JSON_SCHEMA.properties,
      usedEvidence: {
        ...ACTIVITY_RECORD_DRAFT_JSON_SCHEMA.properties.usedEvidence,
        items: {
          type: "string",
          enum: [...new Set(evidence)],
        },
      },
    },
  };
}

export function createOneTopicDraftJsonSchema(): object {
  return {
    type: "object",
    properties: {
      sentence1: { type: "string" },
      sentence2: { type: "string" },
      sentence3: { type: "string" },
      usedEvidenceIndices: {
        type: "array",
        items: { type: "integer" },
      },
    },
    required: ["sentence1", "sentence2", "sentence3", "usedEvidenceIndices"],
    additionalProperties: false,
  };
}

export const ONE_TOPIC_SOURCE_DRAFT_JSON_SCHEMA = {
  type: "object",
  properties: {
    presentationFocus: { type: "string", description: "보고서 본문에서 찾은 짧은 중심 키워드 한 개. 발표 제목 금지." },
    sentence2: { type: "string", description: "학생의 핵심 분석 내용 먼저, 실제 사례는 짧은 보조 근거로 뒤에 포함한 한 문장." },
    sentence3: { type: "string", description: "소감·판단·제안과 그로 드러난 역량을 담은 한 문장. 분석 내용 반복 금지." },
  },
  required: ["presentationFocus", "sentence2", "sentence3"],
  additionalProperties: false,
} as const;

export const CURRICULUM_CREATIVE_DRAFT_JSON_SCHEMA = {
  type: "object",
  properties: {
    motivationAndPerspective: { type: "string", description: "희망 진로에 관심을 갖게 된 계기와 학생이 중요하게 보는 점을 연결한 첫 문장. 근거가 없으면 진로 탐색 사실만 기술." },
    explorationAndPreparation: { type: "string", description: "학생이 조사나 학교 활동에서 실제로 한 행동과 거기서 주목한 점을 연결한 두 번째 문장. 여러 활동을 나열하지 않음." },
    growthAndDirection: { type: "string", description: "앞 문장의 구체적인 활동 대상과 판단 방식을 근거로 역량 한 가지와 희망 분야에서의 발전 가능성을 교사 관점에서 평가한 마지막 문장. 일반적인 평가 문구 금지." },
  },
  required: ["motivationAndPerspective", "explorationAndPreparation", "growthAndDirection"],
  additionalProperties: false,
} as const;

export const REPORT_DOCUMENT_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    extractedText: {
      type: "string",
      description: "문서에서 읽고 분석 근거로 사용한 학생 자료의 텍스트",
    },
    analysis: REPORT_ANALYSIS_JSON_SCHEMA,
  },
  required: ["extractedText", "analysis"],
  additionalProperties: false,
} as const;
