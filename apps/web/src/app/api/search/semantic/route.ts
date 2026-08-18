import { NextRequest, NextResponse } from 'next/server';
import type { Lang } from '@gph/types';
import { semanticSearch } from '@/lib/server/data';
import { cachedJson } from '@/lib/server/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q') || '';
  const limit = sp.get('limit') ? Number(sp.get('limit')) : 6;
  const lang = (sp.get('lang') as Lang) || 'zh';
  return cachedJson(await semanticSearch(q, lang, limit), 300);
}
