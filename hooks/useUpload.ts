"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MAX_FILE_SIZE_BYTES, STORAGE_BUCKET, ANON_UPLOADER_DEFAULT } from "@/lib/constants";
import { buildStoragePath, formatBytes, slugify } from "@/lib/utils";
import { v4 as uuidv4 } from "uuid";
import type { SubjectRow } from "@/lib/database.types";

export interface FileToUpload {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

interface UseUploadProps {
  subjects: SubjectRow[];
  onSuccess?: () => void;
  onNewSubject?: (subject: SubjectRow) => void;
}

export function useUpload({ subjects, onSuccess, onNewSubject }: UseUploadProps) {
  const [files, setFiles] = useState<FileToUpload[]>([]);
  const [uploaderName, setUploaderName] = useState(ANON_UPLOADER_DEFAULT);
  const [description, setDescription] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [isCreatingSubject, setIsCreatingSubject] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const addFiles = useCallback((incoming: File[]) => {
    const newEntries: FileToUpload[] = incoming.map((f) => {
      if (f.size > MAX_FILE_SIZE_BYTES) {
        return {
          id: uuidv4(),
          file: f,
          progress: 0,
          status: "error",
          error: `File exceeds ${formatBytes(MAX_FILE_SIZE_BYTES, 0)} limit`,
        };
      }
      return { id: uuidv4(), file: f, progress: 0, status: "pending" };
    });
    setFiles((prev) => [...prev, ...newEntries]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearDone = useCallback(() => {
    setFiles((prev) => prev.filter((f) => f.status !== "done"));
  }, []);

  const updateFile = useCallback((id: string, patch: Partial<FileToUpload>) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
    );
  }, []);

  const createSubjectInDb = async (): Promise<SubjectRow | null> => {
    const supabase = createClient();
    const name = newSubjectName.trim();
    if (!name) return null;
    const slug = slugify(name);
    const { data, error } = await supabase
      .from("subjects")
      .insert({ name, slug })
      .select()
      .single();
    if (error) {
      const { data: existing } = await supabase
        .from("subjects")
        .select()
        .eq("slug", slug)
        .single();
      return existing ?? null;
    }
    return data;
  };

  const startUpload = async () => {
    const supabase = createClient();
    const pendingFiles = files.filter((f) => f.status === "pending");
    if (pendingFiles.length === 0) return;

    setIsUploading(true);

    let subjectId = selectedSubjectId;
    let subjectSlug = subjects.find((s) => s.id === subjectId)?.slug ?? "general";

    if (isCreatingSubject && newSubjectName.trim()) {
      const newSub = await createSubjectInDb();
      if (newSub) {
        subjectId = newSub.id;
        subjectSlug = newSub.slug;
        onNewSubject?.(newSub);
      }
    }

    await Promise.all(
      pendingFiles.map(async (entry) => {
        updateFile(entry.id, { status: "uploading", progress: 0 });

        const fileId = uuidv4();
        const storagePath = buildStoragePath(subjectSlug, fileId, entry.file.name);

        const { error: storageError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, entry.file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (storageError) {
          updateFile(entry.id, { status: "error", error: storageError.message });
          return;
        }

        updateFile(entry.id, { progress: 80 });

        const { error: dbError } = await supabase.from("files").insert({
          id: fileId,
          subject_id: subjectId || null,
          file_name: entry.file.name,
          storage_path: storagePath,
          mime_type: entry.file.type || null,
          size_bytes: entry.file.size,
          description: description.trim() || null,
          uploader_name: uploaderName.trim() || ANON_UPLOADER_DEFAULT,
        });

        if (dbError) {
          await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
          updateFile(entry.id, { status: "error", error: dbError.message });
          return;
        }

        updateFile(entry.id, { status: "done", progress: 100 });
      })
    );

    setIsUploading(false);
    onSuccess?.();
  };

  return {
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
  };
}
