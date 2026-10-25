"use client";

export function LoadingSkeleton({ view = "grid" }: { view?: "grid" | "list" }) {
  const count = 6;
  if (view === "list") {
    return (
      <div className="file-list">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="file-list-row skeleton-row">
            <div className="skeleton skeleton--icon" />
            <div className="skeleton-content">
              <div className="skeleton skeleton--title" />
              <div className="skeleton skeleton--meta" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="file-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="file-card skeleton-card">
          <div className="skeleton skeleton--preview" />
          <div className="file-card__body">
            <div className="skeleton skeleton--title" />
            <div className="skeleton skeleton--meta" />
            <div className="skeleton skeleton--meta skeleton--short" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  search,
  subject,
}: {
  search: string;
  subject: string | null;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">🗂️</div>
      <h3 className="empty-state__title">No files found</h3>
      <p className="empty-state__text">
        {search || subject
          ? "Try adjusting your search or filter."
          : "Be the first to upload a file!"}
      </p>
    </div>
  );
}
