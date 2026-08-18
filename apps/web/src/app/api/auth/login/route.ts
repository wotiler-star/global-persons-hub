import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 只读部署：不持久化用户，账户系统未启用。返回 503 以便前端友好提示。
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: 'read_only', message: '托管只读版暂未启用账户系统，敬请期待' },
    { status: 503 }
  );
}
