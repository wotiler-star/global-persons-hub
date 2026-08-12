'use client';

import { useMemo, useState } from 'react';
import { pickText, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { type PersonLite } from '@/lib/personProjection';
import { ERAS } from '@/lib/searchIndex';
import { computeFacets, eraKeyOf } from '@/lib/facets';
import PersonCard from '@/components/PersonCard';
import FilterChips, { type ChipOption } from '@/components/FilterChips';
import SortToggle from '@/components/SortToggle';
import EmptyState from '@/components/EmptyState';
import ActiveFilters from '@/components/ActiveFilters';
import ShareLinkButton from '@/components/ShareLinkButton';
import { useQuerySync } from '@/lib/useQuerySync';
import { downloadText, toCsv } from '@/lib/download';

type SortMode = 'influence' | 'netWorth' | 'name';

interface Props {
  /** 已按当前领域筛选好的人物（来自服务端 getPersons({ domain })） */
  items: PersonLite[];
  lang: Lang;
  initialEra?: string;
  initialNationality?: string;
  initialQ?: string;
  initialSort?: SortMode;
  initialDir?: 'asc' | 'desc';
}

/**
 * 领域子板块（/zh/domain/film 等）的统一交互层。
 * 领域本身由路由参数锁定（不重复出筛选 chip），在此之上提供：
 * 站内搜索 / 时代筛选 / 国籍筛选 / 排序(影响力·财富·姓名) / 深链 / 已选筛选 / 导出 CSV / 分享链接。
 * 与 Explore / Gallery / Persons / Search / Timeline 共享同一套交互原语，体验对齐。
 */
export default function DomainExplorer({
  items,
  lang,
  initialEra = 'all',
  initialNationality = 'all',
  initialQ = '',
  initialSort = 'influence',
  initialDir = 'desc'
}: Props) {
  const [era, setEra] = useState<string>(initialEra);
  const [nationality, setNationality] = useState<string>(initialNationality);
  const [q, setQ] = useState(initialQ);
  const [sort, setSort] = useState<SortMode>(initialSort);
  const [dir, setDir] = useState<'asc' | 'desc'>(initialDir);

  // —— 深链接（统一 useQuerySync，不含 domain，domain 由路由锁定）——
  useQuerySync(
    () => ({
      era: era === 'all' ? '' : era,
      nationality: nationality === 'all' ? '' : nationality,
      q: q.trim(),
      sort: sort === 'influence' ? '' : sort,
      dir: dir === 'desc' ? '' : dir
    }),
    ['era', 'nationality', 'q', 'sort', 'dir'],
    [era, nationality, q, sort, dir],
    (params) => {
      const e = params.get('era');
      setEra(e && e !== 'all' ? e : 'all');
      const n = params.get('nationality');
      setNationality(n && n !== 'all' ? n : 'all');
      setQ(params.get('q') ?? '');
      const s = params.get('sort');
      setSort(s === 'netWorth' || s === 'name' ? (s as SortMode) : 'influence');
      const dr = params.get('dir');
      setDir(dr === 'asc' ? 'asc' : 'desc');
    }
  );

  // 通用分面计数：时代计数尊重国籍、国籍计数尊重时代（互不计数自身）
  const facets = useMemo(() => computeFacets(items, { era, nationality }), [items, era, nationality]);

  // 动态国籍集（按频次降序，带分面计数）
  const nationalities = useMemo<ChipOption[]>(
    () =>
      [...facets.nationality.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([n, c]) => ({ value: n, label: n, count: c })),
    [facets.nationality]
  );

  // 过滤 + 站内搜索 + 排序
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const arr = items.filter((p) => {
      if (era !== 'all' && eraKeyOf(p) !== era) return false;
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
      if (sort === 'netWorth') return (b.metrics?.netWorth || 0) - (a.metrics?.netWorth || 0);
      if (sort === 'name') {
        const c = coll.compare(pickText(a.names, lang), pickText(b.names, lang));
        return dir === 'asc' ? c : -c;
      }
      return (b.metrics?.influence || 0) - (a.metrics?.influence || 0);
    });
  }, [items, era, nationality, q, sort, dir, lang]);

  // 重置分页/排序时不影响；此处为客户端全量渲染，无需分页
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
    downloadText(`domain-${lang}.csv`, toCsv(headers, rows), 'text/csv;charset=utf-8');
  };

  const sortOptions = [
    { key: 'influence', label: t(lang, 'persons.byInfluence') },
    { key: 'netWorth', label: t(lang, 'persons.byWealth') },
    { key: 'name', label: t(lang, 'persons.byName') }
  ];

  return (
    <div>
      {/* 工具栏：分享 + 导出 + 计数 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <ShareLinkButton lang={lang} />
        <button
          onClick={exportCsv}
          className="px-3 py-1.5 rounded-lg border text-slate-600 text-sm hover:bg-slate-50"
        >
          {t(lang, 'common.exportCsv')}
        </button>
        <span className="ml-auto text-xs text-slate-400">
          {t(lang, 'persons.total')}：{filtered.length}
        </span>
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

      {/* 时代筛选（带分面计数） */}
      <FilterChips
        label={t(lang, 'explore.era')}
        options={ERAS.map((e) => ({ value: e.key, label: t(lang, e.uiKey), count: facets.era.get(e.key) || 0 }))}
        value={era}
        onChange={(v) => setEra(v || 'all')}
        allValue="all"
        allLabel={t(lang, 'timeline.eraAll')}
      />

      {/* 国籍筛选（带分面计数） */}
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
        share={false}
        filters={[
          ...(era !== 'all'
            ? [{ key: 'era', label: t(lang, ERAS.find((e) => e.key === era)!.uiKey), onRemove: () => setEra('all') }]
            : []),
          ...(nationality !== 'all'
            ? [{ key: 'nationality', label: nationality, onRemove: () => setNationality('all') }]
            : [])
        ]}
        onClear={() => {
          setEra('all');
          setNationality('all');
          setQ('');
          setSort('influence');
          setDir('desc');
        }}
      />

      {/* 排序 + 升降序 */}
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
      </div>

      {/* 结果网格 */}
      {filtered.length === 0 ? (
        <EmptyState title={t(lang, 'persons.noResult')} hint={t(lang, 'common.emptyHint')} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((p) => (
            <PersonCard key={p.id} person={p} lang={lang} />
          ))}
        </div>
      )}
    </div>
  );
}
