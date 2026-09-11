"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setError(data.message ?? t.common.tryAgain);
        return;
      }
      router.push("/library");
      router.refresh();
    } catch {
      setError(t.common.tryAgain);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-20">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">
        {mode === "login" ? t.auth.welcome : t.auth.createTitle}
      </h1>
      <p className="text-sm text-[var(--cf-text-muted)] mb-8">
        {mode === "login"
          ? t.auth.loginText
          : t.auth.registerText}
      </p>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="block text-sm mb-1.5">{t.auth.email}</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-[10px] border border-[var(--cf-border)] bg-transparent px-3.5 py-2.5 text-sm outline-none focus:border-[var(--cf-accent)] transition-colors"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm mb-1.5">{t.auth.password}</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "register" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={mode === "register" ? "pw-hint" : undefined}
            className="w-full rounded-[10px] border border-[var(--cf-border)] bg-transparent px-3.5 py-2.5 text-sm outline-none focus:border-[var(--cf-accent)] transition-colors"
          />
          {mode === "register" && (
            <p id="pw-hint" className="text-xs text-[var(--cf-text-muted)] mt-1.5">
              {t.auth.passwordHint}
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-[10px] border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm px-3.5 py-2.5">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="w-full rounded-[10px] bg-[var(--cf-accent)] hover:bg-[var(--cf-accent-strong)] active:scale-[0.99] transition text-white text-sm font-medium py-2.5 disabled:opacity-50 disabled:pointer-events-none"
        >
          {loading ? t.auth.wait : mode === "login" ? t.auth.signIn : t.auth.create}
        </button>
      </form>

      <p className="text-sm text-[var(--cf-text-muted)] mt-6">
        {mode === "login" ? (
          <>
            {t.auth.newHere}{" "}
            <Link href="/login?mode=register" className="text-[var(--cf-accent-strong)] hover:underline">
              {t.auth.createAccount}
            </Link>
          </>
        ) : (
          <>
            {t.auth.already}{" "}
            <Link href="/login" className="text-[var(--cf-accent-strong)] hover:underline">
              {t.auth.signIn}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
