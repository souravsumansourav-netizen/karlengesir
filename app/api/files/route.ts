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
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Forbidden: You must be signed in as an admin to delete files." },
        { status: 403 }
      );
    }

    // 2. Confirm user exists in admins table
    const adminSupabase = createAdminClient();
    const { data: adminRecord, error: adminCheckErr } = await adminSupabase
      .from("admins")
      .select("user_id")
      .eq("user_id", user.id)
      .single();

    if (adminCheckErr || !adminRecord) {
      return NextResponse.json(
        { error: "Forbidden: Administrative privileges required." },
        { status: 403 }
      );
    }

    // 3. Retrieve the target file rows
    const { data: filesToDelete, error: fetchErr } = await adminSupabase
      .from("files")
      .select("*")
      .in("id", ids);

    if (fetchErr) {
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
        const provider = getStorageProvider(file.storage_provider);
        await provider.deleteObject(file.storage_key);
      } catch (storageErr) {
        console.warn(`Could not delete storage key ${file.storage_key}:`, storageErr);
      }
    }

    // 5. Delete database rows
    const { error: dbDeleteErr } = await adminSupabase
      .from("files")
      .delete()
      .in("id", ids);

    if (dbDeleteErr) {
      return NextResponse.json(
        { error: `Database delete error: ${dbDeleteErr.message}` },
        { status: 500 }
      );
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
