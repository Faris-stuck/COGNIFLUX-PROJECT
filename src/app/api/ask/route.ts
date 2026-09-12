import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRequestId } from "@/lib/observability";
import { rateLimit, clientIp } from "@/lib/auth/rate-limit";
import { getModelLayer } from "@/lib/models";
import { askQuestion } from "@/lib/ask";

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

  const result = await askQuestion(parsed.data.question, getModelLayer(), parsed.data.locale);

  if (result.ok) {
    return NextResponse.json({
      authenticated: false,
      answer: result.answer,
      papers: result.papers,
      cited: result.cited,
      model: result.model,
      usage: result.usage ?? null,
    });
  }
  // Degraded: 200 + reason so the UI can render papers it already has.
  return NextResponse.json({
    authenticated: false,
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
