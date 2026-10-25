import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getStorageProvider } from "@/lib/storage";
import { checkRateLimit } from "@/lib/rateLimit";
import { getStorageQuotaInfo, validateUploadFitsQuota } from "@/lib/quota";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, MULTIPART_PART_SIZE_BYTES } from "@/lib/constants";
import { sanitizeFilename, slugify, formatBytes } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // 1. In-memory IP rate limiting (Cloudflare Turnstile token can also be optionally verified here)
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.success) {
    return NextResponse.json(
      {
        error: `Too many upload requests. Please wait ${rateLimit.reset} seconds before trying again.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.reset),
          "X-RateLimit-Limit": String(rateLimit.limit),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      }
    );
  }

  try {
    const body = await request.json();
    const {
      fileName,
      sizeBytes,
      mimeType,
      subjectId,
      newSubjectName,
    } = body;

    if (!fileName || typeof fileName !== "string") {
      return NextResponse.json(
        { error: "Invalid or missing fileName" },
        { status: 400 }
      );
    }

    const numBytes = Number(sizeBytes);
    if (isNaN(numBytes) || numBytes <= 0) {
      return NextResponse.json(
        { error: "Invalid or zero file size" },
        { status: 400 }
      );
    }

    // 2. Validate max file size limit (supports up to 500 MB / MAX_FILE_SIZE_MB)
    if (numBytes > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `File "${fileName}" exceeds the maximum allowable upload size of ${formatBytes(
            MAX_FILE_SIZE_BYTES
          )} (${MAX_FILE_SIZE_MB} MB). File size: ${formatBytes(numBytes)}.`,
        },
        { status: 400 }
      );
    }

    // 3. Validate free-tier storage quota (e.g. 9.5 GB total cap)
    const quotaInfo = await getStorageQuotaInfo();
    const quotaCheck = validateUploadFitsQuota(quotaInfo.totalBytes, numBytes);
    if (!quotaCheck.allowed) {
      return NextResponse.json({ error: quotaCheck.message }, { status: 400 });
    }

    // 4. Resolve subject slug
    const supabase = createAdminClient();
    let resolvedSubjectId = subjectId || null;
    let subjectSlug = "general";

    if (newSubjectName && typeof newSubjectName === "string" && newSubjectName.trim()) {
      const cleanName = newSubjectName.trim();
      const slug = slugify(cleanName);

      const { data: createdSubject, error: createErr } = await supabase
        .from("subjects")
        .insert({ name: cleanName, slug })
        .select()
        .single();

      if (!createErr && createdSubject) {
        resolvedSubjectId = createdSubject.id;
        subjectSlug = createdSubject.slug;
      } else {
        // Find existing subject if duplicate name
        const { data: existing } = await supabase
          .from("subjects")
          .select()
          .eq("slug", slug)
          .single();
        if (existing) {
          resolvedSubjectId = existing.id;
          subjectSlug = existing.slug;
        }
      }
    } else if (subjectId) {
      const { data: subjectData } = await supabase
        .from("subjects")
        .select("slug")
        .eq("id", subjectId)
        .single();

      if (subjectData) {
        subjectSlug = subjectData.slug;
      }
    }

    // 5. Generate unique fileId and object key: {subject_slug}/{uuid}-{sanitized_original_name}
    const fileId = uuidv4();
    const cleanFileName = sanitizeFilename(fileName);
    const storageKey = `${subjectSlug}/${fileId}-${cleanFileName}`;

    // 6. Generate presigned upload URLs via StorageProvider (Backblaze B2 by default)
    const provider = getStorageProvider();
    const uploadResult = await provider.createUpload({
      key: storageKey,
      contentType: mimeType || "application/octet-stream",
      sizeBytes: numBytes,
      partSize: MULTIPART_PART_SIZE_BYTES,
    });

    return NextResponse.json({
      fileId,
      storageKey,
      storageProvider: provider.name,
      subjectId: resolvedSubjectId,
      ...uploadResult,
    });
  } catch (error: unknown) {
    console.error("Error in /api/upload/init:", error);
    const message = error instanceof Error ? error.message : "Failed to initialize upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
