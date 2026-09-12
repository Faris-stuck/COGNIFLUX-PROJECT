import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRequestId } from "@/lib/observability";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { getModelLayer } from "@/lib/models";
import { askQuestion } from "@/lib/ask";
import { getSessionUser } from "@/lib/auth/session";
import { getPersona, registerInstruction } from "@/lib/persona";
import {
  createConversation,
  getOwnedConversation,
  hashIp,
  loadHistory,
  logAiQuery,
  appendRound,
  trimHistory,
} from "@/lib/ai-store";

export const dynamic = "force-dynamic";

/**
 * POST /api/ask { question, locale? }
 * Evidence-grounded research answer. Strictly rate-limited: every non-cached
 * call fans out to search providers AND an LLM completion (~10-25s).
 * Degrades to search-only (papers without an answer) when the model layer is
 * unavailable — never a hard error for "AI is off".
 */
const ASK_LIMIT = 12;
const ASK_WINDOW_S = 60;

const AskSchema = z.object({
  question: z.string().trim().min(5).max(400),
  locale: z.enum(["id", "en"]).default("id"),
  conversationId: z.coerce.number().int().positive().optional(),
});

export const POST = withRequestId(async (req: NextRequest) => {
  const rl = await rateLimit(`ask:${clientIp(req)}`, ASK_LIMIT, ASK_WINDOW_S);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many questions. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? ASK_WINDOW_S) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = AskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_question" }, { status: 400 });
  }

  // Persona-aware register (Phase 9): signed-in users get an answer written
  // for their education level. Guests/anonymous keep the Phase 8 behavior.
  const user = await getSessionUser();
  const persona = user ? await getPersona(user.id) : null;

  // Multi-turn (Phase 10b): only authenticated users can carry a server-side
  // conversation, and only after ownership is proven. A bogus/expired
  // conversationId silently starts fresh rather than erroring.
  let conversationId: number | null = null;
  let history: Awaited<ReturnType<typeof loadHistory>> = [];
  if (user) {
    if (parsed.data.conversationId) {
      const owned = await getOwnedConversation(user.id, parsed.data.conversationId);
      conversationId = owned ? owned.id : await createConversation(user.id, parsed.data.question);
    } else {
      conversationId = await createConversation(user.id, parsed.data.question);
    }
    history = trimHistory(await loadHistory(user.id, conversationId));
  }

  const started = Date.now();
  const result = await askQuestion(
    parsed.data.question,
    getModelLayer(),
    parsed.data.locale,
    registerInstruction(persona?.level ?? null),
    history,
  );

  // Usage audit (Phase 10a): every touchpoint logged, degraded included.
  void logAiQuery({
    userId: user?.id ?? null,
    conversationId,
    kind: "ask",
    question: parsed.data.question,
    model: result.ok ? result.model : null,
    ok: result.ok,
    reason: result.ok ? null : result.reason,
    promptTokens: result.ok ? result.usage?.promptTokens ?? null : null,
    completionTokens: result.ok ? result.usage?.completionTokens ?? null : null,
    latencyMs: Date.now() - started,
    ipHash: hashIp(clientIp(req)),
  });

  if (user && conversationId) {
    await appendRound(
      user.id,
      conversationId,
      parsed.data.question,
      result.ok ? result.answer : null,
      result.papers,
    );
  }

  if (result.ok) {
    return NextResponse.json({
      authenticated: user !== null,
      conversationId,
      answer: result.answer,
      papers: result.papers,
      cited: result.cited,
      model: result.model,
      usage: result.usage ?? null,
    });
  }
  // Degraded: 200 + reason so the UI can render papers it already has.
  return NextResponse.json({
    authenticated: user !== null,
    conversationId,
    degraded: true,
    reason: result.reason,
    answer: null,
    papers: result.papers,
  });
});

/** GET /api/ask — capabilities probe for the UI banner. */
export const GET = withRequestId(async () => {
  const provider = getModelLayer();
  return NextResponse.json({ ai_enabled: provider.available, provider: provider.id });
});
