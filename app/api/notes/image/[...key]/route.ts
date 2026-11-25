import { NextRequest, NextResponse } from "next/server";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

const IMAGE_CACHE_HEADER = "public, max-age=31536000, immutable";

/**
 * GET /api/notes/image/[...key]
 * Streams note images from object storage with aggressive immutable caching.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ key: string[] }> }
) {
  try {
    const { key: keySegments } = await context.params;
    const key = Array.isArray(keySegments) ? keySegments.join("/") : "";

    if (!key || !key.startsWith("notes-images/") || key.includes("..")) {
      return NextResponse.json({ error: "Invalid image key" }, { status: 400 });
    }

    const provider = getStorageProvider();

    if (provider.getObjectStream) {
      const { stream, contentType, contentLength } =
        await provider.getObjectStream({ key });

      if (stream) {
        return new Response(stream, {
          headers: {
            "Content-Type": contentType || "image/jpeg",
            "Cache-Control": IMAGE_CACHE_HEADER,
            ...(contentLength
              ? { "Content-Length": String(contentLength) }
              : {}),
          },
        });
      }
    }

    const fallbackUrl = await provider.getDownloadUrl({
      key,
      originalFilename: key.split("/").pop() || "image.jpg",
      expiresInSeconds: 3600,
    });

    return NextResponse.redirect(fallbackUrl, { status: 302 });
  } catch (error: unknown) {
    console.error("Error in GET /api/notes/image/[...key]:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load note image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

