"use client";

/* eslint-disable @next/next/no-img-element */
import {
  useState,
  useEffect,
  useRef,
  KeyboardEvent,
  ClipboardEvent,
  ChangeEvent,
} from "react";
import type { Note } from "@/lib/notes/types";
import { copyTextToClipboard } from "@/lib/notes/clipboard";
import {
  extractImagesAndText,
  convertHtmlTableToMarkdown,
  convertTsvToMarkdown,
  optimizeImage,
  AttachedImage,
} from "@/lib/notes/formatters";
import { NoteContent } from "./NoteContent";
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
  const [editedImages, setEditedImages] = useState<AttachedImage[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Sync state when active note changes
  useEffect(() => {
    if (note) {
      const { text, images } = extractImagesAndText(note.content);
      setEditedContent(text);
      setEditedImages(images);
      setIsEditing(false);
      setConfirmDelete(false);
      setCopied(false);
      setZoomedImage(null);
    }
  }, [note]);

  // Handle ESC key to close modal or lightbox
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (zoomedImage) {
          setZoomedImage(null);
        } else if (isEditing) {
          setIsEditing(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditing, onClose, zoomedImage]);

  if (!note) return null;

  const handleCopyAll = async () => {
    const textToCopy = isEditing ? getCombinedEditedContent() : note.content;
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
    const { text, images } = extractImagesAndText(note.content);
    setEditedContent(text);
    setEditedImages(images);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    const { text, images } = extractImagesAndText(note.content);
    setEditedContent(text);
    setEditedImages(images);
    setIsEditing(false);
  };

  const insertTextAtEditCursor = (textToInsert: string) => {
    const el = editTextareaRef.current;
    if (!el) {
      setEditedContent((prev) =>
        prev ? `${prev}\n\n${textToInsert}` : textToInsert
      );
      return;
    }

    const start = el.selectionStart ?? editedContent.length;
    const end = el.selectionEnd ?? editedContent.length;
    const before = editedContent.substring(0, start);
    const after = editedContent.substring(end);

    const padBefore = before && !before.endsWith("\n") ? "\n\n" : "";
    const padAfter = after && !after.startsWith("\n") ? "\n\n" : "";
    const newContent = `${before}${padBefore}${textToInsert}${padAfter}${after}`;

    setEditedContent(newContent);

    setTimeout(() => {
      if (editTextareaRef.current) {
        editTextareaRef.current.focus();
        const newCursor = start + padBefore.length + textToInsert.length;
        editTextareaRef.current.setSelectionRange(newCursor, newCursor);
      }
    }, 10);
  };

  const addEditImages = async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    for (const file of imageFiles) {
      try {
        const dataUrl = await optimizeImage(file);
        setEditedImages((prev) => [
          ...prev,
          {
            id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: file.name || `Pasted Image ${prev.length + 1}`,
            dataUrl,
            size: file.size,
          },
        ]);
        toast.success(`Image attached: ${file.name || "Pasted image"}`);
      } catch (err) {
        console.error("Failed to process image:", err);
        toast.error("Could not process attached image");
      }
    }
  };

  const handleEditPaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardFiles = Array.from(e.clipboardData?.files || []);
    const imageFiles = clipboardFiles.filter((f) => f.type.startsWith("image/"));

    const items = Array.from(e.clipboardData?.items || []);
    const itemImageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file && !imageFiles.some((f) => f.name === file.name && f.size === file.size)) {
          itemImageFiles.push(file);
        }
      }
    }

    const allImages = [...imageFiles, ...itemImageFiles];
    if (allImages.length > 0) {
      e.preventDefault();
      await addEditImages(allImages);
      return;
    }

    const html = e.clipboardData?.getData("text/html");
    if (html && html.includes("<table")) {
      const markdownTable = convertHtmlTableToMarkdown(html);
      if (markdownTable) {
        e.preventDefault();
        insertTextAtEditCursor(markdownTable);
        toast.success("Excel table formatted successfully");
        return;
      }
    }

    const plainText = e.clipboardData?.getData("text/plain");
    if (plainText && plainText.includes("\t")) {
      const markdownTable = convertTsvToMarkdown(plainText);
      if (markdownTable) {
        e.preventDefault();
        insertTextAtEditCursor(markdownTable);
        toast.success("Tabular data formatted successfully");
        return;
      }
    }
  };

  const handleRemoveEditImage = (idxToRemove: number) => {
    setEditedImages((prev) => prev.filter((_, idx) => idx !== idxToRemove));
  };

  const getCombinedEditedContent = () => {
    const trimmedText = editedContent.trim();
    if (editedImages.length === 0) {
      return trimmedText;
    }

    const imagesMarkdown = editedImages
      .map((img) => `![${img.name || "Image"}](${img.dataUrl})`)
      .join("\n\n");

    return trimmedText
      ? `${editedContent.trimEnd()}\n\n${imagesMarkdown}`
      : imagesMarkdown;
  };

  const handleSaveEdit = async () => {
    const finalContent = getCombinedEditedContent();

    // Disabled when both empty
    if (!finalContent.trim()) {
      toast.error("Note content cannot be empty");
      return;
    }

    // Saving unchanged note does not update updated_at
    if (finalContent === note.content) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    const success = await onUpdate(note.id, finalContent);
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
    <>
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
              <div className={styles.editWrap}>
                <textarea
                  ref={editTextareaRef}
                  className={styles.editTextarea}
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  onPaste={handleEditPaste}
                  disabled={isSaving}
                  autoFocus
                  placeholder="Edit note text or paste tables/images..."
                  onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      handleSaveEdit();
                    }
                  }}
                />

                {/* Edit Attached Images */}
                {editedImages.length > 0 && (
                  <div className={styles.attachedImagesStrip}>
                    {editedImages.map((img, idx) => (
                      <div
                        key={img.id || idx}
                        className={styles.attachedImageItem}
                      >
                        <img
                          src={img.dataUrl}
                          alt={img.name}
                          className={styles.attachedImageThumb}
                        />
                        <button
                          type="button"
                          className={styles.removeImageBtn}
                          onClick={() => handleRemoveEditImage(idx)}
                          title="Remove image"
                          aria-label="Remove image"
                        >
                          ✕
                        </button>
                        <span
                          className={styles.attachedImageName}
                          title={img.name}
                        >
                          {img.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Rich view rendering: tables formatted, images rendered, plain text whitespace preserved */
              <div className={styles.modalNoteContent}>
                <NoteContent
                  content={note.content}
                  mode="full"
                  onImageClick={(src) => setZoomedImage(src)}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={styles.modalFooter}>
            <div className={styles.modalActionsLeft}>
              {isEditing ? (
                <>
                  <input
                    ref={editFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                      if (e.target.files && e.target.files.length > 0) {
                        await addEditImages(Array.from(e.target.files));
                        e.target.value = "";
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => editFileInputRef.current?.click()}
                    disabled={isSaving}
                  >
                    📷 Add Image
                  </button>
                  <button
                    type="button"
                    className={styles.saveBtn}
                    onClick={handleSaveEdit}
                    disabled={!getCombinedEditedContent().trim() || isSaving}
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

      {/* Image Zoom Lightbox Overlay */}
      {zoomedImage && (
        <div
          className={styles.lightboxOverlay}
          onClick={() => setZoomedImage(null)}
          role="dialog"
          aria-label="Zoomed image"
        >
          <button
            type="button"
            className={styles.lightboxCloseBtn}
            onClick={() => setZoomedImage(null)}
          >
            ✕
          </button>
          <img
            src={zoomedImage}
            alt="Zoomed view"
            className={styles.lightboxImage}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
