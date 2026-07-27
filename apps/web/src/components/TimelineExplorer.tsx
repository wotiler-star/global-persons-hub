'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { pickText, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { DOMAIN_LABELS, type Domain, type Person } from '@gph/types';

export type DomainFilter = Domain | 'all';

interface Props {
  items: Person[];
  lang: Lang;
}

// 领域主色（仅用于时间轴标记着色，零依赖）
const DOMAIN_COLOR: Record<Domain, string> = {
  film: '#ef4444',
  business: '#f59e0b',
  academic: '#3b82f6',
  sports: '#10b981',
  music: '#a855f7',
  politics: '#ec4899',
  tech: '#06b6d4',
  art: '#f97316',
  other: '#64748b'
};

// 时代预设（出生年区间，含公元前负数）
const ERAS: { key: string; labelKey: string; from: number; to: number }[] = [
  { key: 'ancient', labelKey: 'timeline.eraAncient', from: -100000, to: 499 },
  { key: 'medieval', labelKey: 'timeline.eraMedieval', from: 500, to: 1499 },
  { key: 'modern', labelKey: 'timeline.eraModern', from: 1500, to: 1899 },
  { key: 'contemporary', labelKey: 'timeline.eraContemporary', from: 1900, to: 100000 }
];

function birthYear(p: Person): number | null {
  if (!p.birth) return null;
  const y = parseInt(p.birth.slice(0, 4), 10);
  return Number.isFinite(y) ? y : null;
}

