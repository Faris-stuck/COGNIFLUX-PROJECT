import type { LLMProvider } from "./types";
import { NullProvider } from "./types";
import { OpenAICompatProvider } from "./openai-compat";

/** Injectable env shape (tests pass literals; runtime passes process.env). */
export type Env = Record<string, string | undefined>;

/**
 * Model selection lives in code, credentials never do.
 * COGNIFLUX_LLM=none|zrouter (default: auto — zrouter when key present).
 */
export function createProvider(env: Env = process.env): LLMProvider {
  const choice = (env.COGNIFLUX_LLM ?? "auto").trim().toLowerCase();
  if (choice === "none") return new NullProvider();
  const z = new OpenAICompatProvider(env);
  if (choice === "zrouter") return z; // explicit: caller sees available=false if key missing
  return z.available ? z : new NullProvider();
}

// Singleton for API routes (same pattern as getOrchestrator).
declare global {
  // eslint-disable-next-line no-var
  var _cfModelLayer: LLMProvider | undefined;
}

export function getModelLayer(): LLMProvider {
  if (!global._cfModelLayer) global._cfModelLayer = createProvider();
  return global._cfModelLayer;
}
