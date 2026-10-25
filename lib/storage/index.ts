import { B2Provider } from "./b2";
import { SupabaseStorageProvider } from "./supabase-stub";
import type { StorageProvider } from "./types";
import { DEFAULT_STORAGE_PROVIDER } from "../constants";

export * from "./types";
export * from "./b2";
export * from "./supabase-stub";

let cachedProvider: StorageProvider | null = null;

export function getStorageProvider(customProvider?: string): StorageProvider {
  const provider = (
    customProvider ||
    process.env.STORAGE_PROVIDER ||
    DEFAULT_STORAGE_PROVIDER
  ).toLowerCase();

  if (provider === "supabase") {
    return new SupabaseStorageProvider();
  }

  // Default to Backblaze B2
  if (!cachedProvider || cachedProvider.name !== "b2") {
    cachedProvider = new B2Provider();
  }
  return cachedProvider;
}
