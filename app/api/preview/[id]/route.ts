import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStorageProvider } from "@/lib/storage";
import { formatContentDisposition } from "@/lib/utils";

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
    const { data: file, error: fetchErr } = await supabase
      .from("files")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const storageKey = file.storage_key || file.storage_path || "";
    const storageProvider = file.storage_provider || "b2";

    // 2. Stream preview file directly through server with inline Content-Disposition
    // This avoids redirecting clients to Backblaze B2, preventing ISP/DNS/adblock blocks
    const provider = getStorageProvider(storageProvider);

    if (provider.getObjectStream) {
      const { stream, contentType, contentLength } = await provider.getObjectStream({ key: storageKey });
      if (stream) {
        return new Response(stream, {
          headers: {
            "Content-Type": file.mime_type || contentType || "application/octet-stream",
            "Content-Disposition": formatContentDisposition("inline", file.file_name),
            ...(contentLength ? { "Content-Length": String(contentLength) } : {}),
            "Cache-Control": "private, max-age=600",
          },
        });
      }
    }

    // Fallback to standard provider download url
    const fallbackUrl = await provider.getDownloadUrl({
      key: storageKey,
      originalFilename: file.file_name,
      expiresInSeconds: 600,
    });

    return NextResponse.redirect(fallbackUrl, { status: 302 });
  } catch (error: unknown) {
    console.error("Error in /api/preview/[id]:", error);
    const message = error instanceof Error ? error.message : "Preview generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
