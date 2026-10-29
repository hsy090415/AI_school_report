import type { IcwcDraftDirection } from "../../types";

const MAX_SOURCE_LENGTH = 20_000;

export interface IcwcSecondYearDraftInput {
  reportText: string;
  reflectionText: string;
  teacherComment: string;
  direction: IcwcDraftDirection;
  maxLength: number;
}

function removeContactDetails(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, "[이메일 생략]")
    .replace(/01[016789][- ]?\d{3,4}[- ]?\d{4}/gu, "[연락처 생략]");
}

function conciseReport(text: string): string {
  if (text.length <= MAX_SOURCE_LENGTH) return text;
  return `${text.slice(0, 12_000)}\n[원문 중간 일부 생략]\n${text.slice(-8_000)}`;
}

export function buildIcwcSecondYearDraftPrompt(input: IcwcSecondYearDraftInput): string {
  const focus = input.direction === "탐구내용 중심"
    ? "탐구내용 중심: 팀 보고서에서 탐구 주제, 연구 방법, 분석한 자료와 결과를 구체적으로 파악한다. 그중 학생 개인 소감문과 교사 코멘트로 확인되는 이해·분석·탐구 과정을 연결해 탐구역량을 드러낸다. 팀 공동 결과를 학생의 단독 성과로 쓰지 않는다."
    : "공동체역량 중심: 개인 소감문과 교사 코멘트를 우선 근거로 삼아 학생의 역할 분담, 맡은 역할 수행, 자료 공유, 동료와의 소통·배려, 협력적 문제 해결 과정을 구체적으로 쓴다. 보고서의 탐구 주제는 맥락으로만 간결하게 제시한다. 각 역량은 실제 행동 근거가 있을 때만 언급한다.";

  return [
    "2학년 협동심화탐구프로젝트 학교생활기록부 검토용 초안을 작성한다.",
    "팀 보고서, 학생 개인 소감문, 교사 관찰 코멘트에 명시된 사실만 사용한다.",
    "보고서의 팀 성과와 해당 학생의 행동을 구분하고, 확인되지 않은 개인 기여·실험 결과·역량을 만들지 않는다.",
    `선택한 방향: ${input.direction}. ${focus}`,
    "문장 수와 문장 순서를 고정하지 않는다. 학생의 실제 행동과 그 행동에서 확인되는 역량을 자연스럽게 연결하고, 근거 없는 칭찬이나 추상적인 수식어를 피한다.",
    "교사가 검토할 초안으로 작성한다. 모든 문장은 '-(으)ㅁ' 명사형으로 끝낸다. 한국어를 기본으로 하고 필요한 고유명사·통용 약어 외 영문, 이모지, 장식용 특수문자, 문단 번호를 피한다.",
    `공백 포함 약 ${input.maxLength}자를 목표로 완결된 한국어 문장 2~4개를 작성한다. 최소 ${Math.ceil(input.maxLength * 0.6)}자 이상 쓰고, 한 글자·기호·목록 표시만 답하지 않는다. 글자 수가 정확하지 않아도 문장을 억지로 끊지 않는다.`,
    'JSON 객체 하나만 반환한다. 형식: {"draft":"검토용 초안"}',
    "\n<team_report>\n" + removeContactDetails(conciseReport(input.reportText)) + "\n</team_report>",
    "<student_reflection>\n" + removeContactDetails(input.reflectionText) + "\n</student_reflection>",
    "<teacher_comment>\n" + removeContactDetails(input.teacherComment) + "\n</teacher_comment>",
  ].join("\n");
}
