import Link from 'next/link';
import type { Metadata } from 'next';
import { getPersons, semanticSearch } from '@/lib/server/data';
import { LANGS, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import SearchBar from '@/components/SearchBar';
import SearchExplorer from '@/components/SearchExplorer';
import PersonCard from '@/components/PersonCard';

// —— SEO：搜索页多语种 hreflang + 规范链接 ——
export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[l] = `/${l}/search`;
  languages['x-default'] = `/en/search`;
  return {
    title: t(lang as Lang, 'search.title'),
    alternates: { canonical: `/${lang}/search`, languages }
  };
}

export default async function Search({
  params,
  searchParams
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ q?: string; domain?: string; era?: string; nationality?: string; sort?: string; mode?: string }>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const L = lang as Lang;
  const semantic = sp.mode === 'semantic';

  // 全量人物（用于客户端跨 13 语全文本检索 + 分面）
  const all = await getPersons({ lang, pageSize: 300 }).catch(() => ({ items: [] as any[] }));

  // 语义（向量）模式：保持后端检索
  if (semantic && sp.q) {
    let items: any[] = [];
    let scores: Map<string, number> | null = null;
    try {
      const d = await semanticSearch(sp.q, lang, 12);
      items = d.results.map((r) => r.hit);
      scores = new Map(d.results.map((r) => [r.hit.id, r.score]));
    } catch {
      /* ignore */
    }
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">{t(L, 'search.title')}：{sp.q}</h1>
        <div className="max-w-xl mb-4">
          <SearchBar lang={L} initial={sp.q} />
        </div>
        <div className="mb-6 flex items-center gap-2 text-sm">
          <Link
            href={`/${lang}/search?q=${encodeURIComponent(sp.q)}`}
            className="px-3 py-1 rounded-full border bg-white text-slate-600"
          >
            {t(L, 'search.keyword')}
          </Link>
          <Link
            href={`/${lang}/search?q=${encodeURIComponent(sp.q)}&mode=semantic`}
            className="px-3 py-1 rounded-full border bg-brand text-white border-brand"
          >
            {t(L, 'search.semantic')}
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((p) => (
            <div key={p.id || p.slug} className="relative">
              <PersonCard person={p} lang={L} />
              {scores?.has(p.id) && (
                <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-600/90 text-white">
                  {(scores.get(p.id)! * 100).toFixed(0)}%
                </span>
              )}
            </div>
          ))}
        </div>
        {items.length === 0 && <p className="text-slate-500 mt-6">{t(L, 'search.noResult')}</p>}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">
        {t(L, 'search.title')}
        {sp.q ? `：${sp.q}` : ''}
      </h1>
      <div className="max-w-xl mb-4">
        <SearchBar lang={L} initial={sp.q || ''} />
      </div>

      {sp.q && (
        <div className="mb-6 flex items-center gap-2 text-sm">
          <span className="px-3 py-1 rounded-full border bg-brand text-white border-brand">
            {t(L, 'search.keyword')}
          </span>
          <Link
            href={`/${lang}/search?q=${encodeURIComponent(sp.q)}&mode=semantic`}
            className="px-3 py-1 rounded-full border bg-white text-slate-600"
          >
            {t(L, 'search.semantic')}
          </Link>
        </div>
      )}

      <SearchExplorer
        lang={L}
        allPersons={all.items}
        initialQ={sp.q || ''}
        initialDomain={sp.domain || ''}
        initialEra={sp.era || ''}
        initialNationality={sp.nationality || ''}
        initialSort={sp.sort || ''}
      />
    </div>
  );
}
