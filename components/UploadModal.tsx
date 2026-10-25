"use client";

import { useCallback, useRef, useState } from "react";
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

export function UploadModal({ subjects, onClose, onSuccess, onNewSubject }: UploadModalProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    files,
    addFiles,
    removeFile,
    clearDone,
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
    onSuccess: () => {
      toast.success("Files uploaded successfully!");
      onSuccess();
    },
    onNewSubject,
  });

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = Array.from(e.dataTransfer.files);
      if (dropped.length) addFiles(dropped);
    },
    [addFiles]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const hasFiles = files.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel upload-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">Upload Files</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Drop zone */}
        <div
          className={`drop-zone ${dragging ? "drop-zone--active" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={handleFileInput}
            id="file-input"
          />
          <div className="drop-zone__icon">📂</div>
          <p className="drop-zone__text">
            Drag & drop files here, or <span className="link-text">click to browse</span>
          </p>
          <p className="drop-zone__hint">Any file type · Max {formatBytes(MAX_FILE_SIZE_BYTES, 0)} per file</p>
        </div>

        {/* File queue */}
        {hasFiles && (
          <div className="file-queue">
            {files.map((f) => (
              <div key={f.id} className={`file-item file-item--${f.status}`}>
                <div className="file-item__info">
                  <span className="file-item__name">{f.file.name}</span>
                  <span className="file-item__size">{formatBytes(f.file.size)}</span>
                </div>
                {f.status === "uploading" && (
                  <div className="progress-bar">
                    <div
                      className="progress-bar__fill"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}
                {f.status === "error" && (
                  <p className="file-item__error">{f.error}</p>
                )}
                {f.status === "done" && <span className="badge badge--green">✓ Done</span>}
                {f.status !== "uploading" && (
                  <button
                    className="icon-btn icon-btn--sm"
                    onClick={() => removeFile(f.id)}
                    aria-label="Remove file"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Metadata fields */}
        <div className="form-grid">
          {/* Subject */}
          <div className="form-group">
            <label htmlFor="subject-select" className="form-label">
              Subject <span className="required">*</span>
            </label>
            {!isCreatingSubject ? (
              <div className="select-with-action">
                <select
                  id="subject-select"
                  className="form-select"
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                >
                  <option value="">— Select a subject —</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setIsCreatingSubject(true)}
                >
                  + New
                </button>
              </div>
            ) : (
              <div className="select-with-action">
                <input
                  type="text"
                  className="form-input"
                  placeholder="New subject name"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setIsCreatingSubject(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="form-group">
            <label htmlFor="description" className="form-label">Description</label>
            <textarea
              id="description"
              className="form-textarea"
              placeholder="Optional description..."
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </div>

          {/* Uploader name */}
          <div className="form-group">
            <label htmlFor="uploader-name" className="form-label">Your name</label>
            <input
              id="uploader-name"
              type="text"
              className="form-input"
              placeholder="Anonymous"
              value={uploaderName}
              onChange={(e) => setUploaderName(e.target.value)}
              maxLength={100}
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="modal-footer">
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          {files.some((f) => f.status === "done") && (
            <button className="btn btn--ghost" onClick={clearDone}>
              Clear Done
            </button>
          )}
          <button
            className="btn btn--primary"
            disabled={isUploading || pendingCount === 0}
            onClick={startUpload}
          >
            {isUploading
              ? "Uploading…"
              : `Upload ${pendingCount > 0 ? `(${pendingCount})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
