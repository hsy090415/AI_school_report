import type { ActivityCode } from "../../types";

// 학교에서 전달한 DNA 2학년 리로스쿨 문항 원문. 다른 활동의 미확인 문항은 만들지 않는다.
export const DNA_QUESTIONS = [
  "1학년 활동을 바탕으로 올해 내가 새롭게 확장하고 싶은 탐구의 방향과 도달 목표를 적어봅시다. 2학년때 DNA를 처음 하거나 중간에 진로가 바뀐 경우, 그동안의 공백을 만회하면서 동시에 2학년 수준의 확장을 보여줄 수 있도록 해야 합니다. 앞으로 이어질 20차시 탐구 과정에서 기초 지식들을 숙지하도록 노력하세요.",
  "나의 전공 키워드에 새롭게 결합할 '확장 키워드'를 포함하여 총 3가지 키워드를 선정하고 그 이유를 적어봅시다.",
  "선정된 도서의 핵심 이론을 실제 사회 현상이나 다른 학문에 어떻게 적용하여 탐구할 것인지 구체적인 연결 시나리오를 적어봅시다.",
  "내가 선택한 도서의 제목과 저자를 쓰고, 이 책이 1학년 때 읽은 도서보다 어떻게 더 심화되었거나 확장된 내용을 담고 있는지 적어봅시다.",
  "책에서 다루는 핵심 이론이나 원리를 한 문장으로 요약하고, 그 원리가 실제 분야에서 어떻게 활용되는지 구체적인 예시와 함께 적어봅시다.",
  "저자의 주장 중 동의하기 어렵거나 보완이 필요하다고 생각하는 지점, 혹은 최근의 다른 연구 결과와 상충하는 내용이 있다면 무엇인지 적어봅시다.",
  "이 책을 통해 새롭게 알게 된 '학문적 연결 고리'는 무엇이며, 이것이 나의 탐구 주제를 어떻게 더 넓고 깊게 만들었는지 적어봅시다.",
  "7장 이상의 PPT를 구성할 때, 1학년 활동과 비교하여 이번 탐구에서 강조하고 싶은 차별화 포인트(비교 분석, 융합 등)를 슬라이드 소제목에 반영하여 적어봅시다. 이후 PPT를 완성하여 파일로 첨부합니다.",
  "발표 영상에서 1학년 활동과의 차별성을 강조하는 멘트와, 2학년 탐구의 핵심 융합 포인트를 설명할 핵심 대사를 적어봅시다. 이후 발표영상을 제작하고 유투브에 업로드 한 뒤 링크를 첨부합니다.",
  "이번 학기에 내가 깊이 있게 파고들 구체적인 융합 탐구 주제는 무엇이며, 어떤 대상을 어떤 방식으로 비교 분석할 것인지 적어봅시다.",
  "1학년 때의 탐구와 비교하여 이번 주제가 갖는 학문적 확장성은 무엇이며, 두 분야를 융합하여 얻고자 하는 최종 목적은 무엇인지 적어봅시다.",
  "내 주제와 관련된 서로 다른 관점의 자료 2편 이상을 찾아 비교하고, 이를 통해 내 탐구의 핵심 근거가 될 통합적 이론을 적어봅시다.",
  "내 탐구 주제를 증명하기 위해 서로 대조되는 실제 사례 3가지를 찾고, 그 사례들 사이의 차이점과 공통점을 분석하여 적어봅시다.",
  "나의 융합 탐구 주제를 뒷받침하는 핵심 이론들을 바탕으로, 서로 다른 두 지식이 어떻게 연결되는지 적어봅시다.",
  "대조되는 두 가지 이상의 사례를 비교 분석하고, 그 차이에서 발생하는 구체적인 문제점이나 시사점을 적어봅시다.",
  "분석된 문제점을 해결하기 위해 두 가지 이상의 관점(기술+제도, 공학+심리 등)을 결합한 나만의 창의적 대안을 적어봅시다.",
  "이번 융합 탐구의 핵심 결론을 요약하고, 두 분야를 연결하며 얻은 학문적 통찰과 앞으로의 발전 방향을 적어봅시다.",
  "완성된 융합 탐구 보고서를 바탕으로, 두 분야의 연결 고리가 가장 잘 드러나는 핵심 슬라이드 구성안과 시각 자료 배치 계획을 적어봅시다. 이후 PPT와 발표영상을 제작하고 PPT는 파일첨부, 발표영상은 유투브에 업로드 한 뒤 링크를 입력합니다.",
  "1학년 때의 기초 탐구와 2학년 때의 융합 탐구가 나라는 사람을 어떤 전문가로 성장시켰는지 종합적으로 정리해 봅시다.",
  "동료들의 융합 탐구 발표를 보며 학문적 자극을 받은 지점과, 2학년 DNA 활동을 마친 나에게 주는 최종 피드백을 적어봅시다.",
] as const;

export interface FileSlotDefinition {
  id: string;
  label: string;
  accept: string;
  extensions: readonly string[];
  help: string;
}

export const REPORT_FILE_SLOTS: Record<ActivityCode, readonly FileSlotDefinition[]> = {
  AUTONOMOUS_ONE_TOPIC: [
    { id: "report-form", label: "융합활동 보고서 양식", accept: ".docx,.hwp,.hwpx", extensions: [".docx", ".hwp", ".hwpx"], help: "DOCX, HWP 또는 HWPX" },
    { id: "presentation", label: "발표자료", accept: ".ppt,.pptx,.pdf", extensions: [".ppt", ".pptx", ".pdf"], help: "PPT, PPTX 또는 PDF" },
  ],
  AUTONOMOUS_ICAN_WECAN: [
    { id: "last-year-sheet", label: "I can we can 보고서 엑셀 양식", accept: ".xls,.xlsx", extensions: [".xls", ".xlsx"], help: "작년 양식 기준 · XLS 또는 XLSX" },
  ],
  CAREER_DNA: [
    { id: "reading", label: "독서활동 자료", accept: ".pdf,.docx,.hwp,.hwpx", extensions: [".pdf", ".docx", ".hwp", ".hwpx"], help: "PDF, DOCX, HWP 또는 HWPX" },
    { id: "presentation", label: "탐구 발표자료", accept: ".ppt,.pptx,.pdf", extensions: [".ppt", ".pptx", ".pdf"], help: "PPT, PPTX 또는 PDF" },
  ],
  CAREER_CURRICULUM_CREATIVE: [
    { id: "presentation", label: "교과창체 발표자료", accept: ".ppt,.pptx,.pdf", extensions: [".ppt", ".pptx", ".pdf"], help: "PPT, PPTX 또는 PDF" },
  ],
};
