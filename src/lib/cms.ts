import { getPool } from "@/lib/db";
import type { Locale } from "@/lib/i18n";
export async function getCms<T>(key:string,locale:Locale="id",fallbackLocale:Locale="en"):Promise<T>{
  const {rows}=await getPool().query(`SELECT payload FROM cms_content WHERE active AND content_key=$1 AND locale IN ($2,'*',$3) ORDER BY CASE WHEN locale=$2 THEN 0 WHEN locale=$3 THEN 1 ELSE 2 END LIMIT 1`,[key,locale,fallbackLocale]);
  if(!rows[0]) throw new Error(`CMS content not found: ${key}`);
  return rows[0].payload as T;
}
