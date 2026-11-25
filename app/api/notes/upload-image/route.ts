import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_NOTE_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

/**
 * POST /api/notes/upload-image
 * Uploads an optimized note image to object storage under `notes-images/`
 * and returns a cacheable relative URL (`/api/notes/image/...`).
 */
export async function POST(request: NextRequest) {
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1";

  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.success) {
    return NextResponse.json(
      {
        error: `Too many requests. Please wait ${rateLimit.reset} seconds before trying again.`,
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
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Missing image file in form data" },
        { status: 400 }
      );
    }

    const mimeType = file.type || "image/jpeg";
    if (!mimeType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image files are allowed" },
        { status: 400 }
      );
    }

    if (file.size === 0 || file.size > MAX_NOTE_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Image must be between 1 byte and 10 MB" },
        { status: 400 }
      );
    }

    const ext = MIME_TO_EXT[mimeType.toLowerCase()] || "jpg";
    const key = `notes-images/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const provider = getStorageProvider();
    if (!provider.uploadDirect) {
      return NextResponse.json(
        { error: "Direct upload is not supported by the active storage provider" },
        { status: 501 }
      );
    }

    const body = new Uint8Array(await file.arrayBuffer());
    await provider.uploadDirect({
      key,
      body,
      contentType: mimeType,
    });

    return NextResponse.json(
      {
        url: `/api/notes/image/${key}`,
        key,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Error in POST /api/notes/upload-image:", error);
    const message =
      error instanceof Error ? error.message : "Failed to upload note image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

