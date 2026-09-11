import { EducationSearch } from "@/components/education-search";
import { getServerLocale, getDict } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Learn — Cogniflux",
  description: "Discover free, openly licensed learning materials from trusted education sources.",
};

export default async function LearnPage() {
  const t = await getDict(await getServerLocale());
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t.learn.title}</h1>
      <p className="text-sm text-[var(--cf-text-muted)] mt-1 mb-6">{t.learn.subtitle}</p>
      <EducationSearch />
    </div>
  );
}
