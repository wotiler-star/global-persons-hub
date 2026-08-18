import { NextRequest, NextResponse } from 'next/server';
import { getPerson } from '@/lib/server/data';
import { cachedJson } from '@/lib/server/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPerson(slug);
  if (!p) return NextResponse.json({ error: 'not_found', message: '人物不存在' }, { status: 404 });
  return cachedJson(p, 600);
}
