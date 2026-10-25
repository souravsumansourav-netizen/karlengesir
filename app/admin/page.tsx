"use client";

import { useAdmin } from "@/hooks/useAdmin";
import { useFiles } from "@/hooks/useFiles";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatBytes } from "@/lib/utils";
import Link from "next/link";
import toast from "react-hot-toast";

interface QuotaData {
  totalBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  usedGb: number;
  quotaGb: number;
  percentUsed: number;
  formattedUsed: string;
  formattedQuota: string;
}

export default function AdminDashboard() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { files, subjects, loading } = useFiles();
  const router = useRouter();

  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    if (!adminLoading && !isAdmin) {
      router.replace("/admin/login");
    }
  }, [isAdmin, adminLoading, router]);

  const fetchQuota = () => {
    fetch("/api/quota")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setQuota(d);
      })
      .catch((err) => console.warn("Could not load quota:", err));
  };

  useEffect(() => {
    fetchQuota();
  }, [files]);

  const handleCleanMultipart = async () => {
    if (!confirm("Search Backblaze B2 for stale unfinished multipart uploads older than 24 hours and abort them to free storage?")) {
      return;
    }

    setCleaning(true);
    try {
      const res = await fetch("/api/admin/clean-multipart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ olderThanHours: 24 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cleanup failed");

      toast.success(data.message || `Cleaned up ${data.cleanedCount} stale uploads.`);
      fetchQuota();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Cleanup failed");
    } finally {
      setCleaning(false);
    }
  };

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

  const totalSize = files.reduce((s, f) => s + Number(f.size_bytes || 0), 0);
  const totalDownloads = files.reduce((s, f) => s + Number(f.download_count || 0), 0);

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <AdminSidebar />
      </aside>

      <div className="admin-main">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">Admin Dashboard</h1>
            <p className="admin-subtitle">
              Manage files, subjects, and Backblaze B2 storage quotas
            </p>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={cleaning}
            onClick={handleCleanMultipart}
            title="Clean orphaned Backblaze B2 multipart chunks"
          >
            🧹 {cleaning ? "Cleaning…" : "Clean Stale Uploads"}
          </button>
        </div>

        {/* Free-tier Storage Quota Widget */}
        {quota && (
          <div className="stat-card quota-card" style={{ marginBottom: "1.5rem" }}>
            <div className="quota-bar__header" style={{ marginBottom: "0.5rem" }}>
              <div>
                <span className="stat-card__label" style={{ fontSize: "0.95rem" }}>
                  📦 Backblaze B2 Storage Quota (Free Tier)
                </span>
                <p className="text-muted text-sm" style={{ marginTop: "0.25rem" }}>
                  Enforcing free-tier budget with 0 cost and no credit card required
                </p>
              </div>
              <span className="stat-card__value" style={{ fontSize: "1.25rem" }}>
                {quota.formattedUsed} of {quota.formattedQuota} used ({quota.percentUsed}%)
              </span>
            </div>
            <div className="quota-bar__track" style={{ height: "10px" }}>
              <div
                className={`quota-bar__fill ${
                  quota.percentUsed > 85 ? "quota-bar__fill--warning" : ""
                }`}
                style={{ width: `${Math.min(100, quota.percentUsed)}%` }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem" }}>
              <span className="text-muted text-xs">0 GB</span>
              <span className="text-muted text-xs">Remaining: {formatBytes(quota.remainingBytes)}</span>
              <span className="text-muted text-xs">{quota.formattedQuota} Cap</span>
            </div>
          </div>
        )}

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
            <span className="stat-card__label">Total File Size</span>
            <span className="stat-card__value" style={{ fontSize: "1.25rem" }}>
              {formatBytes(totalSize)}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-card__icon">⬇️</span>
            <span className="stat-card__label">Total Downloads</span>
            <span className="stat-card__value">{totalDownloads}</span>
          </div>
        </div>

        {/* Quick links & actions */}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
          <Link href="/admin/files" className="btn btn--primary">
            📁 Manage Files (Bulk Delete)
          </Link>
          <Link href="/admin/subjects" className="btn btn--ghost">
            🗂️ Manage Subjects
          </Link>
          <Link href="/" className="btn btn--ghost">
            🌐 View Public Site
          </Link>
        </div>
      </div>
    </div>
  );
}

function AdminSidebar() {
  return (
    <>
      <p className="admin-sidebar__title">Admin Control</p>
      <nav>
        <Link href="/admin" className="admin-nav-link admin-nav-link--active">
          📊 Dashboard
        </Link>
        <Link href="/admin/files" className="admin-nav-link">
          📁 Files & Bulk Delete
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
