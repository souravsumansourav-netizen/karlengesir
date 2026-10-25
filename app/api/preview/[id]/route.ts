import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStorageProvider } from "@/lib/storage";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

    // For Backblaze B2, create an inline presigned GET URL
    const keyId = process.env.B2_KEY_ID;
    const appKey = process.env.B2_APPLICATION_KEY;
    const bucket = process.env.B2_BUCKET;
    let endpoint = process.env.B2_ENDPOINT || "s3.us-west-004.backblazeb2.com";
    const region = process.env.B2_REGION || "us-west-004";

    if (storageProvider === "b2" && keyId && appKey && bucket) {
      if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
        endpoint = `https://${endpoint}`;
      }

      const s3 = new S3Client({
        endpoint,
        region,
        forcePathStyle: true,
        credentials: {
          accessKeyId: keyId,
          secretAccessKey: appKey,
        },
      });

      const cleanName = file.file_name.replace(/["\r\n]/g, "");
      const encodedName = encodeURIComponent(cleanName);

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        ResponseContentType: file.mime_type || "application/octet-stream",
        ResponseContentDisposition: `inline; filename="${cleanName}"; filename*=UTF-8''${encodedName}`,
      });

      const inlineUrl = await getSignedUrl(s3, command, { expiresIn: 600 }); // 10 min preview
      return NextResponse.redirect(inlineUrl, { status: 302 });
    }

    // Fallback to standard provider download url
    const provider = getStorageProvider(storageProvider);
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
