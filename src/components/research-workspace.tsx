"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";

type Work={id:string;title:string;authors?:string[];year?:number|string;doi?:string;abstract?:string;primaryLocation?:{source?:string};};

export function ResearchWorkspace(){
  const {t}=useI18n();
  const [query,setQuery]=useState(""); const [loading,setLoading]=useState(false); const [error,setError]=useState(false); const [works,setWorks]=useState<Work[]>([]); const [selected,setSelected]=useState<string[]>([]);
  async function runSearch(e?:React.FormEvent){ e?.preventDefault(); if(!query.trim()) return; setLoading(true); setError(false); try{ const r=await fetch(`/api/search?q=${encodeURIComponent(query.trim())}&page=1&perPage=12&sort=relevance`,{cache:"no-store"}); if(!r.ok) throw new Error(); const d=await r.json(); setWorks((d.works??[]) as Work[]); setSelected([]);}catch{setError(true)}finally{setLoading(false)} }
  function toggle(id:string){ setSelected(s=>s.includes(id)?s.filter(x=>x!==id):s.length<5?[...s,id]:s); }
  const picked=useMemo(()=>works.filter(w=>selected.includes(w.id)),[works,selected]);
  return <div className="mt-8 space-y-8">
    <form onSubmit={runSearch} className="rounded-2xl border p-5 md:p-6">
      <div className="flex flex-col md:flex-row gap-3">
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t.research.questionPlaceholder} aria-label={t.research.questionPlaceholder} className="min-w-0 flex-1 rounded-xl border border-[var(--cf-border)] bg-transparent px-4 py-3 text-sm outline-none focus:border-[var(--cf-accent)]"/>
        <button type="submit" disabled={loading||!query.trim()} className="rounded-xl bg-[var(--cf-accent)] px-5 py-3 text-sm font-medium text-white disabled:opacity-50">{loading?t.research.searching:t.research.runSearch}</button>
      </div>
      {error&&<p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{t.research.searchError}</p>}
    </form>

    {works.length>0&&<section aria-labelledby="research-results">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div><h2 id="research-results" className="text-lg font-semibold">{t.research.results}</h2><p className="text-sm text-[var(--cf-text-muted)]">{t.research.selectUpToFive} · {selected.length} {t.research.selected}</p></div>
        <div className="flex gap-2">
          {selected.length>0&&<button type="button" onClick={()=>setSelected([])} className="rounded-lg border px-3 py-2 text-xs">{t.research.clearSelection}</button>}
          <button type="button" disabled={!selected.length} onClick={()=>document.getElementById("comparison")?.scrollIntoView({behavior:"smooth"})} className="rounded-lg bg-[var(--cf-accent)] px-3 py-2 text-xs text-white disabled:opacity-40">{t.research.compareSelected}</button>
        </div>
      </div>
      <div className="divide-y border-t border-[var(--cf-border)]">
        {works.map(w=><article key={w.id} className="py-5 flex gap-4">
          <button type="button" aria-pressed={selected.includes(w.id)} onClick={()=>toggle(w.id)} className={`mt-1 h-5 w-5 shrink-0 rounded border ${selected.includes(w.id)?"bg-[var(--cf-accent)] border-[var(--cf-accent)]":"border-[var(--cf-border)]"}`} aria-label={`${t.research.selectUpToFive}: ${w.title}`}>{selected.includes(w.id)?"✓":""}</button>
          <div className="min-w-0 flex-1"><Link href={`/paper/${encodeURIComponent(w.id)}`} className="font-medium hover:text-[var(--cf-accent-strong)]">{w.title}</Link><p className="mt-1 text-xs text-[var(--cf-text-muted)]">{[w.year,w.authors?.slice(0,3).join(", "),w.primaryLocation?.source].filter(Boolean).join(" · ")}</p><p className="mt-2 text-sm leading-relaxed text-[var(--cf-text-muted)] line-clamp-3">{w.abstract??t.research.noAbstract}</p><Link href={`/paper/${encodeURIComponent(w.id)}`} className="inline-block mt-3 text-xs text-[var(--cf-accent-strong)]">{t.research.analyzeSelected} →</Link></div>
        </article>)}
      </div>
    </section>}

    <section id="comparison" className="rounded-2xl border p-5 md:p-6">
      <h2 className="text-lg font-semibold">{t.research.comparison}</h2>
      {picked.length===0?<p className="mt-2 text-sm text-[var(--cf-text-muted)]">{t.research.noSelection}</p>:<div className="mt-4 grid gap-4 md:grid-cols-2">{picked.map(w=><article key={w.id} className="rounded-xl border border-[var(--cf-border)] p-4"><Link href={`/paper/${encodeURIComponent(w.id)}`} className="font-medium hover:text-[var(--cf-accent-strong)]">{w.title}</Link><dl className="mt-3 space-y-2 text-sm"><div><dt className="text-xs text-[var(--cf-text-muted)]">{t.research.authors}</dt><dd>{w.authors?.join(", ")||"—"}</dd></div><div><dt className="text-xs text-[var(--cf-text-muted)]">{t.research.year}</dt><dd>{w.year||"—"}</dd></div><div><dt className="text-xs text-[var(--cf-text-muted)]">{t.research.provider}</dt><dd>{w.primaryLocation?.source||"—"}</dd></div></dl></article>)}</div>}
    </section>
  </div>
}
