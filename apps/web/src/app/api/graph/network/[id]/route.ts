import { NextRequest, NextResponse } from 'next/server';
import { getNetwork } from '@/lib/server/data';
import { cachedJson } from '@/lib/server/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const depth = req.nextUrl.searchParams.get('depth')
    ? Number(req.nextUrl.searchParams.get('depth'))
    : 2;
  const net = await getNetwork(id, depth);
  if (!net) return NextResponse.json({ error: 'not_found', message: '人物不存在' }, { status: 404 });
  return cachedJson(net, 600);
}
