"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";

interface Me {
  user?: { id: string; email: string };
}

/** Sign out: clears session server-side, then refreshes server components. */
export function LogoutButton() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={async () => {
        setDone(true);
        setError(false);
        try {
          const res = await fetch("/api/auth/logout", { method: "POST" });
          if (!res.ok) { setError(true); setDone(false); return; }
          window.location.href = "/";
        } catch {
          setError(true);
          setDone(false);
        }
      }}
      className="text-sm text-[var(--cf-text-muted)] hover:text-[var(--cf-text)] transition-colors"
    >
      {error ? `${t.common.signOut} — ${t.common.retry}` : done ? "…" : t.common.signOut}
    </button>
  );
}
