"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dictionary, Locale } from "@/lib/i18n";
import { localeCookie } from "@/lib/i18n";

type Ctx = { locale: Locale; t: Dictionary; setLocale: (locale: Locale) => void };
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ initialLocale, initialDictionary, children }: { initialLocale: Locale; initialDictionary: Dictionary; children: React.ReactNode }) {
  const router = useRouter();
  const [locale, setState] = useState<Locale>(initialLocale);
  const [dictionary, setDictionary] = useState<Dictionary>(initialDictionary);
  useEffect(() => {
    const saved = window.localStorage.getItem(localeCookie);
    if (saved === "id" || saved === "en") setState(saved);
    let alive = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { user?: { locale?: string | null } } | null) => {
        const preferred = data?.user?.locale;
        if (alive && (preferred === "id" || preferred === "en")) {
          setState(preferred);
          window.localStorage.setItem(localeCookie, preferred);
          document.cookie = `${localeCookie}=${preferred}; Path=/; Max-Age=31536000; SameSite=Lax`;
        }
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const setLocale = async (next: Locale) => {
    setState(next);
    window.localStorage.setItem(localeCookie, next);
    document.cookie = `${localeCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    fetch(`/api/i18n?locale=${next}`).then(async r => r.ok ? r.json() : null).then(d => { if(d?.dictionary) setDictionary(d.dictionary); }).catch(() => undefined);
    fetch("/api/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: next }) }).catch(() => undefined);
    router.refresh();
  };
  const value = useMemo(() => ({ locale, t: dictionary, setLocale }), [locale, dictionary]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n() { const ctx = useContext(I18nContext); if (!ctx) throw new Error("useI18n must be used inside I18nProvider"); return ctx; }
