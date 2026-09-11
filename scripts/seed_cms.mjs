import fs from 'node:fs'; import vm from 'node:vm'; import pg from 'pg';
const {Pool}=pg;
const src=fs.readFileSync('src/lib/i18n.ts','utf8');
const m=src.match(/export const dictionaries = (.*) as const;/s); if(!m) throw new Error('dictionary source not found');
const dictionaries=vm.runInNewContext('('+m[1]+')');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const c=await pool.connect(); try { await c.query('BEGIN');
 for(const locale of ['id','en']) await c.query(`INSERT INTO cms_content(content_key,locale,payload) VALUES($1,$2,$3) ON CONFLICT(content_key,locale) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now(),active=true`,['i18n',locale,JSON.stringify(dictionaries[locale])]);
 await c.query(`INSERT INTO cms_content(content_key,locale,payload) VALUES('home.suggestions','*',$1) ON CONFLICT(content_key,locale) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now(),active=true`,[JSON.stringify([
  {group:'Papers',items:['impact of AI on education','machine learning for climate','CRISPR gene editing review']},
  {group:'Education',items:['calculus textbook','basic physics materials','intro to programming']},
  {group:'Research',items:['research gap: e-learning Indonesia','trends in renewable energy']}
])]);
 await c.query(`INSERT INTO cms_content(content_key,locale,payload) VALUES('home.topics','*',$1) ON CONFLICT(content_key,locale) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now(),active=true`,[JSON.stringify(['Machine Learning','Climate Change','Public Health','Neuroscience','Renewable Energy','Quantum Computing','Genomics','Behavioral Economics'])]);
 await c.query('COMMIT'); console.log('seeded cms');
} catch(e){await c.query('ROLLBACK');throw e} finally {c.release();await pool.end()}
