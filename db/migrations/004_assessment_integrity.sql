-- Assessment integrity: server-enforced deadline + attempt metadata.
ALTER TABLE prep_attempts ADD COLUMN IF NOT EXISTS duration_limit_seconds INT;
CREATE INDEX IF NOT EXISTS idx_prep_attempts_status ON prep_attempts(status, started_at DESC);
