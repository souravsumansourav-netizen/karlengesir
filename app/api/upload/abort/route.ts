import { NextRequest, NextResponse } from "next/server";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, uploadId, storageProvider } = body;

    if (!key || !uploadId) {
      return NextResponse.json(
        { error: "Missing required fields (key, uploadId)" },
        { status: 400 }
      );
    }

    const provider = getStorageProvider(storageProvider);
    await provider.abortUpload({ key, uploadId });

    return NextResponse.json({
      aborted: true,
      message: "Multipart upload successfully aborted and orphaned chunks deleted.",
    });
  } catch (error: unknown) {
    console.error("Error in /api/upload/abort:", error);
    const message = error instanceof Error ? error.message : "Failed to abort upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
