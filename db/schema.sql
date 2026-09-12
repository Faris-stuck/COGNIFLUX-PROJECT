-- COGNIFLUX schema v0.1 (foundation)
-- Internal data only. Academic content is fetched dynamically from providers + cached in Redis.

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT UNIQUE,
  password_hash TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT,
  locale      TEXT NOT NULL DEFAULT 'id',
  level       TEXT, -- elementary | middle | high | vocational | university | researcher
  interests   TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data    JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_key  TEXT NOT NULL, -- canonical paper id (doi or provider key)
  snapshot   JSONB NOT NULL DEFAULT '{}', -- normalized paper snapshot
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, paper_key)
);

CREATE TABLE IF NOT EXISTS collections (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id BIGINT REFERENCES collections(id) ON DELETE CASCADE,
  paper_key     TEXT NOT NULL,
  snapshot      JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (collection_id, paper_key)
);

CREATE TABLE IF NOT EXISTS notes (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_key  TEXT,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS highlights (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_key   TEXT NOT NULL,
  text        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT 'yellow',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reading_history (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_key  TEXT NOT NULL,
  read_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query      TEXT NOT NULL,
  filters    JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS followed_topics (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic   TEXT NOT NULL,
  PRIMARY KEY (user_id, topic)
);

CREATE TABLE IF NOT EXISTS research_workspaces (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_papers (
  workspace_id BIGINT REFERENCES research_workspaces(id) ON DELETE CASCADE,
  paper_key    TEXT NOT NULL,
  snapshot     JSONB NOT NULL DEFAULT '{}',
  PRIMARY KEY (workspace_id, paper_key)
);

CREATE TABLE IF NOT EXISTS workspace_notes (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES research_workspaces(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_analyses (
  id           BIGSERIAL PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES research_workspaces(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL, -- analyze | compare | gap | litreview | trends
  input        JSONB NOT NULL DEFAULT '{}',
  output       JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL, -- user | assistant | system
  content         TEXT NOT NULL,
  evidence        JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase 10a (migration 006): usage audit for every LLM touchpoint, degraded attempts included.
CREATE TABLE IF NOT EXISTS ai_queries (
  id                BIGSERIAL PRIMARY KEY,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  conversation_id   BIGINT REFERENCES ai_conversations(id) ON DELETE SET NULL,
  kind              TEXT NOT NULL DEFAULT 'ask',
  question_excerpt  TEXT NOT NULL,
  model             TEXT,
  ok                BOOLEAN NOT NULL,
  reason            TEXT,
  prompt_tokens     INT,
  completion_tokens INT,
  latency_ms        INT,
  ip_hash           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_queries_created ON ai_queries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_queries_user ON ai_queries (user_id, created_at DESC) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS providers (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL, -- academic | openaccess | education
  enabled    BOOLEAN NOT NULL DEFAULT true,
  priority   INT NOT NULL DEFAULT 100
);

CREATE TABLE IF NOT EXISTS provider_health (
  provider_id     TEXT PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'unknown', -- ok | degraded | down | unknown
  latency_ms      INT,
  total_requests  BIGINT NOT NULL DEFAULT 0,
  total_errors    BIGINT NOT NULL DEFAULT 0,
  last_error      TEXT,
  last_success_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS provider_usage (
  id          BIGSERIAL PRIMARY KEY,
  provider_id TEXT NOT NULL,
  operation   TEXT NOT NULL,
  status      TEXT NOT NULL,
  latency_ms  INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cache_metadata (
  key        TEXT PRIMARY KEY,
  ttl        INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID,
  action     TEXT NOT NULL,
  detail     JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_history_user ON reading_history(user_id, read_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_usage_time ON provider_usage(created_at DESC);
