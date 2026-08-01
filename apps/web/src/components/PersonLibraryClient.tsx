'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getPersons } from '@/lib/api';
import { useFavorites, useHistoryEntries, clearHistory, toggleFavorite } from '@/lib/libraryStore';
import { t } from '@/lib/ui';
import { pickText, type Lang } from '@/lib/i18n';
import { DOMAIN_LABELS, type Domain, type Person } from '@gph/types';
import PersonCard from '@/components/PersonCard';
import FilterChips, { type ChipOption } from '@/components/FilterChips';
import SortToggle from '@/components/SortToggle';
import EmptyState from '@/components/EmptyState';
import ActiveFilters from '@/components/ActiveFilters';
import { downloadText, toCsv } from '@/lib/download';

type FavSort = 'recent' | 'name' | 'influence';

export default function PersonLibraryClient({
  lang,
  sharedPersons
}: {
  lang: Lang;
  sharedPersons?: Person[];
}) {
  const favs = useFavorites();
  const histEntries = useHistoryEntries();
  const [all, setAll] = useState<Person[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState<boolean>(!Array.isArray(sharedPersons));
  const [domain, setDomain] = useState<string>('all');
  const [sort, setSort] = useState<FavSort>('recent');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [managing, setManaging] = useState(false);

  const isShared = Array.isArray(sharedPersons);

  useEffect(() => {
    if (isShared) return; // 共享视图无需拉取全量
    let alive = true;
    (async () => {
      const d = await getPersons({ lang, pageSize: 300 }).catch(() => ({ items: [] as Person[] }));
      if (alive) {
        setAll(d.items || []);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [lang, isShared]);

  const bySlug = useMemo(() => new Map(all.map((p) => [p.slug, p])), [all]);
  const favPersons = useMemo(
    () => favs.map((s) => bySlug.get(s)).filter((p): p is Person => Boolean(p)),
    [favs, bySlug]
  );
  const histPersons = useMemo(
    () => histEntries.map((e) => ({ p: bySlug.get(e.slug), at: e.at })).filter((x): x is { p: Person; at: string } => Boolean(x.p)),
    [histEntries, bySlug]
  );

  // 领域选项（来自收藏）
  const domainOpts = useMemo<ChipOption[]>(() => {
    const set = new Set<Domain>();
    favPersons.forEach((p) => p.domains.forEach((d) => set.add(d)));
    return (Object.keys(DOMAIN_LABELS) as Domain[])
      .filter((d) => set.has(d))
      .map((d) => ({ value: d, label: DOMAIN_LABELS[d] }));
  }, [favPersons]);

  // 排序（recent 即收藏顺序，toggleFavorite 已置顶最新）
  const sortedFavs = useMemo(() => {
    const arr = [...favPersons];
    const coll = new Intl.Collator(lang, { sensitivity: 'base' });
    if (sort === 'name') arr.sort((a, b) => coll.compare(pickText(a.names, lang), pickText(b.names, lang)));
    else if (sort === 'influence') arr.sort((a, b) => (b.metrics?.influence || 0) - (a.metrics?.influence || 0));
    return arr;
  }, [favPersons, sort, lang]);

  const filteredFavs = useMemo(
    () => (domain === 'all' ? sortedFavs : sortedFavs.filter((p) => p.domains.includes(domain as Domain))),
    [sortedFavs, domain]
  );

  // 统计概览
  const stats = useMemo(() => {
    const dSet = new Set<Domain>();
    favPersons.forEach((p) => p.domains.forEach((d) => dSet.add(d)));
    return { fav: favPersons.length, hist: histPersons.length, domains: dSet.size };
  }, [favPersons, histPersons]);

  // 选择
  const toggleSelect = (slug: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });
  const allVisibleSelected = filteredFavs.length > 0 && filteredFavs.every((p) => selected.has(p.slug));
  const toggleSelectAll = () =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (allVisibleSelected) filteredFavs.forEach((p) => n.delete(p.slug));
      else filteredFavs.forEach((p) => n.add(p.slug));
      return n;
    });
  const removeSelected = () => {
    selected.forEach((s) => toggleFavorite(s));
    setSelected(new Set());
  };

  // 导出
  const exportJson = () =>
    downloadText(`library-${lang}.json`, JSON.stringify(favPersons, null, 2), 'application/json');
  const exportCsv = () => {
    const headers = ['name', 'slug', 'domains', 'nationalities', 'influence'];
    const rows = filteredFavs.map((p) => [
      pickText(p.names, 'en') || pickText(p.names, lang),
      p.slug,
      p.domains.join('|'),
      (p.nationalities || []).join('|'),
      p.metrics?.influence ?? ''
    ]);
    downloadText(`library-${lang}.csv`, toCsv(headers, rows), 'text/csv;charset=utf-8');
  };

  const onShare = async () => {
    const url = `${window.location.origin}/${lang}/library?ids=${favs.join(',')}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* 剪贴板不可用时静默 */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fmtTime = (iso: string) =>
    iso ? new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '';

  const sortOptions = [
    { key: 'recent', label: t(lang, 'library.sortRecent') },
    { key: 'name', label: t(lang, 'persons.byName') },
    { key: 'influence', label: t(lang, 'persons.byInfluence') }
  ];

  // —— 共享视图（?ids=）——
  if (isShared) {
    const list = sharedPersons as Person[];
    return (
      <div>
        <div className="mb-4 rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3 text-sm text-indigo-800">
          {t(lang, 'library.sharedView').replace('{n}', String(list.length))}
          <Link href={`/${lang}/library`} className="ml-3 underline hover:opacity-80">
            {t(lang, 'library.backToMine')}
          </Link>
        </div>
        {list.length === 0 ? (
          <EmptyState title={t(lang, 'library.emptyFav')} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {list.map((p) => (
              <PersonCard key={p.slug} person={p} lang={lang} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // —— 我的收藏夹 ——
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold">{t(lang, 'library.title')}</h1>
        <button
          type="button"
          onClick={onShare}
          disabled={favs.length === 0}
          className="px-3 py-1.5 rounded-lg bg-brand text-white text-sm hover:opacity-90 disabled:opacity-40"
        >
          {copied ? t(lang, 'library.shareDone') : t(lang, 'library.share')}
        </button>
        <button
          type="button"
          onClick={() => setManaging((v) => !v)}
          disabled={favs.length === 0}
          className={`px-3 py-1.5 rounded-lg border text-sm hover:bg-slate-50 disabled:opacity-40 ${
            managing ? 'bg-slate-800 text-white border-slate-800' : 'text-slate-600'
          }`}
        >
          {t(lang, 'library.bulkManage')}
        </button>
      </div>

      {/* 概览 */}
      <div className="flex flex-wrap items-center gap-4 mb-6 text-sm">
        <span className="text-slate-500">
          {t(lang, 'library.statFav')}：<b className="text-slate-800">{stats.fav}</b>
        </span>
        <span className="text-slate-500">
          {t(lang, 'library.statHist')}：<b className="text-slate-800">{stats.hist}</b>
        </span>
        <span className="text-slate-500">
          {t(lang, 'persons.statDomains')}：<b className="text-slate-800">{stats.domains}</b>
        </span>
      </div>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">{t(lang, 'library.favorites')}</h2>

        {favPersons.length === 0 ? (
          loading ? (
            <EmptyState skeleton />
          ) : (
            <EmptyState title={t(lang, 'library.emptyFav')} hint={t(lang, 'library.emptyHint')}>
              <Link
                href={`/${lang}/persons`}
                className="px-4 py-2 rounded-lg bg-brand text-white text-sm hover:opacity-90"
              >
                {t(lang, 'library.goExplore')}
              </Link>
            </EmptyState>
          )
        ) : (
          <>
            {/* 筛选 + 排序 + 全选 + 导出 */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <FilterChips
                options={domainOpts}
                value={domain}
                onChange={setDomain}
                allValue="all"
                allLabel={t(lang, 'persons.filterAll')}
              />
              <ActiveFilters
                lang={lang}
                filters={domain !== 'all' ? [{ key: 'domain', label: DOMAIN_LABELS[domain as Domain], onRemove: () => setDomain('all') }] : []}
                onClear={() => setDomain('all')}
              />
              <div className="flex items-center gap-3">
                <SortToggle
                  label={`${t(lang, 'persons.sortBy')}：`}
                  options={sortOptions}
                  value={sort}
                  onChange={(v) => setSort(v as FavSort)}
                />
                <button
                  onClick={exportCsv}
                  className="px-3 py-1.5 rounded-lg border text-slate-600 text-sm hover:bg-slate-50"
                >
                  {t(lang, 'common.exportCsv')}
                </button>
                <button
                  onClick={exportJson}
                  className="px-3 py-1.5 rounded-lg border text-slate-600 text-sm hover:bg-slate-50"
                >
                  {t(lang, 'common.exportJson')}
                </button>
              </div>
            </div>

            {managing && (
              <div className="flex items-center gap-3 mb-3 text-sm">
                <label className="flex items-center gap-2 text-slate-600">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} />
                  {t(lang, 'common.selectAll')}
                </label>
                <button
                  onClick={removeSelected}
                  disabled={selected.size === 0}
                  className="px-3 py-1.5 rounded-lg border text-rose-600 text-sm hover:bg-rose-50 disabled:opacity-40"
                >
                  {t(lang, 'common.removeSelected')}
                </button>
                <Link
                  href={`/${lang}/compare?ids=${[...selected].join(',')}`}
                  onClick={(e) => selected.size === 0 && e.preventDefault()}
                  className={`px-3 py-1.5 rounded-lg border text-sm hover:bg-slate-50 ${
                    selected.size === 0 ? 'opacity-40 pointer-events-none' : 'text-slate-700'
                  }`}
                >
                  {t(lang, 'common.compareSelected')}
                </Link>
                <span className="ml-auto text-slate-400">
                  {t(lang, 'common.selectedCount').replace('{n}', String(selected.size))}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredFavs.map((p) => (
                <div key={p.slug} className="relative">
                  {managing && (
                    <input
                      type="checkbox"
                      checked={selected.has(p.slug)}
                      onChange={() => toggleSelect(p.slug)}
                      aria-label={pickText(p.names, lang)}
                      className="absolute top-2 left-2 z-20 w-5 h-5 accent-brand"
                    />
                  )}
                  <PersonCard person={p} lang={lang} />
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{t(lang, 'library.history')}</h2>
          {histPersons.length > 0 && (
            <button
              type="button"
              onClick={() => clearHistory()}
              className="text-xs px-2 py-1 rounded border text-slate-500 hover:bg-slate-100"
            >
              {t(lang, 'library.clearHist')}
            </button>
          )}
        </div>
        {histPersons.length === 0 ? (
          <EmptyState title={t(lang, 'library.emptyHist')} />
        ) : (
          <ol className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {histPersons.map(({ p, at }) => (
              <li key={p.slug}>
                <Link
                  href={`/${lang}/person/${p.slug}`}
                  className="flex items-center gap-3 border rounded-xl bg-white p-3 hover:shadow-sm transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{pickText(p.names, lang)}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {at ? t(lang, 'library.viewTime').replace('{t}', fmtTime(at)) : pickText(p.occupations, lang)}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
