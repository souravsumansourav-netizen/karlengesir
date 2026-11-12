"use client";

/* eslint-disable @next/next/no-img-element */
import {
  useState,
  useRef,
  useEffect,
  ChangeEvent,
  KeyboardEvent,
  ClipboardEvent,
  DragEvent,
} from "react";
import toast from "react-hot-toast";
import {
  convertHtmlTableToMarkdown,
  convertTsvToMarkdown,
  optimizeImage,
  AttachedImage,
} from "@/lib/notes/formatters";
import styles from "./notes.module.css";

interface NoteInputProps {
  onSave: (content: string) => Promise<boolean>;
  disabled?: boolean;
}

export function NoteInput({ onSave, disabled = false }: NoteInputProps) {
  const [content, setContent] = useState("");
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  /**
   * Helper to insert text at the user's current cursor position in the textarea
   */
  const insertTextAtCursor = (textToInsert: string) => {
    const el = textareaRef.current;
    if (!el) {
      setContent((prev) => (prev ? `${prev}\n\n${textToInsert}` : textToInsert));
      return;
    }

    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const before = content.substring(0, start);
    const after = content.substring(end);

    const padBefore = before && !before.endsWith("\n") ? "\n\n" : "";
    const padAfter = after && !after.startsWith("\n") ? "\n\n" : "";
    const newContent = `${before}${padBefore}${textToInsert}${padAfter}${after}`;

    setContent(newContent);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursor = start + padBefore.length + textToInsert.length;
        textareaRef.current.setSelectionRange(newCursor, newCursor);
      }
    }, 10);
  };

  /**
   * Reads, optimizes, and attaches an image file
   */
  const addImageFiles = async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    for (const file of imageFiles) {
      try {
        const dataUrl = await optimizeImage(file);
        setImages((prev) => [
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

  /**
   * Handles Paste events for both Excel tabular data and images
   */
  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    // 1. Check for image files in clipboard
    const clipboardFiles = Array.from(e.clipboardData?.files || []);
    const imageFiles = clipboardFiles.filter((f) => f.type.startsWith("image/"));

    // Also check clipboard items (e.g. screenshots on Mac/Windows)
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
      await addImageFiles(allImages);
      return;
    }

    // 2. Check for tabular data from HTML (Excel / Google Sheets / web table)
    const html = e.clipboardData?.getData("text/html");
    if (html && html.includes("<table")) {
      const markdownTable = convertHtmlTableToMarkdown(html);
      if (markdownTable) {
        e.preventDefault();
        insertTextAtCursor(markdownTable);
        toast.success("Excel table formatted successfully");
        return;
      }
    }

    // 3. Check for TSV tabular data (tab-separated plain text from Excel or Calc)
    const plainText = e.clipboardData?.getData("text/plain");
    if (plainText && plainText.includes("\t")) {
      const markdownTable = convertTsvToMarkdown(plainText);
      if (markdownTable) {
        e.preventDefault();
        insertTextAtCursor(markdownTable);
        toast.success("Tabular data formatted successfully");
        return;
      }
    }

    // If regular plain text, let browser default paste behavior proceed
  };

  const handleRemoveImage = (indexToRemove: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await addImageFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      await addImageFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleSubmit = async () => {
    // Disabled when both text is empty and no images attached
    const trimmedText = content.trim();
    if ((!trimmedText && images.length === 0) || isSaving || disabled) {
      return;
    }

    // Build final note content (text + markdown image tags)
    let finalContent = content;
    if (images.length > 0) {
      const imagesMarkdown = images
        .map((img) => `![${img.name || "Image"}](${img.dataUrl})`)
        .join("\n\n");

      finalContent = trimmedText
        ? `${content.trimEnd()}\n\n${imagesMarkdown}`
        : imagesMarkdown;
    }

    setIsSaving(true);
    const success = await onSave(finalContent);
    setIsSaving(false);

    if (success) {
      setContent("");
      setImages([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = "120px";
      }
    }
  };

  const isSaveDisabled =
    (!content.trim() && images.length === 0) || isSaving || disabled;

  return (
    <div
      className={`${styles.inputCard} ${isDragging ? styles.inputCardDragging : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <textarea
        ref={textareaRef}
        id="note-input"
        className={styles.noteTextarea}
        placeholder="Type or paste anything (text, Excel tables, images)..."
        value={content}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        disabled={isSaving || disabled}
        rows={4}
      />

      {/* Attached Images Preview Strip */}
      {images.length > 0 && (
        <div className={styles.attachedImagesStrip}>
          {images.map((img, idx) => (
            <div key={img.id || idx} className={styles.attachedImageItem}>
              <img
                src={img.dataUrl}
                alt={img.name}
                className={styles.attachedImageThumb}
              />
              <button
                type="button"
                className={styles.removeImageBtn}
                onClick={() => handleRemoveImage(idx)}
                title="Remove image"
                aria-label="Remove image"
              >
                ✕
              </button>
              <span className={styles.attachedImageName} title={img.name}>
                {img.name}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.inputFooter}>
        <div className={styles.inputStats}>
          {content.length > 0 && (
            <span>
              {content.length.toLocaleString()} characters
              {content.length > 100000 &&
                ` (~${(content.length / 1024 / 1024).toFixed(2)} MB)`}
            </span>
          )}
          {images.length > 0 && (
            <span className={styles.imageCountBadge}>
              📷 {images.length} {images.length === 1 ? "image" : "images"} attached
            </span>
          )}
        </div>

        <div className={styles.inputActions}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={handleFileInputChange}
          />

          <button
            type="button"
            className={styles.attachBtn}
            onClick={() => fileInputRef.current?.click()}
            title="Attach or upload image"
            disabled={isSaving || disabled}
          >
            📷 Add Image
          </button>

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
    </div>
  );
}
