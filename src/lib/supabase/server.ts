import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "../../types/database";

export type ServerSupabaseClient = SupabaseClient<Database>;

function requirePublicEnvironmentValue(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }

  return value;
}

export async function createClient(): Promise<ServerSupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requirePublicEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicEnvironmentValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy에서 처리한다.
          }
        },
      },
    },
  );
}
