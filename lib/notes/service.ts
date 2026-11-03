import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Note } from "./types";
import * as fs from "fs";
import * as path from "path";

// Path to any local legacy fallback notes (used during initial development or migration)
const FALLBACK_DIR = path.resolve(process.cwd(), ".next", "cache");
const FALLBACK_FILE = path.join(FALLBACK_DIR, "notes-fallback.json");

function loadFallbackNotes(): Note[] {
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const data = fs.readFileSync(FALLBACK_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn("[Notes Service] Could not read fallback notes file:", err);
  }
  return [];
}

function clearFallbackNotes(): void {
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      fs.unlinkSync(FALLBACK_FILE);
    }
  } catch (err) {
    console.warn("[Notes Service] Could not remove fallback notes file:", err);
  }
}

let _adminClient: SupabaseClient | null = null;

export function getNotesAdminClient(): SupabaseClient {
  if (!_adminClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
    }
    if (!serviceRoleKey) {
      throw new Error(
        "Missing Supabase API key (SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)"
      );
    }

    _adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return _adminClient;
}

function formatSupabaseError(error: { code?: string; message?: string }): string {
  if (error.code === "42501" || error.message?.includes("row-level security")) {
    return (
      "Supabase Row-Level Security blocked this operation. " +
      "Please run the updated SQL policies in supabase/notes.sql in your Supabase SQL Editor."
    );
  }
  if (error.code === "PGRST205") {
    return (
      "Table 'notes' does not exist in Supabase schema cache. " +
      "Please run supabase/notes.sql in your Supabase SQL Editor."
    );
  }
  return error.message || "Unknown database error";
}

/**
 * Attempts to push any cached legacy fallback notes into Supabase.
 */
async function migrateFallbackNotesIfAny(supabase: SupabaseClient): Promise<void> {
  const fallbackNotes = loadFallbackNotes();
  if (!fallbackNotes || fallbackNotes.length === 0) return;

  try {
    for (const note of fallbackNotes) {
      await supabase.from("notes").upsert({
        id: note.id,
        content: note.content,
        created_at: note.created_at,
        updated_at: note.updated_at,
      });
    }
    clearFallbackNotes();
    console.log("[Notes Service] Successfully migrated local fallback notes into Supabase.");
  } catch {
    // If Supabase write policies are not yet enabled, retain fallback file for future migration
  }
}

/**
 * Retrieve all notes ordered by updated_at descending (newest first).
 */
export async function getAllNotes(): Promise<Note[]> {
  const supabase = getNotesAdminClient();

  // Try migrating any leftover fallback notes
  await migrateFallbackNotesIfAny(supabase);

  const { data, error } = await supabase
    .from("notes")
    .select("id, content, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    if (error.code === "PGRST205") {
      const fallback = loadFallbackNotes();
      return fallback.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    }
    throw new Error(formatSupabaseError(error));
  }

  const notes = (data as Note[]) || [];

  // If Supabase has no records yet, surface any legacy cached notes so nothing is lost
  if (notes.length === 0) {
    const fallback = loadFallbackNotes();
    if (fallback.length > 0) {
      return fallback.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    }
  }

  return notes;
}

/**
 * Retrieve a single note by ID.
 */
export async function getNoteById(id: string): Promise<Note | null> {
  const supabase = getNotesAdminClient();
  const { data, error } = await supabase
    .from("notes")
    .select("id, content, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  if (!data) {
    const fallback = loadFallbackNotes();
    return fallback.find((n) => n.id === id) || null;
  }

  return (data as Note) || null;
}

/**
 * Create a new note with exact content preserved.
 */
export async function createNote(content: string): Promise<Note> {
  const supabase = getNotesAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("notes")
    .insert({
      content,
      created_at: now,
      updated_at: now,
    })
    .select("id, content, created_at, updated_at")
    .single();

  if (error) {
    console.error("[Notes Service] Supabase createNote error:", error);
    throw new Error(formatSupabaseError(error));
  }

  return data as Note;
}

/**
 * Update an existing note's content and set updated_at to now.
 */
export async function updateNote(id: string, content: string): Promise<Note> {
  const supabase = getNotesAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("notes")
    .update({
      content,
      updated_at: now,
    })
    .eq("id", id)
    .select("id, content, created_at, updated_at")
    .single();

  if (error) {
    console.error("[Notes Service] Supabase updateNote error:", error);
    throw new Error(formatSupabaseError(error));
  }

  return data as Note;
}

/**
 * Delete a note by ID.
 */
export async function deleteNote(id: string): Promise<boolean> {
  const supabase = getNotesAdminClient();
  const { error } = await supabase.from("notes").delete().eq("id", id);

  if (error) {
    console.error("[Notes Service] Supabase deleteNote error:", error);
    throw new Error(formatSupabaseError(error));
  }

  return true;
}
