import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

type L={id?:string;en?:string}; const loc=(v:unknown)=>v&&typeof v==='object'?v as L:{};
export async function listPracticeQuestions(subjectSlug:string,programSlug:string,limit=10){
 const {rows}=await getPool().query(`SELECT q.id,q.question_type AS "questionType",q.prompt,q.difficulty,q.points,q.competency_id AS "competencyId",c.slug AS "competencySlug",c.title AS "competencyTitle",json_agg(json_build_object('id',o.id,'key',o.option_key,'label',o.label) ORDER BY o.sort_order,o.id) options FROM prep_questions q JOIN prep_competencies c ON c.id=q.competency_id JOIN prep_subjects s ON s.id=c.subject_id JOIN prep_programs p ON p.id=s.program_id JOIN prep_question_options o ON o.question_id=q.id WHERE q.active AND c.active AND s.active AND p.active AND p.slug=$1 AND s.slug=$2 GROUP BY q.id,c.slug,c.title ORDER BY random() LIMIT $3`,[programSlug,subjectSlug,limit]);
 return rows.map(r=>({...r,prompt:loc(r.prompt),competencyTitle:loc(r.competencyTitle),options:(r.options??[]).map((o:any)=>({...o,label:loc(o.label)}))}));
}
export async function createAttempt(programSlug:string,subjectSlug:string,questionIds:number[],mode='practice',durationLimitSeconds?:number){
 const user=await getSessionUser();
 const {rows:p}=await getPool().query(`SELECT p.id program_id,s.id subject_id FROM prep_programs p JOIN prep_subjects s ON s.program_id=p.id WHERE p.slug=$1 AND s.slug=$2`,[programSlug,subjectSlug]);
 if(!p[0]) throw new Error('invalid_scope');
 const uniqueIds=[...new Set(questionIds.map(Number).filter(Number.isInteger))];
 if(!uniqueIds.length || uniqueIds.length>50) throw new Error('invalid_questions');
 const {rows:valid}=await getPool().query(`SELECT q.id,q.points FROM prep_questions q JOIN prep_competencies c ON c.id=q.competency_id JOIN prep_subjects s ON s.id=c.subject_id WHERE q.active AND s.id=$1 AND q.id=ANY($2::bigint[])`,[p[0].subject_id,uniqueIds]);
 if(valid.length!==uniqueIds.length) throw new Error('invalid_question_scope');
 const maxScore=valid.reduce((sum,r)=>sum+Number(r.points||0),0);
 const id=randomUUID();
 await getPool().query(`INSERT INTO prep_attempts(id,user_id,program_id,subject_id,mode,max_score,duration_limit_seconds) VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,user?.id??null,p[0].program_id,p[0].subject_id,mode,maxScore,mode==='tryout'&&Number.isFinite(durationLimitSeconds)?Math.max(1,Math.floor(durationLimitSeconds!)):null]);
 await getPool().query(`INSERT INTO prep_attempt_questions(attempt_id,question_id) SELECT $1,id FROM prep_questions WHERE id=ANY($2::bigint[])`,[id,uniqueIds]);
 return id;
}
export async function submitAttempt(id:string,answers:Record<string,number>){
 const client=await getPool().connect(); try{
  await client.query('BEGIN');
  const {rows:a}=await client.query(`SELECT id,max_score,started_at,mode,duration_limit_seconds FROM prep_attempts WHERE id=$1 AND status='started' FOR UPDATE`,[id]);
  if(!a[0]) throw new Error('attempt_not_found');
  const duration=Math.max(0,Math.round((Date.now()-new Date(a[0].started_at).getTime())/1000));
  const limit=a[0].duration_limit_seconds==null?null:Number(a[0].duration_limit_seconds);
  const timedOut=limit!=null&&duration>limit;
  const {rows:questions}=await client.query(`SELECT aq.question_id,q.points FROM prep_attempt_questions aq JOIN prep_questions q ON q.id=aq.question_id WHERE aq.attempt_id=$1 ORDER BY aq.question_id`,[id]);
  let score=0;
  for(const q of questions){
    const chosen=answers[String(q.question_id)];
    if(chosen==null){ await client.query(`UPDATE prep_attempt_questions SET answer_option_id=NULL,is_correct=false,points_awarded=0 WHERE attempt_id=$1 AND question_id=$2`,[id,q.question_id]); continue; }
    const option=await client.query(`SELECT id,is_correct FROM prep_question_options WHERE id=$1 AND question_id=$2`,[chosen,q.question_id]);
    if(!option.rows[0]) throw new Error('invalid_answer_option');
    const correct=!timedOut&&option.rows[0].is_correct===true;
    const pts=correct?Number(q.points):0; score+=pts;
    await client.query(`UPDATE prep_attempt_questions SET answer_option_id=$1,is_correct=$2,points_awarded=$3 WHERE attempt_id=$4 AND question_id=$5`,[chosen,correct,pts,id,q.question_id]);
  }
  const max=Number(a[0].max_score??0);
  await client.query(`UPDATE prep_attempts SET status='submitted',submitted_at=now(),score=$1,duration_seconds=$2 WHERE id=$3`,[score,duration,id]);
  await client.query('COMMIT');
  return {score,maxScore:max,percent:max?Math.round((score/max)*10000)/100:0,duration,timedOut};
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
export async function getAttempt(id:string){const user=await getSessionUser(); const {rows}=await getPool().query(`SELECT a.id,a.mode,a.status,a.score,a.max_score AS "maxScore",a.duration_seconds AS "duration",a.started_at AS "startedAt",a.submitted_at AS "submittedAt",p.slug program,s.slug subject FROM prep_attempts a LEFT JOIN prep_programs p ON p.id=a.program_id LEFT JOIN prep_subjects s ON s.id=a.subject_id WHERE a.id=$1 AND (a.user_id=$2 OR a.user_id IS NULL)`,[id,user?.id??null]); const r=rows[0]; if(!r) return null; return {...r,score:Number(r.score),maxScore:Number(r.maxScore),duration:Number(r.duration)};}
export async function getRecommendations(){const user=await getSessionUser(); if(!user) return {authenticated:false,recommendations:[]}; const {rows}=await getPool().query(`SELECT c.slug,c.title,ROUND(100*AVG(CASE WHEN aq.is_correct THEN 1 ELSE 0 END),1) accuracy,COUNT(*) answered FROM prep_attempt_questions aq JOIN prep_attempts a ON a.id=aq.attempt_id JOIN prep_questions q ON q.id=aq.question_id JOIN prep_competencies c ON c.id=q.competency_id WHERE a.user_id=$1 AND a.status='submitted' GROUP BY c.slug,c.title ORDER BY accuracy ASC,answered DESC LIMIT 8`,[user.id]); return {authenticated:true,recommendations:rows.map(r=>({...r,title:loc(r.title)}))};}
