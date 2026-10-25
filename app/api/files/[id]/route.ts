import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Missing file id" }, { status: 400 });
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

    // 3. Retrieve the target file row
    const { data: file, error: fetchErr } = await adminSupabase
      .from("files")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // 4. Delete the object from Backblaze B2
    const storageKey = file.storage_key || file.storage_path || "";
    const storageProvider = file.storage_provider || "b2";
    const provider = getStorageProvider(storageProvider);
    try {
      if (storageKey) await provider.deleteObject(storageKey);
    } catch (storageErr) {
      console.warn("Could not delete object from storage:", storageErr);
      // Proceed to delete DB record even if storage deletion returned not found
    }

    // 5. Delete the database row
    const { error: dbDeleteErr } = await adminSupabase
      .from("files")
      .delete()
      .eq("id", id);

    if (dbDeleteErr) {
      return NextResponse.json(
        { error: `Failed to delete file record: ${dbDeleteErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `File "${file.file_name}" successfully deleted from storage and database.`,
    });
  } catch (error: unknown) {
    console.error("Error in DELETE /api/files/[id]:", error);
    const message = error instanceof Error ? error.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
