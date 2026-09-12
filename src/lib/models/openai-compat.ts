import type { ChatMessage, CompletionOptions, CompletionResult, LLMProvider } from "./types";
import { ProviderUnavailable } from "./types";

/**
 * OpenAI-compatible chat-completions provider.
 * Default backend: ZRouter (https://api.zrouter.dev/v1) — works with any
 * OpenAI-compatible base URL via env, so pointing at another vendor is
 * configuration, not code.
 */
export class OpenAICompatProvider implements LLMProvider {
  readonly id = "zrouter";
  readonly timeoutMs = 25_000;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  readonly model: string;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.apiKey = env.ZROUTER_API_KEY?.trim() ?? "";
    this.baseUrl = (env.ZROUTER_BASE_URL?.trim() || "https://api.zrouter.dev/v1").replace(/\/+$/, "");
    this.model = env.COGNIFLUX_AI_MODEL?.trim() || "deepseek-v4.1-flash";
  }

  get available(): boolean {
    return this.apiKey.length > 0;
  }

  async complete(messages: ChatMessage[], opts: CompletionOptions = {}): Promise<CompletionResult> {
    if (!this.available) throw new ProviderUnavailable(this.id, "ZROUTER_API_KEY not set");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: ["Bearer", this.apiKey].join(" "),
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: opts.maxTokens ?? 800,
          temperature: opts.temperature ?? 0.2,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new ProviderUnavailable(this.id, `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        model?: string;
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) throw new ProviderUnavailable(this.id, "empty completion");
      return {
        text,
        model: data.model ?? this.model,
        usage: data.usage
          ? { promptTokens: data.usage.prompt_tokens ?? 0, completionTokens: data.usage.completion_tokens ?? 0 }
          : undefined,
      };
    } catch (err) {
      if (err instanceof ProviderUnavailable) throw err;
      const name = (err as Error)?.name === "AbortError" ? "timeout" : "network";
      throw new ProviderUnavailable(this.id, name);
    } finally {
      clearTimeout(timer);
    }
  }
}
