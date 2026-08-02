'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { pickText, type Lang } from '@/lib/i18n';
import { t, domainLabel } from '@/lib/ui';
import { formatMoney } from '@/lib/format';
import RankMedal from '@/components/RankMedal';
import FilterChips, { type ChipOption } from '@/components/FilterChips';
import SortToggle from '@/components/SortToggle';
import EmptyState from '@/components/EmptyState';
import FavoriteButton from '@/components/FavoriteButton';
import ActiveFilters from '@/components/ActiveFilters';
import ShareLinkButton from '@/components/ShareLinkButton';
import { useQuerySync } from '@/lib/useQuerySync';
import { downloadText, toCsv } from '@/lib/download';
import { DOMAIN_LABELS, type Domain, type Person } from '@gph/types';

export type SortMode = 'influence' | 'netWorth' | 'name';
export type DomainFilter = Domain | 'all';

interface Props {
  items: Person[];
  lang: Lang;
  initialDomain?: DomainFilter;
  initialSort?: SortMode;
  initialDir?: 'asc' | 'desc';
  initialNationality?: string;
  initialQ?: string;
}

const PAGE_SIZE = 30;
const FAV_BTN =
  'flex-none grid place-items-center w-8 h-8 rounded-full bg-white/90 shadow-sm hover:bg-white text-lg leading-none ';

