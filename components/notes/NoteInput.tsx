"use client";

import { useState, useRef, useEffect, ChangeEvent, KeyboardEvent } from "react";
import styles from "./notes.module.css";

interface NoteInputProps {
  onSave: (content: string) => Promise<boolean>;
  disabled?: boolean;
}

export function NoteInput({ onSave, disabled = false }: NoteInputProps) {
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea height to match content
  const adjustHeight = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.max(120, el.scrollHeight)}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [content]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl + Enter or Cmd + Enter shortcut to save
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    // Disabled when empty or whitespace-only
    if (!content.trim() || isSaving || disabled) {
      return;
    }

    setIsSaving(true);
    // Preserves text EXACTLY as entered without trimming
    const success = await onSave(content);
    setIsSaving(false);

    if (success) {
      setContent("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "120px";
      }
    }
  };

  const isSaveDisabled = !content.trim() || isSaving || disabled;

  return (
    <div className={styles.inputCard}>
      <textarea
        ref={textareaRef}
        id="note-input"
        className={styles.noteTextarea}
        placeholder="Type or paste here..."
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={isSaving || disabled}
        rows={4}
      />

      <div className={styles.inputFooter}>
        <div className={styles.inputStats}>
          {content.length > 0 && (
            <span>
              {content.length.toLocaleString()} characters
              {content.length > 100000 && ` (~${(content.length / 1024 / 1024).toFixed(2)} MB)`}
            </span>
          )}
        </div>

        <button
          type="button"
          id="save-note-btn"
          className={styles.saveBtn}
          onClick={handleSubmit}
          disabled={isSaveDisabled}
        >
          {isSaving ? "Saving..." : "Save Note"}
        </button>
      </div>
    </div>
  );
}
