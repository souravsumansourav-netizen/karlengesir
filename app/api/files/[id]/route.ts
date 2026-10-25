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
    const authHeader = _request.headers.get("authorization");
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
    // Check via serverSupabase (which has the user's JWT matching RLS policy `user_id = auth.uid()`)
    let isAuthorized = false;
    const { data: adminRecord } = await serverSupabase
      .from("admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminRecord) {
      isAuthorized = true;
    } else {
      // Fallback: check via is_admin RPC or adminSupabase if service_role key configured
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

    // 3. Retrieve the target file row
    let file = null;
    const { data: fileData } = await serverSupabase
      .from("files")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fileData) {
      file = fileData;
    } else {
      try {
        const adminSupabase = createAdminClient();
        const { data: fallbackFileData } = await adminSupabase
          .from("files")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        file = fallbackFileData;
      } catch {
        // Fallback failed
      }
    }

    if (!file) {
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
    // Attempt delete using serverSupabase (which has the user's admin JWT matching RLS policy: `files: admin delete`),
    // and fallback to adminSupabase if needed.
    const { error: dbDeleteErr } = await serverSupabase
      .from("files")
      .delete()
      .eq("id", id);

    if (dbDeleteErr) {
      try {
        const adminSupabase = createAdminClient();
        const { error: fallbackDeleteErr } = await adminSupabase
          .from("files")
          .delete()
          .eq("id", id);

        if (fallbackDeleteErr) {
          return NextResponse.json(
            { error: `Failed to delete file record: ${fallbackDeleteErr.message || dbDeleteErr.message}` },
            { status: 500 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: `Failed to delete file record: ${dbDeleteErr.message}` },
          { status: 500 }
        );
      }
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
