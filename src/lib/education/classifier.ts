import type { EducationLevel } from "./types";

/**
 * Bilingual query classifier: detects education intent, level/grade/subject,
 * and language from the raw query string. Deterministic rules only - no ML.
 *
 * Pipeline (in order):
 *   1. language detection
 *   2. explicit education-level detection (named levels only)
 *   3. grade detection -> derived levels (single-valued mapping)
 *   4. subject detection (bilingual aliases)
 *   5. domain/intent detection with academic-vs-education conflict resolution
 *   6. topic-term residue
 *
 * Examples:
 *  "grade 8 mathematics" -> { domain:'education', levels:['middle-school'], grade:8, subjects:['mathematics'], lang:'en' }
 *  "matematika kelas 8"  -> { domain:'education', levels:['middle-school'], grade:8, subjects:['mathematics'], lang:'id' }
 *  "SMK RPL database"    -> { domain:'education', levels:['vocational'],  grade:null, subjects:['programming'], topic:['database'] }
 *  "machine learning research" -> { domain:'academic', ... }
 */

export interface QueryClassification {
  /** academic | education | both */
  domain: "academic" | "education" | "both";
  levels: EducationLevel[];
  grade: number | null;
  subjects: string[]; // canonical slugs
  /** remaining topical terms after stripping education markers */
  topicTerms: string[];
  lang: "en" | "id";
}

// ---------------------------------------------------------------------------
// Step 2: EXPLICIT level words only. Bare "grade N" is intentionally NOT here;
// it is handled once, in step 3, via gradeToLevels so a grade can never map to
// two levels (the old dual regex matched "grade 8" as both middle AND high).
// ---------------------------------------------------------------------------

const ID_LEVEL_WORDS: Array<[RegExp, EducationLevel]> = [
  [/\b(sd|sekolah dasar)\b/i, "elementary"],
  [/\b(smp|sltp)\b/i, "middle-school"],
  [/\b(sma|smu)\b/i, "high-school"],
  [/\bsmk\b|\bsekolah menengah kejuruan\b/i, "vocational"],
  [/\b(kuliah|universitas|s1|s2|s3)\b/i, "university"],
  [/\b(pelatihan|kursus|profesional)\b/i, "professional"],
];

const EN_LEVEL_WORDS: Array<[RegExp, EducationLevel]> = [
  [/\belementary\b|\bprimary school\b/i, "elementary"],
  [/\bmiddle school\b|\bjunior high\b/i, "middle-school"],
  [/\bhigh school\b|\bsenior high\b|\bsecondary school\b/i, "high-school"],
  [/\bvocational\b/i, "vocational"],
  [/\buniversity\b|\bcollege\b|\bundergraduate\b|\bgraduate\b/i, "university"],
  [/\bprofessional\b|\badult learning\b|\btraining\b/i, "professional"],
];

// ---------------------------------------------------------------------------
// Step 3: grade extraction (bilingual) -> single canonical level mapping.
// ---------------------------------------------------------------------------

/** Indonesian: kelas 8. English: grade 8 / 8th grade. */
function extractGrade(q: string): number | null {
  const id = q.match(/\bkelas\s*(\d{1,2})\b/i);
  if (id) return clampGrade(Number(id[1]));
  const en = q.match(/\bgrade\s*(\d{1,2})\b/i) ?? q.match(/\b(\d{1,2})(st|nd|rd|th)\s*grade\b/i);
  if (en) return clampGrade(Number(en[1]));
  return null;
}

function clampGrade(n: number): number | null {
  if (n < 1 || n > 16 || Number.isNaN(n)) return null;
  return n;
}

export function gradeToLevels(grade: number | null): EducationLevel[] {
  if (grade == null) return [];
  if (grade <= 6) return ["elementary"];
  if (grade <= 9) return ["middle-school"];
  if (grade <= 12) return ["high-school"];
  return ["university"];
}

// ---------------------------------------------------------------------------
// Step 4: subject aliases. RPL = Rekayasa Perangkat Lunak (Indonesian
// vocational software-engineering program) maps to canonical "programming".
// ---------------------------------------------------------------------------

const ID_SUBJECTS: Array<[RegExp, string]> = [
  [/matematika/i, "mathematics"],
  [/fisika/i, "physics"],
  [/kimia/i, "chemistry"],
  [/biologi/i, "biology"],
  [/ilmu komputer|informatika/i, "computer-science"],
  [/\brpl\b|rekayasa perangkat lunak|pemrograman|coding/i, "programming"],
  [/teknologi informasi/i, "information-technology"],
  [/teknik(?! informatika)/i, "engineering"],
  [/elektronika/i, "electronics"],
  [/jaringan/i, "networking"],
  [/otomotif/i, "automotive"],
  [/akuntansi/i, "accounting"],
  [/ekonomi/i, "economics"],
  [/bisnis/i, "business"],
  [/sejarah/i, "history"],
  [/geografi/i, "geography"],
  [/bahasa(?! inggris$)/i, "languages"],
  [/sastra/i, "literature"],
  [/seni/i, "arts"],
  [/desain/i, "design"],
  [/kesehatan/i, "health"],
  [/pertanian/i, "agriculture"],
  [/perhotelan/i, "hospitality"],
  [/manufaktur/i, "manufacturing"],
];

