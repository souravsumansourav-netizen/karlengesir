/**
 * Sanitize a filename:
 *  - lowercase
 *  - replace spaces and special chars with hyphens
 *  - strip leading/trailing hyphens
 *  - collapse consecutive hyphens
 */
export function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Build storage path: {subjectSlug}/{uuid}-{sanitizedFilename}
 */
export function buildStoragePath(
  subjectSlug: string,
  uuid: string,
  originalName: string
): string {
  const safe = sanitizeFilename(originalName);
  return `${subjectSlug}/${uuid}-${safe}`;
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Slugify a subject name.
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Escape HTML to prevent XSS in user-provided text.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Get a friendly file-type category from MIME type.
 */
export function getFileCategory(mimeType: string | null): string {
  if (!mimeType) return "other";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    mimeType.includes("msword")
  )
    return "document";
  if (
    mimeType.includes("excel") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("csv")
  )
    return "spreadsheet";
  if (
    mimeType.includes("presentation") ||
    mimeType.includes("powerpoint")
  )
    return "presentation";
  if (mimeType.includes("zip") || mimeType.includes("compressed"))
    return "archive";
  if (mimeType.startsWith("text/")) return "text";
  return "other";
}

/**
 * Format Content-Disposition header conforming strictly to RFC 6266 & RFC 5987.
 * Encodes all special characters including ' (single quote), (, ), and * in filename*
 * to avoid parser failures on Backblaze B2 / S3.
 */
export function formatContentDisposition(
  type: "attachment" | "inline",
  filename: string
): string {
  // Strip control chars, quotes, backslashes, and carriage returns for ASCII filename fallback
  const asciiFallback = filename
    .replace(/["\\\r\n]/g, "")
    .replace(/[^\x20-\x7E]/g, "_");

  // RFC 5987 percent-encoding: encodeURIComponent does not encode '()*
  // which are reserved in RFC 5987 parameter syntax and cause Backblaze B2 syntax errors.
  const rfc5987Encoded = encodeURIComponent(filename.replace(/[\r\n]/g, "")).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );

  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${rfc5987Encoded}`;
}
