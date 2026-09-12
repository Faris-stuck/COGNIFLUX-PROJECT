/**
 * Promote ingested official-reference questions into the live practice bank.
 *
 * The ingestor (scripts/ingest_question_sources.mjs) stores official TKA
 * pages as active=false with the source answer key in
 * provenance->metadata->>key. This script is the "review" gate, executed
 * deterministically:
 *
 *  - single-letter keys ("A".."F")  -> mark option by option_key
 *  - combination keys ("Pernyataan 1 dan 2", "B, E", long text) -> match
 *    against normalized option LABELS; promote only on EXACTLY ONE match
 *  - anything ambiguous or unmatched stays active=false and is reported.
 *
 * Idempotent: only touches questions WHERE active=false AND source_type=
 * 'official-reference'. Rerun-safe.
 */
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/\bg[a-z]\.?\s+/g, "")        // strip leading "g. " option markers
    .replace(/&nbsp;/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

async function main() {
  const client = await pool.connect();
  let promoted = 0;
  const skipped = [];
  try {
    const { rows } = await client.query(
      `SELECT q.id, q.external_key, q.source_url, q.question_type,
              q.provenance->>'key' AS answer_key,
              q.provenance->>'format' AS fmt
         FROM prep_questions q
        WHERE q.active = false AND q.source_type = 'official-reference'
        ORDER BY q.id`,
    );
    console.log(`candidates: ${rows.length}`);

    for (const q of rows) {
      const { rows: opts } = await client.query(
        `SELECT id, option_key, label, sort_order FROM prep_question_options WHERE question_id=$1 ORDER BY sort_order, id`,
        [q.id],
      );
      if (opts.length < 2) { skipped.push([q.id, "too-few-options"]); continue; }

      const key = (q.answer_key ?? "").trim();
      if (!key) { skipped.push([q.id, "no-key"]); continue; }

      let hit = null;
      const isMulti = q.question_type === "multiple_response";

      if (/^[A-F]$/.test(key)) {
        hit = opts.filter((o) => o.option_key === key);
      } else if (isMulti && /^([A-F]\s*[,;]\s*)*[A-F]$/.test(key)) {
        // Comma-separated letters, e.g. "B, E" -> mark all listed options.
        const letters = [...key.matchAll(/[A-F]/g)].map((m) => m[0]);
        hit = opts.filter((o) => letters.includes(o.option_key));
        if (hit.length !== letters.length) hit = null;
      } else if (isMulti && /^pernyataan\b/i.test(key)) {
        // "Pernyataan 1, 2, dan 3" with statement options A..D: the numbers
        // are 1-based POSITIONS among the options (official PGK MCMA layout).
        const nums = [...key.matchAll(/\d+/g)].map((m) => Number(m[0]));
        if (nums.length >= 1 && nums.every((n) => n >= 1 && n <= opts.length) && new Set(nums).size === nums.length) {
          hit = opts.filter((o) => nums.includes(o.sort_order / 10));
        }
      } else {
        const nk = norm(key);
        hit = opts.filter((o) => {
          const nl = norm(typeof o.label === "string" ? o.label : o.label?.id ?? "");
          return nl === nk || (nk.length > 8 && (nl.startsWith(nk) || nk.startsWith(nl)));
        });
        // Multi-part key "Pernyataan 1, 2, dan 3" style against single-statement options:
        if (hit.length === 0 && /pernyataan/i.test(key)) {
          const nums = [...key.matchAll(/\d+/g)].map((m) => m[0]);
          hit = opts.filter((o) => {
            const nl = norm(typeof o.label === "string" ? o.label : o.label?.id ?? "");
            const onum = nl.match(/(\d+)/)?.[1];
            return onum && nums.includes(onum);
          });
          // only valid if every option is a single statement
          if (hit.length === 0 || hit.length === opts.length) hit = null;
        }
      }

      const valid = isMulti
        ? hit !== null && hit.length >= 1 && hit.length < opts.length
        : hit !== null && hit.length === 1;
      if (!valid) {
        skipped.push([q.id, `ambiguous-key(${hit ? hit.length : 0}):${key.slice(0, 40)}`]);
        continue;
      }

      await client.query("UPDATE prep_question_options SET is_correct=false WHERE question_id=$1", [q.id]);
      for (const o of hit) {
        await client.query("UPDATE prep_question_options SET is_correct=true WHERE id=$1", [o.id]);
      }
      await client.query(
        `UPDATE prep_questions SET active=true, reviewed_at=now(), published_at=now(), updated_at=now()
          WHERE id=$1`,
        [q.id],
      );
      promoted++;
    }

    console.log(`promoted: ${promoted}`);
    console.log(`skipped : ${skipped.length}`);
    for (const [id, why] of skipped) console.log(`  q${id}: ${why}`);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
