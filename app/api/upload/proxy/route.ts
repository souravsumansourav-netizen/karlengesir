import { NextRequest, NextResponse } from "next/server";
import { getStorageProvider, B2Provider } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANON_UPLOADER_DEFAULT, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from "@/lib/constants";
import { formatBytes } from "@/lib/utils";
import type { Database } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const fileId = formData.get("fileId") as string | null;
    const storageKey = formData.get("storageKey") as string | null;
    const storageProvider = (formData.get("storageProvider") as string | null) || "b2";
    const fileName = (formData.get("fileName") as string | null) || file?.name;
    const sizeBytes = formData.get("sizeBytes") ? Number(formData.get("sizeBytes")) : file?.size;
    const mimeType = (formData.get("mimeType") as string | null) || file?.type || "application/octet-stream";
    const subjectId = (formData.get("subjectId") as string | null) || null;
    const uploaderName = (formData.get("uploaderName") as string | null) || ANON_UPLOADER_DEFAULT;
    const description = (formData.get("description") as string | null) || null;

    if (!file || !fileId || !storageKey || !fileName) {
      return NextResponse.json(
        { error: "Missing required fields (file, fileId, storageKey, fileName)" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `File exceeds maximum allowed size of ${formatBytes(MAX_FILE_SIZE_BYTES)} (${MAX_FILE_SIZE_MB} MB)`,
        },
        { status: 400 }
      );
    }

    // 1. Convert file Blob to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Direct upload to Backblaze B2 via server S3 client
    const provider = getStorageProvider(storageProvider);
    if (provider instanceof B2Provider && provider.uploadDirect) {
      await provider.uploadDirect({
        key: storageKey,
        body: buffer,
        contentType: mimeType,
      });
    } else {
      return NextResponse.json(
        { error: "Direct server upload only supported for B2 provider" },
        { status: 400 }
      );
    }

    // 3. Insert record into Supabase (same resilient logic as /api/upload/complete)
    const supabase = createAdminClient();
    const primaryPayload: Record<string, string | number | null | undefined> = {
      id: fileId,
      subject_id: subjectId || null,
      file_name: fileName,
      storage_key: storageKey,
      storage_path: storageKey,
      storage_provider: provider.name,
      mime_type: mimeType || null,
      size_bytes: Number(sizeBytes || file.size),
      description: description?.trim() || null,
      uploader_name: uploaderName?.trim() || ANON_UPLOADER_DEFAULT,
      download_count: 0,
    };

    let insertedFile = null;
    let dbError = null;

    const primaryInsert = await supabase
      .from("files")
      .insert(primaryPayload as unknown as Database["public"]["Tables"]["files"]["Insert"])
      .select()
      .single();

    if (primaryInsert.error) {
      if (
        primaryInsert.error.code === "PGRST204" ||
        primaryInsert.error.message?.includes("storage_key") ||
        primaryInsert.error.message?.includes("storage_provider") ||
        primaryInsert.error.message?.includes("storage_path")
      ) {
        const adaptedPayload = { ...primaryPayload };
        if (primaryInsert.error.message?.includes("storage_key")) delete adaptedPayload.storage_key;
        if (primaryInsert.error.message?.includes("storage_provider")) delete adaptedPayload.storage_provider;
        if (primaryInsert.error.message?.includes("storage_path")) delete adaptedPayload.storage_path;

        const fallbackInsert = await supabase
          .from("files")
          .insert(adaptedPayload as unknown as Database["public"]["Tables"]["files"]["Insert"])
          .select()
          .single();

        insertedFile = fallbackInsert.data;
        dbError = fallbackInsert.error;
      } else {
        dbError = primaryInsert.error;
      }
    } else {
      insertedFile = primaryInsert.data;
    }

    if (dbError) {
      console.error("DB error saving file record in proxy upload:", dbError);
      return NextResponse.json(
        { error: `Database error: ${dbError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      file: insertedFile,
      fallbackUsed: true,
    });
  } catch (error: unknown) {
    console.error("Error in /api/upload/proxy:", error);
    const message = error instanceof Error ? error.message : "Proxy upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
