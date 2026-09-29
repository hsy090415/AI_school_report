import "server-only";

import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { ActivityCode, GenerateActivityRecordRequest, GenerateActivityRecordResponse } from "../../types";

const HISTORY_DIRECTORY = path.join(process.cwd(), ".ai-test-cache");
const HISTORY_FILE = path.join(HISTORY_DIRECTORY, "activity-record-draft-history.jsonl");

export async function saveStandaloneActivityDraft(
  details: { activityCode: ActivityCode; activityId: string; topic: string },
  result: GenerateActivityRecordResponse,
): Promise<void> {
  try {
    await mkdir(HISTORY_DIRECTORY, { recursive: true });
    await appendFile(HISTORY_FILE, `${JSON.stringify({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      source: "activity-record-api",
      activityCode: details.activityCode,
      activityId: details.activityId,
      topic: details.topic,
      maxLength: result.maxLength,
      characterCount: result.characterCount,
      draft: result.draft,
    })}\n`, "utf8");
  } catch {
    // 테스트 기록 저장 실패가 생성된 초안의 반환을 막지 않도록 한다.
  }
}

export async function saveActivityRecordDraft(
  input: GenerateActivityRecordRequest,
  result: GenerateActivityRecordResponse,
): Promise<void> {
  await saveStandaloneActivityDraft({
    activityCode: input.activityCode,
    activityId: input.activityId,
    topic: input.analysis.topic,
  }, result);
}
