import type { Work } from "@/lib/types";
import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

async function fetchWork(id: string): Promise<Work | null> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
  try {
    const res = await fetch(`${origin}/api/papers/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Work;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const work = await fetchWork(id);
  return { title: work?.title ?? "Paper not found" };
}

export default async function PaperPage({ params }: Props) {
  const { id } = await params;
  let decoded = id;
  try {
    decoded = decodeURIComponent(id);
  } catch {
    /* keep raw */
  }
  const work = await fetchWork(decoded);

  if (!work) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <h1 className="text-xl font-semibold mb-2">We couldn&apos;t find this paper.</h1>
        <p className="text-sm text-[var(--cf-text-muted)] mb-8">
          It may have been removed from the source, or the link is incorrect.
        </p>
        <Link href="/" className="text-sm font-medium text-[var(--cf-accent-strong)] hover:underline">
          Back to search
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href="javascript:history.back()" className="text-sm text-[var(--cf-text-muted)] hover:text-[var(--cf-text)] mb-6 inline-block">
        Back
      </Link>

      <header className="mb-8">
        {work.journal && (
          <p className="text-sm text-[var(--cf-text-muted)] mb-2">
            {work.publicationYear ?? "n.d."} · {work.journal}
            {work.publisher ? ` · ${work.publisher}` : ""}
          </p>
        )}
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight mb-4">{work.title}</h1>
        {work.authors.length > 0 && (
          <p className="text-sm text-[var(--cf-text-muted)] max-w-[65ch]">
            {work.authors.slice(0, 10).map((a) => a.name).join(", ")}
            {work.authors.length > 10 ? ` and ${work.authors.length - 10} others` : ""}
          </p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-8">
        {work.doi && (
          <a
            href={`https://doi.org/${work.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-[10px] bg-[var(--cf-accent)] hover:bg-[var(--cf-accent-strong)] active:scale-[0.98] transition text-white text-sm font-medium px-4 py-2"
          >
            Read at source
          </a>
        )}
        {work.openAccess.isOa && work.openAccess.url && (
          <a
            href={work.openAccess.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-[10px] border border-[var(--cf-border)] hover:border-[var(--cf-accent)] transition-colors text-sm px-4 py-2"
          >
            Open-access PDF
          </a>
        )}
        {work.citationCount != null && work.citationCount > 0 && (
          <span className="text-sm text-[var(--cf-text-muted)]">{work.citationCount.toLocaleString("id-ID")} citations</span>
        )}
      </div>

      {work.abstract && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--cf-text-muted)] mb-2">Abstract</h2>
          <p className="leading-relaxed max-w-[70ch]">{work.abstract}</p>
        </section>
      )}

      {work.subjects.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--cf-text-muted)] mb-2">Subjects</h2>
          <ul className="flex flex-wrap gap-2">
            {work.subjects.map((s) => (
              <li key={s} className="rounded-full border border-[var(--cf-border)] px-3 py-1 text-xs text-[var(--cf-text-muted)]">
                {s}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-t border-[var(--cf-border)] pt-6 grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
        <Meta label="DOI" value={work.doi ? <code className="font-mono text-xs">{work.doi}</code> : null} />
        <Meta label="Type" value={work.type.replace("-", " ")} />
        <Meta label="Language" value={work.language ?? null} />
        <Meta
          label="Sources"
          value={
            <>
              {work.sources.join(", ")}
              {!work.openAccess.isOa && (
                <span className="block text-xs text-[var(--cf-text-muted)] mt-1">
                  Full text availability depends on the source. Check &quot;Read at source&quot; for access options.
                </span>
              )}
            </>
          }
        />
      </section>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode | null }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--cf-text-muted)] inline mr-2">{label}:</dt>
      <dd className="inline">{value}</dd>
    </div>
  );
}
