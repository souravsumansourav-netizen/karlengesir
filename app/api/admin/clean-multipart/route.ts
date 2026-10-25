import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify admin session
    const serverSupabase = await createServerSupabase();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();

    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "").trim();
      const { data } = await serverSupabase.auth.getUser(token);
      if (data.user) user = data.user;
    }

    if (!user) {
      return NextResponse.json(
        { error: "Forbidden: Admin sign-in required." },
        { status: 403 }
      );
    }

    let isAuthorized = false;
    const { data: adminRecord } = await serverSupabase
      .from("admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminRecord) {
      isAuthorized = true;
    } else {
      const { data: rpcAdmin } = await serverSupabase.rpc("is_admin");
      if (rpcAdmin) {
        isAuthorized = true;
      } else {
        try {
          const adminSupabase = createAdminClient();
          const { data: fallbackRecord } = await adminSupabase
            .from("admins")
            .select("user_id")
            .eq("user_id", user.id)
            .maybeSingle();
          if (fallbackRecord) isAuthorized = true;
        } catch {
          // Ignore service role error
        }
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Forbidden: Administrative privileges required." },
        { status: 403 }
      );
    }

    // Optional hours parameter from query string or body (default 24 hours)
    let olderThanHours = 24;
    try {
      const body = await request.json().catch(() => ({}));
      if (body?.olderThanHours) olderThanHours = Number(body.olderThanHours);
    } catch {
      // Use default
    }

    // 2. List stale multipart uploads from Backblaze B2
    const provider = getStorageProvider();
    const staleUploads = await provider.listStaleMultipartUploads(olderThanHours);

    // 3. Abort each stale upload to free up unfinished part storage
    let cleanedCount = 0;
    const errors: string[] = [];

    for (const upload of staleUploads) {
      try {
        await provider.abortUpload({
          key: upload.key,
          uploadId: upload.uploadId,
        });
        cleanedCount++;
      } catch (err: unknown) {
        errors.push(
          `Failed to abort ${upload.key} (${upload.uploadId}): ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    return NextResponse.json({
      success: true,
      foundStaleCount: staleUploads.length,
      cleanedCount,
      errors: errors.length > 0 ? errors : undefined,
      message: `Cleaned up ${cleanedCount} stale multipart upload(s) older than ${olderThanHours} hours.`,
    });
  } catch (error: unknown) {
    console.error("Error in /api/admin/clean-multipart:", error);
    const message = error instanceof Error ? error.message : "Cleanup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
