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

export async function requireAuthenticatedTeacherId(
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
