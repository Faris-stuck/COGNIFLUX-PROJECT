import { EducationSearch } from "@/components/education-search";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Learn — Cogniflux",
  description: "Discover free, openly licensed learning materials from trusted education sources.",
};

export default function LearnPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Learn</h1>
      <p className="text-sm text-[var(--cf-text-muted)] mt-1 mb-6">
        Free and openly licensed learning materials, in one search.
      </p>
      <EducationSearch />
    </main>
  );
}
