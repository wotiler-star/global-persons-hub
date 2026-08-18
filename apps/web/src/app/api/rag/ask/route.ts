import { NextRequest, NextResponse } from 'next/server';
import type { Lang } from '@gph/types';
import { askRag } from '@/lib/server/rag';
import { cachedJson } from '@/lib/server/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q') || '';
  if (!q) return NextResponse.json({ error: 'bad_request', message: '缺少 q 参数' }, { status: 400 });
  const lang = (sp.get('lang') as Lang) || 'zh';
  const limit = sp.get('limit') ? Number(sp.get('limit')) : 5;
  return cachedJson(await askRag(q, lang, limit), 300);
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* 忽略空 body */
  }
  const q = body.query || '';
  if (!q) return NextResponse.json({ error: 'bad_request', message: 'query 不能为空' }, { status: 400 });
  const lang = (body.lang as Lang) || 'zh';
  const limit = body.limit ? Number(body.limit) : 5;
  return cachedJson(await askRag(q, lang, limit), 300);
}
