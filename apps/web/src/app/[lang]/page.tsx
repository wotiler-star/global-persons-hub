import type { Metadata } from 'next';
import { getPersons } from '@/lib/api';
import { pickText, LANGS, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { OG_LOCALE, SITE_NAME } from '@/lib/og';
import { DOMAIN_LABELS, type Domain } from '@gph/types';
import PersonCard from '@/components/PersonCard';
import SearchBar from '@/components/SearchBar';
import TodayInHistory from '@/components/TodayInHistory';

// 与 Domain 类型单一事实源对齐（sitemap / 领域页同做法），新增领域自动出现
const DOMAINS = Object.keys(DOMAIN_LABELS) as Domain[];

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
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[l] = `/${l}`;
  return {
    title,
    description,
    alternates: { canonical: `/${lang}`, languages },
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

  return (
    <div>
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
            {DOMAIN_LABELS[d]}
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
    </div>
  );
}
