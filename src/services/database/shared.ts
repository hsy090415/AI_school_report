import type { AppSupabaseClient } from "../../lib/supabase/client";

export class DatabaseOperationError extends Error {
  constructor(operation: string, message: string, cause?: unknown) {
    super(`${operation}: ${message}`, { cause });
    this.name = "DatabaseOperationError";
  }
}

export function throwIfSupabaseError(
  operation: string,
  error: { message: string } | null,
): asserts error is null {
  if (error) {
    throw new DatabaseOperationError(operation, error.message, error);
  }
}

export async function requireAuthenticatedUserId(
  client: AppSupabaseClient,
): Promise<string> {
  const { data, error } = await client.auth.getUser();
  throwIfSupabaseError("인증 사용자 확인 실패", error);

  if (!data.user) {
    throw new DatabaseOperationError(
      "인증 사용자 확인 실패",
      "로그인이 필요합니다.",
    );
  }

  return data.user.id;
}

export async function requireAuthenticatedTeacherId(
  client: AppSupabaseClient,
): Promise<string> {
  const userId = await requireAuthenticatedUserId(client);
  const { data, error } = await client
    .from("teachers")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  throwIfSupabaseError("승인된 교사 계정 확인 실패", error);

  if (!data) {
    throw new DatabaseOperationError(
      "승인된 교사 계정 확인 실패",
      "관리자가 연결한 교사 계정이 필요합니다.",
    );
  }

  return data.id;
}
