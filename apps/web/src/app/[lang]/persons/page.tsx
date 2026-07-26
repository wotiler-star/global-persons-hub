import type { Metadata } from 'next';
import Link from 'next/link';
import { getPersons } from '@/lib/api';
import { LANGS, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { buildPersonItemList } from '@/lib/format';
import { DOMAIN_LABELS, type Domain, type Person } from '@gph/types';
import PersonsExplorer, { type DomainFilter, type SortMode } from '@/components/PersonsExplorer';
import JsonLd from '@/components/JsonLd';

// —— SEO：人物库多语种 hreflang + canonical ——
export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[l] = `/${l}/persons`;
  return {
    title: t(lang as Lang, 'persons.title'),
    description: t(lang as Lang, 'persons.desc'),
    alternates: { canonical: `/${lang}/persons`, languages }
  };
}

const SORT_KEYS: SortMode[] = ['influence', 'netWorth', 'name'];

export default async function PersonsPage({
  params,
  searchParams
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ domain?: string; sort?: string }>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const L = lang as Lang;

  // 深链接：校验 searchParams 中的 domain/sort，非法值回退默认
  const initialDomain: DomainFilter =
    sp.domain && (sp.domain === 'all' || sp.domain in DOMAIN_LABELS)
      ? (sp.domain as DomainFilter)
      : 'all';
  const initialSort: SortMode = sp.sort && SORT_KEYS.includes(sp.sort as SortMode) ? (sp.sort as SortMode) : 'influence';

  let items: Person[] = [];
  try {
    const d = await getPersons({ lang, pageSize: 200 });
    items = d.items as Person[];
  } catch {
    /* API 不可达时静默降级 */
  }

  // —— SEO / GEO：ItemList 结构化数据（人物库可被搜索引擎/AI 理解） ——
  const jsonLd = buildPersonItemList(items, L, t(L, 'persons.title'), 30);

  return (
    <div>
      <JsonLd data={jsonLd} />
      <nav className="text-sm text-slate-500 mb-4">
        <Link href={`/${lang}`} className="hover:underline">{t(L, 'nav.home')}</Link>
        <span className="mx-1">/</span>
        <span>{t(L, 'persons.title')}</span>
      </nav>
      <h1 className="text-2xl font-bold">{t(L, 'persons.title')}</h1>
      <p className="text-slate-500 mt-1 mb-6 text-sm">{t(L, 'persons.desc')}</p>

      <PersonsExplorer items={items} lang={L} initialDomain={initialDomain} initialSort={initialSort} />
    </div>
  );
}
