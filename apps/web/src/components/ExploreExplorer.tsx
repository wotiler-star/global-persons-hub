'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { pickText, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { DOMAIN_LABELS, type Domain, type Person } from '@gph/types';
import { ERAS } from '@/lib/searchIndex';
import PersonCard from '@/components/PersonCard';

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

/** 从 ISO 日期解析出生年（支持公元前负数，如 -055 → -55） */
function birthYear(p: Person): number | null {
  if (!p.birth) return null;
  const m = String(p.birth).match(/^(-?\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** 按出生年归类时代（与 searchIndex ERAS 一致：<500 古代 / 500-1499 中世纪 / 1500-1899 近代 / ≥1900 现代） */
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
  const router = useRouter();
  const pathname = usePathname();
  const [domain, setDomain] = useState<DomainFilter>(initialDomain as DomainFilter);
  const [era, setEra] = useState<string>(initialEra);
  const [nationality, setNationality] = useState<string>(initialNationality);
  const [sort, setSort] = useState<SortMode>(initialSort);

  // 深链接：筛选/排序变化同步到 URL（replaceState，无整页刷新、可分享）
  useEffect(() => {
    const params = new URLSearchParams();
    if (domain !== 'all') params.set('domain', domain);
    if (era !== 'all') params.set('era', era);
    if (nationality !== 'all') params.set('nationality', nationality);
    if (sort !== 'influence') params.set('sort', sort);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [domain, era, nationality, sort, pathname, router]);

  // 动态领域集（仅展示库中出现的领域）
  const domains = useMemo(() => {
    const set = new Set<Domain>();
    for (const p of items) for (const d of p.domains) set.add(d);
    return (Object.keys(DOMAIN_LABELS) as Domain[]).filter((d) => set.has(d));
  }, [items]);

  // 动态国籍集（按出现频次降序，便于常用项靠前）
  const nationalities = useMemo(() => {
    const cnt = new Map<string, number>();
    for (const p of items) for (const n of p.nationalities || []) cnt.set(n, (cnt.get(n) || 0) + 1);
    return [...cnt.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n);
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

  const sortOptions: { key: SortMode; label: string }[] = [
    { key: 'influence', label: t(lang, 'persons.byInfluence') },
    { key: 'netWorth', label: t(lang, 'persons.byWealth') },
    { key: 'name', label: t(lang, 'persons.byName') }
  ];

  const chip = (active: boolean) =>
    `px-3 py-1 rounded-full border text-sm transition ${
      active ? 'bg-brand text-white border-brand' : 'bg-white text-slate-700 hover:bg-indigo-50'
    }`;

  return (
    <div>
      {/* 领域筛选 */}
      <div className="mb-3">
        <div className="text-sm text-slate-500 mb-2">{t(lang, 'explore.domain')}</div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setDomain('all')} className={chip(domain === 'all')}>
            {t(lang, 'persons.filterAll')}
          </button>
          {domains.map((d) => (
            <button key={d} onClick={() => setDomain(d)} className={chip(domain === d)}>
              {DOMAIN_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      {/* 时代筛选 */}
      <div className="mb-3">
        <div className="text-sm text-slate-500 mb-2">{t(lang, 'explore.era')}</div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setEra('all')} className={chip(era === 'all')}>
            {t(lang, 'timeline.eraAll')}
          </button>
          {ERAS.map((e) => (
            <button key={e.key} onClick={() => setEra(e.key)} className={chip(era === e.key)}>
              {t(lang, e.uiKey as any)}
            </button>
          ))}
        </div>
      </div>

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
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">{t(lang, 'persons.sortBy')}：</span>
          <div className="flex gap-1">
            {sortOptions.map((o) => (
              <button
                key={o.key}
                onClick={() => setSort(o.key)}
                className={`px-3 py-1 rounded-md text-sm border transition ${
                  sort === o.key
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

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
        <p className="text-slate-500 mt-6">{t(lang, 'persons.noResult')}</p>
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
