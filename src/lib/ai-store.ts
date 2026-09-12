/**
 * Phase 10b — conversation store for the ask pipeline.
 *
 * Multi-turn is server-side and account-bound ONLY: history lives in
 * ai_conversations/ai_messages and a conversation can always be proven to
 * belong to the requesting user (IDOR guard on every read/write). Guests
 * stay single-turn so anonymous clients can never grow shared state.
 *
 * Usage logging (ai_queries) also lives here: one row per LLM touchpoint,
 * degraded attempts included, IP stored only as a salted hash.
 */
import { createHash } from "crypto";
import { getPool } from "./db";

export interface StoredTurn {
  role: "user" | "assistant";
  content: string;
}

const HISTORY_TURNS = 6; // last N messages (3 Q/A rounds) fed back to the model
const HISTORY_CHAR_CAP = 1200; // per message — older long answers get truncated
const QUESTION_EXCERPT_CAP = 200;

/** NULL-safe user_id conversation fetch; returns null when it doesn't belong to user. */
export async function getOwnedConversation(
  userId: string,
  conversationId: number,
): Promise<{ id: number } | null> {
  const { rows } = await getPool().query(
    `SELECT id FROM ai_conversations WHERE id = $1 AND user_id = $2`,
    [conversationId, userId],
  );
  return rows[0] ? { id: Number(rows[0].id) } : null;
}

export async function createConversation(userId: string, title: string): Promise<number> {
  const { rows } = await getPool().query(
    `INSERT INTO ai_conversations (user_id, title) VALUES ($1, $2) RETURNING id`,
    [userId, title.slice(0, 120)],
  );
  return Number(rows[0].id);
}

/** Recent history for prompt assembly; ownership-checked; [] on any failure. */
export async function loadHistory(userId: string, conversationId: number): Promise<StoredTurn[]> {
  try {
    const owned = await getOwnedConversation(userId, conversationId);
    if (!owned) return [];
    const { rows } = await getPool().query(
      `SELECT role, content FROM ai_messages
        WHERE conversation_id = $1 AND role IN ('user','assistant')
        ORDER BY id DESC LIMIT $2`,
      [conversationId, HISTORY_TURNS],
    );
    return rows
      .reverse()
      .map((r) => ({ role: r.role as StoredTurn["role"], content: String(r.content).slice(0, HISTORY_CHAR_CAP) }));
  } catch {
    return [];
  }
}

/** Persist one Q/A round. Assistant row is skipped when the turn was degraded. */
export async function appendRound(
  userId: string,
  conversationId: number,
  question: string,
  answer: string | null,
  evidence: unknown[],
): Promise<void> {
  try {
    const owned = await getOwnedConversation(userId, conversationId);
    if (!owned) return;
    const client = await getPool().connect();
    try {
      await client.query(
        `INSERT INTO ai_messages (conversation_id, role, content, evidence) VALUES ($1, 'user', $2, $3)`,
        [conversationId, question, JSON.stringify(evidence)],
      );
      if (answer) {
        await client.query(
          `INSERT INTO ai_messages (conversation_id, role, content, evidence) VALUES ($1, 'assistant', $2, '[]'::jsonb)`,
          [conversationId, answer],
        );
      }
    } finally {
      client.release();
    }
  } catch {
    // Conversation persistence is best-effort: the answer already reached the user.
  }
}

export function hashIp(ip: string): string {
  const salt = process.env.AI_LOG_SALT ?? "cogniflux-static-salt";
  return createHash("sha256").update(`${ip}|${salt}`).digest("hex").slice(0, 32);
}

export interface UsageLogRow {
  userId: string | null;
  conversationId: number | null;
  kind?: string;
  question: string;
  model: string | null;
  ok: boolean;
  reason?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  latencyMs?: number | null;
  ipHash: string;
}

/** Fire-and-forget usage audit; never throws into the request path. */
export async function logAiQuery(row: UsageLogRow): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO ai_queries
         (user_id, conversation_id, kind, question_excerpt, model, ok, reason,
          prompt_tokens, completion_tokens, latency_ms, ip_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        row.userId,
        row.conversationId,
        row.kind ?? "ask",
        row.question.slice(0, QUESTION_EXCERPT_CAP),
        row.model,
        row.ok,
        row.reason ?? null,
        row.promptTokens ?? null,
        row.completionTokens ?? null,
        row.latencyMs ?? null,
        row.ipHash,
      ],
    );
  } catch {
    // Logging must never break the feature.
  }
}

/**
 * Turn-capping for the model context: keep whole user/assistant pairs,
 * newest first, so the FIRST message sent to the LLM is a user turn.
 */
export function trimHistory(history: StoredTurn[], maxMessages = HISTORY_TURNS): StoredTurn[] {
  let out = history.slice(-maxMessages);
  while (out.length > 0 && out[0].role !== "user") out = out.slice(1);
  return out;
}
