import { cookies } from "next/headers";
import type { Dictionary, Locale } from "@/lib/i18n";
import { getCms } from "@/lib/cms";
export async function getServerLocale(): Promise<Locale> {
  const c = await cookies(); const value = c.get("cf_locale")?.value; return value === "en" ? "en" : "id";
}
export async function getDict(locale: Locale): Promise<Dictionary> { return getCms<Dictionary>("i18n", locale); }
