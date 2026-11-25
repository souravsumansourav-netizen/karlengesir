import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Note } from "./types";
import * as fs from "fs";
import * as path from "path";
import crypto from "crypto";

// Path to local fallback storage (persists notes even if network, DNS, or Supabase is unavailable)
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

function saveFallbackNote(note: Note): void {
  try {
    if (!fs.existsSync(FALLBACK_DIR)) {
      fs.mkdirSync(FALLBACK_DIR, { recursive: true });
    }
    const notes = loadFallbackNotes();
    const existingIndex = notes.findIndex((n) => n.id === note.id);
    if (existingIndex >= 0) {
      notes[existingIndex] = note;
    } else {
      notes.unshift(note);
    }
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(notes, null, 2), "utf-8");
  } catch (err) {
    console.error("[Notes Service] Could not write fallback note:", err);
  }
}

function deleteFallbackNoteFile(id: string): void {
  try {
    const notes = loadFallbackNotes();
    const filtered = notes.filter((n) => n.id !== id);
    if (!fs.existsSync(FALLBACK_DIR)) {
      fs.mkdirSync(FALLBACK_DIR, { recursive: true });
    }
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(filtered, null, 2), "utf-8");
  } catch (err) {
    console.error("[Notes Service] Could not delete fallback note:", err);
  }
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

function isNetworkOrConfigError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("fetch failed") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("PGRST205") ||
    msg.includes("getaddrinfo")
  );
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
    // If Supabase write policies or connection not yet available, retain fallback
  }
}

/**
 * Retrieve all notes ordered by updated_at descending (newest first).
 */
export async function getAllNotes(): Promise<Note[]> {
  try {
    const supabase = getNotesAdminClient();

    // Try migrating any leftover fallback notes
    await migrateFallbackNotesIfAny(supabase).catch(() => {});

    const { data, error } = await supabase
      .from("notes")
      .select("id, content, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      if (isNetworkOrConfigError(error)) {
        console.warn("[Notes Service] Using local fallback notes due to Supabase error:", error.message);
        const fallback = loadFallbackNotes();
        return fallback.sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      }
      throw new Error(formatSupabaseError(error));
    }

    const notes = (data as Note[]) || [];

    // If Supabase has no records yet, surface any cached notes
    if (notes.length === 0) {
      const fallback = loadFallbackNotes();
      if (fallback.length > 0) {
        return fallback.sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      }
    }

    return notes;
  } catch (err: unknown) {
    if (isNetworkOrConfigError(err)) {
      console.warn("[Notes Service] Network issue, returning fallback notes:", err);
      const fallback = loadFallbackNotes();
      return fallback.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    }
    throw err;
  }
}

/**
 * Retrieve a single note by ID.
 */
export async function getNoteById(id: string): Promise<Note | null> {
  try {
    const supabase = getNotesAdminClient();
    const { data, error } = await supabase
      .from("notes")
      .select("id, content, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      if (isNetworkOrConfigError(error)) {
        const fallback = loadFallbackNotes();
        return fallback.find((n) => n.id === id) || null;
      }
      throw new Error(formatSupabaseError(error));
    }

    if (!data) {
      const fallback = loadFallbackNotes();
      return fallback.find((n) => n.id === id) || null;
    }

    return (data as Note) || null;
  } catch (err: unknown) {
    if (isNetworkOrConfigError(err)) {
      const fallback = loadFallbackNotes();
      return fallback.find((n) => n.id === id) || null;
    }
    throw err;
  }
}

/**
 * Create a new note with exact content preserved.
 */
export async function createNote(content: string): Promise<Note> {
  const now = new Date().toISOString();
  const fallbackId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());

  try {
    const supabase = getNotesAdminClient();

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
      if (isNetworkOrConfigError(error)) {
        console.warn("[Notes Service] Saving note to local fallback due to Supabase error:", error.message);
        const fallbackNote: Note = {
          id: fallbackId,
          content,
          created_at: now,
          updated_at: now,
        };
        saveFallbackNote(fallbackNote);
        return fallbackNote;
      }
      throw new Error(formatSupabaseError(error));
    }

    return data as Note;
  } catch (err: unknown) {
    if (isNetworkOrConfigError(err)) {
      console.warn("[Notes Service] Saving note to local fallback storage due to network error:", err);
      const fallbackNote: Note = {
        id: fallbackId,
        content,
        created_at: now,
        updated_at: now,
      };
      saveFallbackNote(fallbackNote);
      return fallbackNote;
    }
    throw err;
  }
}

/**
 * Update an existing note's content and set updated_at to now.
 */
export async function updateNote(id: string, content: string): Promise<Note> {
  const now = new Date().toISOString();

  try {
    const supabase = getNotesAdminClient();

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
      if (isNetworkOrConfigError(error)) {
        const fallbackNote: Note = {
          id,
          content,
          created_at: now,
          updated_at: now,
        };
        saveFallbackNote(fallbackNote);
        return fallbackNote;
      }
      throw new Error(formatSupabaseError(error));
    }

    return data as Note;
  } catch (err: unknown) {
    if (isNetworkOrConfigError(err)) {
      const fallbackNote: Note = {
        id,
        content,
        created_at: now,
        updated_at: now,
      };
      saveFallbackNote(fallbackNote);
      return fallbackNote;
    }
    throw err;
  }
}

/**
 * Delete a note by ID.
 */
export async function deleteNote(id: string): Promise<boolean> {
  try {
    const supabase = getNotesAdminClient();
    const { error } = await supabase.from("notes").delete().eq("id", id);

    if (error) {
      if (isNetworkOrConfigError(error)) {
        deleteFallbackNoteFile(id);
        return true;
      }
      throw new Error(formatSupabaseError(error));
    }

    deleteFallbackNoteFile(id);
    return true;
  } catch (err: unknown) {
    if (isNetworkOrConfigError(err)) {
      deleteFallbackNoteFile(id);
      return true;
    }
    throw err;
  }
}
