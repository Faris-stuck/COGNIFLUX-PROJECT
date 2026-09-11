import { getPool } from "@/lib/db";

export type Localized = { id?: string; en?: string };
export type PrepProgram = { id:number; slug:string; title:Localized; description:Localized; educationLevel:string|null; officialUrl:string|null; sourceName:string|null; sortOrder:number };
export type PrepSubject = { id:number; programId:number; slug:string; title:Localized; description:Localized; sourceUrl:string|null; sortOrder:number };
export type PrepCompetency = { id:number; subjectId:number; slug:string; title:Localized; description:Localized; sourceUrl:string|null; sortOrder:number };
export type PrepMaterial = { id:number; title:Localized; url:string; resourceType:string; searchQuery:string|null; sourceName:string|null };

const json = (v: unknown): Localized => (v && typeof v === "object" ? v as Localized : {});

export async function listPrepPrograms(): Promise<PrepProgram[]> {
  const { rows } = await getPool().query(`SELECT p.id,p.slug,p.title,p.description,p.education_level AS "educationLevel",p.official_url AS "officialUrl",s.name AS "sourceName",p.sort_order AS "sortOrder" FROM prep_programs p LEFT JOIN prep_sources s ON s.id=p.source_id WHERE p.active ORDER BY p.sort_order,p.id`);
  return rows.map(r=>({...r,title:json(r.title),description:json(r.description)}));
}

export async function getPrepProgram(slug:string): Promise<PrepProgram|null> {
  const { rows } = await getPool().query(`SELECT p.id,p.slug,p.title,p.description,p.education_level AS "educationLevel",p.official_url AS "officialUrl",s.name AS "sourceName",p.sort_order AS "sortOrder" FROM prep_programs p LEFT JOIN prep_sources s ON s.id=p.source_id WHERE p.active AND p.slug=$1`,[slug]);
  const r=rows[0]; return r ? {...r,title:json(r.title),description:json(r.description)} : null;
}

export async function listPrepSubjects(programId:number): Promise<PrepSubject[]> {
  const { rows } = await getPool().query(`SELECT id,program_id AS "programId",slug,title,description,source_url AS "sourceUrl",sort_order AS "sortOrder" FROM prep_subjects WHERE active AND program_id=$1 ORDER BY sort_order,id`,[programId]);
  return rows.map(r=>({...r,title:json(r.title),description:json(r.description)}));
}

export async function getPrepSubject(programSlug:string, subjectSlug:string): Promise<{program:PrepProgram;subject:PrepSubject}|null> {
  const program=await getPrepProgram(programSlug); if(!program) return null;
  const { rows }=await getPool().query(`SELECT id,program_id AS "programId",slug,title,description,source_url AS "sourceUrl",sort_order AS "sortOrder" FROM prep_subjects WHERE active AND program_id=$1 AND slug=$2`,[program.id,subjectSlug]);
  const r=rows[0]; return r ? {program,subject:{...r,title:json(r.title),description:json(r.description)}} : null;
}

export async function listPrepCompetencies(subjectId:number): Promise<PrepCompetency[]> {
  const { rows }=await getPool().query(`SELECT id,subject_id AS "subjectId",slug,title,description,source_url AS "sourceUrl",sort_order AS "sortOrder" FROM prep_competencies WHERE active AND subject_id=$1 ORDER BY sort_order,id`,[subjectId]);
  return rows.map(r=>({...r,title:json(r.title),description:json(r.description)}));
}

export async function listPrepMaterials(competencyId:number): Promise<PrepMaterial[]> {
  const { rows }=await getPool().query(`SELECT m.id,m.title,m.url,m.resource_type AS "resourceType",m.search_query AS "searchQuery",s.name AS "sourceName" FROM prep_material_links m LEFT JOIN prep_sources s ON s.id=m.source_id WHERE m.active AND m.competency_id=$1 ORDER BY m.sort_order,m.id`,[competencyId]);
  return rows.map(r=>({...r,title:json(r.title)}));
}
