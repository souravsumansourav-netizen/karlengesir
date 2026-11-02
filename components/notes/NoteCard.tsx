"use client";

import { useState, MouseEvent } from "react";
import type { Note } from "@/lib/notes/types";
import { copyTextToClipboard } from "@/lib/notes/clipboard";
import toast from "react-hot-toast";
import styles from "./notes.module.css";

interface NoteCardProps {
  note: Note;
  onClick: (note: Note) => void;
  onDelete: (id: string) => void;
}

function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return "";
  }
}

export function NoteCard({ note, onClick, onDelete }: NoteCardProps) {
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleCopy = async (e: MouseEvent) => {
    e.stopPropagation();
    // Copy the ENTIRE note text, never the preview
    const success = await copyTextToClipboard(note.content);
    if (success) {
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy note");
    }
  };

  const handleDeleteClick = (e: MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(true);
  };

  const handleCancelDelete = (e: MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  };

  const handleConfirmDelete = (e: MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
    onDelete(note.id);
  };

  return (
    <article
      className={styles.card}
      onClick={() => onClick(note)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(note);
        }
      }}
      aria-label="View full note"
    >
      {/* Clipped visually with CSS only, never by cutting the data in memory/DOM */}
      <div className={styles.cardPreview}>{note.content}</div>

      <div className={styles.cardFooter}>
        <span
          className={styles.timestamp}
          title={new Date(note.updated_at).toLocaleString()}
        >
          {formatDate(note.updated_at)}
        </span>

        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleCopy}
            title="Copy full note"
            aria-label="Copy full note"
          >
            {copied ? "✓ Copied" : "📋 Copy"}
          </button>

          {confirmDelete ? (
            <div className={styles.confirmDeleteWrap} onClick={(e) => e.stopPropagation()}>
              <span className={styles.confirmText}>Delete?</span>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                onClick={handleConfirmDelete}
                title="Confirm deletion"
              >
                Yes
              </button>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={handleCancelDelete}
                title="Cancel deletion"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
              onClick={handleDeleteClick}
              title="Delete note"
              aria-label="Delete note"
            >
              🗑️
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
