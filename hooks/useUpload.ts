"use client";

import { useCallback, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  MAX_PARALLEL_UPLOADS,
  MAX_PART_RETRIES,
  ANON_UPLOADER_DEFAULT,
} from "@/lib/constants";
import { formatBytes } from "@/lib/utils";
import type { SubjectRow } from "@/lib/database.types";

export interface FileToUpload {
  id: string;
  file: File;
  progress: number;
  bytesUploaded: number;
  status: "pending" | "uploading" | "done" | "error" | "cancelled";
  error?: string;
  storageKey?: string;
  uploadId?: string;
  abortController?: AbortController;
}

interface UseUploadOptions {
  subjects: SubjectRow[];
  onNewSubject?: (s: SubjectRow) => void;
  onAllComplete?: () => void;
  onError?: (error: string) => void;
}

interface CompletedPart {
  partNumber: number;
  etag: string;
}

export function useUpload({ onNewSubject, onAllComplete, onError }: UseUploadOptions) {
  const [files, setFiles] = useState<FileToUpload[]>([]);
  const [uploaderName, setUploaderName] = useState(ANON_UPLOADER_DEFAULT);
  const [description, setDescription] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [isCreatingSubject, setIsCreatingSubject] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Keep ref to latest files for cancellation / cleanup
  const filesRef = useRef<FileToUpload[]>([]);
  filesRef.current = files;

  const updateFile = useCallback((id: string, patch: Partial<FileToUpload>) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
    );
  }, []);

  const addFiles = useCallback((incoming: File[]) => {
    const newEntries: FileToUpload[] = incoming.map((f) => {
      // Validate file size limit
      if (f.size > MAX_FILE_SIZE_BYTES) {
        return {
          id: uuidv4(),
          file: f,
          progress: 0,
          bytesUploaded: 0,
          status: "error",
          error: `File exceeds the ${formatBytes(MAX_FILE_SIZE_BYTES)} (${MAX_FILE_SIZE_MB} MB) limit`,
        };
      }
      return {
        id: uuidv4(),
        file: f,
        progress: 0,
        bytesUploaded: 0,
        status: "pending",
      };
    });
    setFiles((prev) => [...prev, ...newEntries]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearDone = useCallback(() => {
    setFiles((prev) => prev.filter((f) => f.status !== "done"));
  }, []);

  // Cancel an active or pending upload
  const cancelUpload = useCallback(async (id: string) => {
    const entry = filesRef.current.find((f) => f.id === id);
    if (!entry) return;

    // Abort active HTTP network requests
    if (entry.abortController) {
      entry.abortController.abort();
    }

    updateFile(id, { status: "cancelled", progress: 0 });

    // If a multipart upload was initiated on Backblaze B2, call /api/upload/abort
    if (entry.uploadId && entry.storageKey) {
      try {
        await fetch("/api/upload/abort", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: entry.storageKey,
            uploadId: entry.uploadId,
          }),
          keepalive: true,
        });
      } catch (err) {
        console.warn("Failed to abort multipart upload on server:", err);
      }
    }
  }, [updateFile]);

  // Upload single file via PUT with XMLHttpRequest for live progress
  const uploadSingle = async (
    entry: FileToUpload,
    uploadUrl: string,
    fileId: string,
    storageKey: string,
    storageProvider: string,
    subjectId: string | null,
    controller: AbortController
  ) => {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", entry.file.type || "application/octet-stream");

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.min(98, Math.round((e.loaded / e.total) * 100));
          updateFile(entry.id, {
            progress: percent,
            bytesUploaded: e.loaded,
          });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`B2 upload failed with status ${xhr.status}: ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during direct upload to Backblaze B2"));
      xhr.onabort = () => reject(new Error("Upload cancelled by user"));

      controller.signal.addEventListener("abort", () => {
        xhr.abort();
      });

      xhr.send(entry.file);
    });

    // Notify backend to insert row into Supabase database
    const completeRes = await fetch("/api/upload/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileId,
        storageKey,
        storageProvider,
        fileName: entry.file.name,
        sizeBytes: entry.file.size,
        mimeType: entry.file.type || null,
        subjectId,
        uploaderName,
        description,
        mode: "single",
      }),
    });

    if (!completeRes.ok) {
      const errData = await completeRes.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to record upload in database");
    }

    updateFile(entry.id, { status: "done", progress: 100, bytesUploaded: entry.file.size });
  };

  // Upload multipart file with concurrent workers, retries, and ETag capture
  const uploadMultipart = async (
    entry: FileToUpload,
    uploadId: string,
    fileId: string,
    storageKey: string,
    storageProvider: string,
    subjectId: string | null,
    partSize: number,
    presignedParts: { partNumber: number; url: string }[],
    controller: AbortController
  ) => {
    const totalParts = presignedParts.length;
    const completedParts: CompletedPart[] = [];
    const partBytesUploaded = new Array(totalParts).fill(0);

    // Queue of part indexes to process
    let currentPartIndex = 0;

    const uploadPartWithRetry = async (part: { partNumber: number; url: string }) => {
      const partIdx = part.partNumber - 1;
      const start = partIdx * partSize;
      const end = Math.min(start + partSize, entry.file.size);
      const chunk = entry.file.slice(start, end);

      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= MAX_PART_RETRIES; attempt++) {
        if (controller.signal.aborted) {
          throw new Error("Upload cancelled by user");
        }

        try {
          const res = await fetch(part.url, {
            method: "PUT",
            body: chunk,
            signal: controller.signal,
          });

          if (!res.ok) {
            throw new Error(`Part ${part.partNumber} failed with status ${res.status}`);
          }

          // Backblaze B2 returns ETag in response headers (exposed via cors.json)
          const etagHeader = res.headers.get("etag") || res.headers.get("ETag");
          if (!etagHeader) {
            throw new Error(
              `Part ${part.partNumber} succeeded but no ETag header received. Check bucket CORS settings.`
            );
          }

          const cleanEtag = etagHeader.replace(/^"|"$/g, "");
          completedParts.push({
            partNumber: part.partNumber,
            etag: cleanEtag,
          });

          partBytesUploaded[partIdx] = chunk.size;
          const totalBytesUploaded = partBytesUploaded.reduce((a, b) => a + b, 0);
          const percent = Math.min(98, Math.round((totalBytesUploaded / entry.file.size) * 100));

          updateFile(entry.id, {
            progress: percent,
            bytesUploaded: totalBytesUploaded,
          });

          return; // Success
        } catch (err: unknown) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (controller.signal.aborted) throw lastError;

          if (attempt < MAX_PART_RETRIES) {
            // Exponential backoff: 1s, 2s, 4s
            const delay = 1000 * Math.pow(2, attempt - 1);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }

      throw lastError || new Error(`Part ${part.partNumber} failed after ${MAX_PART_RETRIES} retries`);
    };

    // Worker pool running up to MAX_PARALLEL_UPLOADS (3) parts in parallel
    const worker = async () => {
      while (currentPartIndex < presignedParts.length) {
        if (controller.signal.aborted) break;
        const partToUpload = presignedParts[currentPartIndex++];
        await uploadPartWithRetry(partToUpload);
      }
    };

    const workers = Array.from(
      { length: Math.min(MAX_PARALLEL_UPLOADS, presignedParts.length) },
      () => worker()
    );

    await Promise.all(workers);

    if (controller.signal.aborted) {
      throw new Error("Upload cancelled by user");
    }

    // Call CompleteMultipartUpload on server
    const completeRes = await fetch("/api/upload/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileId,
        storageKey,
        storageProvider,
        fileName: entry.file.name,
        sizeBytes: entry.file.size,
        mimeType: entry.file.type || null,
        subjectId,
        uploaderName,
        description,
        mode: "multipart",
        uploadId,
        parts: completedParts,
      }),
    });

    if (!completeRes.ok) {
      const errData = await completeRes.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to finalize multipart upload");
    }

    updateFile(entry.id, { status: "done", progress: 100, bytesUploaded: entry.file.size });
  };

  // Start processing all pending uploads
  const startUpload = async () => {
    const pendingFiles = files.filter((f) => f.status === "pending");
    if (pendingFiles.length === 0) return;

    setIsUploading(true);

    for (const entry of pendingFiles) {
      const controller = new AbortController();
      updateFile(entry.id, {
        status: "uploading",
        progress: 0,
        bytesUploaded: 0,
        abortController: controller,
      });

      try {
        // Step 1: Call /api/upload/init to validate size, quota, subject and get presigned URL(s)
        const initRes = await fetch("/api/upload/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: entry.file.name,
            sizeBytes: entry.file.size,
            mimeType: entry.file.type || "application/octet-stream",
            subjectId: selectedSubjectId || null,
            newSubjectName: isCreatingSubject ? newSubjectName.trim() : null,
          }),
        });

        const initData = await initRes.json();
        if (!initRes.ok) {
          throw new Error(initData.error || `Initialization failed with status ${initRes.status}`);
        }

        const {
          fileId,
          storageKey,
          storageProvider,
          subjectId: resolvedSubjectId,
          mode,
          uploadUrl,
          uploadId,
          partSize,
          parts,
        } = initData;

        updateFile(entry.id, { storageKey, uploadId });

        // If a new subject was created on the fly, notify parent
        if (isCreatingSubject && resolvedSubjectId && onNewSubject) {
          onNewSubject({
            id: resolvedSubjectId,
            name: newSubjectName.trim(),
            slug: resolvedSubjectId,
            created_at: new Date().toISOString(),
          });
        }

        // Step 2: Upload directly to Backblaze B2
        if (mode === "single") {
          await uploadSingle(
            entry,
            uploadUrl,
            fileId,
            storageKey,
            storageProvider,
            resolvedSubjectId,
            controller
          );
        } else if (mode === "multipart") {
          await uploadMultipart(
            entry,
            uploadId,
            fileId,
            storageKey,
            storageProvider,
            resolvedSubjectId,
            partSize,
            parts,
            controller
          );
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          updateFile(entry.id, { status: "cancelled", error: "Upload cancelled" });
        } else {
          const message = err instanceof Error ? err.message : String(err);
          updateFile(entry.id, { status: "error", error: message });
        }
      }
    }

    setIsUploading(false);
    const finalFiles = filesRef.current;
    const hasErrors = finalFiles.some((f) => f.status === "error");
    const anyDone = finalFiles.some((f) => f.status === "done");

    if (hasErrors) {
      const firstError = finalFiles.find((f) => f.status === "error");
      onError?.(firstError?.error || "Upload failed for one or more files.");
    } else if (anyDone) {
      onAllComplete?.();
    }
  };

  return {
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
  };
}
