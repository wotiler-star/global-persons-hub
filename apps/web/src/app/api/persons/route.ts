import { NextRequest, NextResponse } from 'next/server';
import { getPersons } from '@/lib/server/data';
import { cachedJson } from '@/lib/server/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q') || undefined;
  const domain = sp.get('domain') || undefined;
  const lang = sp.get('lang') || undefined;
  const page = sp.get('page') ? Number(sp.get('page')) : undefined;
  const pageSize = sp.get('pageSize') ? Number(sp.get('pageSize')) : undefined;
  return cachedJson(await getPersons({ q, domain, lang, page, pageSize }), 300);
}
