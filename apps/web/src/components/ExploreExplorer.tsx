'use client';

import { useMemo, useState } from 'react';
import { pickText, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { DOMAIN_LABELS, type Domain, type Person } from '@gph/types';
import { ERAS } from '@/lib/searchIndex';
import PersonCard from '@/components/PersonCard';
import FilterChips, { type ChipOption } from '@/components/FilterChips';
import SortToggle from '@/components/SortToggle';
import EmptyState from '@/components/EmptyState';
import { useQuerySync } from '@/lib/useQuerySync';

type DomainFilter = Domain | 'all';
type SortMode = 'influence' | 'netWorth' | 'name';

interface Props {
  items: Person[];
  lang: Lang;
  initialDomain?: string;
  initialEra?: string;
  initialNationality?: string;
  initialSort?: SortMode;
}

/** 按出生年归类时代（与 searchIndex ERAS 一致） */
function eraOf(y: number | null): string {
  if (y === null) return '';
  for (const e of ERAS) if (y >= e.from && y <= e.to) return e.key;
  return '';
}

export default function ExploreExplorer({
  items,
  lang,
  initialDomain = 'all',
  initialEra = 'all',
  initialNationality = 'all',
  initialSort = 'influence'
}: Props) {
  const [domain, setDomain] = useState<DomainFilter>(initialDomain as DomainFilter);
  const [era, setEra] = useState<string>(initialEra);
  const [nationality, setNationality] = useState<string>(initialNationality);
  const [sort, setSort] = useState<SortMode>(initialSort);

  // —— 深链接（统一 useQuerySync）——
  useQuerySync(
    () => ({
      domain: domain === 'all' ? '' : domain,
      era: era === 'all' ? '' : era,
      nationality: nationality === 'all' ? '' : nationality,
      sort
    }),
    ['domain', 'era', 'nationality', 'sort'],
    [domain, era, nationality, sort]
  );

  // 动态领域集
  const domains = useMemo<ChipOption[]>(() => {
    const set = new Set<Domain>();
    for (const p of items) for (const d of p.domains) set.add(d);
    return (Object.keys(DOMAIN_LABELS) as Domain[])
      .filter((d) => set.has(d))
      .map((d) => ({ value: d, label: DOMAIN_LABELS[d] }));
  }, [items]);

  // 动态国籍集（按频次降序）
  const nationalities = useMemo<ChipOption[]>(() => {
    const cnt = new Map<string, number>();
    for (const p of items) for (const n of p.nationalities || []) cnt.set(n, (cnt.get(n) || 0) + 1);
    return [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => ({ value: n, label: n }));
  }, [items]);

  const filtered = useMemo(() => {
    const arr = items.filter((p) => {
      if (domain !== 'all' && !p.domains.includes(domain)) return false;
      if (era !== 'all' && eraOf(birthYear(p)) !== era) return false;
      if (nationality !== 'all' && !(p.nationalities || []).includes(nationality)) return false;
      return true;
    });
    const out = [...arr];
    if (sort === 'influence') {
      out.sort((a, b) => (b.metrics?.influence || 0) - (a.metrics?.influence || 0));
    } else if (sort === 'netWorth') {
      out.sort((a, b) => (b.metrics?.netWorth || 0) - (a.metrics?.netWorth || 0));
    } else {
      const coll = new Intl.Collator(lang, { sensitivity: 'base' });
      out.sort((a, b) => coll.compare(pickText(a.names, lang), pickText(b.names, lang)));
    }
    return out;
  }, [items, domain, era, nationality, sort, lang]);

  const hasFilter = domain !== 'all' || era !== 'all' || nationality !== 'all' || sort !== 'influence';

  const sortOptions = [
    { key: 'influence', label: t(lang, 'persons.byInfluence') },
    { key: 'netWorth', label: t(lang, 'persons.byWealth') },
    { key: 'name', label: t(lang, 'persons.byName') }
  ];

  return (
    <div>
      {/* 领域筛选 */}
      <FilterChips
        label={t(lang, 'explore.domain')}
        options={domains}
        value={domain}
        onChange={(v) => setDomain((v || 'all') as DomainFilter)}
        allValue="all"
        allLabel={t(lang, 'persons.filterAll')}
      />

      {/* 时代筛选 */}
      <FilterChips
        label={t(lang, 'explore.era')}
        options={ERAS.map((e) => ({ value: e.key, label: t(lang, e.uiKey) }))}
        value={era}
        onChange={(v) => setEra(v || 'all')}
        allValue="all"
        allLabel={t(lang, 'timeline.eraAll')}
      />

      {/* 国籍 + 排序 + 重置 */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">{t(lang, 'explore.nationality')}</span>
          <select
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            className="border rounded-md px-2 py-1 text-sm bg-white text-slate-700"
          >
            <option value="all">{t(lang, 'persons.filterAll')}</option>
            {nationalities.map((n) => (
              <option key={n.value} value={n.value}>
                {n.label}
              </option>
            ))}
          </select>
        </div>

        <SortToggle
          label={`${t(lang, 'persons.sortBy')}：`}
          options={sortOptions}
          value={sort}
          onChange={(v) => setSort(v as SortMode)}
        />

        {hasFilter && (
          <button
            onClick={() => {
              setDomain('all');
              setEra('all');
              setNationality('all');
              setSort('influence');
            }}
            className="ml-auto text-sm text-brand hover:underline"
          >
            {t(lang, 'explore.reset')}
          </button>
        )}
      </div>

      {/* 结果计数 */}
      <div className="text-xs text-slate-400 mb-3">
        {t(lang, 'persons.total')}：{filtered.length}
      </div>

      {/* 卡片网格 */}
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

// 局部工具（解析出生年）
function birthYear(p: Person): number | null {
  if (!p.birth) return null;
  const m = String(p.birth).match(/^(-?\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
