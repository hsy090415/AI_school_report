import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AnalyzeCareerDnaResponse,
  CareerDnaAnswer,
  CareerDnaPresentationKind,
} from "../../types";
import { isReportAnalysis } from "./validation";

const CACHE_VERSION = "career-dna-compact-analysis-v3";
const CACHE_DIRECTORY = path.join(process.cwd(), ".ai-test-cache", "career-dna");

interface CachePresentationInput {
  kind: CareerDnaPresentationKind;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

interface CareerDnaCacheInput {
  answers: CareerDnaAnswer[];
  presentations: CachePresentationInput[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCachedResponse(value: unknown): value is AnalyzeCareerDnaResponse {
  return (
    isObject(value) &&
    Array.isArray(value.answeredSessions) &&
    value.answeredSessions.every(
      (session) => typeof session === "number" && Number.isInteger(session),
    ) &&
    Array.isArray(value.presentations) &&
    value.presentations.every(
      (item) =>
        isObject(item) &&
        (item.kind === "READING" || item.kind === "RESEARCH") &&
        typeof item.fileName === "string" &&
        typeof item.mimeType === "string",
    ) &&
    typeof value.extractedText === "string" &&
    value.extractedText.length > 0 &&
    isReportAnalysis(value.analysis)
  );
}

function updateHash(hash: ReturnType<typeof createHash>, value: string | Uint8Array): void {
  const byteLength = typeof value === "string" ? Buffer.byteLength(value) : value.byteLength;
  hash.update(String(byteLength));
  hash.update(":");
  hash.update(value);
  hash.update("|");
}

export function createCareerDnaCacheKey(input: CareerDnaCacheInput): string {
  const hash = createHash("sha256");
  updateHash(hash, CACHE_VERSION);

  for (const answer of [...input.answers].sort((left, right) => left.session - right.session)) {
    updateHash(hash, String(answer.session));
    updateHash(hash, answer.answer.trim());
  }

  for (const presentation of [...input.presentations].sort((left, right) =>
    left.kind.localeCompare(right.kind),
  )) {
    updateHash(hash, presentation.kind);
    updateHash(hash, presentation.fileName);
    updateHash(hash, presentation.mimeType);
    updateHash(hash, presentation.bytes);
  }

  return hash.digest("hex");
}

export async function readCareerDnaTestCache(
  cacheKey: string,
): Promise<AnalyzeCareerDnaResponse | null> {
  try {
    const raw = await readFile(path.join(CACHE_DIRECTORY, `${cacheKey}.json`), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isCachedResponse(parsed) ? { ...parsed, cacheHit: true } : null;
  } catch {
    return null;
  }
}

export async function writeCareerDnaTestCache(
  cacheKey: string,
  response: AnalyzeCareerDnaResponse,
): Promise<void> {
  const cachePath = path.join(CACHE_DIRECTORY, `${cacheKey}.json`);
  const temporaryPath = `${cachePath}.${process.pid}-${Date.now()}.tmp`;

  try {
    await mkdir(CACHE_DIRECTORY, { recursive: true });
    await writeFile(temporaryPath, JSON.stringify({ ...response, cacheHit: false }), "utf8");
    await rename(temporaryPath, cachePath);
  } catch {
    // 테스트 캐시를 쓰지 못해도 실제 분석 결과는 정상적으로 반환한다.
  }
}
