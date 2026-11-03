"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Note } from "./types";
import toast from "react-hot-toast";

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const notesRef = useRef<Note[]>([]);

  // Keep ref synchronized with state for reliable rollback in closures
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const fetchNotes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/notes", {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch notes (${res.status})`);
      }

      const data = await res.json();
      const fetchedNotes: Note[] = data.notes || [];

      // Ensure newest first (updated_at descending)
      fetchedNotes.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );

      setNotes(fetchedNotes);
    } catch (err: unknown) {
      console.error("[useNotes] Fetch error:", err);
      const msg = err instanceof Error ? err.message : "Failed to load notes";
      setError(msg);
      if (!silent) {
        toast.error(msg);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchNotes(false);
  }, [fetchNotes]);

  // Refresh list when browser tab regains focus or visibility, plus periodic sync for multi-device updates
  useEffect(() => {
    const handleFocus = () => {
      fetchNotes(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchNotes(true);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Multi-device sync: poll every 12s when document is visible
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchNotes(true);
      }
    }, 12000);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
    };
  }, [fetchNotes]);

  // Add note
  const addNote = async (content: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save note");
      }

      const data = await res.json();
      const newNote: Note = data.note;

      // Add to beginning of array (newest first)
      setNotes((prev) => [newNote, ...prev.filter((n) => n.id !== newNote.id)]);
      toast.success("Note saved");
      return true;
    } catch (err: unknown) {
      console.error("[useNotes] Add note error:", err);
      const msg = err instanceof Error ? err.message : "Failed to save note";
      toast.error(msg);
      return false;
    }
  };

  // Update note
  const updateNote = async (id: string, content: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update note");
      }

      const data = await res.json();
      const updatedNote: Note = data.note;

      // Card moves to the top since updated_at is now newest
      setNotes((prev) => [
        updatedNote,
        ...prev.filter((n) => n.id !== updatedNote.id),
      ]);
      toast.success("Note updated");
      return true;
    } catch (err: unknown) {
      console.error("[useNotes] Update note error:", err);
      const msg = err instanceof Error ? err.message : "Failed to update note";
      toast.error(msg);
      return false;
    }
  };

  // Delete note with optimistic update and rollback on failure
  const deleteNote = async (id: string): Promise<boolean> => {
    const previousNotes = [...notesRef.current];

    // Optimistic removal
    setNotes((prev) => prev.filter((n) => n.id !== id));

    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete note");
      }

      toast.success("Note deleted");
      return true;
    } catch (err: unknown) {
      console.error("[useNotes] Delete note error:", err);
      // Roll back
      setNotes(previousNotes);
      const msg = err instanceof Error ? err.message : "Failed to delete note";
      toast.error(msg);
      return false;
    }
  };

  return {
    notes,
    loading,
    error,
    refetch: fetchNotes,
    addNote,
    updateNote,
    deleteNote,
  };
}
