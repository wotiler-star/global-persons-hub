import Link from 'next/link';
import { searchPersons, semanticSearch, getPersons } from '@/lib/api';
import { pickText, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { DOMAIN_LABELS } from '@gph/types';
import PersonCard from '@/components/PersonCard';
import SearchBar from '@/components/SearchBar';

export default async function Search({
  params,
  searchParams
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ q?: string; domain?: string; mode?: string }>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const L = lang as Lang;
  const semantic = sp.mode === 'semantic';
  let items: any[] = [];
  let scores: Map<string, number> | null = null;
  try {
    if (sp.q && semantic) {
      const d = await semanticSearch(sp.q, lang, 12);
      items = d.results.map((r) => r.hit);
      scores = new Map(d.results.map((r) => [r.hit.id, r.score]));
    } else if (sp.q) {
      const d = await searchPersons(sp.q);
      items = d.results;
    } else {
      const d = await getPersons({ domain: sp.domain, lang });
      items = d.items;
    }
  } catch {
    /* ignore */
  }

  const qs = (mode?: string) => {
    const p = new URLSearchParams();
    if (sp.q) p.set('q', sp.q);
    if (mode) p.set('mode', mode);
    return `/${lang}/search?${p.toString()}`;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t(L, 'search.title')}{sp.q ? `：${sp.q}` : ''}</h1>
      <div className="max-w-xl mb-4">
        <SearchBar lang={L} initial={sp.q || ''} />
      </div>

      {/* 关键词 / 语义（向量）双模式切换 */}
      {sp.q && (
        <div className="mb-6 flex items-center gap-2 text-sm">
          <Link
            href={qs()}
            className={`px-3 py-1 rounded-full border ${
              !semantic ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600'
            }`}
          >
            {t(L, 'search.keyword')}
          </Link>
          <Link
            href={qs('semantic')}
            className={`px-3 py-1 rounded-full border ${
              semantic ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600'
            }`}
          >
            {t(L, 'search.semantic')}
          </Link>
          {semantic && (
            <span className="text-xs text-slate-400">{t(L, 'search.semanticHint')}</span>
          )}
        </div>
      )}

      {sp.domain && (
        <div className="mb-4 text-sm text-slate-500">
          {t(L, 'search.domainFilter')}{DOMAIN_LABELS[sp.domain as keyof typeof DOMAIN_LABELS]}
          <Link href={`/${lang}/domain/${sp.domain}`} className="ml-2 text-brand hover:underline">
            {t(L, 'search.viewRank')}
          </Link>
        </div>
      )}

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
