import Link from "next/link";
import { notFound } from "next/navigation";
import { EducationOrchestrator } from "@/lib/education/orchestrator";
import { LEVEL_LABELS, SUBJECT_LABELS, type EducationSubject } from "@/lib/education/types";
import { SaveResourceButton } from "@/components/save-resource-button";

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
        subject: [primarySubject as EducationSubject],
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
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link href="/learn" className="text-sm text-[var(--cf-text-muted)] hover:text-[var(--cf-text)] transition-colors">
        ← Learn
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
              Open Resource ↗
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
        <Meta term="Author" value={resource.authors.map((a) => a.name).join(", ") || null} />
        <Meta term="Publisher" value={resource.publisher} />
        <Meta term="Level" value={resource.educationLevel.map((l) => LEVEL_LABELS[l]?.en ?? l).join(", ")} />
        <Meta term="Grade" value={resource.grade} />
        <Meta term="Subject" value={resource.subject.map((s) => SUBJECT_LABELS[s as keyof typeof SUBJECT_LABELS]?.en ?? s).join(", ")} />
        <Meta term="Language" value={resource.language.toUpperCase()} />
        <Meta term="Resource type" value={TYPE_LABELS[resource.resourceType] ?? resource.resourceType} />
        <Meta term="Format" value={resource.format.join(", ")} />
        <Meta
          term="Source"
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
        <Meta term="License" value={resource.license} />
        <Meta term="Year" value={resource.year} />
        <Meta term="Updated" value={resource.updatedAt ? resource.updatedAt.slice(0, 10) : null} />
      </dl>

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="font-medium">Related resources</h2>
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
                  · {LEVEL_LABELS[r.educationLevel[0] as keyof typeof LEVEL_LABELS]?.en ?? r.educationLevel[0]} ·{" "}
                  {SUBJECT_LABELS[r.subject[0] as keyof typeof SUBJECT_LABELS]?.en ?? r.subject[0]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
