import type { Metadata } from "next";

export const metadata: Metadata = { title: "Learn" };

const LEVELS = ["Elementary", "Middle School", "High School", "Vocational", "University"];

export default function LearnPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Learn</h1>
      <p className="text-sm text-[var(--cf-text-muted)] mb-10 max-w-[60ch]">
        Open educational resources by level. Content aggregation from open providers arrives with the education provider
        layer.
      </p>
      <div role="list" className="flex flex-wrap gap-2">
        {LEVELS.map((l) => (
          <span
            key={l}
            role="listitem"
            className="rounded-full border border-[var(--cf-border)] bg-[var(--cf-surface)] px-4 py-2 text-sm text-[var(--cf-text-muted)]"
          >
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
