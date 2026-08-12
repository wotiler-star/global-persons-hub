import type { Metadata } from 'next';
import AskClient from '@/components/AskClient';
import { LANGS, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';

// —— SEO：AI 问答页多语种 hreflang + 规范链接 ——
export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[l] = `/${l}/ask`;
  languages['x-default'] = `/en/ask`;
  return {
    title: t(lang as Lang, 'ask.title'),
    description: t(lang as Lang, 'ask.subtitle'),
    alternates: { canonical: `/${lang}/ask`, languages }
  };
}

export default async function AskPage({
  params,
  searchParams
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  return <AskClient lang={lang as Lang} initial={sp.q || ''} />;
}
