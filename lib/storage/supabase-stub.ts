import type {
  StorageProvider,
  CreateUploadResult,
  StaleMultipartUpload,
} from "./types";

/**
 * Supabase Storage Provider Stub.
 * Supabase Storage Free Tier has a strict 50 MB per-file limit and lacks native S3 multipart upload APIs.
 * Use B2Provider for large files (up to 500 MB+).
 */
export class SupabaseStorageProvider implements StorageProvider {
  public readonly name = "supabase";

  async createUpload({
    key,
    sizeBytes,
  }: {
    key: string;
    contentType: string;
    sizeBytes: number;
    partSize?: number;
  }): Promise<CreateUploadResult> {
    if (sizeBytes > 50 * 1024 * 1024) {
      throw new Error(
        "Supabase Storage free tier does not support files larger than 50 MB. Please set STORAGE_PROVIDER=b2."
      );
    }

    // In a full Supabase storage implementation, we would call supabase.storage.createSignedUploadUrl(key)
    return {
      mode: "single",
      uploadUrl: `https://supabase-placeholder.co/storage/v1/upload/${encodeURIComponent(key)}`,
      key,
    };
  }

  async completeUpload(): Promise<{ location?: string }> {
    return { location: "supabase-storage" };
  }

  async abortUpload(): Promise<void> {
    // No-op for Supabase Storage stub
  }

  async getDownloadUrl({ key }: { key: string; originalFilename: string }): Promise<string> {
    return `https://supabase-placeholder.co/storage/v1/object/public/shared-files/${encodeURIComponent(key)}`;
  }

  async deleteObject(): Promise<void> {
    // No-op for Supabase Storage stub
  }

  async listStaleMultipartUploads(): Promise<StaleMultipartUpload[]> {
    return [];
  }
}
