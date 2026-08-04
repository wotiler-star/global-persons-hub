'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { pickText, type Lang } from '@/lib/i18n';
import { t, domainLabel } from '@/lib/ui';
import { DOMAIN_LABELS, type Domain, type Person } from '@gph/types';
import { ERAS } from '@/lib/searchIndex';
import { computeFacets } from '@/lib/facets';
import FilterChips, { type ChipOption } from '@/components/FilterChips';
import ActiveFilters from '@/components/ActiveFilters';

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

// 时代预设统一复用 searchIndex.ERAS（与 Explore/Gallery 共享同一套 key，确保 ?era= 跨板块一致）

function parseYear(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const m = /^(-?\d{1,6})/.exec(iso);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return Number.isFinite(y) ? y : null;
}

function birthYear(p: Person): number | null {
  return parseYear(p.birth);
}

function deathYear(p: Person): number | null {
  return parseYear(p.death);
}

export default function TimelineExplorer({ items, lang }: Props) {
  // 仅保留有出生年的人物（时间轴以出生年为锚点）
  const timelinePersons = useMemo(
    () => items.filter((p) => birthYear(p) != null),
    [items]
  );
  // 附加解析出的生卒年，便于排序与定位
  const withYear = useMemo(
    () =>
      timelinePersons.map((p) => ({
        p,
        y: birthYear(p) as number,
        d: deathYear(p)
      })),
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

  // 浏览器前进/后退：把 URL 中的 domain/from/to 读回状态，使深链接可导航
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      const p = new URLSearchParams(window.location.search);
      const d = p.get('domain');
      setDomain(d && (d === 'all' || d in DOMAIN_LABELS) ? (d as DomainFilter) : 'all');
      const rf = Number(p.get('from'));
      const rt = Number(p.get('to'));
      if (Number.isFinite(rf)) setCFrom(rf);
      if (Number.isFinite(rt)) setCTo(rt);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  // 动态领域集（仅展示库中出现的领域）
  const domains = useMemo(() => {
    const set = new Set<Domain>();
    for (const p of items) for (const d of p.domains) set.add(d);
    return (Object.keys(DOMAIN_LABELS) as Domain[]).filter((d) => set.has(d));
  }, [items]);

  // 当前年份窗口内的人物（用于领域分面计数，使计数随滑块缩放）
  const windowPersons = useMemo(() => withYear.map((x) => x.p), [withYear]);
  const domainFacets = useMemo<Map<Domain, number>>(
    () => computeFacets(windowPersons, {}).domain,
    [windowPersons]
  );

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

  // ===== 时间轴几何：按当前筛选区间自适应缩放（窗口化视图）=====
  // 窗口边界取「当前区间 ∩ 实际数据」并留 2% 视觉边距，选中时代时人物铺满轨道
  const win = useMemo(() => {
    if (filtered.length === 0) return { lo: from, hi: to };
    let lo = Infinity;
    let hi = -Infinity;
    const nowY = new Date().getFullYear();
    for (const { y, d } of filtered) {
      if (y < lo) lo = y;
      const end = d ?? Math.min(nowY, to);
      if (end > hi) hi = end;
      if (y > hi) hi = y;
    }
    const pad = Math.max(2, Math.round((hi - lo) * 0.03));
    return { lo: lo - pad, hi: hi + pad };
  }, [filtered, from, to]);

  const span = win.hi - win.lo || 1;
  const pctOf = (y: number) => ((y - win.lo) / span) * 100;
  const step =
    span > 1200 ? 200 : span > 600 ? 100 : span > 250 ? 50 : span > 100 ? 25 : span > 40 ? 10 : 5;
  const tickStart = Math.ceil(win.lo / step) * step;
  const ticks: number[] = [];
  for (let y = tickStart; y <= win.hi; y += step) ticks.push(y);

  const nowYear = new Date().getFullYear();

  // 车道防重叠（贪心分配，考虑寿命条尾端）
  const MIN_GAP = 1.5;
  const laneLast: number[] = [];
  const lanes: number[] = [];
  const barEnds: number[] = [];
  for (const { y, d } of filtered) {
    const pc = pctOf(y);
    const endYear = d ?? Math.min(nowYear, win.hi);
    const endPc = Math.min(100, Math.max(pc + 0.6, pctOf(Math.min(endYear, win.hi))));
    barEnds.push(endPc);
    let placed = -1;
    for (let i = 0; i < laneLast.length; i++) {
      if (pc >= laneLast[i] + MIN_GAP) {
        placed = i;
        break;
      }
    }
    if (placed < 0) {
      placed = laneLast.length;
      laneLast.push(endPc);
    } else {
      laneLast[placed] = Math.max(laneLast[placed], endPc);
    }
    lanes.push(placed);
  }
  const laneCount = Math.max(1, laneLast.length);
  const LANE_H = 24;
  const railHeight = laneCount * LANE_H + 64; // 底部余量容纳悬浮卡与刻度

  // 13 语年份格式：中文/日文前置「公元前/紀元前 + 年」，其余「数字 + BCE」
  const bce = t(lang, 'life.bce');
  const fmtYear = (y: number) => {
    if (y < 0) {
      const n = -y;
      return lang === 'zh' || lang === 'ja' ? `${bce}${n}${lang === 'zh' ? '年' : '年'}` : `${n} ${bce}`;
    }
    return lang === 'zh' || lang === 'ja' ? `${y}年` : `${y}`;
  };
  const lifespanText = (y: number, d: number | null) =>
    `${fmtYear(y)} – ${d != null ? fmtYear(d) : t(lang, 'life.alive')}`;

  return (
    <div>
      {/* 领域筛选 */}
      <FilterChips
        options={domains.map((d) => ({ value: d, label: domainLabel(lang, d), count: domainFacets.get(d) || 0 }))}
        value={domain}
        onChange={(v) => setDomain((v || 'all') as DomainFilter)}
        allValue="all"
        allLabel={t(lang, 'persons.filterAll')}
      />

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
            {t(lang, e.uiKey)}
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

      {/* 已选筛选（领域 / 年代区间）+ 清空 + 复制深链接，与其他子板块统一 */}
      <ActiveFilters
        lang={lang}
        filters={[
          ...(domain !== 'all'
            ? [{ key: 'domain', label: domainLabel(lang, domain), onRemove: () => setDomain('all') }]
            : []),
          ...(activeEra !== 'all'
            ? [
                {
                  key: 'era',
                  label:
                    activeEra === 'custom'
                      ? `${fmtYear(from)} – ${fmtYear(to)}`
                      : t(lang, ERAS.find((e) => e.key === activeEra)?.uiKey || 'timeline.eraAll'),
                  onRemove: () => {
                    setCFrom(bounds.min);
                    setCTo(bounds.max);
                    setActiveEra('all');
                  }
                }
              ]
            : [])
        ]}
        onClear={() => {
          setDomain('all');
          setCFrom(bounds.min);
          setCTo(bounds.max);
          setActiveEra('all');
        }}
      />

      {/* 领域颜色图例 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
        {domains.map((d) => (
          <button
            key={d}
            onClick={() => setDomain(domain === d ? 'all' : d)}
            className={`inline-flex items-center gap-1.5 text-xs transition ${
              domain === 'all' || domain === d ? 'text-slate-600' : 'text-slate-300'
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: DOMAIN_COLOR[d], opacity: domain === 'all' || domain === d ? 1 : 0.3 }}
            />
            {domainLabel(lang, d)}
          </button>
        ))}
      </div>

      {/* 时间轴轨道（生命线视图：出生点 + 寿命条 + 富悬浮卡） */}
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
            {/* 人物生命线 */}
            {filtered.map(({ p, y, d }, i) => {
              const primary = p.domains[0];
              const name = pickText(p.names, lang);
              const color = DOMAIN_COLOR[primary] || DOMAIN_COLOR.other;
              const top = lanes[i] * LANE_H + 4;
              const leftPc = pctOf(y);
              const widthPc = Math.max(0.4, barEnds[i] - leftPc);
              const alive = d == null;
              return (
                <Link
                  key={p.id}
                  href={`/${lang}/person/${p.slug}`}
                  className="absolute group"
                  style={{ left: `${leftPc}%`, top, width: `${widthPc}%`, height: 14 }}
                >
                  {/* 寿命条（在世：渐隐尾端） */}
                  <span
                    className="absolute left-1 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full"
                    style={{
                      backgroundColor: color,
                      opacity: 0.35,
                      ...(alive
                        ? { background: `linear-gradient(to right, ${color} 60%, transparent)`, opacity: 0.3 }
                        : {})
                    }}
                  />
                  {/* 出生点 */}
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 block w-3 h-3 rounded-full ring-2 ring-white shadow-sm group-hover:scale-125 transition-transform"
                    style={{ backgroundColor: color }}
                  />
                  {/* 富悬浮卡（纯 CSS，无 JS 状态） */}
                  <span
                    className="pointer-events-none absolute left-0 top-full mt-1.5 z-20 hidden group-hover:block bg-slate-900 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap"
                  >
                    <span className="block font-semibold text-[13px]">{name}</span>
                    <span className="block text-slate-300 mt-0.5">{lifespanText(y, d)}</span>
                    <span className="mt-1 inline-flex items-center gap-1 text-slate-300">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      {domainLabel(lang, primary)}
                    </span>
                  </span>
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
          {filtered.map(({ p, y, d }) => {
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
                      {lifespanText(y, d)} · {domainLabel(lang, primary)}
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
