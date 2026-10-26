import { NextRequest, NextResponse } from "next/server";
import { getStorageProvider, B2Provider } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const chunk = formData.get("chunk") as Blob | null;
    const key = formData.get("key") as string | null;
    const uploadId = formData.get("uploadId") as string | null;
    const partNumber = Number(formData.get("partNumber"));
    const storageProvider = (formData.get("storageProvider") as string | null) || "b2";

    if (!chunk || !key || !uploadId || !partNumber || isNaN(partNumber)) {
      return NextResponse.json(
        { error: "Missing required fields (chunk, key, uploadId, partNumber)" },
        { status: 400 }
      );
    }

    const provider = getStorageProvider(storageProvider);
    if (!(provider instanceof B2Provider) || !provider.uploadPartDirect) {
      return NextResponse.json(
        { error: "Direct part upload only supported for B2 provider" },
        { status: 400 }
      );
    }

    const arrayBuffer = await chunk.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { etag } = await provider.uploadPartDirect({
      key,
      uploadId,
      partNumber,
      body: buffer,
    });

    return NextResponse.json({
      success: true,
      partNumber,
      etag,
    });
  } catch (error: unknown) {
    console.error("Error in /api/upload/proxy-part:", error);
    const message = error instanceof Error ? error.message : "Proxy part upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
