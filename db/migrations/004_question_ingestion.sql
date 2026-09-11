-- Dynamic question ingestion/provenance layer
ALTER TABLE prep_questions ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'cogniflux-original';
ALTER TABLE prep_questions ADD COLUMN IF NOT EXISTS external_key TEXT;
ALTER TABLE prep_questions ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE prep_questions ADD COLUMN IF NOT EXISTS provenance JSONB NOT NULL DEFAULT '{}';
ALTER TABLE prep_questions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE prep_questions ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_prep_questions_source_key ON prep_questions(source_url, external_key) WHERE external_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_prep_questions_content_hash ON prep_questions(content_hash) WHERE content_hash IS NOT NULL;
CREATE TABLE IF NOT EXISTS prep_ingestion_runs (
  id BIGSERIAL PRIMARY KEY, source_id BIGINT REFERENCES prep_sources(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running', fetched_count INT NOT NULL DEFAULT 0,
  accepted_count INT NOT NULL DEFAULT 0, skipped_count INT NOT NULL DEFAULT 0, error_count INT NOT NULL DEFAULT 0,
  error_message TEXT
);
CREATE TABLE IF NOT EXISTS prep_question_provenance (
  question_id BIGINT PRIMARY KEY REFERENCES prep_questions(id) ON DELETE CASCADE,
  source_id BIGINT REFERENCES prep_sources(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL, external_key TEXT, source_question_number TEXT,
  source_format TEXT, source_competency TEXT, source_subcompetency TEXT,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(), raw_checksum TEXT, metadata JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_prep_ingestion_runs_source ON prep_ingestion_runs(source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_prep_question_provenance_source ON prep_question_provenance(source_id, retrieved_at DESC);
