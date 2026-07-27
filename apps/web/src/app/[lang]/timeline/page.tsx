import type { Metadata } from 'next';
import Link from 'next/link';
import { getPersons } from '@/lib/api';
import { LANGS, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { type Person } from '@gph/types';
import TimelineExplorer from '@/components/TimelineExplorer';

// —— Stage 34 SSG/ISR：13 语时间轴构建期预渲染，5 分钟增量再生 ——
export const revalidate = 300;
export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

// —— SEO：时间轴多语种 hreflang + canonical ——
export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[l] = `/${l}/timeline`;
  return {
    title: t(lang as Lang, 'timeline.title'),
    description: t(lang as Lang, 'timeline.desc'),
    alternates: { canonical: `/${lang}/timeline`, languages }
  };
}

export default async function TimelinePage({
  params
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const L = lang as Lang;

  let items: Person[] = [];
  try {
    const d = await getPersons({ lang, pageSize: 200 });
    items = d.items as Person[];
  } catch {
    /* API 不可达时静默降级 */
  }

  return (
    <div>
      <nav className="text-sm text-slate-500 mb-4">
        <Link href={`/${lang}`} className="hover:underline">{t(L, 'nav.home')}</Link>
        <span className="mx-1">/</span>
        <span>{t(L, 'nav.timeline')}</span>
      </nav>
      <h1 className="text-2xl font-bold">{t(L, 'timeline.title')}</h1>
      <p className="text-slate-500 mt-1 mb-6 text-sm">{t(L, 'timeline.desc')}</p>

      <TimelineExplorer items={items} lang={L} />
    </div>
  );
}
