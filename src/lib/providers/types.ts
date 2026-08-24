import type { SearchParams, SearchResult, Work } from "../types";

export interface ProviderCapabilities {
  search: boolean;
  getWork: boolean;
  getAuthor: boolean;
  getRelated: boolean;
  getReferences: boolean;
  getCitations: boolean;
  /** Provider can return structured full text (getFullText). */
  getFullText: boolean;
}

export const NO_CAPABILITIES: ProviderCapabilities = {
  search: false,
  getWork: false,
  getAuthor: false,
  getRelated: false,
  getReferences: false,
  getCitations: false,
  getFullText: false,
};

/** Every academic/open-access provider implements this. Unsupported operations report capability=false and throw ProviderUnsupported. */
export interface AcademicProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  /** Per-operation soft timeout in ms; orchestrator enforces a hard timeout too. */
  readonly timeoutMs: number;
  search(params: SearchParams): Promise<SearchResult>;
  getWork(id: string): Promise<Work | null>;
}

export class ProviderUnsupported extends Error {
  constructor(providerId: string, op: string) {
    super(`Provider ${providerId} does not support ${op}`);
    this.name = "ProviderUnsupported";
  }
}
