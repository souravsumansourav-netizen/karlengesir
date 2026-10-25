"use client";

import { useAdmin } from "@/hooks/useAdmin";
import { useFiles } from "@/hooks/useFiles";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { formatBytes } from "@/lib/utils";
import Link from "next/link";

export default function AdminDashboard() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { files, subjects, loading } = useFiles();
  const router = useRouter();

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      router.replace("/admin/login");
    }
  }, [isAdmin, adminLoading, router]);

  if (adminLoading || loading) {
    return (
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <AdminSidebar />
        </aside>
        <div className="admin-main">
          <div className="stats-grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="stat-card">
                <div className="skeleton skeleton--meta" />
                <div className="skeleton skeleton--title" style={{ height: 32, width: "60%" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const totalSize = files.reduce((s, f) => s + (f.size_bytes ?? 0), 0);
  const totalDownloads = files.reduce((s, f) => s + f.download_count, 0);

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <AdminSidebar />
      </aside>

      <div className="admin-main">
        <div className="admin-header">
          <h1 className="admin-title">Admin Dashboard</h1>
        </div>

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-card__icon">📁</span>
            <span className="stat-card__label">Total Files</span>
            <span className="stat-card__value">{files.length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__icon">🗂️</span>
            <span className="stat-card__label">Subjects</span>
            <span className="stat-card__value">{subjects.length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__icon">💾</span>
            <span className="stat-card__label">Total Size</span>
            <span className="stat-card__value" style={{ fontSize: "1.25rem" }}>
              {formatBytes(totalSize)}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-card__icon">⬇️</span>
            <span className="stat-card__label">Downloads</span>
            <span className="stat-card__value">{totalDownloads}</span>
          </div>
        </div>

        {/* Quick links */}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <Link href="/admin/files" className="btn btn--primary">
            Manage Files
          </Link>
          <Link href="/admin/subjects" className="btn btn--ghost">
            Manage Subjects
          </Link>
          <Link href="/" className="btn btn--ghost">
            View Site
          </Link>
        </div>
      </div>
    </div>
  );
}

function AdminSidebar() {
  return (
    <>
      <p className="admin-sidebar__title">Admin</p>
      <nav>
        <Link href="/admin" className="admin-nav-link">
          📊 Dashboard
        </Link>
        <Link href="/admin/files" className="admin-nav-link">
          📁 Files
        </Link>
        <Link href="/admin/subjects" className="admin-nav-link">
          🗂️ Subjects
        </Link>
        <Link href="/" className="admin-nav-link">
          🌐 View Site
        </Link>
      </nav>
    </>
  );
}