export default function TimelineExplorer({ items, lang }: Props) {
  // 仅保留有出生年的人物（时间轴以出生年为锚点）
  const timelinePersons = useMemo(
    () => items.filter((p) => birthYear(p) != null),
    [items]
  );
  // 附加解析出的出生年，便于排序与定位
  const withYear = useMemo(
    () => timelinePersons.map((p) => ({ p, y: birthYear(p) as number })),
    [timelinePersons]
  );

  // 全局年份边界（滑块范围稳定，不随筛选变化）
  const bounds = useMemo(() => {
    if (withYear.length === 0) return { min: 0, max: 0 };
    let min = Infinity;
    let max = -Infinity;
    for (const { y } of withYear) {
      if (y < min) min = y;
      if (y > max) max = y;
    }
    return { min, max };
  }, [withYear]);

  // 初始化（含 URL 深链读取）
  const initial = (() => {
    if (typeof window === 'undefined') return { domain: 'all' as DomainFilter, from: bounds.min, to: bounds.max, custom: false };
    const sp = new URLSearchParams(window.location.search);
    const d = sp.get('domain');
    const domain: DomainFilter = d && (d === 'all' || d in DOMAIN_LABELS) ? (d as DomainFilter) : 'all';
    const rf = Number(sp.get('from'));
    const rt = Number(sp.get('to'));
    const custom = Number.isFinite(rf) && Number.isFinite(rt);
    return {
      domain,
      from: custom ? rf : bounds.min,
      to: custom ? rt : bounds.max,
      custom
    };
  })();

  const [domain, setDomain] = useState<DomainFilter>(initial.domain);
  const [cFrom, setCFrom] = useState<number>(initial.from);
  const [cTo, setCTo] = useState<number>(initial.to);
  const [activeEra, setActiveEra] = useState<string>(initial.custom ? 'custom' : 'all');

  // 深链：domain/from/to 同步到 URL
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (domain === 'all') p.delete('domain');
    else p.set('domain', domain);
    p.set('from', String(cFrom));
    p.set('to', String(cTo));
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [domain, cFrom, cTo]);

  // 动态领域集（仅展示库中出现的领域）
  const domains = useMemo(() => {
    const set = new Set<Domain>();
    for (const p of items) for (const d of p.domains) set.add(d);
    return (Object.keys(DOMAIN_LABELS) as Domain[]).filter((d) => set.has(d));
  }, [items]);

  // 当前筛选区间
  const from = cFrom;
  const to = cTo;

  const filtered = useMemo(
    () =>
      withYear
        .filter(
          ({ p, y }) =>
            (domain === 'all' || p.domains.includes(domain)) && y >= from && y <= to
        )
        .sort((a, b) => a.y - b.y),
    [withYear, domain, from, to]
  );

  // 时间轴几何
  const span = bounds.max - bounds.min || 1;
  const pctOf = (y: number) => ((y - bounds.min) / span) * 100;
  const step =
    span > 1200 ? 200 : span > 600 ? 100 : span > 250 ? 50 : 25;
  const tickStart = Math.ceil(bounds.min / step) * step;
  const ticks: number[] = [];
  for (let y = tickStart; y <= bounds.max; y += step) ticks.push(y);

  // 车道防重叠（贪心分配）
  const MIN_GAP = 2.2;
  const laneLast: number[] = [];
  const lanes: number[] = [];
  for (const { y } of filtered) {
    const pc = pctOf(y);
    let placed = -1;
    for (let i = 0; i < laneLast.length; i++) {
      if (pc >= laneLast[i] + MIN_GAP) {
        placed = i;
        break;
      }
    }
    if (placed < 0) {
      placed = laneLast.length;
      laneLast.push(pc);
    } else {
      laneLast[placed] = pc;
    }
    lanes.push(placed);
  }
  const laneCount = Math.max(1, laneLast.length);
  const LANE_H = 24;
  const railHeight = laneCount * LANE_H + 30;

  const fmtYear = (y: number) => (y < 0 ? `${-y} BCE` : `${y}`);

  return (
    <div>
      {/* 领域筛选 */}
      <div className="flex flex-wrap gap-2 mb-4">
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

      {/* 时代预设 + 起止年滑块 */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={() => {
            setCFrom(bounds.min);
            setCTo(bounds.max);
            setActiveEra('all');
          }}
          className={`px-3 py-1 rounded-md border text-sm transition ${
            activeEra === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 hover:bg-slate-100'
          }`}
        >
          {t(lang, 'timeline.eraAll')}
        </button>
        {ERAS.map((e) => (
          <button
            key={e.key}
            onClick={() => {
              setCFrom(e.from);
              setCTo(e.to);
              setActiveEra(e.key);
            }}
            className={`px-3 py-1 rounded-md border text-sm transition ${
              activeEra === e.key ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {t(lang, e.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-2">
        <label className="text-sm text-slate-500">
          {t(lang, 'timeline.rangeFrom')}：
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            value={from}
            onChange={(ev) => {
              const v = Math.min(Number(ev.target.value), to);
              setCFrom(v);
              setActiveEra('custom');
            }}
            className="align-middle ml-1"
          />
          <span className="ml-1 font-mono text-slate-700">{fmtYear(from)}</span>
        </label>
        <label className="text-sm text-slate-500">
          {t(lang, 'timeline.rangeTo')}：
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            value={to}
            onChange={(ev) => {
              const v = Math.max(Number(ev.target.value), from);
              setCTo(v);
              setActiveEra('custom');
            }}
            className="align-middle ml-1"
          />
          <span className="ml-1 font-mono text-slate-700">{fmtYear(to)}</span>
        </label>
        <span className="ml-auto text-xs text-slate-400">{t(lang, 'timeline.hint')}</span>
      </div>

      {/* 时间轴轨道 */}
      {withYear.length === 0 ? (
        <p className="text-slate-500 mt-6">{t(lang, 'persons.noResult')}</p>
      ) : (
        <div className="relative w-full overflow-x-auto border rounded-xl bg-white p-3 mb-6">
          <div className="relative" style={{ height: railHeight, minWidth: 720 }}>
            {/* 基准线 */}
            <div
              className="absolute left-0 right-0 border-t border-slate-200"
              style={{ top: railHeight - 26 }}
            />
            {/* 刻度 */}
            {ticks.map((y) => (
              <div
                key={y}
                className="absolute top-0 bottom-0 border-l border-slate-100"
                style={{ left: `${pctOf(y)}%` }}
              >
                <span className="absolute -bottom-0 left-1 text-[10px] text-slate-400 whitespace-nowrap">
                  {fmtYear(y)}
                </span>
              </div>
            ))}
            {/* 人物标记 */}
            {filtered.map(({ p, y }, i) => {
              const primary = p.domains[0];
              const name = pickText(p.names, lang);
              const color = DOMAIN_COLOR[primary] || DOMAIN_COLOR.other;
              return (
                <Link
                  key={p.id}
                  href={`/${lang}/person/${p.slug}`}
                  title={`${name} · ${t(lang, 'timeline.bornIn')} ${fmtYear(y)} · ${DOMAIN_LABELS[primary]}`}
                  className="absolute -translate-x-1/2 group"
                  style={{ left: `${pctOf(y)}%`, top: lanes[i] * LANE_H + 2 }}
                >
                  <span
                    className="block w-3 h-3 rounded-full ring-2 ring-white shadow-sm hover:scale-125 transition-transform"
                    style={{ backgroundColor: color }}
                  />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* 区间人物列表（点选查看） */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-500">
          {t(lang, 'persons.total')}：{filtered.length}
        </span>
      </div>
      {filtered.length === 0 ? (
        <p className="text-slate-500 mt-2">{t(lang, 'persons.noResult')}</p>
      ) : (
        <ol className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filtered.map(({ p, y }) => {
            const primary = p.domains[0];
            return (
              <li key={p.id}>
                <Link
                  href={`/${lang}/person/${p.slug}`}
                  className="flex items-center gap-3 border rounded-xl bg-white p-3 hover:shadow-sm transition"
                >
                  <span
                    className="flex-none w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: DOMAIN_COLOR[primary] || DOMAIN_COLOR.other }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{pickText(p.names, lang)}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {t(lang, 'timeline.bornIn')} {fmtYear(y)} · {DOMAIN_LABELS[primary]}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
