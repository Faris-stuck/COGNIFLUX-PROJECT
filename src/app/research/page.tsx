import type { Metadata } from "next";
import { getServerLocale, getDict } from "@/lib/i18n-server";
import { ResearchWorkspace } from "@/components/research-workspace";

export const metadata: Metadata = { title: "Research" };
export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const t = await getDict(await getServerLocale());
  return <div className="max-w-6xl mx-auto px-4 py-10 md:py-12"><h1 className="text-2xl font-semibold tracking-tight">{t.research.title}</h1><p className="mt-2 text-sm text-[var(--cf-text-muted)] max-w-[65ch]">{t.research.workspaceSubtitle}</p><ResearchWorkspace/></div>;
}
