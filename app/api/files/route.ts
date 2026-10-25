import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid ids array" },
        { status: 400 }
      );
    }

    // 1. Verify Supabase session server-side
    const serverSupabase = await createServerSupabase();
    const authHeader = request.headers.get("authorization");
    let user = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "").trim();
      const { data } = await serverSupabase.auth.getUser(token);
      user = data.user;
    }

    if (!user) {
      const { data } = await serverSupabase.auth.getUser();
      user = data.user;
    }

    if (!user) {
      return NextResponse.json(
        { error: "Forbidden: You must be signed in as an admin to delete files." },
        { status: 403 }
      );
    }

    // 2. Confirm user exists in admins table
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

    // 3. Retrieve the target file rows
    let filesToDelete = null;
    const { data: serverFiles, error: fetchErr } = await serverSupabase
      .from("files")
      .select("*")
      .in("id", ids);

    if (serverFiles && serverFiles.length > 0) {
      filesToDelete = serverFiles;
    } else {
      try {
        const adminSupabase = createAdminClient();
        const { data: fallbackFiles } = await adminSupabase
          .from("files")
          .select("*")
          .in("id", ids);
        filesToDelete = fallbackFiles;
      } catch {
        // Fallback failed
      }
    }

    if (fetchErr && !filesToDelete) {
      return NextResponse.json(
        { error: `Failed to fetch files: ${fetchErr.message}` },
        { status: 500 }
      );
    }

    if (!filesToDelete || filesToDelete.length === 0) {
      return NextResponse.json(
        { message: "No matching files found to delete." },
        { status: 200 }
      );
    }

    // 4. Delete objects from Backblaze B2
    for (const file of filesToDelete) {
      try {
        const storageKey = file.storage_key || file.storage_path || "";
        const storageProvider = file.storage_provider || "b2";
        const provider = getStorageProvider(storageProvider);
        if (storageKey) await provider.deleteObject(storageKey);
      } catch (storageErr) {
        console.warn(`Could not delete storage key:`, storageErr);
      }
    }

    // 5. Delete database rows
    const { error: dbDeleteErr } = await serverSupabase
      .from("files")
      .delete()
      .in("id", ids);

    if (dbDeleteErr) {
      try {
        const adminSupabase = createAdminClient();
        const { error: fallbackDeleteErr } = await adminSupabase
          .from("files")
          .delete()
          .in("id", ids);

        if (fallbackDeleteErr) {
          return NextResponse.json(
            { error: `Database delete error: ${fallbackDeleteErr.message || dbDeleteErr.message}` },
            { status: 500 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: `Database delete error: ${dbDeleteErr.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      deletedCount: filesToDelete.length,
      message: `Successfully deleted ${filesToDelete.length} file(s).`,
    });
  } catch (error: unknown) {
    console.error("Error in bulk DELETE /api/files:", error);
    const message = error instanceof Error ? error.message : "Bulk delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
