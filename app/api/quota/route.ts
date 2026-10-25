import { NextResponse } from "next/server";
import { getStorageQuotaInfo } from "@/lib/quota";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const quotaInfo = await getStorageQuotaInfo();
    return NextResponse.json(quotaInfo);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch storage quota";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