export default function PersonsExplorer({
  items,
  lang,
  initialDomain = 'all',
  initialSort = 'influence',
  initialDir = 'desc',
  initialNationality = 'all',
  initialQ = ''
}: Props) {
  const [domain, setDomain] = useState<DomainFilter>(initialDomain);
  const [nationality, setNationality] = useState<string>(initialNationality);
  const [sort, setSort] = useState<SortMode>(initialSort);
  const [dir, setDir] = useState<'asc' | 'desc'>(initialDir);
  const [q, setQ] = useState(initialQ);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  // —— 深链接：筛选/排序/搜索同步到 URL（可分享、SSR 可读）——
  useQuerySync(
    () => ({
      domain: domain === 'all' ? '' : domain,
      nationality: nationality === 'all' ? '' : nationality,
      sort,
      dir,
      q: q.trim()
    }),
    ['domain', 'nationality', 'sort', 'dir', 'q'],
    [domain, nationality, sort, dir, q],
    (params) => {
      const d = params.get('domain');
      setDomain(d && d !== 'all' ? (d as DomainFilter) : 'all');
      const n = params.get('nationality');
      setNationality(n && n !== 'all' ? n : 'all');
      const s = params.get('sort');
      setSort(s === 'influence' || s === 'netWorth' || s === 'name' ? (s as SortMode) : 'influence');
      const dr = params.get('dir');
      setDir(dr === 'asc' || dr === 'desc' ? dr : 'desc');
      setQ(params.get('q') ?? '');
    }
  );

  // 动态领域集（仅展示库中出现的领域）
  const domains = useMemo<ChipOption[]>(() => {
    const set = new Set<Domain>();
    for (const p of items) for (const d of p.domains) set.add(d);
    return (Object.keys(DOMAIN_LABELS) as Domain[])
      .filter((d) => set.has(d))
      .map((d) => ({ value: d, label: domainLabel(lang, d) }));
  }, [items]);

  // 动态国籍集（按出现频次降序）
  const nationalities = useMemo<ChipOption[]>(() => {
    const cnt = new Map<string, number>();
    for (const p of items) for (const n of p.nationalities || []) cnt.set(n, (cnt.get(n) || 0) + 1);
    return [...cnt.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([n]) => ({ value: n, label: n }));
  }, [items]);

  // 过滤 + 站内搜索 + 排序
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const arr = items.filter((p) => {
      if (domain !== 'all' && !p.domains.includes(domain)) return false;
      if (nationality !== 'all' && !(p.nationalities || []).includes(nationality)) return false;
      if (query) {
        const hay = [pickText(p.names, lang), pickText(p.occupations, lang), pickText(p.summary, lang)]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    const coll = new Intl.Collator(lang, { sensitivity: 'base' });
    return [...arr].sort((a, b) => {
      if (sort === 'influence') return (b.metrics?.influence || 0) - (a.metrics?.influence || 0);
      if (sort === 'netWorth') return (b.metrics?.netWorth || 0) - (a.metrics?.netWorth || 0);
      const c = coll.compare(pickText(a.names, lang), pickText(b.names, lang));
      return dir === 'asc' ? c : -c;
    });
  }, [items, domain, nationality, q, sort, dir, lang]);

  // 分页（加载更多）
  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

  // 筛选变化重置分页
  useEffect(() => {
    setPage(1);
  }, [domain, nationality, q, sort, dir]);

  // 统计概览
  const stats = useMemo(() => {
    const dSet = new Set<Domain>();
    const nSet = new Set<string>();
    for (const p of items) {
      p.domains.forEach((d) => dSet.add(d));
      (p.nationalities || []).forEach((n) => nSet.add(n));
    }
    return { total: items.length, domains: dSet.size, nationalities: nSet.size };
  }, [items]);

  // 选择（批量对比）
  const toggleSelect = (slug: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.slug));
  const toggleSelectAll = () =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (allVisibleSelected) visible.forEach((p) => n.delete(p.slug));
      else visible.forEach((p) => n.add(p.slug));
      return n;
    });

  const exportCsv = () => {
    const headers = ['name', 'slug', 'domains', 'nationalities', 'influence', 'netWorth'];
    const rows = filtered.map((p) => [
      pickText(p.names, 'en') || pickText(p.names, lang),
      p.slug,
      p.domains.join('|'),
      (p.nationalities || []).join('|'),
      p.metrics?.influence ?? '',
      p.metrics?.netWorth ?? ''
    ]);
    downloadText(`persons-${lang}.csv`, toCsv(headers, rows), 'text/csv;charset=utf-8');
  };

  const sortOptions = [
    { key: 'influence', label: t(lang, 'persons.byInfluence') },
    { key: 'netWorth', label: t(lang, 'persons.byWealth') },
    { key: 'name', label: t(lang, 'persons.byName') }
  ];

  return (
    <div>
      {/* 统计概览条 */}
      <div className="flex flex-wrap items-center gap-4 mb-5 text-sm">
        <span className="text-slate-500">
          {t(lang, 'persons.statTotal')}：<b className="text-slate-800">{stats.total}</b>
        </span>
        <span className="text-slate-500">
          {t(lang, 'persons.statDomains')}：<b className="text-slate-800">{stats.domains}</b>
        </span>
        <span className="text-slate-500">
          {t(lang, 'persons.statCountries')}：<b className="text-slate-800">{stats.nationalities}</b>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <ShareLinkButton lang={lang} />
          <button
            onClick={exportCsv}
            className="px-3 py-1.5 rounded-lg border text-slate-600 text-sm hover:bg-slate-50"
          >
            {t(lang, 'common.exportCsv')}
          </button>
        </div>
      </div>

      {/* 站内搜索 */}
      <div className="mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t(lang, 'common.inPageSearch')}
          className="w-full max-w-md px-3 py-2 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/40"
        />
      </div>

      {/* 领域筛选 */}
      <FilterChips
        label={t(lang, 'explore.domain')}
        options={domains}
        value={domain}
        onChange={(v) => setDomain((v || 'all') as DomainFilter)}
        allValue="all"
        allLabel={t(lang, 'persons.filterAll')}
      />

      {/* 国籍筛选 */}
      {nationalities.length > 0 && (
        <FilterChips
          label={t(lang, 'explore.nationality')}
          options={nationalities}
          value={nationality}
          onChange={(v) => setNationality(v || 'all')}
          allValue="all"
          allLabel={t(lang, 'persons.filterAll')}
        />
      )}

      <ActiveFilters
        lang={lang}
        share={false} /* 顶部工具条已有独立的「复制链接」按钮，避免重复 */
        filters={[
          ...(domain !== 'all'
            ? [{ key: 'domain', label: domainLabel(lang, domain), onRemove: () => setDomain('all') }]
            : []),
          ...(nationality !== 'all'
            ? [{ key: 'nationality', label: nationality, onRemove: () => setNationality('all') }]
            : [])
        ]}
        onClear={() => {
          setDomain('all');
          setNationality('all');
          setSort('influence');
        }}
      />

      {/* 排序 + 升降序 + 全选 */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SortToggle
          label={`${t(lang, 'persons.sortBy')}：`}
          options={sortOptions}
          value={sort}
          onChange={(v) => setSort(v as SortMode)}
          dir={sort === 'name' ? dir : undefined}
          onDirChange={setDir}
          lang={lang}
        />
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} />
          {t(lang, 'common.selectAll')}
        </label>
      </div>

      {/* 结果计数 */}
      <div className="text-xs text-slate-400 mb-3">
        {t(lang, 'persons.total')}：{filtered.length}
      </div>

      {/* 排行榜列表 */}
      {visible.length === 0 ? (
        <EmptyState title={t(lang, 'persons.noResult')} hint={t(lang, 'common.emptyHint')} />
      ) : (
        <ol className="space-y-2">
          {visible.map((p, i) => {
            const wealth = formatMoney(p.metrics?.netWorth);
            const influence = p.metrics?.influence ?? 0;
            const isSel = selected.has(p.slug);
            return (
              <li
                key={p.id}
                className={`flex items-center gap-3 border rounded-xl bg-white p-3 hover:shadow-sm transition ${
                  isSel ? 'ring-2 ring-brand/50' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSel}
                  onChange={() => toggleSelect(p.slug)}
                  aria-label={pickText(p.names, lang)}
                  className="flex-none"
                />
                <RankMedal rank={i + 1} />
                <div className="flex-1 min-w-0">
                  <Link href={`/${lang}/person/${p.slug}`} className="font-semibold hover:text-brand">
                    {pickText(p.names, lang)}
                  </Link>
                  <div className="text-xs text-slate-500 truncate">{pickText(p.occupations, lang)}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.domains.map((d) => (
                      <span key={d} className="text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                        {domainLabel(lang, d)}
                      </span>
                    ))}
                    {(p.nationalities || []).slice(0, 3).map((n) => (
                      <span key={n} className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
                {sort !== 'name' && (
                  <div className="flex-none w-40 text-right">
                    {sort === 'netWorth' ? (
                      <span className="text-sm font-semibold text-emerald-700">{wealth ?? '—'}</span>
                    ) : (
                      <>
                        <span className="text-sm font-semibold text-slate-700">{influence}</span>
                        <div className="h-1.5 rounded bg-slate-100 mt-1 overflow-hidden">
                          <div className="h-full bg-brand" style={{ width: `${influence}%` }} />
                        </div>
                      </>
                    )}
                  </div>
                )}
                <FavoriteButton slug={p.slug} lang={lang} className={FAV_BTN + (isSel ? 'text-amber-500' : 'text-slate-400')} />
              </li>
            );
          })}
        </ol>
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

      {/* 批量对比浮动条 */}
      {selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white rounded-full px-4 py-2 shadow-lg">
          <span className="text-sm">{t(lang, 'common.selectedCount').replace('{n}', String(selected.size))}</span>
          <Link
            href={`/${lang}/compare?ids=${[...selected].join(',')}`}
            className="px-3 py-1 rounded-full bg-brand text-white text-sm hover:opacity-90"
          >
            {t(lang, 'common.compareSelected')}
          </Link>
          <button onClick={() => setSelected(new Set())} className="text-xs text-slate-300 hover:underline">
            {t(lang, 'common.clearSelection')}
          </button>
        </div>
      )}
    </div>
  );
}
