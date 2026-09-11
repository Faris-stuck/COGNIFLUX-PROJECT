import Link from "next/link";
import type { Metadata } from "next";
import { getDict, getServerLocale } from "@/lib/i18n-server";
import { listPrepPrograms, listPrepSubjects } from "@/lib/prep-catalog";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Indonesia Preparation | Cogniflux",description:"Dynamic Indonesian exam and school preparation catalog."};
export default async function PersiapanPage(){
 const locale=await getServerLocale(); const t=await getDict(locale); const programs=await listPrepPrograms();
 const catalog=await Promise.all(programs.map(async p=>({program:p,subjects:await listPrepSubjects(p.id)})));
 const label=(x:{id?:string;en?:string})=>x[locale]??x.en??x.id??"";
 return <div className="max-w-6xl mx-auto px-4 py-10 pb-24">
  <section className="max-w-3xl pt-4 pb-10"><p className="text-xs uppercase tracking-[0.16em] text-[var(--cf-accent-strong)] font-semibold mb-3">{t.prep.eyebrow}</p><h1 className="text-3xl md:text-4xl font-semibold tracking-tight leading-tight">{t.prep.title}</h1><p className="mt-4 text-[15px] leading-relaxed text-[var(--cf-text-muted)]">{t.prep.subtitle}</p><div className="mt-6 flex flex-wrap gap-2"><Link href="/learn" className="rounded-[10px] bg-[var(--cf-accent)] text-white px-4 py-2.5 text-sm font-medium">{t.prep.openMaterials}</Link><Link href="/search?q=UTBK%20SNBT%20penalaran" className="rounded-[10px] border border-[var(--cf-border)] px-4 py-2.5 text-sm font-medium">{t.prep.practiceSearch}</Link></div></section>
  <div className="space-y-10">{catalog.map(({program,subjects})=><section key={program.slug} aria-labelledby={`program-${program.slug}`} className="border-t border-[var(--cf-border)] pt-7"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id={`program-${program.slug}`} className="text-xl font-semibold">{label(program.title)}</h2><p className="text-sm text-[var(--cf-text-muted)] mt-1">{label(program.description)}</p></div>{program.officialUrl&&<a href={program.officialUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--cf-text-muted)] hover:text-[var(--cf-text)]">{t.prep.officialSource}</a>}</div><div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{subjects.map(s=><Link key={s.id} href={`/persiapan/${encodeURIComponent(program.slug)}/${encodeURIComponent(s.slug)}`} className="rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-4 hover:border-[var(--cf-accent)] transition"><h3 className="font-medium">{label(s.title)}</h3><p className="mt-1 text-xs text-[var(--cf-text-muted)] line-clamp-2">{label(s.description)}</p></Link>)}</div></section>)}</div>
 </div>;
}
