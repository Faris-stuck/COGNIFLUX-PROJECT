import { SearchBar } from "@/components/search-bar";
import { WorkCard } from "@/components/work-card";
import { getHomeFeed } from "@/lib/home-feed";
import Link from "next/link";
import { getServerLocale, getDict } from "@/lib/i18n-server";
import { getHomeSuggestions, getHomeTopics } from "@/lib/site-content";

export default async function HomePage() {
  // Cache-first (Redis, 6h): render almost never blocks on upstream providers.
  const feed = await getHomeFeed();
  const t = await getDict(await getServerLocale());
  const suggestions = await getHomeSuggestions<Array<{group:string;items:string[]}>>();
  const topics = await getHomeTopics<string[]>();
  const hasFeed = feed.trending.length > 0 || feed.latest.length > 0;

  return (
    <div className="max-w-3xl mx-auto px-4 pt-14 pb-24">
      <div className="flex flex-col gap-6">
        {/* Compact hero */}
        <div className="flex flex-col gap-5">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tighter leading-[1.15]">
            {t.home.title1}
            <br />
            {t.home.title2}
          </h1>
          <SearchBar />
        </div>

        {hasFeed ? (
          <>
            {feed.trending.length > 0 && (
              <section aria-labelledby="trending-heading" className="pt-4">
                <h2 id="trending-heading" className="text-sm font-medium uppercase tracking-wide text-[var(--cf-text-muted)] mb-1">
                  {t.home.trending}
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
                  {t.home.latest}
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
            {suggestions.map((group) => (
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

        {/* {t.home.topics} */}
        <section aria-labelledby="topics-heading" className="pt-10">
          <h2 id="topics-heading" className="text-sm font-medium uppercase tracking-wide text-[var(--cf-text-muted)] mb-3">
            {t.home.topics}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {topics.map((topic) => (
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
          {t.home.description}
        </p>
      </div>
    </div>
  );
}
