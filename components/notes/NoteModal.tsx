"use client";

import { useState, useEffect, KeyboardEvent } from "react";
import type { Note } from "@/lib/notes/types";
import { copyTextToClipboard } from "@/lib/notes/clipboard";
import toast from "react-hot-toast";
import styles from "./notes.module.css";

interface NoteModalProps {
  note: Note | null;
  onClose: () => void;
  onUpdate: (id: string, content: string) => Promise<boolean>;
  onDelete: (id: string) => void;
}

export function NoteModal({
  note,
  onClose,
  onUpdate,
  onDelete,
}: NoteModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync state when active note changes
  useEffect(() => {
    if (note) {
      setEditedContent(note.content);
      setIsEditing(false);
      setConfirmDelete(false);
      setCopied(false);
    }
  }, [note]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isEditing) {
          setIsEditing(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditing, onClose]);

  if (!note) return null;

  const handleCopyAll = async () => {
    const textToCopy = isEditing ? editedContent : note.content;
    const success = await copyTextToClipboard(textToCopy);
    if (success) {
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy text");
    }
  };

  const handleStartEdit = () => {
    setEditedContent(note.content);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditedContent(note.content);
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    // Disabled when empty or whitespace-only
    if (!editedContent.trim()) {
      toast.error("Note content cannot be empty");
      return;
    }

    // Saving unchanged text does not change updated_at (per requirement)
    if (editedContent === note.content) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    const success = await onUpdate(note.id, editedContent);
    setIsSaving(false);

    if (success) {
      setIsEditing(false);
    }
  };

  const handleDelete = () => {
    onDelete(note.id);
    onClose();
  };

  return (
    <div
      className={styles.modalOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Note details"
    >
      <div className={styles.modalPanel}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalMeta}>
            <span className={styles.modalDate}>
              Updated: {new Date(note.updated_at).toLocaleString()}
            </span>
          </div>

          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {isEditing ? (
            <textarea
              className={styles.editTextarea}
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              disabled={isSaving}
              autoFocus
              placeholder="Edit note..."
              onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleSaveEdit();
                }
              }}
            />
          ) : (
            /* Plain text rendering only, whitespace preserved, word-break handled */
            <div className={styles.fullText}>{note.content}</div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter}>
          <div className={styles.modalActionsLeft}>
            {isEditing ? (
              <>
                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={handleSaveEdit}
                  disabled={!editedContent.trim() || isSaving}
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={handleCopyAll}
                  aria-label="Copy all text"
                >
                  {copied ? "✓ Copied" : "📋 Copy all"}
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={handleStartEdit}
                  aria-label="Edit note"
                >
                  ✏️ Edit
                </button>

                {confirmDelete ? (
                  <div className={styles.confirmDeleteWrap}>
                    <span className={styles.confirmText}>Confirm delete?</span>
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                      onClick={handleDelete}
                    >
                      Yes, Delete
                    </button>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                    onClick={() => setConfirmDelete(true)}
                    aria-label="Delete note"
                  >
                    🗑️ Delete
                  </button>
                )}
              </>
            )}
          </div>

          <div className={styles.modalActionsRight}>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
