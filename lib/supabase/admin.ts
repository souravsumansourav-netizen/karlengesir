import { createClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { getEnvVar } from "../env";

// Server-only Supabase client with service-role permissions
// Bypasses RLS to insert validated file records and manage admin tasks
export function createAdminClient() {
  const supabaseUrl = getEnvVar(
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_URL"
  );
  const serviceRoleKey = getEnvVar(
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_ADMIN_KEY",
    "SERVICE_ROLE_KEY"
  );

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
  }

  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY environment variable. This key is required for server-side API operations."
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// Lazy getter function for request-time access
export const getSupabaseAdmin = createAdminClient;
