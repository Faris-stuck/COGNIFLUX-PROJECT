import { createHash } from "node:crypto";
import { Pool } from "pg";

const sources = [
  { name: "Pusat Asesmen Pendidikan — TKA SMP Matematika", url: "https://pusmendik.kemendikdasmen.go.id/tka/tka/view/mata-pelajaran-wajib/smp/Matematika", subject: "matematika" },
  { name: "Pusat Asesmen Pendidikan — TKA SMA Matematika", url: "https://pusmendik.kemendikdasmen.go.id/tka/tka/view/mata-pelajaran-wajib/sma/Matematika%20TKA", subject: "matematika" },
  { name: "Pusat Asesmen Pendidikan — TKA Matematika Tingkat Lanjut", url: "https://pusmendik.kemendikdasmen.go.id/tka/tka/view/mata-pelajaran-pilihan/sma/matematika-tingkat-lanjut", subject: "matematika-tingkat-lanjut" },
];
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const hash = value => createHash("sha256").update(value).digest("hex");
const decodeHtml = value => value
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const stripHtml = value => decodeHtml(value
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<br\s*\/?\s*>/gi, "\n")
  .replace(/<[^>]+>/g, " "))
  .replace(/\s+/g, " ").trim();
const field = (block, label) => {
  const match = block.match(new RegExp(`<th[^>]*>\\s*${label}\\s*<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`, "i"));
  return match ? stripHtml(match[1]) : "";
};
function parseBlocks(html) {
  const out = [];
  const re = /<div[^>]*class=["'][^"']*soal-item[^"']*["'][^>]*data-soal=["'](\d+)["'][^>]*>([\s\S]*?)(?=<div[^>]*class=["'][^"']*soal-item[^"']*["'][^>]*data-soal=|<\/div>\s*<\/div>\s*<\/div>\s*$)/gi;
  let match;
  while ((match = re.exec(html))) {
    const block = match[2];
    const promptParts = [...block.matchAll(/<p\s+class=["']card-text["'][^>]*>([\s\S]*?)<\/p>/gi)]
      .map(m => stripHtml(m[1])).filter(Boolean);
    const options = [...block.matchAll(/<label[^>]*class=["'][^"']*form-check-label[^"']*["'][^>]*>([\s\S]*?)<\/label>/gi)]
      .map(m => stripHtml(m[1])).filter(Boolean);
    const item = {
      number: match[1],
      competency: field(block, "Kompetensi"),
      subcompetency: field(block, "Sub Kompetensi"),
      format: field(block, "Bentuk Soal"),
      key: field(block, "Kunci"),
      prompt: promptParts.join("\n\n").trim(),
      options,
    };
    if (item.number && item.prompt && item.options.length && item.key) out.push(item);
  }
  return out;
}
async function findCompetency(client, source, subjectSlug) {
  const { rows } = await client.query(`SELECT c.id,c.slug,c.title FROM prep_competencies c JOIN prep_subjects s ON s.id=c.subject_id WHERE s.slug=$1 ORDER BY c.sort_order,c.id`, [subjectSlug]);
  const n = String(source).toLowerCase();
  return rows.find(r => JSON.stringify(r.title).toLowerCase().includes(n.slice(0, 80)))
    || rows.find(r => n.includes(r.slug.replaceAll("-", " ")))
    || rows.find(r => r.slug === "cakupan-dan-dasar")
    || rows[0]
    || null;
}
async function main() {
  const client = await pool.connect();
  try {
    for (const src of sources) {
      const sid = (await client.query("SELECT id FROM prep_sources WHERE url LIKE $1 LIMIT 1", [new URL(src.url).origin + "%"])).rows[0]?.id ?? null;
      const run = (await client.query("INSERT INTO prep_ingestion_runs(source_id,source_url) VALUES($1,$2) RETURNING id", [sid, src.url])).rows[0].id;
      try {
        const response = await fetch(src.url, { headers: { "user-agent": "Cogniflux/0.1 question-ingestor (+https://cogniflux.web.id)" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        const blocks = parseBlocks(html);
        let accepted = 0, skipped = 0;
        for (const block of blocks) {
          const contentHash = hash(`${src.url}|${block.number}|${JSON.stringify(block)}`);
          const existing = await client.query("SELECT id FROM prep_questions WHERE content_hash=$1 OR (source_url=$2 AND external_key=$3) LIMIT 1", [contentHash, src.url, block.number]);
          if (existing.rows[0]) { skipped++; continue; }
          const competency = await findCompetency(client, block.competency, src.subject);
          if (!competency) { skipped++; continue; }
          const kind = block.format.includes("MCMA") ? "multiple_response" : block.format.includes("Kategori") ? "true_false_matrix" : "single_choice";
          const prompt = JSON.stringify({ id: block.prompt, en: block.prompt });
          const provenance = JSON.stringify({ competency: block.competency, subcompetency: block.subcompetency, format: block.format, key: block.key, optionCount: block.options.length, publicationPolicy: "reference-only-until-reviewed" });
          const inserted = (await client.query(`INSERT INTO prep_questions(competency_id,question_type,prompt,explanation,difficulty,points,source_url,source_type,external_key,content_hash,provenance,active) VALUES($1,$2,$3,'{}',2,1,$4,'official-reference',$5,$6,$7,false) RETURNING id`, [competency.id, kind, prompt, src.url, block.number, contentHash, provenance])).rows[0];
          for (let i = 0; i < block.options.length; i++) {
            const key = String.fromCharCode(65 + i);
            await client.query(`INSERT INTO prep_question_options(question_id,option_key,label,is_correct,sort_order) VALUES($1,$2,$3,false,$4) ON CONFLICT(question_id,option_key) DO NOTHING`, [inserted.id, key, JSON.stringify({ id: block.options[i], en: block.options[i] }), (i + 1) * 10]);
          }
          await client.query(`INSERT INTO prep_question_provenance(question_id,source_id,source_url,external_key,source_question_number,source_format,source_competency,source_subcompetency,raw_checksum,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [inserted.id, sid, src.url, block.number, block.number, block.format, block.competency, block.subcompetency, hash(JSON.stringify(block)), JSON.stringify({ key: block.key, optionCount: block.options.length })]);
          accepted++;
        }
        await client.query("UPDATE prep_ingestion_runs SET finished_at=now(),status='success',fetched_count=$1,accepted_count=$2,skipped_count=$3 WHERE id=$4", [blocks.length, accepted, skipped, run]);
        console.log(`${src.url}: fetched=${blocks.length} accepted=${accepted} skipped=${skipped}`);
      } catch (error) {
        await client.query("UPDATE prep_ingestion_runs SET finished_at=now(),status='failed',error_count=1,error_message=$1 WHERE id=$2", [error instanceof Error ? error.message : String(error), run]);
        console.log(`${src.url}: FAILED ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exit(1); });
