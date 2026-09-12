-- Phase 10a: AI usage logging (user-approved 2026-09-12).
-- One row per LLM touchpoint (grounded answer, future summarizations),
-- including degraded attempts so we can see provider failure rates and
-- per-IP abuse patterns. provider/model are TEXT (not FK) because the
-- provider registry is env-driven, not DB-driven.

CREATE TABLE IF NOT EXISTS ai_queries (
  id                BIGSERIAL PRIMARY KEY,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL = guest
  conversation_id   BIGINT REFERENCES ai_conversations(id) ON DELETE SET NULL,
  kind              TEXT NOT NULL DEFAULT 'ask',       -- 'ask' | future kinds
  question_excerpt  TEXT NOT NULL,                     -- truncated, never full text
  model             TEXT,                              -- NULL when no completion happened
  ok                BOOLEAN NOT NULL,
  reason            TEXT,                              -- degradation reason if !ok
  prompt_tokens     INT,
  completion_tokens INT,
  latency_ms        INT,
  ip_hash           TEXT,                              -- sha256(ip + ROTATION_SALT)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_queries_created ON ai_queries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_queries_user ON ai_queries (user_id, created_at DESC) WHERE user_id IS NOT NULL;
