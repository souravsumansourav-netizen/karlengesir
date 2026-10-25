"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export function useAdmin() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    const checkAdmin = async (u: User | null) => {
      if (!u) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", u.id)
        .maybeSingle();
      setIsAdmin(!!data);
      setLoading(false);
    };

    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u);
      checkAdmin(u);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        setLoading(true);
        checkAdmin(u);
      }
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  return { user, isAdmin, loading };
}
