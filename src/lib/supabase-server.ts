import { createServerClient } from "@supabase/ssr";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Creates an authenticated Supabase server client for API routes.
 * Reads auth cookies from the Next.js request via next/headers.
 */
export function createSupabaseServerClient(): SupabaseClient {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
            // May fail in read-only contexts — middleware handles token refresh
          }
        },
      },
    }
  );
}

/**
 * Gets the authenticated user from request cookies.
 * Returns the Supabase client and verified user, or throws.
 */
export async function getAuthenticatedUser(): Promise<{
  supabase: SupabaseClient;
  user: User;
}> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Non authentifié");
  }

  return { supabase, user };
}

/**
 * Creates a Supabase client with the service-role key (bypasses RLS).
 * Used only for server-side background operations (e.g. live pipeline writes).
 */
export function createSupabaseServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
