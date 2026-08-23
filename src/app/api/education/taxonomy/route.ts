import { NextResponse } from "next/server";
import { cached } from "@/lib/db";
import { EDUCATION_LEVELS, LEVEL_LABELS, EDUCATION_SUBJECTS, SUBJECT_LABELS } from "@/lib/education/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/education/taxonomy - canonical levels + subjects with localized
 * labels (en/id). Extendable vocabularies; UI renders from this.
 */
export async function GET() {
  const data = await cached("cf:edu-taxonomy:v1", 86400, async () => ({
    levels: EDUCATION_LEVELS.map((l) => ({ slug: l, label: LEVEL_LABELS[l] })),
    subjects: EDUCATION_SUBJECTS.map((s) => ({ slug: s, label: SUBJECT_LABELS[s] })),
  }));
  return NextResponse.json(data);
}
