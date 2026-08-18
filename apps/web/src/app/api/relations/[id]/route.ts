import { NextRequest, NextResponse } from 'next/server';
import { getRelations } from '@/lib/server/data';
import { cachedJson } from '@/lib/server/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getRelations(id);
  if (!r) return NextResponse.json({ error: 'not_found', message: '人物不存在' }, { status: 404 });
  return cachedJson(r, 600);
}
