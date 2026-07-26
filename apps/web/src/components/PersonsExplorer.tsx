'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { pickText, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { formatMoney } from '@/lib/format';
import RankMedal from '@/components/RankMedal';
import { DOMAIN_LABELS, type Domain, type Person } from '@gph/types';

export type SortMode = 'influence' | 'netWorth' | 'name';
export type DomainFilter = Domain | 'all';

interface Props {
  items: Person[];
  lang: Lang;
  initialDomain?: DomainFilter;
  initialSort?: SortMode;
}

export default function PersonsExplorer({ items, lang, initialDomain = 'all', initialSort = 'influence' }: Props) {
  const [domain, setDomain] = useState<DomainFilter>(initialDomain);
  const [sort, setSort] = useState<SortMode>(initialSort);

  // 深链接：筛选/排序变化同步到 URL（replaceState，无整页刷新、可分享）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (domain === 'all') params.delete('domain');
    else params.set('domain', domain);
    if (sort === 'influence') params.delete('sort');
    else params.set('sort', sort);
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [domain, sort]);

  // 动态领域集（仅展示库中出现的领域）
  const domains = useMemo(() => {
    const set = new Set<Domain>();
    for (const p of items) for (const d of p.domains) set.add(d);
    return (Object.keys(DOMAIN_LABELS) as Domain[]).filter((d) => set.has(d));
  }, [items]);

  const sorted = useMemo(() => {
    const filtered = domain === 'all' ? items : items.filter((p) => p.domains.includes(domain));
    const arr = [...filtered];
    if (sort === 'influence') {
      arr.sort((a, b) => (b.metrics?.influence || 0) - (a.metrics?.influence || 0));
    } else if (sort === 'netWorth') {
      arr.sort((a, b) => (b.metrics?.netWorth || 0) - (a.metrics?.netWorth || 0));
    } else {
      const coll = new Intl.Collator(lang, { sensitivity: 'base' });
      arr.sort((a, b) => coll.compare(pickText(a.names, lang), pickText(b.names, lang)));
    }
    return arr;
  }, [items, domain, sort, lang]);

  const sortOptions: { key: SortMode; label: string }[] = [
    { key: 'influence', label: t(lang, 'persons.byInfluence') },
    { key: 'netWorth', label: t(lang, 'persons.byWealth') },
    { key: 'name', label: t(lang, 'persons.byName') }
  ];

  return (
    <div>
      {/* 分类筛选 */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setDomain('all')}
          className={`px-3 py-1 rounded-full border text-sm transition ${
            domain === 'all' ? 'bg-brand text-white border-brand' : 'bg-white text-slate-700 hover:bg-indigo-50'
          }`}
        >
          {t(lang, 'persons.filterAll')}
        </button>
        {domains.map((d) => (
          <button
            key={d}
            onClick={() => setDomain(d)}
            className={`px-3 py-1 rounded-full border text-sm transition ${
              domain === d ? 'bg-brand text-white border-brand' : 'bg-white text-slate-700 hover:bg-indigo-50'
            }`}
          >
            {DOMAIN_LABELS[d]}
          </button>
        ))}
      </div>

      {/* 排序切换 */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-sm text-slate-500">{t(lang, 'persons.sortBy')}：</span>
        <div className="flex gap-1">
          {sortOptions.map((o) => (
            <button
              key={o.key}
              onClick={() => setSort(o.key)}
              className={`px-3 py-1 rounded-md text-sm border transition ${
                sort === o.key ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-400">
          {t(lang, 'persons.total')}：{sorted.length}
        </span>
      </div>

      {/* 排行榜列表 */}
      {sorted.length === 0 ? (
        <p className="text-slate-500 mt-6">{t(lang, 'persons.noResult')}</p>
      ) : (
        <ol className="space-y-2">
          {sorted.map((p, i) => {
            const wealth = formatMoney(p.metrics?.netWorth);
            const influence = p.metrics?.influence ?? 0;
            return (
              <li
                key={p.id}
                className="flex items-center gap-4 border rounded-xl bg-white p-3 hover:shadow-sm transition"
              >
                <RankMedal rank={i + 1} />
                <div className="flex-1 min-w-0">
                  <Link href={`/${lang}/person/${p.slug}`} className="font-semibold hover:text-brand">
                    {pickText(p.names, lang)}
                  </Link>
                  <div className="text-xs text-slate-500 truncate">{pickText(p.occupations, lang)}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.domains.map((d) => (
                      <span key={d} className="text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                        {DOMAIN_LABELS[d]}
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
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
