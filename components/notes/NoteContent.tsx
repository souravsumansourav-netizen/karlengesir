"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo } from "react";
import { parseContentBlocks } from "@/lib/notes/formatters";
import styles from "./notes.module.css";

interface NoteContentProps {
  content: string;
  mode?: "preview" | "full";
  onImageClick?: (src: string, alt?: string) => void;
}

export function NoteContent({
  content,
  mode = "full",
  onImageClick,
}: NoteContentProps) {
  const blocks = useMemo(() => parseContentBlocks(content), [content]);

  // If there are no rich blocks (no tables and no images), render plain text
  const isPureText = blocks.every((b) => b.type === "text");

  if (isPureText) {
    return (
      <div className={mode === "preview" ? styles.cardText : styles.fullText}>
        {content}
      </div>
    );
  }

  return (
    <div className={mode === "preview" ? styles.cardContentWrap : styles.fullContentWrap}>
      {blocks.map((block, idx) => {
        if (block.type === "text") {
          if (!block.text.trim()) return null;
          return (
            <div
              key={idx}
              className={mode === "preview" ? styles.cardText : styles.fullText}
            >
              {block.text}
            </div>
          );
        }

        if (block.type === "table") {
          return (
            <div
              key={idx}
              className={
                mode === "preview"
                  ? styles.cardTableWrapper
                  : styles.tableWrapper
              }
            >
              <table className={styles.noteTable}>
                <thead>
                  <tr>
                    {block.headers.map((h, hIdx) => (
                      <th
                        key={hIdx}
                        style={{ textAlign: block.alignments[hIdx] || "left" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          style={{
                            textAlign: block.alignments[cIdx] || "left",
                          }}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === "image") {
          return (
            <div
              key={idx}
              className={
                mode === "preview"
                  ? styles.cardImageWrapper
                  : styles.modalImageWrapper
              }
            >
              <img
                src={block.src}
                alt={block.alt || "Note image"}
                className={
                  mode === "preview"
                    ? styles.cardImagePreview
                    : styles.modalImage
                }
                loading="lazy"
                onClick={(e) => {
                  if (mode === "full" && onImageClick) {
                    e.stopPropagation();
                    onImageClick(block.src, block.alt);
                  }
                }}
              />
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
