import { SearchBar } from "@/components/search-bar";
import Link from "next/link";

const SUGGESTIONS = [
  { group: "Papers", items: ["impact of AI on education", "machine learning for climate", "CRISPR gene editing review"] },
  { group: "Education", items: ["calculus textbook", "basic physics materials", "intro to programming"] },
  { group: "Research", items: ["research gap: e-learning Indonesia", "trends in renewable energy"] },
];

export default function HomePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 pt-20 pb-24">
      <div className="flex flex-col gap-8">
        <h1 className="text-3xl md:text-5xl font-semibold tracking-tighter leading-[1.1]">
          Explore Knowledge.
          <br />
          Discover Research.
        </h1>

        <SearchBar size="lg" />

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

        <p className="text-sm text-[var(--cf-text-muted)] max-w-[60ch] pt-2">
          Cogniflux searches open academic sources like OpenAlex and Crossref in parallel, removes duplicates, and ranks
          what matters. Free for students, teachers, and researchers everywhere.
        </p>
      </div>
    </div>
  );
}
