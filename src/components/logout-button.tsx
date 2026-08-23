"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Me {
  user?: { id: string; email: string };
}

/** Sign out: clears session server-side, then refreshes server components. */
export function LogoutButton() {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        setDone(true);
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/";
      }}
      className="text-sm text-[var(--cf-text-muted)] hover:text-[var(--cf-text)] transition-colors"
    >
      {done ? "…" : "Sign out"}
    </button>
  );
}
