import Link from "next/link";

export default function ExplorePage() {
  const topics = [
    "artificial intelligence", "climate change", "public health", "machine learning",
    "renewable energy", "neuroscience", "education technology", "microbiology",
    "economics", "materials science", "robotics", "nutrition",
  ];
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Explore</h1>
      <p className="text-sm text-[var(--cf-text-muted)] mb-10">Browse active research topics across open science.</p>
      <div role="list" className="flex flex-wrap gap-2">
        {topics.map((t) => (
          <Link
            key={t}
            role="listitem"
            href={`/search?q=${encodeURIComponent(t)}`}
            className="rounded-full border border-[var(--cf-border)] bg-[var(--cf-surface)] px-4 py-2 text-sm hover:border-[var(--cf-accent)] hover:text-[var(--cf-accent-strong)] transition-colors capitalize"
          >
            {t}
          </Link>
        ))}
      </div>
    </div>
  );
}
