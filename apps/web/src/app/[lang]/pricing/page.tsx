import type { Metadata } from 'next';
import { LANGS, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import PricingClient from './PricingClient';

// —— SEO：定价页多语种 hreflang + 规范链接（服务端壳，交互逻辑在 PricingClient）——
export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[l] = `/${l}/pricing`;
  return {
    title: t(lang as Lang, 'pricing.title'),
    description: t(lang as Lang, 'pricing.subtitle'),
    alternates: { canonical: `/${lang}/pricing`, languages }
  };
}

export default async function PricingPage({
  params
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return <PricingClient lang={lang} />;
}
