import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: 'read_only', message: '托管只读版暂未启用账户系统，敬请期待' },
    { status: 503 }
  );
}
