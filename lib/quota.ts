import { createAdminClient } from "./supabase/admin";
import { STORAGE_QUOTA_BYTES, STORAGE_QUOTA_GB } from "./constants";
import { formatBytes } from "./utils";

export interface QuotaInfo {
  totalBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  usedGb: number;
  quotaGb: number;
  percentUsed: number;
  isExceeded: boolean;
  formattedUsed: string;
  formattedQuota: string;
}

export async function getStorageQuotaInfo(): Promise<QuotaInfo> {
  let totalBytes = 0;

  try {
    const supabase = createAdminClient();

    // Query all files size_bytes
    const { data, error } = await supabase.from("files").select("size_bytes");

    if (!error && data) {
      totalBytes = data.reduce((sum, item) => sum + Number(item.size_bytes || 0), 0);
    }
  } catch (err) {
    console.warn("Could not retrieve storage quota from Supabase:", err);
  }

  const quotaBytes = STORAGE_QUOTA_BYTES;
  const remainingBytes = Math.max(0, quotaBytes - totalBytes);
  const usedGb = totalBytes / (1024 * 1024 * 1024);
  const quotaGb = STORAGE_QUOTA_GB;
  const percentUsed = Math.min(100, Number(((totalBytes / quotaBytes) * 100).toFixed(1)));
  const isExceeded = totalBytes >= quotaBytes;

  return {
    totalBytes,
    quotaBytes,
    remainingBytes,
    usedGb: Number(usedGb.toFixed(2)),
    quotaGb,
    percentUsed,
    isExceeded,
    formattedUsed: formatBytes(totalBytes),
    formattedQuota: `${STORAGE_QUOTA_GB} GB`,
  };
}

export function validateUploadFitsQuota(
  currentTotalBytes: number,
  newFileBytes: number
): { allowed: boolean; message?: string } {
  const projectedTotal = currentTotalBytes + newFileBytes;
  if (projectedTotal > STORAGE_QUOTA_BYTES) {
    return {
      allowed: false,
      message: `Upload rejected: This file (${formatBytes(newFileBytes)}) would exceed the ${STORAGE_QUOTA_GB} GB storage quota. Current usage: ${formatBytes(currentTotalBytes)}. Available space: ${formatBytes(Math.max(0, STORAGE_QUOTA_BYTES - currentTotalBytes))}.`,
    };
  }
  return { allowed: true };
}
