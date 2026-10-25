"use client";

import { useState } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { useFiles } from "@/hooks/useFiles";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FileCard } from "@/components/FileCard";
import { Filters } from "@/components/Filters";
import { LoadingSkeleton, EmptyState } from "@/components/LoadingSkeleton";
import { UploadModal } from "@/components/UploadModal";
import Link from "next/link";
import toast from "react-hot-toast";
import { formatBytes } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export default function AdminFilesPage() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const router = useRouter();
  const [showUpload, setShowUpload] = useState(false);
  const [view, setView] = useState<"grid" | "list">("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const {
    files,
    subjects,
    loading,
    search,
    setSearch,
    selectedSubject,
    setSelectedSubject,
    sort,
    setSort,
    refetch,
    refetchSubjects,
  } = useFiles();

  useEffect(() => {
    if (!adminLoading && !isAdmin) router.replace("/admin/login");
  }, [isAdmin, adminLoading, router]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === files.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(files.map((f) => f.id)));
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    if (!confirm(`Are you sure you want to permanently delete ${ids.length} selected file(s) from Backblaze B2 and the database?`)) {
      return;
    }

    setBulkDeleting(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/files", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ ids }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk delete failed");

      toast.success(data.message || `Deleted ${ids.length} files.`);
      setSelectedIds(new Set());
      refetch();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Bulk delete failed");
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <p className="admin-sidebar__title">Admin Control</p>
        <nav>
          <Link href="/admin" className="admin-nav-link">
            📊 Dashboard
          </Link>
          <Link href="/admin/files" className="admin-nav-link admin-nav-link--active">
            📁 Files & Bulk Delete
          </Link>
          <Link href="/admin/subjects" className="admin-nav-link">
            🗂️ Subjects
          </Link>
          <Link href="/" className="admin-nav-link">
            🌐 View Site
          </Link>
        </nav>
      </aside>

      <div className="admin-main">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">Manage Files</h1>
            <p className="admin-subtitle">
              Browse, inspect, and perform single or bulk file deletions
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {selectedIds.size > 0 && (
              <button
                type="button"
                className="btn btn--danger"
                disabled={bulkDeleting}
                onClick={handleBulkDelete}
              >
                {bulkDeleting ? "Deleting…" : `🗑 Delete Selected (${selectedIds.size})`}
              </button>
            )}
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setShowUpload(true)}
            >
              📤 Upload
            </button>
          </div>
        </div>

        <Filters
          subjects={subjects}
          selectedSubject={selectedSubject}
          onSubjectChange={setSelectedSubject}
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          onSortChange={setSort}
          view={view}
          onViewChange={setView}
        />

        {files.length > 0 && (
          <div className="bulk-bar" style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "1rem 0" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.9rem" }}>
              <input
                type="checkbox"
                checked={files.length > 0 && selectedIds.size === files.length}
                onChange={selectAll}
              />
              Select All ({files.length})
            </label>
            {selectedIds.size > 0 && (
              <span className="text-muted text-sm">
                · {selectedIds.size} selected (
                {formatBytes(
                  files
                    .filter((f) => selectedIds.has(f.id))
                    .reduce((a, b) => a + Number(b.size_bytes || 0), 0)
                )}
                )
              </span>
            )}
          </div>
        )}

        {loading ? (
          <LoadingSkeleton view={view} />
        ) : files.length === 0 ? (
          <EmptyState search={search} subject={selectedSubject} />
        ) : view === "grid" ? (
          <div className="file-grid">
            {files.map((f) => (
              <div key={f.id} style={{ position: "relative" }}>
                <input
                  type="checkbox"
                  style={{ position: "absolute", top: 12, left: 12, zIndex: 10, cursor: "pointer", transform: "scale(1.2)" }}
                  checked={selectedIds.has(f.id)}
                  onChange={() => toggleSelect(f.id)}
                />
                <FileCard
                  file={f}
                  isAdmin={true}
                  onDeleted={() => {
                    selectedIds.delete(f.id);
                    refetch();
                  }}
                  view="grid"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="file-list">
            {files.map((f) => (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  style={{ cursor: "pointer", transform: "scale(1.2)" }}
                  checked={selectedIds.has(f.id)}
                  onChange={() => toggleSelect(f.id)}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <FileCard
                    file={f}
                    isAdmin={true}
                    onDeleted={() => {
                      selectedIds.delete(f.id);
                      refetch();
                    }}
                    view="list"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showUpload && (
        <UploadModal
          subjects={subjects}
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            setShowUpload(false);
            refetch();
          }}
          onNewSubject={() => refetchSubjects()}
        />
      )}
    </div>
  );
}
