// Central application and storage configuration

// File upload limits
export const MAX_FILE_SIZE_MB = Number(process.env.NEXT_PUBLIC_MAX_FILE_SIZE_MB || process.env.MAX_FILE_SIZE_MB || 500);
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Free-tier storage quota (default 9.5 GB to keep Backblaze B2 within 10 GB free tier)
export const STORAGE_QUOTA_GB = Number(process.env.NEXT_PUBLIC_STORAGE_QUOTA_GB || process.env.STORAGE_QUOTA_GB || 9.5);
export const STORAGE_QUOTA_BYTES = Math.floor(STORAGE_QUOTA_GB * 1024 * 1024 * 1024);

// Multipart configuration for Backblaze B2 (S3 compatible)
// Files <= 100 MB use single presigned PUT; files > 100 MB use multipart upload
export const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024; // 100 MB
// Backblaze B2 requires parts to be at least 5 MB (5,242,880 bytes). We use 10 MB chunks:
export const MULTIPART_PART_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_PARALLEL_UPLOADS = 3;
export const MAX_PART_RETRIES = 3;

// Storage provider default
export const DEFAULT_STORAGE_PROVIDER = "b2";
export const ANON_UPLOADER_DEFAULT = "Anonymous";
