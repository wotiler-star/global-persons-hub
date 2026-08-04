import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isLang, type Lang } from '@/lib/i18n';

/**
 * 语种嗅探中间件。
 *
 * 问题背景：Next 的 not-found.tsx / error.tsx 边界组件拿不到 params，
 * 且布局里注入的 React Context（LangProvider）不会下传到边界子树、
 * usePathname() 在边界渲染阶段又返回空串 —— 三者叠加导致边界只能回退英文。
 *
 * 解法：中间件在每个请求上解析路径首段语种，写入请求头 x-lang；
 * 边界（服务端组件）用 headers().get('x-lang') 取回，SSR/ISR 都能拿到正确语种。
 * 该头仅在同一请求内可见（不写回浏览器、不落盘），无安全面。
 */
export function middleware(req: NextRequest) {
  const seg = req.nextUrl.pathname.split('/').filter(Boolean)[0];
  const lang: Lang = isLang(seg) ? seg : 'en';

  const headers = new Headers(req.headers);
  headers.set('x-lang', lang);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  // 排除静态资源与文件型路由，减少无谓开销；其余（含 /[lang]/* 与根路由）均拦截
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|feed.xml|llms.txt|llms-full.txt|opengraph-image|icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js)$).*)'
  ]
};
