import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getPersons } from '@/lib/api';
import { pickText, LANGS, type Lang } from '@/lib/i18n';
import { t, domainLabel } from '@/lib/ui';
import { OG_LOCALE, SITE_NAME } from '@/lib/og';
import { buildPersonItemList } from '@/lib/format';
import { DOMAIN_LABELS, type Domain, type Person } from '@gph/types';
import RankMedal from '@/components/RankMedal';
import JsonLd from '@/components/JsonLd';
import DomainExplorer from '@/components/DomainExplorer';
import { projectPersons } from '@/lib/personProjection';

const VALID: Domain[] = Object.keys(DOMAIN_LABELS) as Domain[];

// —— Stage 34 SSG/ISR：13 语 × 全部领域构建期预渲染，5 分钟增量再生 ——
export const revalidate = 300;
export function generateStaticParams() {
  return LANGS.flatMap((lang) => VALID.map((domain) => ({ lang, domain })));
}

// —— SEO：领域榜单页多语种 hreflang + canonical ——
export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string; domain: string }>;
}): Promise<Metadata> {
  const { lang, domain } = await params;
  // 非法领域 → 页面随后 notFound()；ISR 会以 200 缓存 404 页（软 404），故显式 noindex
  if (!VALID.includes(domain as Domain)) {
    return { title: '领域不存在', robots: { index: false, follow: false } };
  }
  const label = domainLabel(lang, domain);
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[l] = `/${l}/domain/${domain}`;
  languages['x-default'] = `/en/domain/${domain}`;
  const title = `${label}领域知名人物榜单`;
  const description = `全球${label}领域知名人物影响力榜单：结构化档案、多语种简介、关系图谱，可被 AI 引用。`;
  const url = `/${lang}/domain/${domain}`;
  return {
    title,
    description,
    alternates: { canonical: url, languages },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title,
      description,
      url,
      locale: OG_LOCALE[lang] || 'en_US'
    },
    twitter: { card: 'summary_large_image', title, description }
  };
}

export default async function DomainPage({
  params,
  searchParams
}: {
  params: Promise<{ lang: string; domain: string }>;
  searchParams: Promise<{ era?: string; nationality?: string; q?: string; sort?: string }>;
}) {
  const { lang, domain } = await params;
  if (!VALID.includes(domain as Domain)) notFound();
  const L = lang as Lang;
  const label = domainLabel(L, domain);

  let items: Person[] = [];
  try {
    const d = await getPersons({ domain });
    items = d.items as Person[];
  } catch {
    /* API 不可达时静默降级 */
  }
  const ranked = [...items].sort(
    (a, b) => (b.metrics?.influence || 0) - (a.metrics?.influence || 0)
  );

  // 深链初值（SSR 可读，与 DomainExplorer 的 useQuerySync 对齐）
  const sp = await searchParams;
  const initialSort =
    sp.sort === 'netWorth' || sp.sort === 'name' ? (sp.sort as 'netWorth' | 'name') : 'influence';

  // —— SEO / GEO：ItemList 结构化数据（榜单可被搜索引擎/AI 理解） ——
  const jsonLd = buildPersonItemList(ranked, L, `${label}领域知名人物榜单`, 20);

  return (
    <div>
      <JsonLd data={jsonLd} />
      <nav className="text-sm text-slate-500 mb-4">
        <Link href={`/${lang}`} className="hover:underline">{t(L, 'nav.home')}</Link>
        <span className="mx-1">/</span>
        <span>{label}</span>
      </nav>
      <h1 className="text-2xl font-bold">{label} {t(L, 'section.domains')} · {t(L, 'domain.rankTitle')}</h1>
      <p className="text-slate-500 mt-1 mb-6 text-sm">
        {t(L, 'domain.count')} {ranked.length} {t(L, 'domain.persons')} · {t(L, 'domain.sortedBy')}
      </p>

      {/* TOP3 醒目展示（榜单基调，始终基于全量领域榜，不随客户端筛选变化） */}
      {ranked.length > 0 && (
        <ol className="grid sm:grid-cols-3 gap-4 mb-8">
          {ranked.slice(0, 3).map((p, i) => (
            <li key={p.id} className="relative border rounded-xl bg-white p-4">
              <RankMedal rank={i + 1} className="absolute -top-3 -left-2" />
              <Link href={`/${lang}/person/${p.slug}`} className="font-semibold hover:text-brand">
                {pickText(p.names, L)}
              </Link>
              <div className="text-xs text-slate-500 mt-1">{pickText(p.occupations, L)}</div>
              <div className="text-xs text-slate-400 mt-2">
                影响力 {p.metrics?.influence ?? '-'}
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* 统一交互层：站内搜索 / 时代 / 国籍筛选 / 排序 / 深链 / 导出 / 已选筛选 */}
      {ranked.length === 0 ? (
        <p className="text-slate-500 mt-6">{t(L, 'domain.empty')}</p>
      ) : (
        <DomainExplorer
          items={projectPersons(ranked, L)}
          lang={L}
          initialEra={sp.era || 'all'}
          initialNationality={sp.nationality || 'all'}
          initialQ={sp.q || ''}
          initialSort={initialSort}
        />
      )}

      {/* 领域互链（SEO 内链结构） */}
      <div className="mt-10 border-t pt-6">
        <h2 className="text-sm font-semibold text-slate-500 mb-3">{t(L, 'domain.browseOther')}</h2>
        <div className="flex flex-wrap gap-2">
          {VALID.filter((d) => d !== domain && d !== 'other').map((d) => (
            <Link
              key={d}
              href={`/${lang}/domain/${d}`}
              className="px-3 py-1 rounded-full bg-white border text-sm text-slate-700 hover:bg-indigo-50"
            >
              {domainLabel(L, d)}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
