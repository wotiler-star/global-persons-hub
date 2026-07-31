'use client';

import { useMemo, useState } from 'react';
import { pickText, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { DOMAIN_LABELS, type Domain, type Person } from '@gph/types';
import PersonCard from '@/components/PersonCard';
import FilterChips, { type ChipOption } from '@/components/FilterChips';
import SortToggle from '@/components/SortToggle';
import EmptyState from '@/components/EmptyState';
import { useQuerySync } from '@/lib/useQuerySync';
import { filterPersons, matchScore, birthYear, ERAS } from '@/lib/searchIndex';

type SortMode = 'relevance' | 'influence' | 'name' | 'newest';

export default function SearchExplorer({
  lang,
  allPersons,
  initialQ = '',
  initialDomain = '',
  initialEra = '',
  initialNationality = ''
}: {
  lang: Lang;
  allPersons: Person[];
  initialQ?: string;
  initialDomain?: string;
  initialEra?: string;
  initialNationality?: string;
}) {
  const [q, setQ] = useState(initialQ);
  const [domain, setDomain] = useState(initialDomain);
  const [era, setEra] = useState(initialEra);
  const [nationality, setNationality] = useState(initialNationality);
  const [sort, setSort] = useState<SortMode>(initialQ ? 'relevance' : 'influence');
  const [page, setPage] = useState(1);

  // —— 深链接 ——
  useQuerySync(
    () => ({ q: q.trim(), domain, era, nationality, sort }),
    ['q', 'domain', 'era', 'nationality', 'sort'],
    [q, domain, era, nationality, sort]
  );

  const PAGE_SIZE = 36;

  // 关键词命中的基础集合（忽略所有分面，用于分面计数）
  const qMatched = useMemo(
    () => (q.trim() ? allPersons.filter((p) => matchScore(p, q) > 0) : allPersons),
    [allPersons, q]
  );

  const eraOf = (p: Person): string => {
    const y = birthYear(p);
    if (y == null) return '';
    const e = ERAS.find((x) => y >= x.from && y <= x.to);
    return e ? e.key : '';
  };

  // 分面计数（各自忽略自身维度，应用其它筛选）
  const domainCounts = useMemo(() => {
    const m = new Map<Domain, number>();
    for (const p of qMatched) {
      if (era && eraOf(p) !== era) continue;
      if (nationality && !(p.nationalities || []).includes(nationality)) continue;
      for (const d of p.domains) m.set(d, (m.get(d) || 0) + 1);
    }
    return m;
  }, [qMatched, era, nationality]);

  const eraCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of qMatched) {
      if (domain && !p.domains.includes(domain as Domain)) continue;
      if (nationality && !(p.nationalities || []).includes(nationality)) continue;
      const k = eraOf(p) || 'unknown';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [qMatched, domain, nationality]);

  const nationalityCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of qMatched) {
      if (domain && !p.domains.includes(domain as Domain)) continue;
      if (era && eraOf(p) !== era) continue;
      for (const n of p.nationalities || []) m.set(n, (m.get(n) || 0) + 1);
    }
    return m;
  }, [qMatched, domain, era]);

  const presentDomains = (Object.keys(DOMAIN_LABELS) as Domain[]).filter((d) =>
    allPersons.some((p) => p.domains.includes(d))
  );
  const presentEras = ERAS;
  const presentNationalities = useMemo(() => {
    const cnt = new Map<string, number>();
    for (const p of allPersons) for (const n of p.nationalities || []) cnt.set(n, (cnt.get(n) || 0) + 1);
    return [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }, [allPersons]);

  // 过滤 + 国籍 + 排序
  const filtered = useMemo(() => {
    const base = filterPersons(allPersons, { q, domain, era });
    const arr = nationality ? base.filter((p) => (p.nationalities || []).includes(nationality)) : base;
    const coll = new Intl.Collator(lang, { sensitivity: 'base' });
    const out = [...arr];
    if (sort === 'influence') out.sort((a, b) => (b.metrics?.influence || 0) - (a.metrics?.influence || 0));
    else if (sort === 'name') out.sort((a, b) => coll.compare(pickText(a.names, lang), pickText(b.names, lang)));
    else if (sort === 'newest')
      out.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    // relevance：filterPersons 已按相关性排序（仅 q 存在时），保持不变
    return out;
  }, [allPersons, q, domain, era, nationality, sort, lang]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

  // 筛选变化重置分页
  const resetPage = () => setPage(1);
  const onDomain = (d: string) => {
    setDomain(d);
    resetPage();
  };
  const onEra = (k: string) => {
    setEra(k);
    resetPage();
  };
  const onNationality = (n: string) => {
    setNationality(n);
    resetPage();
  };

  const hasFilter = !!(domain || era || nationality);

  // 无结果推荐：取全库影响力 Top 人物
  const suggestions = useMemo(
    () =>
      [...allPersons]
        .sort((a, b) => (b.metrics?.influence || 0) - (a.metrics?.influence || 0))
        .slice(0, 8),
    [allPersons]
  );

  const sortOptions = [
    { key: 'relevance', label: t(lang, 'search.keyword') },
    { key: 'influence', label: t(lang, 'persons.byInfluence') },
    { key: 'name', label: t(lang, 'persons.byName') },
    { key: 'newest', label: t(lang, 'search.sortNewest') }
  ];

  return (
    <div>
      {/* 分面：领域 */}
      <FilterChips
        label={t(lang, 'search.facetDomain')}
        options={presentDomains.map((d) => ({ value: d, label: DOMAIN_LABELS[d], count: domainCounts.get(d) || 0 }))}
        value={domain}
        onChange={onDomain}
        allValue=""
        allLabel={t(lang, 'search.allDomains')}
      />

      {/* 分面：时代 */}
      <FilterChips
        label={t(lang, 'search.facetEra')}
        options={presentEras.map((e) => ({ value: e.key, label: t(lang, e.uiKey), count: eraCounts.get(e.key) || 0 }))}
        value={era}
        onChange={onEra}
        allValue=""
        allLabel={t(lang, 'timeline.eraAll')}
      />

      {/* 分面：国籍 */}
      {presentNationalities.length > 0 && (
        <FilterChips
          label={t(lang, 'search.facetNationality')}
          options={presentNationalities.map((n) => ({ value: n, label: n, count: nationalityCounts.get(n) || 0 }))}
          value={nationality}
          onChange={onNationality}
          allValue=""
          allLabel={t(lang, 'persons.filterAll')}
        />
      )}

      {/* 已选筛选（可单独移除）*/}
      {hasFilter && (
        <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
          <span className="text-slate-500">{t(lang, 'search.activeFilters')}：</span>
          {domain && (
            <button
              onClick={() => onDomain('')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand/10 text-brand"
            >
              {DOMAIN_LABELS[domain as Domain]}
              <span className="opacity-60">×</span>
            </button>
          )}
          {era && (
            <button
              onClick={() => onEra('')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand/10 text-brand"
            >
              {t(lang, ERAS.find((e) => e.key === era)!.uiKey)}
              <span className="opacity-60">×</span>
            </button>
          )}
          {nationality && (
            <button
              onClick={() => onNationality('')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand/10 text-brand"
            >
              {nationality}
              <span className="opacity-60">×</span>
            </button>
          )}
          <button
            onClick={() => {
              setDomain('');
              setEra('');
              setNationality('');
              resetPage();
            }}
            className="text-xs text-slate-500 hover:underline"
          >
            {t(lang, 'search.clearFilter')}
          </button>
        </div>
      )}

      {/* 排序 */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SortToggle
          label={`${t(lang, 'persons.sortBy')}：`}
          options={sortOptions}
          value={sort}
          onChange={(v) => {
            setSort(v as SortMode);
            resetPage();
          }}
        />
        <span className="ml-auto text-xs text-slate-400">
          {filtered.length} {t(lang, 'search.results')}
        </span>
      </div>

      {/* 结果网格 */}
      {visible.length === 0 ? (
        <EmptyState title={t(lang, 'search.noResult')} hint={t(lang, 'common.emptyHint')}>
          <div>
            <p className="text-xs text-slate-400 mb-3">{t(lang, 'search.suggestions')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {suggestions.map((p) => (
                <PersonCard key={p.id || p.slug} person={p} lang={lang} />
              ))}
            </div>
          </div>
        </EmptyState>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {visible.map((p) => (
            <PersonCard key={p.id || p.slug} person={p} lang={lang} highlight={q.trim() || undefined} />
          ))}
        </div>
      )}

      {/* 加载更多 */}
      {hasMore && (
        <div className="text-center mt-6">
          <button
            onClick={() => setPage((p) => p + 1)}
            className="px-5 py-2 rounded-lg border text-sm text-slate-700 hover:bg-slate-50"
          >
            {t(lang, 'common.loadMore')}（{filtered.length - visible.length}）
          </button>
        </div>
      )}
    </div>
  );
}
