"use client";

import { useState } from "react";
import { useNotes } from "@/lib/notes/useNotes";
import type { Note } from "@/lib/notes/types";
import { NoteInput } from "@/components/notes/NoteInput";
import { NoteCard } from "@/components/notes/NoteCard";
import { NoteModal } from "@/components/notes/NoteModal";
import { NoteSkeleton } from "@/components/notes/NoteSkeleton";
import { EmptyNotes } from "@/components/notes/EmptyNotes";
import styles from "@/components/notes/notes.module.css";

export default function NotesBoardPage() {
  const { notes, loading, addNote, updateNote, deleteNote } = useNotes();
  const [activeNote, setActiveNote] = useState<Note | null>(null);

  const handleCardClick = (note: Note) => {
    setActiveNote(note);
  };

  const handleModalClose = () => {
    setActiveNote(null);
  };

  const handleUpdate = async (id: string, content: string): Promise<boolean> => {
    const success = await updateNote(id, content);
    if (success) {
      // Update active note in modal if open
      setActiveNote((prev) => (prev && prev.id === id ? { ...prev, content, updated_at: new Date().toISOString() } : prev));
    }
    return success;
  };

  const handleDelete = (id: string) => {
    deleteNote(id);
    if (activeNote && activeNote.id === id) {
      setActiveNote(null);
    }
  };

  return (
    <div className={styles.boardContainer}>
      {/* Header */}
      <section className={styles.boardHeader}>
        <span className={styles.boardEyebrow}>Open Notes</span>
        <h1 className={styles.boardTitle}>Notes Board</h1>
        <p className={styles.boardSubtitle}>
          Type or paste anything to share instantly. No login required.
        </p>
      </section>

      {/* Input Form at Top */}
      <NoteInput onSave={addNote} />

      {/* Board Layout */}
      <section id="notes-board-list" aria-label="Notes board">
        {loading ? (
          <NoteSkeleton />
        ) : notes.length === 0 ? (
          <EmptyNotes />
        ) : (
          <div className={styles.masonryGrid}>
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onClick={handleCardClick}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </section>

      {/* Full View / Edit Modal */}
      <NoteModal
        note={activeNote}
        onClose={handleModalClose}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
    </div>
  );
}
