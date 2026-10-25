import { NextRequest, NextResponse } from "next/server";
import { getStorageProvider } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANON_UPLOADER_DEFAULT } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      fileId,
      storageKey,
      storageProvider,
      fileName,
      sizeBytes,
      mimeType,
      subjectId,
      uploaderName,
      description,
      mode,
      uploadId,
      parts,
    } = body;

    if (!fileId || !storageKey || !fileName || sizeBytes === undefined) {
      return NextResponse.json(
        { error: "Missing required fields (fileId, storageKey, fileName, sizeBytes)" },
        { status: 400 }
      );
    }

    const provider = getStorageProvider(storageProvider);

    // If multipart upload, call CompleteMultipartUpload with the part list
    if (mode === "multipart") {
      if (!uploadId || !Array.isArray(parts) || parts.length === 0) {
        return NextResponse.json(
          { error: "Multipart completion requires uploadId and non-empty parts list" },
          { status: 400 }
        );
      }

      await provider.completeUpload({
        key: storageKey,
        uploadId,
        parts: parts.map((p: { partNumber: number; etag: string }) => ({
          partNumber: Number(p.partNumber),
          etag: String(p.etag),
        })),
      });
    }

    // Insert metadata row into Supabase Postgres
    const supabase = createAdminClient();

    let insertedFile = null;
    let dbError = null;

    // Try modern schema (storage_key & storage_provider)
    const primaryInsert = await supabase
      .from("files")
      .insert({
        id: fileId,
        subject_id: subjectId || null,
        file_name: fileName,
        storage_key: storageKey,
        storage_provider: provider.name,
        mime_type: mimeType || null,
        size_bytes: Number(sizeBytes),
        description: description?.trim() || null,
        uploader_name: uploaderName?.trim() || ANON_UPLOADER_DEFAULT,
        download_count: 0,
      })
      .select()
      .single();

    if (primaryInsert.error) {
      // If storage_key or storage_provider column is not yet migrated in Supabase, fall back to storage_path
      if (
        primaryInsert.error.code === "PGRST204" ||
        primaryInsert.error.message?.includes("storage_key") ||
        primaryInsert.error.message?.includes("storage_provider")
      ) {
        console.log("Falling back to legacy storage_path column in files table...");
        const fallbackInsert = await supabase
          .from("files")
          .insert({
            id: fileId,
            subject_id: subjectId || null,
            file_name: fileName,
            storage_path: storageKey,
            mime_type: mimeType || null,
            size_bytes: Number(sizeBytes),
            description: description?.trim() || null,
            uploader_name: uploaderName?.trim() || ANON_UPLOADER_DEFAULT,
            download_count: 0,
          })
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
      console.error("DB error saving file record:", dbError);
      return NextResponse.json(
        { error: `Database error: ${dbError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      file: insertedFile,
    });
  } catch (error: unknown) {
    console.error("Error in /api/upload/complete:", error);
    const message = error instanceof Error ? error.message : "Failed to complete upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
