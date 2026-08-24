import type { PaperDocument } from "./document";
import { cached } from "../db";
import { normalizeJats } from "./jats";
import { fetchPaperXml, FullTextUnavailable, resolvePmcid } from "../providers/europepmc";

/**
 * Reader service: paperId -> canonical PaperDocument with Redis caching.
 *
 * Cache key convention: cf:paper-fulltext:v1:<paperId>
 * TTL 6h - full documents are large but not user-specific; upstream content
 * can change, so we never cache forever. Guest and authenticated reads share
 * the same cached document (no user data inside).
 */

const CACHE_TTL = 6 * 60 * 60;

export interface ReaderResult {
  document: PaperDocument | null;
  available: boolean;
  /** Machine-readable reason when unavailable. */
  reason?: "not_in_epmc" | "not_open_access" | "upstream_error" | "bad_response";
}

/** Cheap availability probe used by Paper Detail to enable/disable [Read]. */
export async function checkFullTextAvailability(paperId: string): Promise<boolean> {
  // Read-only probe: NEVER write to the document cache key. A previous
  // version cached a null here under the same key, poisoning the real
  // getFullTextDocument lookup whenever /status ran first.
  try {
    const { getRedis } = await import("../db");
    const redis = await getRedis();
    const hit = await redis.get(`cf:paper-fulltext:v1:${paperId}`);
    if (hit && hit !== "null") return true;
  } catch {
    /* cache unavailable -> fall through to live probe */
  }
  try {
    return (await resolvePmcid(paperId)) !== null;
  } catch {
    return false; // degrade: show Read as unavailable rather than erroring
  }
}

export async function getFullTextDocument(paperId: string, title?: string | null): Promise<ReaderResult> {
  try {
    const document = await cached(`cf:paper-fulltext:v1:${paperId}`, CACHE_TTL, async () => {
      const { xml } = await fetchPaperXml(paperId);
      const doc = normalizeJats(xml, { paperId, providerId: "europepmc" });
      // Metadata from the search layer is often richer (authors list, year);
      // backfill only fields the JATS front lacks.
      if (!doc.title && title) doc.title = title.slice(0, 500);
      return doc;
    });
    if (!document) throw new FullTextUnavailable(undefined, "not_in_epmc");
    return { document, available: true };
  } catch (err) {
    if (err instanceof FullTextUnavailable) {
      return { document: null, available: false, reason: err.code };
    }
    // Unknown failure: never leak stack traces to the client.
    console.error("[reader] full text failed:", err instanceof Error ? err.message : err);
    return { document: null, available: false, reason: "upstream_error" };
  }
}
