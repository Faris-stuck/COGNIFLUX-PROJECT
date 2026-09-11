import { getPool } from "@/lib/db";
import { getCms } from "@/lib/cms";
export type NavItem={href:string;label_key:string;sort_order:number};
export async function getNavigation():Promise<NavItem[]>{const {rows}=await getPool().query(`SELECT href,label_key,sort_order FROM site_navigation WHERE active ORDER BY sort_order,id`);return rows;}
export async function getHomeSuggestions<T=unknown>():Promise<T>{return getCms<T>("home.suggestions");}
export async function getHomeTopics<T=unknown>():Promise<T>{return getCms<T>("home.topics");}
