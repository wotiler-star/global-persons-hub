import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { isLang, htmlLang, LANGS, type Lang } from '@/lib/i18n';

// —— SEO：每个语言版本独立渲染正确的 <html lang>（BCP-47）+ 书写方向 ——
// 根布局（app/layout.tsx）仅作透传，<html>/<body> 由此处按语种输出，
// 使 Google/Bing 能正确判定各 /[lang]/* 页面的语言，配合 hreflang 交替避免重复内容。
export const dynamicParams = true;

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export default async function LangLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const { lang: hl, dir } = htmlLang(lang as Lang);
  return (
    <html lang={hl} dir={dir}>
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <NavBar />
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
