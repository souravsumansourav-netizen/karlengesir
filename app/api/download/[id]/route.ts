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

    // 3. Generate presigned GET download URL with Content-Disposition = attachment
    const provider = getStorageProvider(file.storage_provider);
    const downloadUrl = await provider.getDownloadUrl({
      key: file.storage_key,
      originalFilename: file.file_name,
      expiresInSeconds: 300, // 5 minutes expiry
    });

    // 4. Redirect client to presigned download URL
    return NextResponse.redirect(downloadUrl, { status: 302 });
  } catch (error: unknown) {
    console.error("Error in /api/download/[id]:", error);
    const message = error instanceof Error ? error.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
