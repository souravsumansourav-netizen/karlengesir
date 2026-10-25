"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKET } from "@/lib/constants";
import { formatBytes, getFileCategory } from "@/lib/utils";
import { FileIcon } from "./FileIcon";
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
  const supabase = createClient();

  const category = getFileCategory(file.mime_type);

  const getPublicUrl = () => {
    const { data } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(file.storage_path);
    return data.publicUrl;
  };

  const handleDownload = async () => {
    const url = getPublicUrl();
    const a = document.createElement("a");
    a.href = url;
    a.download = file.file_name;
    a.click();
    // Increment download count via RPC
    await supabase.rpc("increment_download_count", { file_id: file.id });
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // DB delete (enforced by RLS – admin only)
      const { error: dbErr } = await supabase
        .from("files")
        .delete()
        .eq("id", file.id);
      if (dbErr) throw dbErr;

      // Storage delete
      const { error: storErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([file.storage_path]);
      if (storErr) console.warn("Storage delete:", storErr.message);

      toast.success("File deleted");
      onDeleted(file.id);
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const canPreview = ["image", "pdf", "audio", "video"].includes(category);
  const publicUrl = getPublicUrl();

  if (view === "list") {
    return (
      <div className="file-list-row">
        <FileIcon mimeType={file.mime_type} className="file-list-row__icon" />
        <div className="file-list-row__main">
          <span className="file-list-row__name">{file.file_name}</span>
          <span className="file-list-row__meta">
            {file.subjects?.name ?? "—"} · {formatBytes(file.size_bytes ?? 0)} ·{" "}
            {new Date(file.created_at).toLocaleDateString()} · by {file.uploader_name} ·{" "}
            {file.download_count} downloads
          </span>
          {file.description && (
            <span className="file-list-row__desc">{file.description}</span>
          )}
        </div>
        <div className="file-list-row__actions">
          {canPreview && (
            <button className="btn btn--ghost btn--sm" onClick={() => setPreviewOpen(true)}>
              Preview
            </button>
          )}
          <button className="btn btn--primary btn--sm" onClick={handleDownload}>
            ↓
          </button>
          {isAdmin && !confirmDelete && (
            <button
              className="btn btn--danger btn--sm"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          )}
          {isAdmin && confirmDelete && (
            <>
              <button
                className="btn btn--danger btn--sm"
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? "…" : "Confirm"}
              </button>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </>
          )}
        </div>
        {previewOpen && (
          <PreviewModal
            url={publicUrl}
            name={file.file_name}
            category={category}
            onClose={() => setPreviewOpen(false)}
          />
        )}
      </div>
    );
  }

  // Grid view
  return (
    <div className="file-card">
      <div
        className="file-card__preview"
        onClick={() => canPreview && setPreviewOpen(true)}
        style={{ cursor: canPreview ? "pointer" : "default" }}
      >
        {category === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={publicUrl}
            alt={file.file_name}
            className="file-card__img"
            loading="lazy"
          />
        ) : (
          <FileIcon mimeType={file.mime_type} className="file-card__big-icon" />
        )}
        {canPreview && category !== "image" && (
          <span className="file-card__preview-hint">Click to preview</span>
        )}
      </div>

      <div className="file-card__body">
        <p className="file-card__name" title={file.file_name}>
          {file.file_name}
        </p>
        {file.subjects && (
          <span className="badge badge--subject">{file.subjects.name}</span>
        )}
        <div className="file-card__meta">
          <span>{formatBytes(file.size_bytes ?? 0)}</span>
          <span>·</span>
          <span>{new Date(file.created_at).toLocaleDateString()}</span>
        </div>
        <div className="file-card__meta">
          <span>by {file.uploader_name}</span>
          <span>·</span>
          <span>{file.download_count} ↓</span>
        </div>
        {file.description && (
          <p className="file-card__desc">{file.description}</p>
        )}
      </div>

      <div className="file-card__footer">
        {canPreview && (
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setPreviewOpen(true)}
          >
            Preview
          </button>
        )}
        <button className="btn btn--primary btn--sm" onClick={handleDownload}>
          Download
        </button>
        {isAdmin && !confirmDelete && (
          <button
            className="btn btn--danger btn--sm"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        )}
        {isAdmin && confirmDelete && (
          <div className="confirm-row">
            <span className="text-sm">Sure?</span>
            <button
              className="btn btn--danger btn--sm"
              disabled={deleting}
              onClick={handleDelete}
            >
              {deleting ? "…" : "Yes"}
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setConfirmDelete(false)}
            >
              No
            </button>
          </div>
        )}
      </div>

      {previewOpen && (
        <PreviewModal
          url={publicUrl}
          name={file.file_name}
          category={category}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Inline Preview Modal ──────────────────────────────────────────────────────
function PreviewModal({
  url,
  name,
  category,
  onClose,
}: {
  url: string;
  name: string;
  category: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel preview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">{name}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="preview-body">
          {category === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={name} className="preview-img" />
          )}
          {category === "pdf" && (
            <iframe src={url} className="preview-frame" title={name} />
          )}
          {category === "video" && (
            <video src={url} controls className="preview-video" />
          )}
          {category === "audio" && (
            <audio src={url} controls className="preview-audio" />
          )}
        </div>
      </div>
    </div>
  );
}
