import { NextResponse } from 'next/server';
import { cachedJson } from '@/lib/server/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return cachedJson({ ok: true, time: new Date().toISOString() }, 30);
}
