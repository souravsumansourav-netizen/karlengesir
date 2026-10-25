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
export default function AdminFilesPage() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const router = useRouter();
  const [showUpload, setShowUpload] = useState(false);
  const [view, setView] = useState<"grid" | "list">("list");

  const {
    files, subjects, loading,
    search, setSearch,
    selectedSubject, setSelectedSubject,
    sort, setSort,
    refetch, refetchSubjects,
  } = useFiles();

  useEffect(() => {
    if (!adminLoading && !isAdmin) router.replace("/admin/login");
  }, [isAdmin, adminLoading, router]);

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <p className="admin-sidebar__title">Admin</p>
        <nav>
          <Link href="/admin" className="admin-nav-link">📊 Dashboard</Link>
          <Link href="/admin/files" className="admin-nav-link admin-nav-link--active">📁 Files</Link>
          <Link href="/admin/subjects" className="admin-nav-link">🗂️ Subjects</Link>
          <Link href="/" className="admin-nav-link">🌐 View Site</Link>
        </nav>
      </aside>

      <div className="admin-main">
        <div className="admin-header">
          <h1 className="admin-title">Files</h1>
          <button className="btn btn--primary" onClick={() => setShowUpload(true)}>
            📤 Upload
          </button>
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

        {loading ? (
          <LoadingSkeleton view={view} />
        ) : files.length === 0 ? (
          <EmptyState search={search} subject={selectedSubject} />
        ) : view === "grid" ? (
          <div className="file-grid">
            {files.map((f) => (
              <FileCard key={f.id} file={f} isAdmin={true} onDeleted={refetch} view="grid" />
            ))}
          </div>
        ) : (
          <div className="file-list">
            {files.map((f) => (
              <FileCard key={f.id} file={f} isAdmin={true} onDeleted={refetch} view="list" />
            ))}
          </div>
        )}
      </div>

      {showUpload && (
        <UploadModal
          subjects={subjects}
          onClose={() => setShowUpload(false)}
          onSuccess={() => { setShowUpload(false); refetch(); }}
          onNewSubject={() => refetchSubjects()}
        />
      )}
    </div>
  );
}
