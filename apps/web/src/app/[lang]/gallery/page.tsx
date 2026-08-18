import type { Metadata } from 'next';
import Link from 'next/link';
import { getPersons } from '@/lib/server/data';
import { LANGS, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { type Person } from '@gph/types';
import GalleryExplorer from '@/components/GalleryExplorer';
import { projectPersons } from '@/lib/personProjection';

// —— SEO：画廊页多语种 hreflang + canonical ——
export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[l] = `/${l}/gallery`;
  languages['x-default'] = `/en/gallery`;
  return {
    title: t(lang as Lang, 'gallery.title'),
    description: t(lang as Lang, 'gallery.subtitle'),
    alternates: { canonical: `/${lang}/gallery`, languages }
  };
}

export default async function GalleryPage({
  params,
  searchParams
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ domain?: string; era?: string; sort?: string }>;
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

  const sort = sp.sort === 'name' ? 'name' : 'influence';

  return (
    <div>
      <nav className="text-sm text-slate-500 mb-4">
        <Link href={`/${lang}`} className="hover:underline">
          {t(L, 'nav.home')}
        </Link>
        <span className="mx-1">/</span>
        <span>{t(L, 'nav.gallery')}</span>
      </nav>
      <h1 className="text-2xl font-bold">{t(L, 'gallery.title')}</h1>
      <p className="text-slate-500 mt-1 mb-6 text-sm">{t(L, 'gallery.subtitle')}</p>

      <GalleryExplorer
        items={projectPersons(items, L)}
        lang={L}
        initialDomain={sp.domain || 'all'}
        initialEra={sp.era || 'all'}
        initialSort={sort}
      />
    </div>
  );
}
