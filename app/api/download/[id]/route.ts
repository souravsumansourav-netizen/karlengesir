import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Missing file id" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Fetch file record from database
    const { data: file, error: fetchErr } = await supabase
      .from("files")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // 2. Increment download count via security definer RPC
    try {
      await supabase.rpc("increment_download_count", { file_id: id });
    } catch (rpcErr) {
      console.warn("Error incrementing download count:", rpcErr);
    }

    // 3. Stream file directly from storage through server
    // This avoids redirecting clients to Backblaze B2, preventing ISP/DNS/adblock blocks
    const storageKey = file.storage_key || file.storage_path || "";
    const storageProvider = file.storage_provider || "b2";
    const provider = getStorageProvider(storageProvider);

    if (provider.getObjectStream) {
      const { stream, contentType, contentLength } = await provider.getObjectStream({ key: storageKey });
      if (stream) {
        const { formatContentDisposition } = await import("@/lib/utils");
        return new Response(stream, {
          headers: {
            "Content-Type": file.mime_type || contentType || "application/octet-stream",
            "Content-Disposition": formatContentDisposition("attachment", file.file_name),
            ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
            "Cache-Control": "private, max-age=3600",
          },
        });
      }
    }

    // 4. Fallback: generate presigned GET download URL if provider is not B2
    const downloadUrl = await provider.getDownloadUrl({
      key: storageKey,
      originalFilename: file.file_name,
      expiresInSeconds: 300, // 5 minutes expiry
    });

    return NextResponse.redirect(downloadUrl, { status: 302 });
  } catch (error: unknown) {
    console.error("Error in /api/download/[id]:", error);
    const message = error instanceof Error ? error.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
