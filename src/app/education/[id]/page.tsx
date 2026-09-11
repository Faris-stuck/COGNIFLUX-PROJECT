import Link from "next/link";
import { notFound } from "next/navigation";
import { EducationOrchestrator } from "@/lib/education/orchestrator";

import { SaveResourceButton } from "@/components/save-resource-button";
import { getServerLocale, getDict } from "@/lib/i18n-server";
import { getCms } from "@/lib/cms";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  textbook: "Textbook",
  article: "Article",
  lesson: "Lesson",
  course: "Course",
  module: "Module",
  exercise: "Exercise",
  reference: "Reference",
  interactive: "Interactive",
  video: "Video",
  other: "Resource",
};

function Meta({ term, value }: { term: string; value: React.ReactNode }) {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div className="flex gap-3 py-2 border-b border-[var(--cf-border)] last:border-b-0">
      <dt className="w-32 shrink-0 text-sm text-[var(--cf-text-muted)]">{term}</dt>
      <dd className="text-sm flex-1">{value}</dd>
    </div>
  );
}

export default async function EducationResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let resource = null;
  try {
    resource = await new EducationOrchestrator().getResource(decodeURIComponent(id));
  } catch {
    resource = null;
  }
  if (!resource) notFound();
  const t = await getDict(await getServerLocale());
  const taxonomy = await getCms<any>("education.taxonomy", await getServerLocale());
  const levelLabel = (x:string) => taxonomy.levels.find((v:any)=>v.slug===x)?.label?.en ?? x;
  const subjectLabel = (x:string) => taxonomy.subjects.find((v:any)=>v.slug===x)?.label?.en ?? x;

  // Deterministic related resources: same subject + same level, excluding self.
  let related: Awaited<ReturnType<EducationOrchestrator["search"]>>["resources"] = [];
  const primarySubject = resource.subject[0];
  if (primarySubject) {
    try {
      const res = await new EducationOrchestrator().search({
        q: "",
        page: 1,
        perPage: 12,
        level: [],
        grade: undefined,
        subject: [primarySubject],
        language: [],
        resourceType: [],
        format: [],
        provider: [],
        yearFrom: undefined,
        yearTo: undefined,
      });
      related = res.resources.filter((r) => r.id !== resource!.id).slice(0, 5);
    } catch {
      related = [];
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link href="/learn" className="text-sm text-[var(--cf-text-muted)] hover:text-[var(--cf-text)] transition-colors">
        ← {t.educationDetail.back}
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight mt-4">{resource.title}</h1>
      {resource.description && <p className="mt-3 text-[15px] leading-relaxed text-[var(--cf-text-muted)] max-w-[65ch]">{resource.description}</p>}

      <div className="flex flex-wrap items-center gap-3 mt-6">
        {(() => {
          const url = resource.readUrl ?? resource.sourceUrl;
          return url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-[10px] bg-[var(--cf-accent)] text-white px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {t.educationDetail.open} ↗
            </a>
          ) : null;
        })()}
        {/* Save via library API (client-side action) */}
        <SaveResourceButton
          resourceId={resource.id}
          title={resource.title}
          authors={resource.authors.slice(0, 10)}
          year={resource.year ?? null}
          publisher={resource.publisher ?? null}
          readUrl={resource.readUrl ?? resource.sourceUrl ?? null}
        />
      </div>

      <dl className="mt-8 border border-[var(--cf-border)] rounded-[10px] bg-[var(--cf-surface)] px-4 py-2">
        <Meta term={t.educationDetail.author} value={resource.authors.map((a) => a.name).join(", ") || null} />
        <Meta term={t.educationDetail.publisher} value={resource.publisher} />
        <Meta term={t.educationDetail.level} value={resource.educationLevel.map((l) => levelLabel(l)).join(", ")} />
        <Meta term={t.educationDetail.grade} value={resource.grade} />
        <Meta term={t.educationDetail.subject} value={resource.subject.map((s) => subjectLabel(s)).join(", ")} />
        <Meta term={t.educationDetail.language} value={resource.language.toUpperCase()} />
        <Meta term={t.educationDetail.resourceType} value={TYPE_LABELS[resource.resourceType] ?? resource.resourceType} />
        <Meta term={t.educationDetail.format} value={resource.format.join(", ")} />
        <Meta
          term={t.educationDetail.source}
          value={
            resource.sourceUrl ? (
              <a href={resource.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--cf-accent-strong)]">
                {resource.source === "openstax" ? "OpenStax" : resource.source === "otl" ? "Open Textbook Library" : resource.source} ↗
              </a>
            ) : (
              resource.source
            )
          }
        />
        <Meta term={t.educationDetail.license} value={resource.license} />
        <Meta term={t.educationDetail.year} value={resource.year} />
        <Meta term={t.educationDetail.updated} value={resource.updatedAt ? resource.updatedAt.slice(0, 10) : null} />
      </dl>

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="font-medium">{t.educationDetail.related}</h2>
          <ul className="mt-3 space-y-2">
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/education/${encodeURIComponent(r.id)}`}
                  className="text-sm hover:text-[var(--cf-accent-strong)] transition-colors"
                >
                  {r.title}
                </Link>
                <span className="text-sm text-[var(--cf-text-muted)]">
                  {" "}
                  · {levelLabel(r.educationLevel[0])} ·{" "}
                  {subjectLabel(r.subject[0])}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
