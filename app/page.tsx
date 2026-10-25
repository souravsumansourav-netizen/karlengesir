"use client";

import { useState } from "react";
import { useFiles } from "@/hooks/useFiles";
import { useAdmin } from "@/hooks/useAdmin";
import { Filters } from "@/components/Filters";
import { FileCard } from "@/components/FileCard";
import { UploadModal } from "@/components/UploadModal";
import { LoadingSkeleton, EmptyState } from "@/components/LoadingSkeleton";
export default function HomePage() {
  const [showUpload, setShowUpload] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const { isAdmin } = useAdmin();

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

  const handleNewSubject = () => {
    refetchSubjects();
  };

  return (
    <>
      {/* Hero */}
      <section className="hero">
        <span className="hero__eyebrow">Open File Sharing</span>
        <h1 className="hero__title">
          Share files, <br />instantly.
        </h1>
        <p className="hero__subtitle">
          Upload any file, browse by subject, and download in a click. No account required.
        </p>
        <div className="hero__actions">
          <button
            id="open-upload"
            className="btn btn--primary btn--lg"
            onClick={() => setShowUpload(true)}
          >
            📤 Upload Files
          </button>
          <a href="#files" className="btn btn--ghost btn--lg">
            Browse Files
          </a>
        </div>
      </section>

      {/* File Browser */}
      <section id="files">
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
              <FileCard
                key={f.id}
                file={f}
                isAdmin={isAdmin}
                onDeleted={() => refetch()}
                view="grid"
              />
            ))}
          </div>
        ) : (
          <div className="file-list">
            {files.map((f) => (
              <FileCard
                key={f.id}
                file={f}
                isAdmin={isAdmin}
                onDeleted={() => refetch()}
                view="list"
              />
            ))}
          </div>
        )}
      </section>

      {/* Upload Modal */}
      {showUpload && (
        <UploadModal
          subjects={subjects}
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            setShowUpload(false);
            refetch();
          }}
          onNewSubject={handleNewSubject}
        />
      )}
    </>
  );
}
