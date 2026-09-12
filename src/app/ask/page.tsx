import type { Metadata } from "next";
import { AskPanel } from "@/components/ask-panel";
import { getServerLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Ask Cogniflux", description: "Evidence-grounded research answers." };
}

export default async function AskPage() {
  const locale = await getServerLocale();
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">
        {locale === "id" ? "Tanya Cogniflux" : "Ask Cogniflux"}
      </h1>
      <p className="text-sm text-[var(--cf-text-muted)] mb-8">
        {locale === "id"
          ? "Jawaban disusun hanya dari paper yang benar-benar kami temukan — setiap klaim punya sitasi."
          : "Answers are grounded strictly in papers we actually retrieved — every claim cites a source."}
      </p>
      <AskPanel locale={locale === "en" ? "en" : "id"} />
    </div>
  );
}
