import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { getNoteById, updateNote, deleteNote } from "@/lib/notes/service";
import { NOTES_DELETE_POLICY } from "@/lib/notes/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/notes/[id]
 * Fetch a single note by ID.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Missing note id" }, { status: 400 });
    }

    const note = await getNoteById(id);
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json(
      { note },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error: unknown) {
    console.error("Error in GET /api/notes/[id]:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch note";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/notes/[id]
 * Updates a note's content and sets updated_at to now.
 * Reuses existing rate limiter.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Missing note id" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Request body must be an object" },
        { status: 400 }
      );
    }

    const { content } = body as { content?: unknown };

    if (typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Note content cannot be empty or whitespace only" },
        { status: 400 }
      );
    }

    const updated = await updateNote(id, content);
    return NextResponse.json({ note: updated });
  } catch (error: unknown) {
    console.error("Error in PATCH /api/notes/[id]:", error);
    const message = error instanceof Error ? error.message : "Failed to update note";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/notes/[id]
 * Deletes a note according to NOTES_DELETE_POLICY.
 * Reuses existing rate limiter.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Missing note id" }, { status: 400 });
    }

    // Policy check structured so rules can be tightened later by changing NOTES_DELETE_POLICY in config.ts
    switch (NOTES_DELETE_POLICY) {
      case "anyone":
        // Allowed for all callers (no authentication or ownership check required)
        break;

      case "admin_only": {
        // Structured for future admin-only enforcement:
        // Check session/JWT and verify admin role
        return NextResponse.json(
          { error: "Forbidden: Only administrators may delete notes." },
          { status: 403 }
        );
      }

      case "owner_or_admin": {
        // Structured for future owner-or-admin enforcement:
        // Check session/JWT and verify note ownership or admin role
        return NextResponse.json(
          { error: "Forbidden: You do not have permission to delete this note." },
          { status: 403 }
        );
      }

      default:
        return NextResponse.json(
          { error: "Unsupported deletion policy configuration" },
          { status: 500 }
        );
    }

    await deleteNote(id);
    return NextResponse.json({ success: true, id });
  } catch (error: unknown) {
    console.error("Error in DELETE /api/notes/[id]:", error);
    const message = error instanceof Error ? error.message : "Failed to delete note";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
