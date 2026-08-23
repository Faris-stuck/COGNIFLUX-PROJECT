-- COGNIFLUX migration 001: Phase 1 (Auth + Personal Library)
-- Reuses existing tables from schema.sql. Additive only - preserves all data.

-- notes: allow general notes (paper optional) and attach to a collection
ALTER TABLE notes ALTER COLUMN paper_key DROP NOT NULL;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS collection_id BIGINT REFERENCES collections(id) ON DELETE CASCADE;

-- highlights: optional note attached to a highlight; section anchor for future Reader use
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE highlights ADD COLUMN IF NOT EXISTS section_anchor TEXT;

-- reading_history: one row per user+paper, update read_at on re-read
ALTER TABLE reading_history DROP CONSTRAINT IF EXISTS uq_history_user_paper;
ALTER TABLE reading_history ADD CONSTRAINT uq_history_user_paper UNIQUE (user_id, paper_key);
ALTER TABLE reading_history ADD COLUMN IF NOT EXISTS progress SMALLINT; -- 0..100, null = unknown
ALTER TABLE reading_history ADD COLUMN IF NOT EXISTS snapshot JSONB NOT NULL DEFAULT '{}'; -- slim display metadata only

-- upsert targets used by the library API
ALTER TABLE collection_items DROP CONSTRAINT IF EXISTS collection_items_pkey;
ALTER TABLE collection_items ADD CONSTRAINT uq_collection_paper UNIQUE (collection_id, paper_key);
ALTER TABLE profiles ADD CONSTRAINT uq_profiles_user UNIQUE (user_id);

-- password recovery + email verification architecture (delivery channel comes later)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_highlights_user ON highlights(user_id);
