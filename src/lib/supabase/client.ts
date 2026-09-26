import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";

export type AppSupabaseClient = SupabaseClient<Database>;

function requirePublicEnvironmentValue(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }

  return value;
}

export function createClient(): AppSupabaseClient {
  return createBrowserClient<Database>(
    requirePublicEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicEnvironmentValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  );
}
