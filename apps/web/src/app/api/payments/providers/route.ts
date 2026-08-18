import { NextResponse } from 'next/server';
import { cachedJson } from '@/lib/server/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 只读部署：无真实支付。返回静态渠道清单，供定价页正常渲染。
export function GET() {
  const names = ['stripe', 'wechat', 'alipay', 'mock'] as const;
  return cachedJson(
    {
      default: 'mock',
      providers: names.map((n) => ({ name: n, configured: n === 'mock' }))
    },
    3600
  );
}
