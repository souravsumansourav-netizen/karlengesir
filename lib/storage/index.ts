import { B2Provider } from "./b2";
import { SupabaseStorageProvider } from "./supabase-stub";
import type { StorageProvider } from "./types";
import { DEFAULT_STORAGE_PROVIDER } from "../constants";
import { getEnvVar } from "../env";

export * from "./types";
export * from "./b2";
export * from "./supabase-stub";

export function getStorageProvider(customProvider?: string): StorageProvider {
  const provider = (
    customProvider ||
    getEnvVar("STORAGE_PROVIDER") ||
    DEFAULT_STORAGE_PROVIDER
  ).toLowerCase();

  if (provider === "supabase") {
    return new SupabaseStorageProvider();
  }

  // Default to Backblaze B2 (create fresh to ensure current request context env is used)
  return new B2Provider();
}
