import { getServerLocale,getDict } from "@/lib/i18n-server";
import { PrepTryoutList } from "@/components/prep-tryout-list";
export const dynamic="force-dynamic";
export default async function Page(){const t=await getDict(await getServerLocale());return <div className="max-w-5xl mx-auto px-4 py-10 pb-24"><h1 className="text-3xl font-semibold tracking-tight">{t.prep.tryoutTitle}</h1><p className="mt-2 text-sm text-[var(--cf-text-muted)]">{t.prep.tryoutSubtitle}</p><PrepTryoutList/></div>}
