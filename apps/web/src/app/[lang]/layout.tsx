import { notFound } from 'next/navigation';
import { isLang, LANGS } from '@/lib/i18n';

/**
 * 语种段布局。三个作用：
 * 1) 边界锚点：Next 的 not-found.tsx / error.tsx 需要所在段存在 layout 才会作为嵌套边界生效，
 *    否则 /[lang]/** 内部抛出的 notFound() 会一路冒泡到根 404（丢失语种上下文，只能显示英文）。
 * 2) 非法语种拦截：/xx/... 直接 404，而不是渲染出一个回退英文的"半可用"页面。
 * 3) RTL：阿拉伯语等从右向左书写的语种在此统一翻转文字方向。
 *
 * 注：边界组件（not-found/error）的语种不再经 Context 下传（Context 不会到达边界子树），
 * 改由 src/middleware.ts 注入 x-lang 请求头、服务端 boundaries 直接读取。
 */
const RTL_LANGS = new Set(['ar']);

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export default async function LangLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();

  return <div dir={RTL_LANGS.has(lang) ? 'rtl' : 'ltr'}>{children}</div>;
}
