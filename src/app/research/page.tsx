import type { Metadata } from "next";

export const metadata: Metadata = { title: "Research" };

const TOOLS = [
  { name: "Ask", desc: "Ask a research question, get evidence-backed answers with citations." },
  { name: "Analyze Paper", desc: "Structured breakdown: objective, methodology, results, limitations." },
  { name: "Compare Papers", desc: "Side-by-side comparison of up to 5 papers." },
  { name: "Research Gap", desc: "Evidence-based gap detection across topic clusters." },
  { name: "Literature Review", desc: "Assisted review structure from a topic." },
  { name: "Research Trends", desc: "Publication and citation trends over time." },
];

export default function ResearchPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Research</h1>
      <p className="text-sm text-[var(--cf-text-muted)] mb-10 max-w-[60ch]">
        Research intelligence tools. These arrive with the AI layer; the pipeline below shows what each will do.
      </p>
      <div className="grid sm:grid-cols-2 gap-x-10 gap-y-8">
        {TOOLS.map((t) => (
          <section key={t.name}>
            <h2 className="font-medium mb-1">{t.name}</h2>
            <p className="text-sm text-[var(--cf-text-muted)] leading-relaxed max-w-[55ch]">{t.desc}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
