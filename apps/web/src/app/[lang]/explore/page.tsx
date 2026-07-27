import type { Metadata } from 'next';
import Link from 'next/link';
import { getPersons } from '@/lib/api';
import { LANGS, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { type Person } from '@gph/types';
import ExploreExplorer from '@/components/ExploreExplorer';

// —— SEO：探索页多语种 hreflang + canonical ——
export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[l] = `/${l}/explore`;
  return {
    title: t(lang as Lang, 'explore.title'),
    description: t(lang as Lang, 'persons.desc'),
    alternates: { canonical: `/${lang}/explore`, languages }
  };
}

export default async function ExplorePage({
  params,
  searchParams
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ domain?: string; era?: string; nationality?: string; sort?: string }>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const L = lang as Lang;

  let items: Person[] = [];
  try {
    const d = await getPersons({ lang, pageSize: 300 });
    items = d.items as Person[];
  } catch {
    /* API 不可达时静默降级 */
  }

  const sort = sp.sort === 'netWorth' || sp.sort === 'name' ? sp.sort : 'influence';

  return (
    <div>
      <nav className="text-sm text-slate-500 mb-4">
        <Link href={`/${lang}`} className="hover:underline">
          {t(L, 'nav.home')}
        </Link>
        <span className="mx-1">/</span>
        <span>{t(L, 'nav.explore')}</span>
      </nav>
      <h1 className="text-2xl font-bold">{t(L, 'explore.title')}</h1>
      <p className="text-slate-500 mt-1 mb-6 text-sm">{t(L, 'persons.desc')}</p>

      <ExploreExplorer
        items={items}
        lang={L}
        initialDomain={sp.domain || 'all'}
        initialEra={sp.era || 'all'}
        initialNationality={sp.nationality || 'all'}
        initialSort={sort}
      />
    </div>
  );
}
