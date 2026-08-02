import type { Metadata } from 'next';
import { getPersons } from '@/lib/api';
import { pickText, LANGS, type Lang } from '@/lib/i18n';
import { t, domainLabel } from '@/lib/ui';
import { OG_LOCALE, SITE_NAME, SITE_URL } from '@/lib/og';
import { DOMAIN_LABELS, type Domain } from '@gph/types';
import PersonCard from '@/components/PersonCard';
import SearchBar from '@/components/SearchBar';
import TodayInHistory from '@/components/TodayInHistory';
import ForYou from '@/components/ForYou';
import JsonLd from '@/components/JsonLd';

// 与 Domain 类型单一事实源对齐（sitemap / 领域页同做法），新增领域自动出现
const DOMAINS = Object.keys(DOMAIN_LABELS) as Domain[];

// —— Stage 34 SSG/ISR：13 语首页构建期预渲染，5 分钟增量再生 ——
export const revalidate = 300;
export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

// —— 首页多语种社交分享卡 + hreflang ——
export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const L = lang as Lang;
  const title = t(L, 'home.heroTitle');
  const description = t(L, 'home.heroSub');
  const languages: Record<string, string> = { 'x-default': `/en` };
  for (const l of LANGS) languages[l] = `/${l}`;
  return {
    title,
    description,
    alternates: {
      canonical: `/${lang}`,
      languages,
      types: { 'application/rss+xml': [{ url: '/feed.xml', title: `${SITE_NAME} — New Profiles` }] }
    },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title,
      description,
      url: `/${lang}`,
      locale: OG_LOCALE[L] || 'en_US'
    },
    twitter: { card: 'summary_large_image', title, description }
  };
}

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const L = lang as Lang;
  let items: any[] = [];
  try {
    // 全量取回（50 人级），供影响力榜单与「历史上的今天」双用
    const d = await getPersons({ lang, pageSize: 200 });
    items = d.items;
  } catch {
    // API 不可达时静默降级
  }
  const top = [...items]
    .sort((a, b) => (b.metrics?.influence || 0) - (a.metrics?.influence || 0))
    .slice(0, 12);

  // —— Stage 34：WebSite + SearchAction 结构化数据（利于搜索引擎站内搜索直达框）——
  const websiteLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: `/${lang}`,
    inLanguage: L,
    isAccessibleForFree: true,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `/${lang}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string'
    }
  };

  // —— Stage 35（GEO / E-E-A-T）：Organization 发布者实体，强化站点权威信号 ——
  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    description:
      'A structured, multilingual knowledge graph of notable people across film, business, academia, sports, music, politics, tech, and art.',
    sameAs: [`${SITE_URL}/llms.txt`]
  };

  return (
    <div>
      <JsonLd data={websiteLd} />
      <JsonLd data={orgLd} />
      <section className="text-center py-10">
        <h1 className="text-3xl font-bold">{t(L, 'home.heroTitle')}</h1>
        <p className="text-slate-600 mt-2">{t(L, 'home.heroSub')}</p>
        <div className="max-w-xl mx-auto mt-6">
          <SearchBar lang={L} />
        </div>
      </section>

      <section className="flex flex-wrap gap-2 justify-center mb-8">
        {DOMAINS.map((d) => (
          <a
            key={d}
            href={`/${L}/domain/${d}`}
            className="px-3 py-1 rounded-full bg-white border text-sm text-slate-700 hover:bg-indigo-50"
          >
            {domainLabel(L, d)}
          </a>
        ))}
      </section>

      <TodayInHistory persons={items} lang={L} />

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{t(L, 'home.trending')}</h2>
        <a href={`/${L}/persons`} className="text-sm text-brand hover:underline">
          {t(L, 'common.viewAll')}
        </a>
      </div>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {top.map((p) => (
          <PersonCard key={p.id} person={p} lang={L} />
        ))}
      </div>
      {top.length === 0 && (
        <p className="text-slate-500 mt-6">{t(L, 'home.apiDown')}</p>
      )}

      <ForYou items={items} lang={L} />
    </div>
  );
}
