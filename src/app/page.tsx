import { SearchBar } from "@/components/search-bar";
import { WorkCard } from "@/components/work-card";
import { getHomeFeed } from "@/lib/home-feed";
import Link from "next/link";

const SUGGESTIONS = [
  { group: "Papers", items: ["impact of AI on education", "machine learning for climate", "CRISPR gene editing review"] },
  { group: "Education", items: ["calculus textbook", "basic physics materials", "intro to programming"] },
  { group: "Research", items: ["research gap: e-learning Indonesia", "trends in renewable energy"] },
];

const TOPICS = [
  "Machine Learning",
  "Climate Change",
  "Public Health",
  "Neuroscience",
  "Renewable Energy",
  "Quantum Computing",
  "Genomics",
  "Behavioral Economics",
];

export default async function HomePage() {
  // Cache-first (Redis, 6h): render almost never blocks on upstream providers.
  const feed = await getHomeFeed();
  const hasFeed = feed.trending.length > 0 || feed.latest.length > 0;

  return (
    <div className="max-w-3xl mx-auto px-4 pt-14 pb-24">
      <div className="flex flex-col gap-6">
        {/* Compact hero */}
        <div className="flex flex-col gap-5">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tighter leading-[1.15]">
            Explore Knowledge.
            <br />
            Discover Research.
          </h1>
          <SearchBar />
        </div>

        {hasFeed ? (
          <>
            {feed.trending.length > 0 && (
              <section aria-labelledby="trending-heading" className="pt-4">
                <h2 id="trending-heading" className="text-sm font-medium uppercase tracking-wide text-[var(--cf-text-muted)] mb-1">
                  Trending Research
                </h2>
                <div>
                  {feed.trending.map((work) => (
                    <WorkCard key={work.id} work={work} />
                  ))}
                </div>
              </section>
            )}

            {feed.latest.length > 0 && (
              <section aria-labelledby="latest-heading" className="pt-8">
                <h2 id="latest-heading" className="text-sm font-medium uppercase tracking-wide text-[var(--cf-text-muted)] mb-1">
                  Latest Research
                </h2>
                <div>
                  {feed.latest.map((work) => (
                    <WorkCard key={work.id} work={work} />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          /* Total provider outage or cold empty pipeline -> static fallback, never an empty page */
          <div className="grid sm:grid-cols-3 gap-6 pt-4">
            {SUGGESTIONS.map((group) => (
              <section key={group.group}>
                <h2 className="text-sm font-medium mb-2">{group.group}</h2>
                <ul className="flex flex-col gap-1.5">
                  {group.items.map((item) => (
                    <li key={item}>
                      <Link
                        href={`/search?q=${encodeURIComponent(item)}`}
                        className="text-sm text-[var(--cf-text-muted)] hover:text-[var(--cf-accent-strong)] transition-colors line-clamp-1"
                      >
                        {item}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {/* Explore Topics */}
        <section aria-labelledby="topics-heading" className="pt-10">
          <h2 id="topics-heading" className="text-sm font-medium uppercase tracking-wide text-[var(--cf-text-muted)] mb-3">
            Explore Topics
          </h2>
          <ul className="flex flex-wrap gap-2">
            {TOPICS.map((topic) => (
              <li key={topic}>
                <Link
                  href={`/search?q=${encodeURIComponent(topic)}`}
                  className="inline-block text-sm rounded-full border border-[var(--cf-border)] px-3.5 py-1.5 text-[var(--cf-text-muted)] hover:text-[var(--cf-accent-strong)] hover:border-[var(--cf-accent)] transition-colors"
                >
                  {topic}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-sm text-[var(--cf-text-muted)] max-w-[60ch] pt-4">
          Cogniflux searches open academic sources like OpenAlex and Crossref in parallel, removes duplicates, and ranks
          what matters. Free for students, teachers, and researchers everywhere.
        </p>
      </div>
    </div>
  );
}
