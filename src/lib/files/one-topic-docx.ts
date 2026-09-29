import "server-only";
import type { OneTopicReport } from "../../types/one-topic";
import { AiRequestError } from "../ai/errors";
import { decodeXmlText, extractZipEntries } from "./zip";

function cellText(xml: string): string {
  return Array.from(xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gu))
    .map((paragraph) => Array.from((paragraph[1] ?? "").matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu))
      .map((text) => decodeXmlText(text[1] ?? "")).join(""))
    .join("\n").trim();
}

export function extractOneTopicReport(bytes: Uint8Array): OneTopicReport {
  let xml: string | undefined;
  try {
    xml = extractZipEntries(bytes, (name) => name === "word/document.xml", 2 * 1024 * 1024)
      .get("word/document.xml")?.toString("utf8");
  } catch {
    throw new AiRequestError("INVALID_REQUEST", "DOCX 문서를 읽을 수 없습니다. 파일 형식을 확인해 주세요.");
  }
  if (!xml) throw new AiRequestError("INVALID_REQUEST", "DOCX 본문을 찾을 수 없습니다.");
  const report: OneTopicReport = { area: "", topic: "", references: "", content: "", reflection: "" };
  let recognized = 0;
  for (const row of xml.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/gu)) {
    const cells = Array.from((row[1] ?? "").matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/gu), (cell) => cellText(cell[1] ?? ""));
    for (const [key, label] of [["area", "발표 영역"], ["topic", "발표 주제"]] as const) {
      const cell = cells.find((value) => value.includes(`${label} :`) || value.includes(`${label}:`));
      if (cell !== undefined) {
        report[key] = cell.slice(cell.indexOf(label) + label.length).replace(/^\s*[:：]\s*/u, "").trim();
        recognized += 1;
      }
    }
    const label = (cells[0] ?? "").replace(/\s/gu, "");
    const key = label === "관련자료및도서,참고사이트" ? "references"
      : label === "발표내용" ? "content" : label === "소감및느낀점" ? "reflection" : null;
    if (key) { report[key] = cells.slice(1).join("\n").trim(); recognized += 1; }
  }
  if (recognized < 3) throw new AiRequestError("INVALID_REQUEST", "1인 1융합 보고서 양식의 항목을 찾지 못했습니다.");
  return report;
}
