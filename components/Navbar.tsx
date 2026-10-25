"use client";

import Link from "next/link";
import { useTheme } from "./ThemeProvider";
import { useAdmin } from "@/hooks/useAdmin";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export function Navbar() {
  const { theme, toggle } = useTheme();
  const { isAdmin, user } = useAdmin();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.push("/");
    router.refresh();
  };

  return (
    <header className="navbar">
      <div className="navbar__inner">
        <Link href="/" className="navbar__brand">
          <span className="navbar__logo">📚</span>
          <span className="navbar__name">FileShare</span>
        </Link>

        <nav className="navbar__nav">
          {isAdmin && (
            <Link href="/admin" className="nav-link">
              Admin Panel
            </Link>
          )}
          {user && isAdmin ? (
            <button className="btn btn--ghost btn--sm" onClick={handleLogout}>
              Sign out
            </button>
          ) : (
            <Link href="/admin/login" className="nav-link">
              Admin Login
            </Link>
          )}
          <button
            className="theme-toggle"
            onClick={toggle}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </nav>
      </div>
    </header>
  );
}
