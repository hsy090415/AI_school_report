import "server-only";

import { AiRequestError } from "../ai/errors";
import { decodeXmlText, extractZipEntries } from "./zip";

export function extractPptxText(bytes: Uint8Array): string {
  const files = extractZipEntries(
    bytes,
    (name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name),
    5 * 1024 * 1024,
  );
  const slides = [...files.entries()].sort(([left], [right]) => {
    const leftNumber = Number(left.match(/slide(\d+)\.xml$/u)?.[1] ?? 0);
    const rightNumber = Number(right.match(/slide(\d+)\.xml$/u)?.[1] ?? 0);
    return leftNumber - rightNumber;
  });
  if (slides.length === 0) {
    throw new AiRequestError("INVALID_REQUEST", "PPTX에서 슬라이드를 찾을 수 없습니다.");
  }

  return slides
    .map(([, buffer], index) => {
      const xml = buffer.toString("utf8");
      const text = Array.from(xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gu))
        .map((match) => decodeXmlText(match[1] ?? "").trim())
        .filter(Boolean)
        .join("\n");
      return `[슬라이드 ${index + 1}]\n${text || "(추출 가능한 텍스트 없음)"}`;
    })
    .join("\n\n");
}
