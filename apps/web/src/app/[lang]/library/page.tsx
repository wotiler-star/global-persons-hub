import type { Metadata } from 'next';
import { getPersons } from '@/lib/server/data';
import { LANGS, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { OG_LOCALE, SITE_NAME } from '@/lib/og';
import type { Person } from '@gph/types';
import PersonLibraryClient from '@/components/PersonLibraryClient';

// —— SEO / GEO：多语种 hreflang 交替链接 + 规范链接 ——
export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const L = lang as Lang;
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[l] = `/${l}/library`;
  languages['x-default'] = `/en/library`;
  const title = t(L, 'library.title');
  return {
    title,
    alternates: { canonical: `/${lang}/library`, languages },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title,
      url: `/${lang}/library`,
      locale: OG_LOCALE[L] || 'en_US'
    }
  };
}

export default async function LibraryPage({
  params,
  searchParams
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { lang } = await params;
  const L = lang as Lang;
  const sp = await searchParams;
  const idsRaw = typeof sp.ids === 'string' ? sp.ids : Array.isArray(sp.ids) ? sp.ids[0] : '';
  const ids = (idsRaw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let sharedPersons: Person[] | undefined;
  if (ids.length) {
    const all = await getPersons({ lang: L, pageSize: 300 }).catch(() => ({
      items: [] as Person[]
    }));
    const map = new Map(all.items.map((p) => [p.slug, p]));
    sharedPersons = ids.map((id) => map.get(id)).filter((p): p is Person => Boolean(p));
  }

  return <PersonLibraryClient lang={L} sharedPersons={sharedPersons} />;
}
