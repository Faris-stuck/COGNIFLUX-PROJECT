/**
 * ModelLayer: provider-agnostic LLM abstraction (Phase 8).
 *
 * Mirrors the proven AcademicProvider pattern in src/lib/providers:
 * capability flags, soft per-operation timeout, and a NullProvider so the
 * app degrades to search-only when no key is configured. Adding a second
 * LLM vendor must not touch src/lib/ask.ts.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface LLMProvider {
  readonly id: string;
  /** True only when the provider is configured (API key present). */
  readonly available: boolean;
  /** Soft timeout in ms the caller should enforce. */
  readonly timeoutMs: number;
  complete(messages: ChatMessage[], opts?: CompletionOptions): Promise<CompletionResult>;
}

export class ProviderUnavailable extends Error {
  constructor(providerId: string, reason: string) {
    super(`LLM provider ${providerId} unavailable: ${reason}`);
    this.name = "ProviderUnavailable";
  }
}

  /** Always-present fallback; routes check .available before calling. */
export class NullProvider implements LLMProvider {
  readonly id = "none";
  readonly available = false;
  readonly timeoutMs = 0;
  async complete(_messages: ChatMessage[], _opts?: CompletionOptions): Promise<CompletionResult> {
    throw new ProviderUnavailable(this.id, "no provider configured");
  }
}
