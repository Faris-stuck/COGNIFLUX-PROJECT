import type { Work } from "../types";
import type { PaperDocument } from "../reader/document";
import { AcademicProvider, NO_CAPABILITIES } from "./types";

/**
 * Europe PMC full-text provider.
 *
 * Official API: https://europepmc.org/RestfulWebService
 *   - Search: /webservices/rest/search?query=DOI:"..."&format=json
 *     (fields include pmcid, inEPMC, isOpenAccess - no key required)
 *   - Full text: /webservices/rest/{PMCID}/fullTextXML  (JATS XML, only when
 *     the article is openly accessible and deposited in Europe PMC)
 *
 * Capability truthfully reported as getFullText = true ONLY because this
 * endpoint genuinely returns structured full text for OA-in-EPMC articles;
 * it throws a typed unavailable error otherwise. No fabricated content.
 */

const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest";

export class FullTextUnavailable extends Error {
  constructor(
    message = "Full text isn't available in Cogniflux for this paper.",
    readonly code: "not_in_epmc" | "not_open_access" | "upstream_error" | "bad_response" = "not_in_epmc"
  ) {
    super(message);
    this.name = "FullTextUnavailable";
  }
}

interface EpmcSearchHit {
  id?: string;
  pmcid?: string;
  doi?: string;
  inEPMC?: string;
  isOpenAccess?: string;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "Cogniflux/0.1 (reader)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new FullTextUnavailable("Europe PMC search failed.", "upstream_error");
  return res.json();
}

/** Resolve a Cogniflux paper key to a PMCID with open full text, or null. */
export async function resolvePmcid(paperId: string): Promise<string | null> {
  const doi = paperId.startsWith("doi:") ? paperId.slice(4) : null;
  if (!doi) return null;

  const data = (await fetchJson(
    // Encode only the surrounding quotes, not the DOI body: EPMC's query
    // parser does not match %2F-encoded slashes inside a quoted DOI phrase.
    `${BASE}/search?query=DOI:${encodeURIComponent(`"${doi}"`)}&format=json&pageSize=5`
  )) as { resultList?: { result?: EpmcSearchHit[] } };

  const hits = data.resultList?.result ?? [];
  for (const h of hits) {
    if (h.pmcid && h.inEPMC === "Y" && h.isOpenAccess === "Y") return h.pmcid;
  }
  return null;
}

export async function fetchJatsXml(pmcid: string): Promise<string> {
  const res = await fetch(`${BASE}/${pmcid}/fullTextXML`, {
    headers: { accept: "application/xml", "user-agent": "Cogniflux/0.1 (reader)" },
    signal: AbortSignal.timeout(25_000),
  });
  if (res.status === 404) {
    throw new FullTextUnavailable(undefined, "not_in_epmc");
  }
  if (!res.ok) {
    throw new FullTextUnavailable("Europe PMC full text request failed.", "upstream_error");
  }
  const xml = await res.text();
  if (!xml.includes("<")) throw new FullTextUnavailable(undefined, "bad_response");
  return xml;
}

/**
 * Full-text source descriptor used by the Reader service layer.
 * Lives outside AcademicProvider so the academic orchestrator stays untouched
 * (no regression risk); capability is still surfaced through the registry.
 */
export const EuropePmcFullTextSource = {
  id: "europepmc",
  name: "Europe PMC",
  homepageUrl: "https://europepmc.org",
  capabilities: { ...NO_CAPABILITIES, getFullText: true },
} as const;

/** Convenience wrapper: paperId -> normalized PaperDocument (raw XML out). */
export async function fetchPaperXml(paperId: string): Promise<{ xml: string; pmcid: string }> {
  const pmcid = await resolvePmcid(paperId);
  if (!pmcid) {
    // Distinguish "we looked and there is none" from upstream failure.
    throw new FullTextUnavailable(undefined, "not_in_epmc");
  }
  const xml = await fetchJatsXml(pmcid);
  return { xml, pmcid };
}

// Re-export type only, to keep the reader layer independent of providers.
export type { Work };
