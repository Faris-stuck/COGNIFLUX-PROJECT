-- COGNIFLUX migration 002: dynamic Indonesian exam-learning catalog
CREATE TABLE IF NOT EXISTS prep_sources (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'official',
  license TEXT,
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS prep_programs (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title JSONB NOT NULL,
  description JSONB NOT NULL DEFAULT '{}',
  education_level TEXT,
  official_url TEXT,
  source_id BIGINT REFERENCES prep_sources(id),
  sort_order INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS prep_subjects (
  id BIGSERIAL PRIMARY KEY,
  program_id BIGINT NOT NULL REFERENCES prep_programs(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title JSONB NOT NULL,
  description JSONB NOT NULL DEFAULT '{}',
  source_url TEXT,
  sort_order INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(program_id, slug)
);
CREATE TABLE IF NOT EXISTS prep_competencies (
  id BIGSERIAL PRIMARY KEY,
  subject_id BIGINT NOT NULL REFERENCES prep_subjects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title JSONB NOT NULL,
  description JSONB NOT NULL DEFAULT '{}',
  source_url TEXT,
  sort_order INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(subject_id, slug)
);
CREATE TABLE IF NOT EXISTS prep_material_links (
  id BIGSERIAL PRIMARY KEY,
  competency_id BIGINT NOT NULL REFERENCES prep_competencies(id) ON DELETE CASCADE,
  source_id BIGINT REFERENCES prep_sources(id),
  title JSONB NOT NULL,
  url TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT 'official-reference',
  search_query TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 100,
  UNIQUE(competency_id, url)
);
CREATE INDEX IF NOT EXISTS idx_prep_programs_active ON prep_programs(active, sort_order);
CREATE INDEX IF NOT EXISTS idx_prep_subjects_program ON prep_subjects(program_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_prep_competencies_subject ON prep_competencies(subject_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_prep_materials_competency ON prep_material_links(competency_id, active, sort_order);

INSERT INTO prep_sources(name,url,kind,license) VALUES
('Pusat Asesmen Pendidikan — TKA','https://pusmendik.kemdikbud.go.id/tka/','official','Government/public information'),
('SNPMB — UTBK-SNBT','https://snpmb.id/utbk-snbt/informasi-umum','official','Official admissions information'),
('Kemendikdasmen','https://kemendikdasmen.go.id/','official','Government/public information')
ON CONFLICT(url) DO UPDATE SET name=EXCLUDED.name,kind=EXCLUDED.kind,license=EXCLUDED.license,last_verified_at=now();

INSERT INTO prep_programs(slug,title,description,education_level,official_url,source_id,sort_order) VALUES
('tka-sd', '{"id":"TKA SD / MI","en":"TKA Elementary / MI"}', '{"id":"Persiapan Tes Kemampuan Akademik untuk kelas 6 dan sederajat.","en":"Academic Competency Test preparation for grade 6 and equivalent."}', 'elementary', 'https://pusmendik.kemdikbud.go.id/tka/', (SELECT id FROM prep_sources WHERE url='https://pusmendik.kemdikbud.go.id/tka/'), 10),
('tka-smp', '{"id":"TKA SMP / MTs","en":"TKA Junior High / MTs"}', '{"id":"Persiapan TKA untuk kelas 9 dan sederajat.","en":"TKA preparation for grade 9 and equivalent."}', 'middle', 'https://pusmendik.kemdikbud.go.id/tka/', (SELECT id FROM prep_sources WHERE url='https://pusmendik.kemdikbud.go.id/tka/'), 20),
('tka-sma-smk', '{"id":"TKA SMA / MA / SMK","en":"TKA Senior High / Vocational"}', '{"id":"Bahasa Indonesia, Matematika, Bahasa Inggris, dan mata pelajaran pilihan sesuai informasi resmi TKA.","en":"Indonesian, Mathematics, English, and elective subjects according to the official TKA information."}', 'high', 'https://pusmendik.kemdikbud.go.id/tka/', (SELECT id FROM prep_sources WHERE url='https://pusmendik.kemdikbud.go.id/tka/'), 30),
('snbt', '{"id":"SNBT / UTBK","en":"SNBT / UTBK"}', '{"id":"Persiapan TPS dan Tes Literasi untuk seleksi masuk perguruan tinggi negeri.","en":"TPS and literacy preparation for Indonesian public university admission."}', 'university', 'https://snpmb.id/utbk-snbt/informasi-umum', (SELECT id FROM prep_sources WHERE url='https://snpmb.id/utbk-snbt/informasi-umum'), 40),
('ujian-sekolah', '{"id":"Ujian Sekolah","en":"School Exams"}', '{"id":"Kumpulan jalur belajar untuk materi sekolah dan asesmen.","en":"Study paths for school subjects and assessments."}', 'school', 'https://kemendikdasmen.go.id/', (SELECT id FROM prep_sources WHERE url='https://kemendikdasmen.go.id/'), 50),
('seleksi-ptn', '{"id":"Seleksi PTN & Akademik","en":"University & Academic Selection"}', '{"id":"Persiapan akademik lintas seleksi masuk perguruan tinggi di Indonesia.","en":"Academic preparation for university admission pathways in Indonesia."}', 'university', 'https://snpmb.id/', (SELECT id FROM prep_sources WHERE url='https://snpmb.id/'), 60)
ON CONFLICT(slug) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,official_url=EXCLUDED.official_url,source_id=EXCLUDED.source_id,sort_order=EXCLUDED.sort_order,updated_at=now();

WITH p AS (SELECT id FROM prep_programs WHERE slug='tka-sd')
INSERT INTO prep_subjects(program_id,slug,title,description,source_url,sort_order)
SELECT p.id,'bahasa-indonesia','{"id":"Bahasa Indonesia","en":"Indonesian Language"}','{"id":"Pemahaman membaca dan literasi.","en":"Reading comprehension and literacy."}','https://pusmendik.kemdikbud.go.id/tka/',10 FROM p
ON CONFLICT(program_id,slug) DO NOTHING;
WITH p AS (SELECT id FROM prep_programs WHERE slug='tka-sd')
INSERT INTO prep_subjects(program_id,slug,title,description,source_url,sort_order)
SELECT p.id,'matematika','{"id":"Matematika","en":"Mathematics"}','{"id":"Konsep, penerapan, dan pemecahan masalah matematika.","en":"Mathematical concepts, applications, and problem solving."}','https://pusmendik.kemdikbud.go.id/tka/',20 FROM p
ON CONFLICT(program_id,slug) DO NOTHING;

WITH p AS (SELECT id FROM prep_programs WHERE slug='tka-smp')
INSERT INTO prep_subjects(program_id,slug,title,description,source_url,sort_order)
SELECT p.id,v.slug,v.title::jsonb,v.description::jsonb,'https://pusmendik.kemdikbud.go.id/tka/',v.ord FROM p CROSS JOIN (VALUES
('bahasa-indonesia','{"id":"Bahasa Indonesia","en":"Indonesian Language"}','{"id":"Pemahaman teks informasi dan fiksi serta penalaran membaca.","en":"Informational and fiction text comprehension and reading reasoning."}',10),
('matematika','{"id":"Matematika","en":"Mathematics"}','{"id":"Bilangan, aljabar, geometri dan pengukuran, data dan peluang.","en":"Numbers, algebra, geometry and measurement, data and probability."}',20)
) v(slug,title,description,ord) ON CONFLICT(program_id,slug) DO NOTHING;

WITH p AS (SELECT id FROM prep_programs WHERE slug='tka-sma-smk')
INSERT INTO prep_subjects(program_id,slug,title,description,source_url,sort_order)
SELECT p.id,v.slug,v.title::jsonb,v.description::jsonb,'https://pusmendik.kemdikbud.go.id/tka/',v.ord FROM p CROSS JOIN (VALUES
('bahasa-indonesia','{"id":"Bahasa Indonesia","en":"Indonesian Language"}','{"id":"Pemahaman tekstual, inferensial, evaluasi, dan apresiasi.","en":"Textual and inferential comprehension, evaluation, and appreciation."}',10),
('matematika','{"id":"Matematika","en":"Mathematics"}','{"id":"Bilangan, aljabar, geometri dan pengukuran, data dan peluang, serta trigonometri.","en":"Numbers, algebra, geometry and measurement, data and probability, and trigonometry."}',20),
('bahasa-inggris','{"id":"Bahasa Inggris","en":"English"}','{"id":"Membaca teks dalam konteks sehari-hari, vokasional, dan akademik.","en":"Reading texts in everyday, vocational, and academic contexts."}',30),
('matematika-tingkat-lanjut','{"id":"Matematika Tingkat Lanjut","en":"Advanced Mathematics"}','{"id":"Aljabar, geometri dan pengukuran, serta kalkulus.","en":"Algebra, geometry and measurement, and calculus."}',40),
('fisika','{"id":"Fisika","en":"Physics"}','{}',50),('kimia','{"id":"Kimia","en":"Chemistry"}','{}',60),('biologi','{"id":"Biologi","en":"Biology"}','{}',70),('ekonomi','{"id":"Ekonomi","en":"Economics"}','{}',80),('geografi','{"id":"Geografi","en":"Geography"}','{}',90),('sosiologi','{"id":"Sosiologi","en":"Sociology"}','{}',100),('sejarah','{"id":"Sejarah","en":"History"}','{}',110),('antropologi','{"id":"Antropologi","en":"Anthropology"}','{}',120),('bahasa-jepang','{"id":"Bahasa Jepang","en":"Japanese"}','{}',130),('bahasa-korea','{"id":"Bahasa Korea","en":"Korean"}','{}',140),('bahasa-mandarin','{"id":"Bahasa Mandarin","en":"Mandarin Chinese"}','{}',150),('bahasa-arab','{"id":"Bahasa Arab","en":"Arabic"}','{}',160)
) v(slug,title,description,ord) ON CONFLICT(program_id,slug) DO NOTHING;

WITH p AS (SELECT id FROM prep_programs WHERE slug='snbt')
INSERT INTO prep_subjects(program_id,slug,title,description,source_url,sort_order)
SELECT p.id,v.slug,v.title::jsonb,v.description::jsonb,'https://snpmb.id/utbk-snbt/informasi-umum',v.ord FROM p CROSS JOIN (VALUES
('penalaran-umum','{"id":"Penalaran Umum","en":"General Reasoning"}','{}',10),
('pengetahuan-pemahaman-umum','{"id":"Pengetahuan dan Pemahaman Umum","en":"General Knowledge and Understanding"}','{}',20),
('pemahaman-bacaan-menulis','{"id":"Pemahaman Bacaan dan Menulis","en":"Reading Comprehension and Writing"}','{}',30),
('pengetahuan-kuantitatif','{"id":"Pengetahuan Kuantitatif","en":"Quantitative Knowledge"}','{}',40),
('literasi-bahasa-indonesia','{"id":"Literasi Bahasa Indonesia","en":"Indonesian Literacy"}','{}',50),
('literasi-bahasa-inggris','{"id":"Literasi Bahasa Inggris","en":"English Literacy"}','{}',60),
('penalaran-matematika','{"id":"Penalaran Matematika","en":"Mathematical Reasoning"}','{}',70)
) v(slug,title,description,ord) ON CONFLICT(program_id,slug) DO NOTHING;

WITH p AS (SELECT id FROM prep_programs WHERE slug='ujian-sekolah')
INSERT INTO prep_subjects(program_id,slug,title,description,source_url,sort_order)
SELECT p.id,v.slug,v.title::jsonb,'{}','https://kemendikdasmen.go.id/',v.ord FROM p CROSS JOIN (VALUES
('bahasa-indonesia','{"id":"Bahasa Indonesia","en":"Indonesian Language"}',10),('matematika','{"id":"Matematika","en":"Mathematics"}',20),('ipa','{"id":"IPA","en":"Science"}',30),('ips','{"id":"IPS","en":"Social Studies"}',40),('bahasa-inggris','{"id":"Bahasa Inggris","en":"English"}',50),('informatika','{"id":"Informatika","en":"Computer Science"}',60)
) v(slug,title,ord) ON CONFLICT(program_id,slug) DO NOTHING;

WITH p AS (SELECT id FROM prep_programs WHERE slug='seleksi-ptn')
INSERT INTO prep_subjects(program_id,slug,title,description,source_url,sort_order)
SELECT p.id,v.slug,v.title::jsonb,'{}','https://snpmb.id/',v.ord FROM p CROSS JOIN (VALUES
('literasi','{"id":"Literasi","en":"Literacy"}',10),('penalaran','{"id":"Penalaran","en":"Reasoning"}',20),('kemampuan-numerik','{"id":"Kemampuan Numerik","en":"Numerical Ability"}',30),('matematika','{"id":"Matematika","en":"Mathematics"}',40),('bahasa','{"id":"Bahasa","en":"Language"}',50)
) v(slug,title,ord) ON CONFLICT(program_id,slug) DO NOTHING;

-- Initial competency map: content stays in DB and can be extended without UI/code changes.
WITH s AS (SELECT id FROM prep_subjects WHERE slug='matematika' AND program_id=(SELECT id FROM prep_programs WHERE slug='tka-sma-smk'))
INSERT INTO prep_competencies(subject_id,slug,title,description,source_url,sort_order)
SELECT s.id,v.slug,v.title::jsonb,v.description::jsonb,'https://pusmendik.kemdikbud.go.id/tka/tka/view/mata-pelajaran-wajib/sma',v.ord FROM s CROSS JOIN (VALUES
('bilangan','{"id":"Bilangan","en":"Numbers"}','{"id":"Memahami dan menerapkan konsep bilangan dalam masalah.","en":"Understand and apply number concepts in problems."}',10),
('aljabar','{"id":"Aljabar","en":"Algebra"}','{"id":"Memahami ekspresi, persamaan, fungsi, dan pemodelan aljabar.","en":"Understand expressions, equations, functions, and algebraic modelling."}',20),
('geometri-pengukuran','{"id":"Geometri dan Pengukuran","en":"Geometry and Measurement"}','{}',30),
('data-peluang','{"id":"Data dan Peluang","en":"Data and Probability"}','{}',40),
('trigonometri','{"id":"Trigonometri","en":"Trigonometry"}','{}',50)
) v(slug,title,description,ord) ON CONFLICT(subject_id,slug) DO NOTHING;
WITH s AS (SELECT id FROM prep_subjects WHERE slug='bahasa-inggris' AND program_id=(SELECT id FROM prep_programs WHERE slug='tka-sma-smk'))
INSERT INTO prep_competencies(subject_id,slug,title,description,source_url,sort_order)
SELECT s.id,v.slug,v.title::jsonb,v.description::jsonb,'https://pusmendik.kemdikbud.go.id/tka/tka/view/mata-pelajaran-wajib/sma/bahasa-inggris',v.ord FROM s CROSS JOIN (VALUES
('pemahaman-tekstual','{"id":"Pemahaman Tekstual","en":"Textual Comprehension"}','{}',10),('pemahaman-inferensial','{"id":"Pemahaman Inferensial","en":"Inferential Comprehension"}','{}',20),('evaluasi-apresiasi','{"id":"Evaluasi dan Apresiasi","en":"Evaluation and Appreciation"}','{}',30)
) v(slug,title,description,ord) ON CONFLICT(subject_id,slug) DO NOTHING;
WITH s AS (SELECT id FROM prep_subjects WHERE slug='penalaran-umum' AND program_id=(SELECT id FROM prep_programs WHERE slug='snbt'))
INSERT INTO prep_competencies(subject_id,slug,title,description,source_url,sort_order)
SELECT s.id,v.slug,v.title::jsonb,'{}','https://snpmb.id/utbk-snbt/informasi-umum',v.ord FROM s CROSS JOIN (VALUES
('induktif','{"id":"Penalaran Induktif","en":"Inductive Reasoning"}',10),('deduktif','{"id":"Penalaran Deduktif","en":"Deductive Reasoning"}',20),('kuantitatif','{"id":"Penalaran Kuantitatif","en":"Quantitative Reasoning"}',30)
) v(slug,title,ord) ON CONFLICT(subject_id,slug) DO NOTHING;

-- Ensure every catalog subject has a navigable learning node. Content is data in DB,
-- not embedded in the UI, and can be expanded later by ingestion/admin workflows.
INSERT INTO prep_competencies(subject_id,slug,title,description,source_url,sort_order)
SELECT s.id,'cakupan-dan-dasar',jsonb_build_object('id','Cakupan dan dasar','en','Scope and foundations'),jsonb_build_object('id','Mulai dari konsep dan cakupan materi yang relevan untuk target ini.','en','Start with the concepts and scope relevant to this target.'),COALESCE(s.source_url,p.official_url),1
FROM prep_subjects s JOIN prep_programs p ON p.id=s.program_id
WHERE s.active AND NOT EXISTS (SELECT 1 FROM prep_competencies c WHERE c.subject_id=s.id);

INSERT INTO prep_material_links(competency_id,source_id,title,url,resource_type,search_query,sort_order)
SELECT c.id,p.source_id,
       jsonb_build_object('id','Sumber resmi dan cakupan','en','Official source and scope'),
       COALESCE(c.source_url,p.official_url), 'official-reference',
       jsonb_build_object('id',c.slug,'en',c.slug)::text, 1
FROM prep_competencies c JOIN prep_subjects s ON s.id=c.subject_id JOIN prep_programs p ON p.id=s.program_id
WHERE COALESCE(c.source_url,p.official_url) IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM prep_material_links m WHERE m.competency_id=c.id);
