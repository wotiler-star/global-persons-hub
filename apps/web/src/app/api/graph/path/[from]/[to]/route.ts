import { NextRequest, NextResponse } from 'next/server';
import { getPath } from '@/lib/server/data';
import { cachedJson } from '@/lib/server/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ from: string; to: string }> }) {
  const { from, to } = await params;
  const net = await getPath(from, to);
  if (!net) return NextResponse.json({ error: 'not_found', message: '人物不存在' }, { status: 404 });
  return cachedJson(net, 600);
}
