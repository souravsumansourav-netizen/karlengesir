"use client";

import { useEffect } from "react";
import type { FileRow } from "@/lib/database.types";
import { formatBytes, getFileCategory } from "@/lib/utils";

interface FilePreviewModalProps {
  file: FileRow;
  onClose: () => void;
}

export function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
  const category = getFileCategory(file.mime_type);
  const previewUrl = `/api/preview/${file.id}`;
  const downloadUrl = `/api/download/${file.id}`;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal--preview">
        <div className="modal__header">
          <div style={{ minWidth: 0 }}>
            <h2 id="preview-title" className="modal__title truncate">
              {file.file_name}
            </h2>
            <p className="modal__subtitle">
              {formatBytes(file.size_bytes)} · {file.mime_type || "Unknown type"}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <a
              href={downloadUrl}
              className="btn btn--primary btn--sm"
              download={file.file_name}
            >
              ↓ Download
            </a>
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label="Close preview"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="modal__body preview-container">
          {category === "image" && (
            <div className="preview-image-wrapper">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={file.file_name}
                className="preview-image"
                loading="eager"
              />
            </div>
          )}

          {category === "pdf" && (
            <iframe
              src={previewUrl}
              title={file.file_name}
              className="preview-iframe"
            />
          )}

          {category === "audio" && (
            <div className="preview-media-wrapper">
              <audio controls autoPlay className="preview-audio" src={previewUrl}>
                Your browser does not support the audio element.
              </audio>
            </div>
          )}

          {category === "video" && (
            <div className="preview-media-wrapper">
              <video
                controls
                autoPlay
                playsInline
                className="preview-video"
                src={previewUrl}
              >
                Your browser does not support the video element.
              </video>
            </div>
          )}

          {!["image", "pdf", "audio", "video"].includes(category) && (
            <div className="preview-unsupported">
              <p>Inline preview is not available for this file type.</p>
              <a href={downloadUrl} className="btn btn--primary">
                Download to View
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
