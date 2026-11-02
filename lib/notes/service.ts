import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import type { Note } from "./types";
import * as fs from "fs";
import * as path from "path";

// In-memory / file fallback store used ONLY if the 'notes' table has not yet
// been created in the Supabase schema cache (error code PGRST205).
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

function saveFallbackNotes(notes: Note[]): void {
  try {
    if (!fs.existsSync(FALLBACK_DIR)) {
      fs.mkdirSync(FALLBACK_DIR, { recursive: true });
    }
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(notes, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Notes Service] Could not write fallback notes file:", err);
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
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
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

function isFallbackNeeded(err: unknown): boolean {
  if (err && typeof err === "object") {
    const code = (err as { code?: string }).code;
    const message = (err as { message?: string }).message;
    if (
      code === "PGRST205" ||
      code === "42501" ||
      (message && (message.includes("public.notes") || message.includes("row-level security")))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Retrieve all notes ordered by updated_at descending (newest first).
 */
export async function getAllNotes(): Promise<Note[]> {
  const supabase = getNotesAdminClient();
  const { data, error } = await supabase
    .from("notes")
    .select("id, content, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    if (isFallbackNeeded(error)) {
      console.warn(
        "[Notes Service] 'notes' table not found in Supabase. Using fallback store. Run supabase/notes.sql in Supabase SQL editor."
      );
      const notes = loadFallbackNotes();
      return notes.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    }
    throw new Error(`Failed to fetch notes: ${error.message}`);
  }

  return (data as Note[]) || [];
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
    if (isFallbackNeeded(error)) {
      const notes = loadFallbackNotes();
      return notes.find((n) => n.id === id) || null;
    }
    throw new Error(`Failed to fetch note by id: ${error.message}`);
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
    if (isFallbackNeeded(error)) {
      console.warn(
        "[Notes Service] 'notes' table not found in Supabase. Using fallback store. Run supabase/notes.sql in Supabase SQL editor."
      );
      const newNote: Note = {
        id: uuidv4(),
        content,
        created_at: now,
        updated_at: now,
      };
      const notes = loadFallbackNotes();
      notes.unshift(newNote);
      saveFallbackNotes(notes);
      return newNote;
    }
    throw new Error(`Failed to create note: ${error.message}`);
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
    if (isFallbackNeeded(error)) {
      const notes = loadFallbackNotes();
      const index = notes.findIndex((n) => n.id === id);
      if (index === -1) {
        throw new Error("Note not found");
      }
      const updatedNote: Note = {
        ...notes[index],
        content,
        updated_at: now,
      };
      notes.splice(index, 1);
      notes.unshift(updatedNote);
      saveFallbackNotes(notes);
      return updatedNote;
    }
    throw new Error(`Failed to update note: ${error.message}`);
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
    if (isFallbackNeeded(error)) {
      const notes = loadFallbackNotes();
      const filtered = notes.filter((n) => n.id !== id);
      saveFallbackNotes(filtered);
      return true;
    }
    throw new Error(`Failed to delete note: ${error.message}`);
  }

  return true;
}
