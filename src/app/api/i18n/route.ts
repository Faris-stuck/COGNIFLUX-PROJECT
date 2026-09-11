import { NextRequest, NextResponse } from "next/server";
import { getCms } from "@/lib/cms";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){const locale=req.nextUrl.searchParams.get("locale")==="en"?"en":"id";return NextResponse.json({locale,dictionary:await getCms("i18n",locale)});}
