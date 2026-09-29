import "server-only";
import type { OneTopicReport } from "../../types/one-topic";
import { AiRequestError } from "../ai/errors";
import { extractHwpParagraphs } from "./hwp-text";

export function extractOneTopicHwp(bytes: Uint8Array): OneTopicReport {
  const text = extractHwpParagraphs(bytes).join("\n");
  const markers: Array<[keyof OneTopicReport, RegExp]> = [
    ["area", /^[ \t◈◇◆]*발표\s*영역\s*[:：]/mu],
    ["topic", /^[ \t◈◇◆]*발표\s*주제\s*[:：]/mu],
    ["references", /^[ \t]*관련\s*자료\s*및\s*도서\s*[,，]?\s*참고\s*사이트[ \t]*$/mu],
    ["content", /^[ \t]*발표\s*내용[ \t]*$/mu],
    ["reflection", /^[ \t]*소감\s*및\s*느낀\s*점[ \t]*$/mu],
  ];
  const report: OneTopicReport = { area: "", topic: "", references: "", content: "", reflection: "" };
  const positions = markers.map(([key, pattern]) => ({ key, match: pattern.exec(text) }));
  if (positions.some(({ match }) => !match)) throw new AiRequestError("INVALID_REQUEST", "1인 1융합 보고서의 다섯 항목을 찾지 못했습니다. 제공된 양식으로 작성해 주세요.");
  for (let i = 0; i < positions.length; i += 1) {
    const { key, match } = positions[i]!;
    const start = match!.index + match![0].length;
    const end = positions[i + 1]?.match?.index ?? text.length;
    if (end < start) throw new AiRequestError("INVALID_REQUEST", "보고서 항목 순서가 양식과 다릅니다.");
    report[key] = text.slice(start, end).trim();
  }
  return report;
}
