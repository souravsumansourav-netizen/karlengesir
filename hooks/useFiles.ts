"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SubjectRow, FileRow } from "@/lib/database.types";

export type SortOption = "newest" | "oldest" | "name" | "size";

export function useFiles() {
  const [files, setFiles] = useState<(FileRow & { subjects: SubjectRow | null })[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOption>("newest");

  const fetchSubjects = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("subjects")
      .select("*")
      .order("name");
    setSubjects(data ?? []);
  }, []);

  const fetchFiles = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    let query = supabase
      .from("files")
      .select("*, subjects(*)");

    if (selectedSubject) {
      query = query.eq("subject_id", selectedSubject);
    }
    if (search) {
      query = query.or(
        `file_name.ilike.%${search}%,description.ilike.%${search}%,uploader_name.ilike.%${search}%`
      );
    }

    switch (sort) {
      case "newest":
        query = query.order("created_at", { ascending: false });
        break;
      case "oldest":
        query = query.order("created_at", { ascending: true });
        break;
      case "name":
        query = query.order("file_name", { ascending: true });
        break;
      case "size":
        query = query.order("size_bytes", { ascending: false });
        break;
    }

    const { data } = await query;
    setFiles((data as (FileRow & { subjects: SubjectRow | null })[]) ?? []);
    setLoading(false);
  }, [search, selectedSubject, sort]);

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  return {
    files,
    subjects,
    loading,
    search,
    setSearch,
    selectedSubject,
    setSelectedSubject,
    sort,
    setSort,
    refetch: fetchFiles,
    refetchSubjects: fetchSubjects,
  };
}
