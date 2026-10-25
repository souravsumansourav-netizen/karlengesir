"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUpload } from "@/hooks/useUpload";
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
      toast.success("All uploads completed successfully!");
      onSuccess();
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

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId && (!isCreatingSubject || !newSubjectName.trim())) {
      toast.error("Please select or create a subject for the uploaded files.");
      return;
    }
    if (pendingCount === 0) return;
    await startUpload();
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="modal">
        {/* Header */}
        <div className="modal__header">
          <div>
            <h2 id="modal-title" className="modal__title">
              Upload Files
            </h2>
            <p className="modal__subtitle">
              Fast, direct Backblaze B2 storage with support for files up to {formatBytes(MAX_FILE_SIZE_BYTES)}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close upload modal"
          >
            ✕
          </button>
        </div>

        {/* Free-tier Storage Quota Usage Bar */}
        <div className="quota-bar-wrapper">
          <div className="quota-bar__header">
            <span className="quota-bar__label">
              💾 Storage Quota (Free Tier)
            </span>
            <span className="quota-bar__stat">
              {quota.loading
                ? "Checking storage…"
                : `${quota.formattedUsed} of ${quota.formattedQuota} used (${quota.percentUsed}%)`}
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

        {/* Drop zone */}
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
            Drag & drop files here, or <span className="link-text">click to browse</span>
          </p>
          <p className="drop-zone__hint">
            Any file type accepted (PDF, Office, Images, Videos, Archives) · Max{" "}
            {formatBytes(MAX_FILE_SIZE_BYTES, 0)} per file
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

            {files.map((f) => (
              <div key={f.id} className={`file-item file-item--${f.status}`}>
                <div className="file-item__info">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span className="file-item__name truncate">{f.file.name}</span>
                    <span className="file-item__size">
                      {f.status === "uploading"
                        ? `${formatBytes(f.bytesUploaded)} / ${formatBytes(f.file.size)} (${f.progress}%)`
                        : formatBytes(f.file.size)}
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
                    {f.status === "pending" && (
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm"
                        onClick={() => removeFile(f.id)}
                        title="Remove file"
                      >
                        ✕
                      </button>
                    )}
                    {f.status === "done" && <span className="badge badge--success">✓ Done</span>}
                    {f.status === "cancelled" && <span className="badge badge--warning">Cancelled</span>}
                    {f.status === "error" && <span className="badge badge--danger">Failed</span>}
                  </div>
                </div>

                {f.status === "uploading" && (
                  <div className="progress-bar">
                    <div
                      className="progress-bar__fill"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}

                {f.error && <p className="file-item__error">{f.error}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Metadata Form */}
        <form onSubmit={handleUploadSubmit} className="modal__form">
          {/* Subject selection (Required) */}
          <div className="form-group">
            <div className="form-group__header">
              <label htmlFor="subject-select" className="form-label">
                Subject <span className="text-danger">*</span>
              </label>
              <button
                type="button"
                className="link-text link-text--sm"
                onClick={() => {
                  setIsCreatingSubject((v) => !v);
                  setSelectedSubjectId("");
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
                required
                maxLength={60}
                autoFocus
              />
            ) : (
              <select
                id="subject-select"
                className="form-select"
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                required
              >
                <option value="">— Select a subject —</option>
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
