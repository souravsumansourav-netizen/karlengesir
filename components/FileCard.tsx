"use client";

import { useState } from "react";
import { formatBytes, getFileCategory } from "@/lib/utils";
import { FileIcon } from "./FileIcon";
import { FilePreviewModal } from "./FilePreviewModal";
import type { FileRow, SubjectRow } from "@/lib/database.types";
import toast from "react-hot-toast";

interface FileCardProps {
  file: FileRow & { subjects: SubjectRow | null };
  isAdmin: boolean;
  onDeleted: (id: string) => void;
  view: "grid" | "list";
}

export function FileCard({ file, isAdmin, onDeleted, view }: FileCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloadCount, setDownloadCount] = useState(file.download_count);

  const category = getFileCategory(file.mime_type);
  const canPreview = ["image", "pdf", "audio", "video"].includes(category);
  const downloadUrl = `/api/download/${file.id}`;
  const previewThumbnailUrl = `/api/preview/${file.id}`;

  const handleDownloadClick = () => {
    // Optimistically increment download count in UI
    setDownloadCount((prev) => prev + 1);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/files/${file.id}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `Delete failed with status ${res.status}`);
      }

      toast.success(data.message || "File deleted successfully");
      onDeleted(file.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete file";
      toast.error(message);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (view === "list") {
    return (
      <>
        <div className="file-list-row">
          <FileIcon mimeType={file.mime_type} className="file-list-row__icon" />
          <div className="file-list-row__main">
            <span className="file-list-row__name">{file.file_name}</span>
            <span className="file-list-row__meta">
              {file.subjects?.name ?? "General"} · {formatBytes(file.size_bytes)} ·{" "}
              {new Date(file.created_at).toLocaleDateString()} · by {file.uploader_name} ·{" "}
              {downloadCount} {downloadCount === 1 ? "download" : "downloads"}
            </span>
            {file.description && (
              <span className="file-list-row__desc">{file.description}</span>
            )}
          </div>
          <div className="file-list-row__actions">
            {canPreview && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setPreviewOpen(true)}
              >
                👁 Preview
              </button>
            )}
            <a
              href={downloadUrl}
              className="btn btn--primary btn--sm"
              onClick={handleDownloadClick}
              title={`Download ${file.file_name}`}
            >
              ↓ Download
            </a>
            {isAdmin && !confirmDelete && (
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => setConfirmDelete(true)}
                title="Delete file (Admin only)"
              >
                Delete
              </button>
            )}
            {isAdmin && confirmDelete && (
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <button
                  type="button"
                  className="btn btn--danger btn--sm"
                  disabled={deleting}
                  onClick={handleDelete}
                >
                  {deleting ? "…" : "Confirm"}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {previewOpen && (
          <FilePreviewModal file={file} onClose={() => setPreviewOpen(false)} />
        )}
      </>
    );
  }

  // Grid view
  return (
    <>
      <div className="file-card">
        {/* Thumbnail / Icon banner */}
        <div
          className={`file-card__thumb ${canPreview ? "file-card__thumb--clickable" : ""}`}
          onClick={() => canPreview && setPreviewOpen(true)}
          role={canPreview ? "button" : undefined}
          tabIndex={canPreview ? 0 : undefined}
          onKeyDown={(e) => e.key === "Enter" && canPreview && setPreviewOpen(true)}
        >
          {category === "image" ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={previewThumbnailUrl}
              alt={file.file_name}
              className="file-card__img"
              loading="lazy"
            />
          ) : (
            <div className="file-card__icon-wrap">
              <FileIcon mimeType={file.mime_type} />
              {canPreview && <span className="preview-badge">Preview</span>}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="file-card__body">
          <span className="file-card__subject">
            {file.subjects?.name ?? "General"}
          </span>
          <h3 className="file-card__name truncate" title={file.file_name}>
            {file.file_name}
          </h3>
          {file.description && (
            <p className="file-card__desc truncate-2" title={file.description}>
              {file.description}
            </p>
          )}

          <div className="file-card__meta">
            <span>{formatBytes(file.size_bytes)}</span>
            <span>·</span>
            <span>by {file.uploader_name}</span>
            <span>·</span>
            <span>{downloadCount} ⬇</span>
          </div>
        </div>

        {/* Actions */}
        <div className="file-card__footer">
          {canPreview && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setPreviewOpen(true)}
            >
              👁 Preview
            </button>
          )}
          <a
            href={downloadUrl}
            className="btn btn--primary btn--sm"
            onClick={handleDownloadClick}
            download={file.file_name}
          >
            ↓ Download
          </a>

          {isAdmin && !confirmDelete && (
            <button
              type="button"
              className="btn btn--danger btn--sm"
              onClick={() => setConfirmDelete(true)}
              title="Delete file"
            >
              🗑
            </button>
          )}

          {isAdmin && confirmDelete && (
            <div style={{ display: "flex", gap: "0.25rem", width: "100%" }}>
              <button
                type="button"
                className="btn btn--danger btn--sm"
                style={{ flex: 1 }}
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? "…" : "Confirm"}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setConfirmDelete(false)}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      {previewOpen && (
        <FilePreviewModal file={file} onClose={() => setPreviewOpen(false)} />
      )}
    </>
  );
}
