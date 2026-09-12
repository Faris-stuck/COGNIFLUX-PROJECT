import type { SearchParams, Work } from "./types";
import type { ChatMessage, LLMProvider } from "./models/types";
import { getOrchestrator } from "./providers/orchestrator";
import type { StoredTurn } from "./ai-store";

/**
 * Evidence-grounded answering pipeline (Phase 8):
 * retrieval (existing orchestrator) -> numbered context -> LLM -> citation
 * validation. Citations that don't resolve to a retrieved paper invalidate
 * the answer, and the caller falls back to search-only mode.
 */

export interface CitedPaper {
  n: number;
  id: string;
  title: string;
  year: number | null;
  url: string | null;
}

export interface AskSuccess {
  ok: true;
  answer: string;
  papers: CitedPaper[];
  cited: number[];
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface AskDegraded {
  ok: false;
  reason: "no_provider" | "no_results" | "provider_error" | "invalid_citations";
  papers: CitedPaper[];
}

export type AskResult = AskSuccess | AskDegraded;

const ABSTRACT_CAP = 480; // chars of abstract sent to the model, per paper
const CONTEXT_BUDGET = 6; // max papers in the numbered context

export function toCited(works: Work[], limit = CONTEXT_BUDGET): CitedPaper[] {
  return works.slice(0, limit).map((w, i) => ({
    n: i + 1,
    id: w.id,
    title: w.title,
    year: w.publicationYear,
    url: w.url ?? w.openAccess?.url ?? (w.doi ? `https://doi.org/${w.doi}` : null),
  }));
}

/** Numbered evidence block. Deterministic so it can be unit-tested. */
export function buildContext(papers: CitedPaper[], works: Work[]): string {
  const byId = new Map(works.map((w) => [w.id, w]));
  return papers
    .map((p) => {
      const w = byId.get(p.id);
      const authors = (w?.authors ?? []).slice(0, 3).map((a) => a.name).join(", ");
      const abs = (w?.abstract ?? "").replace(/\s+/g, " ").slice(0, ABSTRACT_CAP);
      return `[${p.n}] ${p.title}${authors ? ` — ${authors}` : ""}${p.year ? ` (${p.year})` : ""}\n${abs ? `Abstract: ${abs}` : "(no abstract)"}`;
    })
    .join("\n\n");
}

export function buildMessages(
  question: string,
  context: string,
  locale: "id" | "en",
  register?: string | null,
  history?: StoredTurn[],
): ChatMessage[] {
  const lang = locale === "id" ? "Bahasa Indonesia" : "English";
  return [
    {
      role: "system",
      content:
        `You are Cogniflux's research assistant. Answer ONLY using the numbered evidence provided. ` +
        `Every factual claim must cite its source as [n] matching the evidence list. ` +
        `If the evidence does not support an answer, say so plainly. ` +
        `Never invent titles, authors, years, or statistics. ` +
        `Write the answer in ${lang}. Keep it under 200 words.` +
        (register ? ` ${register}` : "") +
        (history && history.length > 0
          ? ` The conversation may include earlier turns from this chat; you may refer to them, but every factual claim in THIS answer must still cite the numbered evidence above.`
          : ""),
    },
    // Past turns first (oldest→newest); the fresh evidence only accompanies
    // the final question, so older answers stay stable history, not context.
    ...(history ?? []).map((t) => ({ role: t.role, content: t.content }) as ChatMessage),
    { role: "user", content: `Evidence:\n${context}\n\nQuestion: ${question}` },
  ];
}

/** Extract unique [n] citations from model text. */
export function extractCitations(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(/\[(\d{1,2})\]/g)) out.add(Number(m[1]));
  return [...out].sort((a, b) => a - b);
}

/** True when every cited n is within the evidence list (>=1 citation). */
export function citationsValid(text: string, paperCount: number): boolean {
  const cited = extractCitations(text);
  return cited.length > 0 && cited.every((n) => n >= 1 && n <= paperCount);
}

export async function askQuestion(
  question: string,
  provider: LLMProvider,
  locale: "id" | "en" = "id",
  register?: string | null,
  history?: StoredTurn[],
): Promise<AskResult> {
  // Retrieval first — even the degraded path returns useful papers.
  const params: SearchParams = {
    q: question,
    page: 1,
    perPage: CONTEXT_BUDGET,
    openAccessOnly: false,
    sort: "relevance",
  };
  const search = await getOrchestrator().search(params);
  const papers = toCited(search.works);

  if (papers.length === 0) return { ok: false, reason: "no_results", papers: [] };
  if (!provider.available) return { ok: false, reason: "no_provider", papers };

  try {
    const completion = await provider.complete(buildMessages(question, buildContext(papers, search.works), locale, register, history), {
      maxTokens: 800,
      temperature: 0.2,
    });
    if (!citationsValid(completion.text, papers.length)) {
      return { ok: false, reason: "invalid_citations", papers };
    }
    return {
      ok: true,
      answer: completion.text,
      papers,
      cited: extractCitations(completion.text),
      model: completion.model,
      usage: completion.usage,
    };
  } catch {
    return { ok: false, reason: "provider_error", papers };
  }
}
