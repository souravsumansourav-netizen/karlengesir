"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUpload, type FileToUpload } from "@/hooks/useUpload";
import { FileIcon } from "@/components/FileIcon";
import type { SubjectRow } from "@/lib/database.types";
import { MAX_FILE_SIZE_BYTES } from "@/lib/constants";
import { formatBytes } from "@/lib/utils";
import toast from "react-hot-toast";

interface UploadModalProps {
  subjects: SubjectRow[];
  onClose: () => void;
  onSuccess: () => void;
  onNewSubject: (s: SubjectRow) => void;
}

interface QuotaState {
  usedGb: number;
  quotaGb: number;
  percentUsed: number;
  formattedUsed: string;
  formattedQuota: string;
  loading: boolean;
}

type StatusTone = "ready" | "queued" | "active" | "done" | "error" | "cancelled";

interface StatusInfo {
  tone: StatusTone;
  label: string;
  detail: string;
  indeterminate?: boolean;
}

/** Derive a human-readable status for every file so no state is ever "unknown". */
function getStatus(f: FileToUpload, batchRunning: boolean): StatusInfo {
  const size = formatBytes(f.file.size);
  switch (f.status) {
    case "pending":
      return batchRunning
        ? { tone: "queued", label: "Waiting", detail: size }
        : { tone: "ready", label: "Ready", detail: size };
    case "uploading":
      if (f.bytesUploaded === 0 && f.progress === 0) {
        return { tone: "active", label: "Preparing", detail: size, indeterminate: true };
      }
      if (f.progress >= 98) {
        return { tone: "active", label: "Finalizing", detail: size, indeterminate: true };
      }
      return {
        tone: "active",
        label: `Uploading ${f.progress}%`,
        detail: `${formatBytes(f.bytesUploaded)} of ${size}`,
      };
    case "done":
      return { tone: "done", label: "Uploaded", detail: size };
    case "cancelled":
      return { tone: "cancelled", label: "Cancelled", detail: size };
    case "error":
    default:
      return { tone: "error", label: "Failed", detail: size };
  }
}

