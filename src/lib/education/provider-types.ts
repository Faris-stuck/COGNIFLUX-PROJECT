import type { EducationResource, EducationSearchParams, EducationSearchResult } from "./types";

export interface EducationProviderCapabilities {
  search: boolean;
  getResource: boolean;
  /** Provider exposes a full browsable catalog feed (cached locally in Redis). */
  catalogFeed: boolean;
  getSubjects: boolean;
  getLevels: boolean;
  getLanguages: boolean;
  getFormats: boolean;
  license: boolean;
  updatedAt: boolean;
  sourceUrl: boolean;
}

export const NO_EDU_CAPABILITIES: EducationProviderCapabilities = {
  search: false,
  getResource: false,
  catalogFeed: false,
  getSubjects: false,
  getLevels: false,
  getLanguages: false,
  getFormats: false,
  license: false,
  updatedAt: false,
  sourceUrl: false,
};

export interface EducationProvider {
  readonly id: string;
  readonly name: string;
  readonly homepageUrl: string;
  readonly capabilities: EducationProviderCapabilities;
  readonly timeoutMs: number;
  /**
   * Search the provider. Implementations must:
   * - normalize into canonical EducationResource
   * - never throw for "no results" (return empty)
   * - throw only on real transport/API failure
   */
  search(params: EducationSearchParams): Promise<EducationSearchResult>;
  getResource(sourceId: string): Promise<EducationResource | null>;
}
