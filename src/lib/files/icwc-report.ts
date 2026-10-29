import "server-only";

import { AiRequestError } from "../ai/errors";
import { extractHwpParagraphs, hasHwpEmbeddedVisualContent } from "./hwp-text";
import { decodeXmlText, extractZipEntries, listZipEntryNames } from "./zip";

const MAX_EXTRACTED_TEXT = 150_000;
const PLACEHOLDER = /^(?:여기부터\s*기입하시오[.。]?|내용을\s*입력하세요[.。]?)$/u;
const SECTION = /(?:서론|본론|결론|연구의\s*목적과\s*필요성|이론적\s*배경|연구\s*설계|연구\s*결과|참고\s*문헌)/u;

function docxParagraphs(bytes: Uint8Array): string[] {
  let xml: string | undefined;
  try {
    xml = extractZipEntries(bytes, (name) => name === "word/document.xml", 8 * 1024 * 1024)
      .get("word/document.xml")?.toString("utf8");
  } catch {
    throw new AiRequestError("INVALID_REQUEST", "DOCX 본문을 읽을 수 없습니다.");
  }
  if (!xml) throw new AiRequestError("INVALID_REQUEST", "DOCX 본문을 찾을 수 없습니다.");
  return Array.from(xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gu), ([, paragraph]) =>
    Array.from((paragraph ?? "").matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu),
      ([, value]) => decodeXmlText(value ?? "")).join("").trim());
}

export function extractIcwcReportText(bytes: Uint8Array, fileName: string): string {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension !== "hwp" && extension !== "docx") {
    throw new AiRequestError("INVALID_REQUEST", "2학년 ICWC 보고서는 HWP 또는 DOCX 파일을 사용해 주세요.");
  }

  const paragraphs = extension === "hwp" ? extractHwpParagraphs(bytes) : docxParagraphs(bytes);
  const start = paragraphs.findIndex((line) => /^\s*주제\s*[:：]?/u.test(line));
  const body = (start >= 0 ? paragraphs.slice(start) : paragraphs)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter((line) => line && !PLACEHOLDER.test(line));

  const text = body.join("\n").trim();
  if (!SECTION.test(text) || text.length < 80) {
    throw new AiRequestError("INVALID_REQUEST", "작성된 2학년 ICWC 보고서 내용을 찾지 못했습니다. 빈 양식인지 확인해 주세요.");
  }
  if (text.length > MAX_EXTRACTED_TEXT) {
    throw new AiRequestError("INVALID_REQUEST", "추출된 보고서가 너무 깁니다.");
  }
  return text;
}

export function hasIcwcReportImages(bytes: Uint8Array, fileName: string): boolean {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "hwp") return hasHwpEmbeddedVisualContent(bytes);
  if (extension === "docx") {
    return listZipEntryNames(bytes).some((name) => /^word\/(?:media\/|embeddings\/|drawings\/)/iu.test(name));
  }
  throw new AiRequestError("INVALID_REQUEST", "2학년 ICWC 보고서는 HWP 또는 DOCX 파일을 사용해 주세요.");
}
