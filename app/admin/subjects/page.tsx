"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAdmin } from "@/hooks/useAdmin";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/utils";
import type { SubjectRow } from "@/lib/database.types";
import toast from "react-hot-toast";
import Link from "next/link";

export default function AdminSubjectsPage() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!adminLoading && !isAdmin) router.replace("/admin/login");
  }, [isAdmin, adminLoading, router]);

  const fetchSubjects = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("subjects")
      .select("*")
      .order("name");
    setSubjects(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchSubjects(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createSubject = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    const { error } = await supabase
      .from("subjects")
      .insert({ name, slug: slugify(name) });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Subject "${name}" created`);
      setNewName("");
      fetchSubjects();
    }
    setCreating(false);
  };

  const saveEdit = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    const { error } = await supabase
      .from("subjects")
      .update({ name, slug: slugify(name) })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Subject renamed");
      setEditingId(null);
      fetchSubjects();
    }
  };

  const deleteSubject = async (id: string) => {
    // Check if any files reference this subject
    const { count } = await supabase
      .from("files")
      .select("id", { count: "exact", head: true })
      .eq("subject_id", id);

    if ((count ?? 0) > 0) {
      toast.error(
        `Cannot delete: ${count} file(s) still belong to this subject. Reassign them first.`
      );
      setDeleteConfirmId(null);
      return;
    }

    setDeletingId(id);
    const { error } = await supabase
      .from("subjects")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Subject deleted");
      fetchSubjects();
    }
    setDeletingId(null);
    setDeleteConfirmId(null);
  };

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <p className="admin-sidebar__title">Admin</p>
        <nav>
          <Link href="/admin" className="admin-nav-link">📊 Dashboard</Link>
          <Link href="/admin/files" className="admin-nav-link">📁 Files</Link>
          <Link href="/admin/subjects" className="admin-nav-link admin-nav-link--active">🗂️ Subjects</Link>
          <Link href="/" className="admin-nav-link">🌐 View Site</Link>
        </nav>
      </aside>

      <div className="admin-main">
        <div className="admin-header">
          <h1 className="admin-title">Subjects</h1>
        </div>

        {/* Create new subject */}
        <div className="select-with-action" style={{ maxWidth: 480 }}>
          <input
            type="text"
            className="form-input"
            placeholder="New subject name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createSubject()}
          />
          <button
            className="btn btn--primary"
            disabled={creating || !newName.trim()}
            onClick={createSubject}
          >
            {creating ? "…" : "Create"}
          </button>
        </div>

        {/* Subject list */}
        {loading ? (
          <div style={{ color: "var(--text-muted)" }}>Loading…</div>
        ) : subjects.length === 0 ? (
          <p className="text-muted">No subjects yet.</p>
        ) : (
          <div className="subject-table">
            {subjects.map((s) => (
              <div key={s.id} className="subject-row">
                {editingId === s.id ? (
                  <>
                    <input
                      className="form-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit(s.id)}
                      autoFocus
                    />
                    <div className="subject-row__actions">
                      <button className="btn btn--primary btn--sm" onClick={() => saveEdit(s.id)}>
                        Save
                      </button>
                      <button className="btn btn--ghost btn--sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1 }}>
                      <span className="subject-row__name">{s.name}</span>
                      <span className="subject-row__slug"> /{s.slug}</span>
                    </div>
                    <div className="subject-row__actions">
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => { setEditingId(s.id); setEditName(s.name); }}
                      >
                        Rename
                      </button>
                      {deleteConfirmId !== s.id ? (
                        <button
                          className="btn btn--danger btn--sm"
                          onClick={() => setDeleteConfirmId(s.id)}
                        >
                          Delete
                        </button>
                      ) : (
                        <>
                          <button
                            className="btn btn--danger btn--sm"
                            disabled={deletingId === s.id}
                            onClick={() => deleteSubject(s.id)}
                          >
                            {deletingId === s.id ? "…" : "Confirm"}
                          </button>
                          <button
                            className="btn btn--ghost btn--sm"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
