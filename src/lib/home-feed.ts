/**
 * Home feed loader: content-first homepage data, cache-first strategy.
 *
 - Two curated feeds (trending by citations, newest by date) fetched through the
   SAME academic orchestrator used by /api/search, so normalization, dedup,
   ranking and per-provider fault isolation apply unchanged.
 - Wrapped in the Redis-backed cached() helper with a LONG ttl (6h): the
   homepage almost never blocks on upstream providers.
 - Total provider failure -> throws INSIDE the cached callback so the empty
   result is never written to Redis, and getHomeFeed() degrades gracefully to
   empty arrays (page falls back to static suggestions).
 */
import type { Work } from "./types";
import { cached } from "./db";

export interface HomeFeed {
  trending: Work[];
  latest: Work[];
}

const HOME_FEED_KEY = "cf:home:v1";
const HOME_FEED_TTL_SECONDS = 6 * 60 * 60; // 6 hours
const FEED_SIZE = 5;

async function loadHomeFeed(): Promise<HomeFeed> {
  // Dynamic import keeps orchestrator init off cold paths that never need it.
  const { getOrchestrator } = await import("./providers/orchestrator");
  const orchestrator = getOrchestrator();

  const [trendingResult, latestResult] = await Promise.allSettled([
    orchestrator.search({
      q: "high impact open science",
      page: 1,
      perPage: FEED_SIZE,
      sort: "citations",
      openAccessOnly: false,
    }),
    orchestrator.search({
      q: "recent advances machine learning",
      page: 1,
      perPage: FEED_SIZE + FEED_SIZE, // over-fetch; some are removed as trending duplicates below
      sort: "newest",
      openAccessOnly: false,
    }),
  ]);

  const extract = (
    r:
      | PromiseFulfilledResult<{ works: Work[]; providersFailed: string[] }>
      | PromiseRejectedResult
  ): Work[] => ("status" in r && r.status === "fulfilled" ? [...r.value.works] : []);

  const trending = extract(trendingResult).slice(0, FEED_SIZE);

  // Remove works already shown in Trending from Latest.
  const trendingIds = new Set(trending.map((w) => w.id));
  const seenIds = new Set(trendingIds);
  const latest: Work[] = [];
  for (const w of extract(latestResult)) {
    if (seenIds.has(w.id)) continue;
    seenIds.add(w.id);
    latest.push(w);
    if (latest.length >= FEED_SIZE) break;
  }

  // Every provider failed for every feed -> treat as total outage: throw so
  // cached() does NOT persist the empty feed for 6 hours.
  if (trending.length === 0 && latest.length === 0) {
    throw new Error("home-feed: all providers failed");
  }

  return { trending, latest };
}

/** Never throws. Returns empty arrays when the pipeline is fully down. */
export async function getHomeFeed(): Promise<HomeFeed> {
  try {
    return await cached<HomeFeed>(HOME_FEED_KEY, HOME_FEED_TTL_SECONDS, loadHomeFeed);
  } catch (e) {
    console.error("[home-feed] degraded:", e instanceof Error ? e.message : e);
    return { trending: [], latest: [] };
  }
}
