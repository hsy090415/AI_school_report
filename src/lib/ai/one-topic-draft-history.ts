import "server-only";

import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { GenerateOneTopicRecordResponse, OneTopicReport } from "../../types/one-topic";

const HISTORY_DIRECTORY = path.join(process.cwd(), ".ai-test-cache", "one-topic");
const HISTORY_FILE = path.join(HISTORY_DIRECTORY, "draft-history.jsonl");

export async function saveOneTopicDraft(
  report: OneTopicReport,
  result: GenerateOneTopicRecordResponse,
): Promise<void> {
  try {
    await mkdir(HISTORY_DIRECTORY, { recursive: true });
    await appendFile(HISTORY_FILE, `${JSON.stringify({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      source: "groq",
      reportArea: report.area,
      reportTopic: report.topic,
      maxLength: result.maxLength,
      characterCount: result.characterCount,
      draft: result.draft,
    })}\n`, "utf8");
  } catch {
    // 테스트 기록 저장 실패가 생성된 초안의 반환을 막지 않도록 한다.
  }
}