const EN_SUBJECTS: Array<[RegExp, string]> = [
  [/\bmathematics\b|\bmath\b|\bcalculus\b|\balgebra\b|\bstatistics\b/i, "mathematics"],
  [/\bphysics\b/i, "physics"],
  [/\bchemistry\b/i, "chemistry"],
  [/\bbiology\b/i, "biology"],
  [/\bcomputer science\b/i, "computer-science"],
  [/\bprogramming\b|\bcoding\b|\bsoftware engineering\b/i, "programming"],
  [/\binformation technology\b/i, "information-technology"],
  [/\bengineering\b/i, "engineering"],
  [/\belectronics\b/i, "electronics"],
  [/\bnetworking\b|\bnetworks?\b/i, "networking"],
  [/\bautomotive\b/i, "automotive"],
  [/\baccounting\b|\bfinance\b/i, "accounting"],
  [/\beconomics?\b/i, "economics"],
  [/\bbusiness\b/i, "business"],
  [/\bhistory\b/i, "history"],
  [/\bgeography\b/i, "geography"],
  [/\blanguages?\b/i, "languages"],
  [/\bliterature\b/i, "literature"],
  [/\barts?\b/i, "arts"],
  [/\bdesign\b/i, "design"],
  [/\bhealth\b|\bnursing\b/i, "health"],
  [/\bagriculture\b/i, "agriculture"],
  [/\bhospitality\b/i, "hospitality"],
  [/\bmanufacturing\b/i, "manufacturing"],
];

// ---------------------------------------------------------------------------
// Step 5: intent markers.
//
// EDU_HINT deliberately excludes the bare word "learning": it is dominated by
// academic compound terms ("machine learning", "deep learning", "learning to
// rank"). Education intent needs an explicit artifact word (textbook, lesson,
// curriculum...) or the standalone word "education".
// ---------------------------------------------------------------------------

const EDU_HINT =
  /\b(textbook|textbooks|buku pelajaran|buku|lesson|lessons|kurikulum|curriculum|worksheet|soal latihan|exercise|exercises|quiz|silabus|syllabus|modul|module|course|kelas|grade|pelajaran|belajar|education|materi|study guide|latihan)\b/i;

/** Strong academic signals that suppress pure-education classification. */
const ACADEMIC_HINT =
  /\b(research|penelitian|paper|papers|journal|jurnal|systematic review|literature review|preprint|citation|thesis|disertasi|skripsi|proceedings|h-index|study on|effect of|analysis of|meta-analysis)\b/i;

export function classifyQuery(rawQuery: string): QueryClassification {
  const q = rawQuery.trim();
  const lower = q.toLowerCase();

  // 1. Language detection: explicit Indonesian markers win.
  const hasIdMarker =
    /\b(kelas|matematika|fisika|kimia|biologi|informatika|sejarah|geografi|belajar|pelajaran|buku|soal|kurikulum|sd|smp|sma|smk|kuliah)\b/i.test(
      lower
    );
  const lang: "en" | "id" = hasIdMarker ? "id" : "en";

  // 2. Explicit named levels.
  const levels: EducationLevel[] = [];
  for (const [re, lvl] of [...ID_LEVEL_WORDS, ...EN_LEVEL_WORDS]) {
    if (re.test(lower) && !levels.includes(lvl)) levels.push(lvl);
  }

  // 3. Grade -> derived levels. Named levels take precedence; grade-derived
  //    levels are added only when no named level already matched, so
  //    "grade 8" maps to exactly one level and "high school grade 12" keeps
  //    the explicit one.
  const grade = extractGrade(q);
  if (levels.length === 0) {
    for (const lvl of gradeToLevels(grade)) {
      if (!levels.includes(lvl)) levels.push(lvl);
    }
  }

  // 4. Subjects.
  const subjects: string[] = [];
  for (const [re, subj] of [...ID_SUBJECTS, ...EN_SUBJECTS]) {
    if (re.test(lower) && !subjects.includes(subj)) subjects.push(subj);
  }

  // 5. Domain/intent with conflict resolution.
  const eduHint = EDU_HINT.test(lower);
  const academicHint = ACADEMIC_HINT.test(lower);

  let domain: QueryClassification["domain"];
  if (academicHint && (eduHint || levels.length > 0)) domain = "both";
  else if (academicHint) domain = "academic"; // research wins over subject-only
  else if (levels.length > 0 || eduHint || subjects.length > 0) domain = "education";
  else domain = "academic"; // no education signal at all

  // 6. Topic terms: strip education markers to leave the topical residue.
  let topicTerms = q
    .replace(/(kelas|grade)\s*\d{1,2}/gi, "")
    .replace(/\b(sd|smp|sma|smk|sltp|smu|rpl)\b/gi, "")
    .replace(
      /\b(elementary|middle school|junior high|high school|senior high|secondary school|primary school|vocational|university|college|undergraduate|graduate|professional|adult learning|training|sekolah dasar|sekolah menengah kejuruan|kuliah|universitas)\b/gi,
      ""
    )
    .replace(
      /\b(textbook|textbooks|lesson|lessons|course|module|modul|worksheet|quiz|exercise|exercises|syllabus|silabus|curriculum|kurikulum|buku pelajaran|buku|soal latihan|soal|materi|belajar|pelajaran|learning|teaching|education|for|untuk|dan|and|the|a|an|of|di|in)\b/gi,
      ""
    )
    .split(/[\s,]+/)
    .filter(Boolean);

  // If nothing left after stripping, keep the original query as topic.
  if (topicTerms.length === 0) topicTerms = q.split(/\s+/).filter(Boolean);

  return { domain, levels, grade, subjects, topicTerms, lang };
}