function StatusGlyph({ tone }: { tone: StatusTone }) {
  const common = { width: 14, height: 14, viewBox: "0 0 16 16", "aria-hidden": true as const, className: "status-glyph" };
  switch (tone) {
    case "done":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="8" fill="currentColor" />
          <path d="M4.6 8.3l2.2 2.2 4.6-4.9" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "error":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="8" fill="currentColor" />
          <path d="M8 4.4v4.2M8 11.2v.1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "cancelled":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="8" fill="currentColor" />
          <path d="M5.2 8h5.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "active":
      return (
        <svg {...common} className="status-glyph status-glyph--spin">
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
          <path d="M8 1.8a6.2 6.2 0 0 1 6.2 6.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "queued":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 4.6V8l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
  }
}

export function UploadModal({ subjects, onClose, onSuccess, onNewSubject }: UploadModalProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [quota, setQuota] = useState<QuotaState>({
    usedGb: 0,
    quotaGb: 9.5,
    percentUsed: 0,
    formattedUsed: "0 B",
    formattedQuota: "9.5 GB",
    loading: true,
  });

  // Fetch real-time storage quota usage on modal open
  useEffect(() => {
    let mounted = true;
    fetch("/api/quota")
      .then((r) => r.json())
      .then((data) => {
        if (mounted && !data.error) {
          setQuota({
            usedGb: data.usedGb,
            quotaGb: data.quotaGb,
            percentUsed: data.percentUsed,
            formattedUsed: data.formattedUsed,
            formattedQuota: data.formattedQuota,
            loading: false,
          });
        }
      })
      .catch((err) => {
        console.warn("Could not fetch quota:", err);
        if (mounted) setQuota((prev) => ({ ...prev, loading: false }));
      });

    return () => {
      mounted = false;
    };
  }, []);

  const {
    files,
    addFiles,
    removeFile,
    clearDone,
    cancelUpload,
    uploaderName,
    setUploaderName,
    description,
    setDescription,
    selectedSubjectId,
    setSelectedSubjectId,
    newSubjectName,
    setNewSubjectName,
    isCreatingSubject,
    setIsCreatingSubject,
    isUploading,
    startUpload,
  } = useUpload({
    subjects,
    onNewSubject,
    onAllComplete: () => {
      toast.success("Upload completed successfully!");
      onSuccess();
    },
    onError: (errMsg: string) => {
      toast.error(errMsg);
    },
  });

  const hasFiles = files.length > 0;
  const pendingCount = files.filter((f) => f.status === "pending").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const isAllDone = hasFiles && files.every((f) => f.status === "done");

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) addFiles(droppedFiles);
    },
    [addFiles]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files ? Array.from(e.target.files) : [];
    if (selected.length > 0) addFiles(selected);
    e.target.value = "";
  };

  // Subject is now optional (non-mandatory)
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingCount === 0) return;
    await startUpload();
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isUploading) onClose();
      }}
    >
      <div className="modal modal-panel upload-modal">
        {/* Header */}
        <div className="modal__header">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id="modal-title" className="modal__title">
              Upload Files
            </h2>
            <p className="modal__subtitle">
              Fast, direct Backblaze B2 storage up to {formatBytes(MAX_FILE_SIZE_BYTES)}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn modal-close-btn"
            onClick={onClose}
            aria-label="Close upload modal"
            disabled={isUploading}
          >
            ✕
          </button>
        </div>

        {/* Free-tier Storage Quota Usage Bar */}
        <div className="quota-bar-wrapper">
          <div className="quota-bar__header">
            <span className="quota-bar__label">Storage</span>
            <span className="quota-bar__stat">
              {quota.loading
                ? "Checking storage…"
                : `${quota.formattedUsed} of ${quota.formattedQuota} (${quota.percentUsed}%)`}
            </span>
          </div>
          <div className="quota-bar__track">
            <div
              className={`quota-bar__fill ${
                quota.percentUsed > 90 ? "quota-bar__fill--warning" : ""
              }`}
              style={{ width: `${Math.min(100, quota.percentUsed)}%` }}
            />
          </div>
        </div>

        {/* Drop zone / Tap to browse */}
        <div
          className={`drop-zone ${dragging ? "drop-zone--active" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          role="button"
          aria-label="File drop area"
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={handleFileChange}
            id="file-input"
          />
          <div className="drop-zone__icon">📂</div>
          <p className="drop-zone__text">
            <span className="desktop-only-inline">Drag & drop files here, or </span>
            <span className="link-text">tap to select files</span>
          </p>
          <p className="drop-zone__hint">
            PDF, Docs, Images, Videos, Archives · Max {formatBytes(MAX_FILE_SIZE_BYTES, 0)} per file
          </p>
        </div>

        {/* File queue */}
        {hasFiles && (
          <div className="file-queue">
            <div className="file-queue__header">
              <span>Files to Upload ({files.length})</span>
              {doneCount > 0 && (
                <button
                  type="button"
                  className="link-text link-text--sm"
                  onClick={clearDone}
                >
                  Clear completed
                </button>
              )}
            </div>

            {files.map((f) => {
              const st = getStatus(f, isUploading);
              return (
                <div key={f.id} className={`file-item file-item--${f.status}`}>
                  <div className="file-item__info">
                    <div className="file-item__glyph" aria-hidden="true">
                      <FileIcon mimeType={f.file.type || null} />
                    </div>

                    <div className="file-item__main">
                      <span className="file-item__name truncate">{f.file.name}</span>
                      <span className={`file-item__status file-item__status--${st.tone}`} aria-live="polite">
                        <StatusGlyph tone={st.tone} />
                        <span>{st.label}</span>
                        <span className="file-item__dot">·</span>
                        <span className="file-item__size">{st.detail}</span>
                      </span>
                    </div>

                    <div className="file-item__actions">
                      {f.status === "uploading" && (
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          onClick={() => cancelUpload(f.id)}
                          title="Cancel upload"
                        >
                          Cancel
                        </button>
                      )}
                      {(f.status === "pending" || f.status === "error" || f.status === "cancelled") && (
                        <button
                          type="button"
                          className="icon-btn icon-btn--sm"
                          onClick={() => removeFile(f.id)}
                          title="Remove file"
                          aria-label={`Remove ${f.file.name}`}
                          disabled={f.status === "pending" && isUploading}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {f.status === "uploading" && (
                    <div
                      className={`progress-bar ${st.indeterminate ? "progress-bar--indeterminate" : ""}`}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={st.indeterminate ? undefined : f.progress}
                      aria-label={`${f.file.name} upload progress`}
                    >
                      <div
                        className="progress-bar__fill"
                        style={st.indeterminate ? undefined : { width: `${f.progress}%` }}
                      />
                    </div>
                  )}

                  {f.error && f.status !== "cancelled" && <p className="file-item__error">{f.error}</p>}
                </div>
              );
            })}
          </div>
        )}

        {/* Metadata Form */}
        <form onSubmit={handleUploadSubmit} className="modal__form">
          {/* Subject selection (Optional / Non-mandatory) */}
          <div className="form-group">
            <div className="form-group__header">
              <label htmlFor="subject-select" className="form-label">
                Subject <span className="text-muted font-normal">(optional)</span>
              </label>
              <button
                type="button"
                className="link-text link-text--sm"
                onClick={() => {
                  setIsCreatingSubject((v) => !v);
                  setSelectedSubjectId("");
                  setNewSubjectName("");
                }}
              >
                {isCreatingSubject ? "Choose existing" : "+ New subject"}
              </button>
            </div>

            {isCreatingSubject ? (
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Machine Learning, Physics 101…"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                maxLength={60}
                autoFocus
              />
            ) : (
              <select
                id="subject-select"
                className="form-select"
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
              >
                <option value="">— None / General (optional) —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Description (Optional) */}
          <div className="form-group">
            <label htmlFor="file-desc" className="form-label">
              Description <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              id="file-desc"
              type="text"
              className="form-input"
              placeholder="Brief description or context…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
            />
          </div>

          {/* Uploader Name (Optional) */}
          <div className="form-group">
            <label htmlFor="uploader-name" className="form-label">
              Your Name <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              id="uploader-name"
              type="text"
              className="form-input"
              placeholder="Anonymous"
              value={uploaderName}
              onChange={(e) => setUploaderName(e.target.value)}
              maxLength={50}
            />
          </div>

          {/* Form Actions */}
          <div className="modal__footer">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onClose}
              disabled={isUploading}
            >
              {isAllDone ? "Close" : "Cancel"}
            </button>

            <button
              type="submit"
              className="btn btn--primary"
              disabled={isUploading || pendingCount === 0}
            >
              {isUploading
                ? `Uploading (${files.filter((f) => f.status === "uploading").length})…`
                : `Upload ${pendingCount > 0 ? `${pendingCount} ${pendingCount === 1 ? "file" : "files"}` : ""}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
