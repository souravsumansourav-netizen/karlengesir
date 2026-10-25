"use client";

import type { SubjectRow } from "@/lib/database.types";
import type { SortOption } from "@/hooks/useFiles";

interface FiltersProps {
  subjects: SubjectRow[];
  selectedSubject: string | null;
  onSubjectChange: (id: string | null) => void;
  search: string;
  onSearchChange: (v: string) => void;
  sort: SortOption;
  onSortChange: (v: SortOption) => void;
  view: "grid" | "list";
  onViewChange: (v: "grid" | "list") => void;
}

export function Filters({
  subjects,
  selectedSubject,
  onSubjectChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  view,
  onViewChange,
}: FiltersProps) {
  return (
    <div className="filters">
      {/* Search */}
      <div className="search-wrap">
        <span className="search-icon">🔍</span>
        <input
          type="search"
          id="search-input"
          className="search-input"
          placeholder="Search files, descriptions, uploaders…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* Subject chips */}
      <div className="subject-chips">
        <button
          className={`chip ${!selectedSubject ? "chip--active" : ""}`}
          onClick={() => onSubjectChange(null)}
        >
          All
        </button>
        {subjects.map((s) => (
          <button
            key={s.id}
            className={`chip ${selectedSubject === s.id ? "chip--active" : ""}`}
            onClick={() => onSubjectChange(s.id)}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Sort + View toggle */}
      <div className="filter-row">
        <select
          id="sort-select"
          className="form-select form-select--sm"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A-Z</option>
          <option value="size">Largest first</option>
        </select>

        <div className="view-toggle" role="group" aria-label="View toggle">
          <button
            id="view-grid"
            className={`view-btn ${view === "grid" ? "view-btn--active" : ""}`}
            onClick={() => onViewChange("grid")}
            aria-label="Grid view"
          >
            ▦
          </button>
          <button
            id="view-list"
            className={`view-btn ${view === "list" ? "view-btn--active" : ""}`}
            onClick={() => onViewChange("list")}
            aria-label="List view"
          >
            ☰
          </button>
        </div>
      </div>
    </div>
  );
}
