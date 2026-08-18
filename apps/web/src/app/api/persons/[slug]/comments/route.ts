import { NextRequest, NextResponse } from 'next/server';
import { cachedJson } from '@/lib/server/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 只读部署：评论不持久化，GET 返回空列表；POST 需登录（托管只读版未启用账户系统）。
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  await params;
  return cachedJson({ items: [] }, 60);
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  await params;
  return NextResponse.json(
    { error: 'read_only', message: '托管只读版暂未启用评论写入' },
    { status: 503 }
  );
}
