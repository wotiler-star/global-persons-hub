'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { pickText, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { DOMAIN_LABELS, type Domain, type Person } from '@gph/types';
import { ERAS } from '@/lib/searchIndex';
import PersonPortrait from '@/components/PersonPortrait';
import FavoriteButton from '@/components/FavoriteButton';
import FilterChips from '@/components/FilterChips';
import SortToggle from '@/components/SortToggle';
import EmptyState from '@/components/EmptyState';
import { useQuerySync } from '@/lib/useQuerySync';

type DomainFilter = Domain | 'all';
type SortMode = 'influence' | 'name';

interface Props {
  items: Person[];
  lang: Lang;
  initialDomain?: string;
  initialEra?: string;
  initialSort?: string;
}

/** 按出生年归类时代（与 searchIndex ERAS 一致） */
function eraOf(y: number | null): string {
  if (y === null) return '';
  for (const e of ERAS) if (y >= e.from && y <= e.to) return e.key;
  return '';
}

export default function GalleryExplorer({
  items,
  lang,
  initialDomain = 'all',
  initialEra = 'all',
  initialSort = 'influence'
}: Props) {
  const [domain, setDomain] = useState<DomainFilter>(initialDomain as DomainFilter);
  const [era, setEra] = useState<string>(initialEra);
  const [sort, setSort] = useState<SortMode>(initialSort === 'name' ? 'name' : 'influence');
  const [density, setDensity] = useState<'cozy' | 'compact'>('cozy');
  const [active, setActive] = useState<Person | null>(null);

  // —— 深链接（统一 useQuerySync）——
  useQuerySync(
    () => ({
      domain: domain === 'all' ? '' : domain,
      era: era === 'all' ? '' : era,
      sort
    }),
    ['domain', 'era', 'sort'],
    [domain, era, sort]
  );

  // 灯箱：Esc 关闭 + 锁定背景滚动
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = active ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [active]);

  // 动态领域集
  const domains = useMemo(
    () => {
      const set = new Set<Domain>();
      for (const p of items) for (const d of p.domains) set.add(d);
      return (Object.keys(DOMAIN_LABELS) as Domain[]).filter((d) => set.has(d));
    },
    [items]
  );

  const filtered = useMemo(() => {
    const arr = items.filter((p) => {
      if (domain !== 'all' && !p.domains.includes(domain)) return false;
      if (era !== 'all' && eraOf(birthYear(p)) !== era) return false;
      return true;
    });
    const out = [...arr];
    if (sort === 'name') {
      const coll = new Intl.Collator(lang, { sensitivity: 'base' });
      out.sort((a, b) => coll.compare(pickText(a.names, lang), pickText(b.names, lang)));
    } else {
      out.sort((a, b) => (b.metrics?.influence || 0) - (a.metrics?.influence || 0));
    }
    return out;
  }, [items, domain, era, sort, lang]);

  const hasFilter = domain !== 'all' || era !== 'all' || sort !== 'influence';

  const gridCols =
    density === 'compact'
      ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6'
      : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';

  return (
    <div>
      {/* 领域筛选 */}
      <FilterChips
        label={t(lang, 'explore.domain')}
        options={domains.map((d) => ({ value: d, label: DOMAIN_LABELS[d] }))}
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

      {/* 排序 + 布局密度 + 重置 */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <SortToggle
          label={`${t(lang, 'persons.sortBy')}：`}
          options={[
            { key: 'influence', label: t(lang, 'persons.byInfluence') },
            { key: 'name', label: t(lang, 'persons.byName') }
          ]}
          value={sort}
          onChange={(v) => setSort(v as SortMode)}
        />

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">{t(lang, 'gallery.density')}：</span>
          <div className="flex gap-1">
            <button
              onClick={() => setDensity('cozy')}
              className={`px-3 py-1 rounded-md text-sm border transition ${
                density === 'cozy' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              {t(lang, 'gallery.cozy')}
            </button>
            <button
              onClick={() => setDensity('compact')}
              className={`px-3 py-1 rounded-md text-sm border transition ${
                density === 'compact' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              {t(lang, 'gallery.compact')}
            </button>
          </div>
        </div>

        {hasFilter && (
          <button
            onClick={() => {
              setDomain('all');
              setEra('all');
              setSort('influence');
            }}
            className="ml-auto text-sm text-brand hover:underline"
          >
            {t(lang, 'explore.reset')}
          </button>
        )}
      </div>

      {/* 计数 */}
      <div className="text-xs text-slate-400 mb-3">
        {t(lang, 'gallery.count').replace('{n}', String(filtered.length))}
      </div>

      {/* 画廊网格 */}
      {filtered.length === 0 ? (
        <EmptyState title={t(lang, 'gallery.empty')} hint={t(lang, 'common.emptyHint')} />
      ) : (
        <div className={`grid ${gridCols} gap-3`}>
          {filtered.map((p) => {
            const name = pickText(p.names, lang);
            const occ = pickText(p.occupations, lang);
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => setActive(p)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActive(p);
                  }
                }}
                className="group relative block text-left outline-none"
              >
                <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-slate-100 ring-1 ring-black/5 transition group-hover:ring-2 group-hover:ring-brand group-focus-visible:ring-2 group-focus-visible:ring-brand">
                  <PersonPortrait person={p} lang={lang} className="absolute inset-0 w-full h-full" />
                  <Link
                    href={`/${lang}/person/${p.slug}`}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    title={t(lang, 'gallery.lightboxProfile')}
                    className="absolute top-2 left-2 z-10 w-7 h-7 rounded-full bg-white/85 hover:bg-white text-slate-700 flex items-center justify-center text-xs shadow"
                  >
                    ↗
                  </Link>
                  <FavoriteButton slug={p.slug} lang={lang} />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent p-3 pt-8">
                    <div className="text-white font-semibold text-sm leading-tight drop-shadow">{name}</div>
                    {occ && (
                      <div className="text-white/80 text-[11px] leading-tight mt-0.5 drop-shadow line-clamp-1">{occ}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 灯箱 */}
      {active && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
          onClick={() => setActive(null)}
        >
          <div
            className="relative bg-white rounded-2xl overflow-hidden max-w-md w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setActive(null)}
              aria-label="close"
              className="absolute top-2 left-2 z-20 w-8 h-8 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center"
            >
              ✕
            </button>
            <div className="relative aspect-[3/4] bg-slate-100">
              <PersonPortrait person={active} lang={lang} className="absolute inset-0 w-full h-full" />
              <FavoriteButton slug={active.slug} lang={lang} />
            </div>
            <div className="p-4 overflow-y-auto">
              <div className="text-lg font-bold pr-8">{pickText(active.names, lang)}</div>
              <div className="text-xs text-slate-500">{pickText(active.occupations, lang)}</div>
              {active.domains.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {active.domains.map((d) => (
                    <span key={d} className="text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                      {DOMAIN_LABELS[d]}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-sm text-slate-600 mt-3 line-clamp-4">{pickText(active.summary, lang)}</p>
              <Link
                href={`/${lang}/person/${active.slug}`}
                className="mt-4 block text-center bg-brand hover:opacity-90 text-white text-sm font-medium rounded-lg py-2.5 transition"
              >
                {t(lang, 'gallery.lightboxProfile')} →
              </Link>
            </div>
          </div>
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
