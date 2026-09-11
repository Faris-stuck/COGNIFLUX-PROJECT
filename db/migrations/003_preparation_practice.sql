-- Dynamic preparation practice/assessment layer. Questions and scoring data live in PostgreSQL.
CREATE TABLE IF NOT EXISTS prep_questions (
  id BIGSERIAL PRIMARY KEY,
  competency_id BIGINT NOT NULL REFERENCES prep_competencies(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL DEFAULT 'single_choice',
  prompt JSONB NOT NULL,
  explanation JSONB NOT NULL DEFAULT '{}',
  difficulty SMALLINT NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
  points SMALLINT NOT NULL DEFAULT 1 CHECK (points > 0),
  source_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS prep_question_options (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES prep_questions(id) ON DELETE CASCADE,
  option_key TEXT NOT NULL,
  label JSONB NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 100,
  UNIQUE(question_id, option_key)
);
CREATE INDEX IF NOT EXISTS idx_prep_questions_competency ON prep_questions(competency_id, active, difficulty, id);
CREATE INDEX IF NOT EXISTS idx_prep_options_question ON prep_question_options(question_id, sort_order, id);

CREATE TABLE IF NOT EXISTS prep_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  program_id BIGINT REFERENCES prep_programs(id) ON DELETE SET NULL,
  subject_id BIGINT REFERENCES prep_subjects(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'practice',
  status TEXT NOT NULL DEFAULT 'started',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  score NUMERIC(8,2),
  max_score NUMERIC(8,2),
  duration_seconds INT
);
CREATE TABLE IF NOT EXISTS prep_attempt_questions (
  attempt_id UUID NOT NULL REFERENCES prep_attempts(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES prep_questions(id) ON DELETE RESTRICT,
  answer_option_id BIGINT REFERENCES prep_question_options(id) ON DELETE RESTRICT,
  is_correct BOOLEAN,
  points_awarded NUMERIC(8,2),
  PRIMARY KEY(attempt_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_prep_attempts_user ON prep_attempts(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_prep_attempt_questions_attempt ON prep_attempt_questions(attempt_id);

CREATE TABLE IF NOT EXISTS prep_tryouts (
  id BIGSERIAL PRIMARY KEY,
  program_id BIGINT REFERENCES prep_programs(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title JSONB NOT NULL,
  description JSONB NOT NULL DEFAULT '{}',
  duration_seconds INT NOT NULL DEFAULT 1800,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS prep_tryout_questions (
  tryout_id BIGINT NOT NULL REFERENCES prep_tryouts(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES prep_questions(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 100,
  PRIMARY KEY(tryout_id, question_id)
);

-- Original starter questions: stored as DB content, never embedded in UI code.
WITH c AS (SELECT id FROM prep_competencies WHERE slug='aljabar' AND subject_id=(SELECT id FROM prep_subjects WHERE slug='matematika' AND program_id=(SELECT id FROM prep_programs WHERE slug='tka-sma-smk')) LIMIT 1)
INSERT INTO prep_questions(competency_id,question_type,prompt,explanation,difficulty,source_url)
SELECT c.id,'single_choice','{"id":"Jika 2x + 5 = 17, nilai x adalah ...","en":"If 2x + 5 = 17, the value of x is ..."}','{"id":"Kurangi 5 dari kedua ruas sehingga 2x = 12, lalu bagi 2 sehingga x = 6.","en":"Subtract 5 from both sides to get 2x = 12, then divide by 2 to get x = 6."}',1,'https://pusmendik.kemdikbud.go.id/tka/' FROM c
WHERE NOT EXISTS (SELECT 1 FROM prep_questions q WHERE q.competency_id=c.id AND q.prompt->>'en'='If 2x + 5 = 17, the value of x is ...');
WITH q AS (SELECT id FROM prep_questions WHERE prompt->>'en'='If 2x + 5 = 17, the value of x is ...' LIMIT 1)
INSERT INTO prep_question_options(question_id,option_key,label,is_correct,sort_order)
SELECT q.id,v.k,v.l::jsonb,v.correct,v.ord FROM q CROSS JOIN (VALUES
('A','{"id":"4","en":"4"}',false,10),('B','{"id":"6","en":"6"}',true,20),('C','{"id":"8","en":"8"}',false,30),('D','{"id":"11","en":"11"}',false,40)
) v(k,l,correct,ord) ON CONFLICT(question_id,option_key) DO NOTHING;

WITH c AS (SELECT id FROM prep_competencies WHERE slug='induktif' AND subject_id=(SELECT id FROM prep_subjects WHERE slug='penalaran-umum' AND program_id=(SELECT id FROM prep_programs WHERE slug='snbt')) LIMIT 1)
INSERT INTO prep_questions(competency_id,question_type,prompt,explanation,difficulty,source_url)
SELECT c.id,'single_choice','{"id":"Semua peserta yang lulus tahap A menerima kartu akses. Dita menerima kartu akses. Kesimpulan yang paling tepat adalah ...","en":"All participants who pass stage A receive an access card. Dita receives an access card. The most appropriate conclusion is ..."}','{"id":"Penerimaan kartu akses tidak membuktikan bahwa Dita pasti lulus tahap A, karena syarat tersebut hanya satu arah.","en":"Receiving an access card does not prove that Dita passed stage A, because the statement only establishes one direction."}',2,'https://snpmb.id/utbk-snbt/informasi-umum' FROM c
WHERE NOT EXISTS (SELECT 1 FROM prep_questions q WHERE q.competency_id=c.id AND q.prompt->>'en' LIKE 'All participants who pass stage A%');
WITH q AS (SELECT id FROM prep_questions WHERE prompt->>'en' LIKE 'All participants who pass stage A%' LIMIT 1)
INSERT INTO prep_question_options(question_id,option_key,label,is_correct,sort_order)
SELECT q.id,v.k,v.l::jsonb,v.correct,v.ord FROM q CROSS JOIN (VALUES
('A','{"id":"Dita pasti lulus tahap A.","en":"Dita definitely passed stage A."}',false,10),('B','{"id":"Dita pasti tidak lulus tahap A.","en":"Dita definitely did not pass stage A."}',false,20),('C','{"id":"Tidak dapat dipastikan bahwa Dita lulus tahap A.","en":"It cannot be concluded that Dita passed stage A."}',true,30),('D','{"id":"Semua penerima kartu akses lulus tahap A.","en":"Everyone who receives an access card passed stage A."}',false,40)
) v(k,l,correct,ord) ON CONFLICT(question_id,option_key) DO NOTHING;

WITH p AS (SELECT id FROM prep_programs WHERE slug='snbt' LIMIT 1)
INSERT INTO prep_tryouts(program_id,slug,title,description,duration_seconds)
SELECT p.id,'snbt-mini-01','{"id":"SNBT Mini Tryout 01","en":"SNBT Mini Tryout 01"}','{"id":"Tryout dinamis dari bank soal Cogniflux.","en":"Dynamic tryout assembled from the Cogniflux question bank."}',1200
FROM p WHERE NOT EXISTS (SELECT 1 FROM prep_tryouts WHERE slug='snbt-mini-01');
WITH t AS (SELECT id FROM prep_tryouts WHERE slug='snbt-mini-01' LIMIT 1), q AS (SELECT id FROM prep_questions ORDER BY id LIMIT 10)
INSERT INTO prep_tryout_questions(tryout_id,question_id,sort_order)
SELECT t.id,q.id,row_number() over() FROM t CROSS JOIN q ON CONFLICT DO NOTHING;
