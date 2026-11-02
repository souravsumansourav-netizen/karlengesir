import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { getAllNotes, createNote } from "@/lib/notes/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/notes
 * Returns the list of notes ordered by updated_at descending.
 */
export async function GET() {
  try {
    const notes = await getAllNotes();
    return NextResponse.json({ notes });
  } catch (error: unknown) {
    console.error("Error in GET /api/notes:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch notes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/notes
 * Creates a new note with exact content preserved (no trimming).
 * Reuses existing rate limiter.
 * Supports notes up to 10 MB+.
 */
export async function POST(request: NextRequest) {
  // 1. IP Rate Limiting
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

  // 2. Parse payload
  let body: unknown;
  try {
    body = await request.json();
  } catch (err) {
    console.error("Error parsing JSON body in POST /api/notes:", err);
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
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

  // 3. Save note EXACTLY as entered (preserving all newlines, spaces, tabs, special characters)
  try {
    const note = await createNote(content);
    return NextResponse.json({ note }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error in POST /api/notes:", error);
    const message = error instanceof Error ? error.message : "Failed to create note";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
