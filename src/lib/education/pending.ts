import type { EducationResource, EducationSearchParams, EducationSearchResult } from "./types";
import { EducationResourceSchema } from "./types";
import type { EducationProvider, EducationProviderCapabilities } from "./provider-types";
import { NO_EDU_CAPABILITIES } from "./provider-types";

/**
 * SIBI (Sistem Informasi Buku Indonesia / kemdikbud).
 *
 * STATUS: PENDING - intentionally NOT a fake implementation.
 *
 * Evaluated 2026-08: no stable official programmatic API is publicly
 * documented; the historical sibi.kemdikbud.go.id host did not resolve during
 * provider inspection. Per Cogniflux policy we never invent endpoints. When an
 * official mechanism becomes available (API, OAI-PMH, or structured data feed),
 * implement `search`/`getResource` against it and flip `pending` to false.
 */

export const SIBI_PROVIDER_STATUS = {
  id: "sibi",
  name: "SIBI (Indonesian Ministry of Education book system)",
  status: "pending" as const,
  reason:
    "No stable official public API documented; host unreachable at inspection time. Adapter will be implemented when an official machine-readable access path exists.",
  evaluatedAt: "2026-08-23",
};

/**
 * Rumah Belajar (belajar.kemdikbud.go.id).
 * Same situation as SIBI: official portal exists for humans, but no documented
 * open API. Kept as a typed placeholder so the orchestrator can report status.
 */
export const RUMAH_BELAJAR_PROVIDER_STATUS = {
  id: "rumah-belajar",
  name: "Rumah Belajar (kemdikbud learning portal)",
  status: "pending" as const,
  reason: "Official portal is human-facing only; no documented open API. Pending official machine-readable access.",
  evaluatedAt: "2026-08-23",
};

/** Shared shape for providers that are registered but not yet callable. */
export class PendingEducationProvider implements EducationProvider {
  readonly id: string;
  readonly name: string;
  readonly homepageUrl: string;
  readonly capabilities: EducationProviderCapabilities = NO_EDU_CAPABILITIES;
  readonly timeoutMs = 0;
  private readonly reason: string;

  constructor(id: string, name: string, homepageUrl: string, reason: string) {
    this.id = id;
    this.name = name;
    this.homepageUrl = homepageUrl;
    this.reason = reason;
  }

  async search(_params: EducationSearchParams): Promise<EducationSearchResult> {
    // Honest empty result with degraded=false: this is not a failure, the
    // provider simply does not offer programmatic access yet.
    return {
      resources: [],
      total: 0,
      page: 1,
      perPage: 0,
      providersUsed: [],
      providersFailed: [],
      degraded: false,
    };
  }

  async getResource(_sourceId: string): Promise<EducationResource | null> {
    return null;
  }

  get pendingReason(): string {
    return this.reason;
  }
}

// Re-exported so tests can validate schema round-trip without network.
export { EducationResourceSchema };
