import { NextRequest, NextResponse } from 'next/server';
import { searchPersons } from '@/lib/server/data';
import { cachedJson } from '@/lib/server/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';
  return cachedJson(await searchPersons(q), 120);
}
