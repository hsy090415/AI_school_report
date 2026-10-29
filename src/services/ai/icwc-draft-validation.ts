import type { IcwcDraftReview } from "../../types";

const NOMINAL_ENDING = /(?:함|됨|음|임|봄|냄|줌|씀)[.。]$/u;
const UNUSUAL_SYMBOL = /[\p{S}•※★☆○●◎◇◆□■△▲▽▼→←↑↓·ㆍ/<>_~^]/gu;
const NUMBERED_PARAGRAPH = /(?:^|\n)\s*(?:\d+[.)]|[①-⑳])[ \t]*/u;

function uniqueMatches(value: string, expression: RegExp): string[] {
  return [...new Set(value.match(expression) ?? [])];
}

export function inspectIcwcDraft(draft: string, maxLength: number): IcwcDraftReview {
  const characterCount = Array.from(draft).length;
  const byteCount = new TextEncoder().encode(draft).length;
  const englishTerms = uniqueMatches(draft, /[A-Za-z]+(?:[A-Za-z\d-]*[A-Za-z\d])?/gu);
  const specialCharacters = uniqueMatches(draft, UNUSUAL_SYMBOL);
  if (NUMBERED_PARAGRAPH.test(draft)) specialCharacters.push("문단 번호");

  const sentences = draft.split(/(?<=[.!?。])\s+/u).map((sentence) => sentence.trim()).filter(Boolean);
  const nonNominalSentences = sentences.flatMap((sentence, index) => {
    const cleaned = sentence.replace(/["'”’»）)\]]+$/u, "");
    return NOMINAL_ENDING.test(cleaned) ? [] : [index + 1];
  });

  const warnings: string[] = [];
  if (characterCount > maxLength) warnings.push(`공백 포함 ${characterCount}자로 목표 ${maxLength}자를 초과함. 교사가 분량을 조정해 주세요.`);
  if (englishTerms.length) warnings.push(`영문 표기 확인: ${englishTerms.slice(0, 6).join(", ")}${englishTerms.length > 6 ? " 외" : ""}. 고유명사·통용 약어인지 확인해 주세요.`);
  if (specialCharacters.length) warnings.push(`특수문자·문단 번호 확인: ${specialCharacters.slice(0, 6).join(" ")}. 기록 입력에 필요한 표현인지 확인해 주세요.`);
  if (nonNominalSentences.length) warnings.push(`${nonNominalSentences.join(", ")}번째 문장의 명사형 종결어미(-(으)ㅁ)를 확인해 주세요.`);

  return { draft, characterCount, byteCount, maxLength, englishTerms, specialCharacters, nonNominalSentences, warnings };
}
