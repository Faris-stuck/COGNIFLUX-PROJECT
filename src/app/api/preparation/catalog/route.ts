import { NextResponse } from "next/server";
import { listPrepPrograms, listPrepSubjects } from "@/lib/prep-catalog";
export const dynamic="force-dynamic";
export async function GET(){
  const programs=await listPrepPrograms();
  const subjects=Object.fromEntries(await Promise.all(programs.map(async p=>[p.slug,await listPrepSubjects(p.id)])));
  return NextResponse.json({programs,subjects});
}
