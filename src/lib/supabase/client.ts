import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";

export type AppSupabaseClient = SupabaseClient<Database>;

export function createClient(): AppSupabaseClient {
  // Next.js exposes NEXT_PUBLIC values to browser bundles only for direct references.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Supabase 공개 연결 설정이 필요합니다.");
  }
  return createBrowserClient<Database>(
    url,
    key,
  );
}
