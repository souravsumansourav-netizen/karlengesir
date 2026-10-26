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

    // 3. If proxy download is requested or provider supports streaming fallback, stream directly
    const storageKey = file.storage_key || file.storage_path || "";
    const storageProvider = file.storage_provider || "b2";
    const provider = getStorageProvider(storageProvider);

    if (_request.nextUrl.searchParams.get("proxy") === "true" && provider.getObjectStream) {
      const { stream, contentType, contentLength } = await provider.getObjectStream({ key: storageKey });
      const { formatContentDisposition } = await import("@/lib/utils");
      return new Response(stream as BodyInit, {
        headers: {
          "Content-Type": contentType || "application/octet-stream",
          "Content-Disposition": formatContentDisposition("attachment", file.file_name),
          ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
        },
      });
    }

    // 4. Generate presigned GET download URL with Content-Disposition = attachment
    const downloadUrl = await provider.getDownloadUrl({
      key: storageKey,
      originalFilename: file.file_name,
      expiresInSeconds: 300, // 5 minutes expiry
    });

    // 5. Redirect client to presigned download URL
    return NextResponse.redirect(downloadUrl, { status: 302 });
  } catch (error: unknown) {
    console.error("Error in /api/download/[id]:", error);
    const message = error instanceof Error ? error.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
