'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { pickText, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { DOMAIN_LABELS, type Person, type Relation, type Domain } from '@gph/types';

const MAX = 3;

type Cell = string | React.ReactNode;

/* —— 确定性渐变小头像（与画廊 PersonPortrait 同款调色板/哈希） —— */
const PALETTES: [string, string][] = [
  ['#6366f1', '#8b5cf6'],
  ['#0ea5e9', '#22d3ee'],
  ['#f43f5e', '#fb7185'],
  ['#10b981', '#34d399'],
  ['#f59e0b', '#fbbf24'],
  ['#ec4899', '#f472b6'],
  ['#8b5cf6', '#6366f1'],
  ['#14b8a6', '#2dd4bf'],
  ['#ef4444', '#f97316'],
  ['#3b82f6', '#6366f1'],
  ['#a855f7', '#d946ef'],
  ['#06b6d4', '#3b82f6']
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function Avatar({ person, lang, size = 'w-14 h-14 text-xl' }: { person: Person; lang: Lang; size?: string }) {
  const name = pickText(person.names, lang);
  const real = person.imageUrl || person.images?.[0];
  const [c1, c2] = PALETTES[hash(person.slug || name) % PALETTES.length];
  if (real) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={real} alt={name} className={`${size} rounded-full object-cover border shrink-0`} />;
  }
  return (
    <div
      className={`${size} rounded-full flex items-center justify-center text-white font-bold shrink-0 select-none`}
      style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
    >
      {(name || '?').trim().charAt(0).toUpperCase()}
    </div>
  );
}

/* —— 年份解析与本地化（容忍负数 ISO：-0055-01-01 → -55） —— */
function parseYear(s?: string): number | null {
  if (!s) return null;
  const m = String(s).match(/^(-?\d{1,4})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return Number.isFinite(y) ? y : null;
}

function formatYear(y: number, lang: Lang): string {
  if (y < 0) {
    const bce = t(lang, 'life.bce');
    return lang === 'zh' || lang === 'ja' ? `${bce}${Math.abs(y)}` : `${Math.abs(y)} ${bce}`;
  }
  return String(y);
}

function Row({ label, values, wrap }: { label: string; values: Cell[]; wrap?: boolean }) {
  return (
    <div
      className="grid gap-3 mt-3 items-start"
      style={{ gridTemplateColumns: `160px repeat(${values.length}, minmax(180px, 1fr))` }}
    >
      <div className="text-sm font-medium text-slate-500 pt-1">{label}</div>
      {values.map((v, i) => (
        <div key={i} className={`text-sm ${wrap ? 'leading-relaxed' : ''}`}>
          {v}
        </div>
      ))}
    </div>
  );
}

/* —— 数值条形对比单元：pct 相对最大值，best 高亮 —— */
function Bar({ pct, text, best }: { pct: number; text: string; best: boolean }) {
  return (
    <div>
      <div className={`text-sm font-semibold ${best ? 'text-emerald-600' : 'text-slate-700'}`}>
        {text}
        {best && <span className="ml-1 text-[10px] align-middle">★</span>}
      </div>
      <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${best ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-indigo-300 to-indigo-400'}`}
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
    </div>
  );
}

function relName(r: Relation, lang: Lang): string {
  const nm = (r as any).targetName as Partial<Record<Lang, string>> | undefined;
  if (nm) {
    const s = pickText(nm, lang);
    if (s) return s;
  }
  const slug = (r as any).targetSlug as string | undefined;
  return slug || r.targetId;
}

/**
 * 人物对比工具（Stage 31 升级版）：
 * - 表头人物卡带确定性渐变头像 + 可点姓名跳详情；
 * - 影响力 / 净资产 条形可视化，最高值 emerald 高亮 ★；
 * - 新增「寿命」行（在世人物显示当前年龄 + 在世徽标，公元前年份 13 语本地化）；
 * - 新增「主要成就」行（各取前 3 条）；
 * - 空态提供按领域影响力自动生成的「热门对比」一键预设；
 * - URL 深链 ?ids= 可分享。纯客户端交互，零新增依赖。
 */
export default function CompareExplorer({
  lang,
  allPersons,
  initialIds
}: {
  lang: Lang;
  allPersons: Person[];
  initialIds: string[];
}) {
  const router = useRouter();
  const bySlug = useMemo(() => new Map(allPersons.map((p) => [p.slug, p])), [allPersons]);

  const [selected, setSelected] = useState<Person[]>(() =>
    initialIds.map((id) => bySlug.get(id)).filter((p): p is Person => Boolean(p))
  );
  const [q, setQ] = useState('');

  // 选中变更 → 同步 URL（可分享、可回退）
  useEffect(() => {
    const ids = selected.map((p) => p.slug).join(',');
    router.replace(`/${lang}/compare${ids ? `?ids=${ids}` : ''}`, { scroll: false });
  }, [selected, lang, router]);

  const matches = useMemo(() => {
    const sel = new Set(selected.map((p) => p.slug));
    const term = q.trim().toLowerCase();
    return allPersons
      .filter((p) => !sel.has(p.slug))
      .filter((p) => {
        if (!term) return true;
        const name = pickText(p.names, lang).toLowerCase();
        const occ = (pickText(p.occupations, lang) || '').toLowerCase();
        return name.includes(term) || occ.includes(term);
      })
      .slice(0, 8);
  }, [q, selected, allPersons, lang]);

  const add = (p: Person) =>
    setSelected((prev) => {
      if (prev.length >= MAX || prev.some((x) => x.slug === p.slug)) return prev;
      return [...prev, p];
    });
  const remove = (slug: string) => setSelected((prev) => prev.filter((x) => x.slug !== slug));
  const clear = () => setSelected([]);

  // 热门对比预设：各领域按影响力取 Top2 组成对（每人只出现一次），最多 4 组
  const presets = useMemo(() => {
    const doms: Domain[] = ['academic', 'tech', 'business', 'art', 'politics', 'music', 'sports', 'film'];
    const used = new Set<string>();
    const out: [Person, Person][] = [];
    for (const d of doms) {
      const top = allPersons
        .filter((p) => p.domains.includes(d) && !used.has(p.slug))
        .sort((a, b) => (b.metrics?.influence ?? 0) - (a.metrics?.influence ?? 0))
        .slice(0, 2);
      if (top.length === 2) {
        out.push([top[0], top[1]]);
        top.forEach((p) => used.add(p.slug));
      }
      if (out.length >= 4) break;
    }
    return out;
  }, [allPersons]);

  // 共同领域（所有选中人物的领域交集）
  const sharedDomains = useMemo(() => {
    if (selected.length < 2) return [] as Domain[];
    const first = new Set(selected[0].domains);
    const rest = selected.slice(1);
    const inter = new Set<Domain>(
      [...first].filter((d) => rest.every((p) => p.domains.includes(d)))
    );
    return [...inter];
  }, [selected]);

  // 共同关联人物（关系 targetId 的交集）
  const sharedRelationNames = useMemo(() => {
    if (selected.length < 2) return [] as string[];
    const first = new Set(selected[0].relations.map((r) => r.targetId));
    const rest = selected.slice(1);
    const inter = new Set<string>(
      [...first].filter((id) =>
        rest.every((p) => (p.relations || []).some((r) => r.targetId === id))
      )
    );
    const ids = [...inter];
    if (!ids.length) return [];
    const names: string[] = [];
    for (const r of selected[0].relations || []) {
      if (ids.includes(r.targetId)) {
        const n = relName(r, lang);
        if (n && !names.includes(n)) names.push(n);
      }
    }
    return names;
  }, [selected, lang]);

  // —— 数值行数据（影响力 / 净资产 最大值，用于条形归一化） ——
  const maxInfluence = Math.max(...selected.map((p) => p.metrics?.influence ?? 0), 0);
  const maxNetWorth = Math.max(...selected.map((p) => p.metrics?.netWorth ?? 0), 0);
  const hasNetWorth = selected.some((p) => (p.metrics?.netWorth ?? 0) > 0);

  const thisYear = new Date().getFullYear();

  const cols = `160px repeat(${Math.max(selected.length, 1)}, minmax(180px, 1fr))`;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">{t(lang, 'compare.title')}</h1>
      <p className="text-slate-500 mt-1">{t(lang, 'compare.subtitle')}</p>

      {/* 搜索选择区 */}
      <div className="mt-6 relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t(lang, 'compare.select')}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
        {q.trim() && matches.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-72 overflow-auto">
            {matches.map((p) => (
              <li key={p.slug}>
                <button
                  onClick={() => {
                    add(p);
                    setQ('');
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center gap-3"
                >
                  <Avatar person={p} lang={lang} size="w-8 h-8 text-sm" />
                  <span className="font-medium text-sm">{pickText(p.names, lang)}</span>
                  <span className="text-xs text-slate-400 truncate ml-auto">{pickText(p.occupations, lang)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="text-xs text-slate-400 mt-1 flex items-center gap-3">
        <span>{t(lang, 'compare.maxHint')} · {selected.length}/{MAX}</span>
        {selected.length > 0 && (
          <button onClick={clear} className="text-indigo-600 hover:underline">
            {t(lang, 'compare.clear')}
          </button>
        )}
      </div>

      {selected.length < 2 ? (
        <div className="mt-10 text-center">
          <p className="text-slate-500">{t(lang, 'compare.empty')}</p>
          {presets.length > 0 && (
            <div className="mt-6">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                {t(lang, 'compare.presets')}
              </div>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {presets.map(([a, b]) => (
                  <button
                    key={`${a.slug}-${b.slug}`}
                    onClick={() => setSelected([a, b])}
                    className="group flex items-center gap-2 px-3 py-2 rounded-full border bg-white hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-sm"
                  >
                    <Avatar person={a} lang={lang} size="w-6 h-6 text-[11px]" />
                    <span className="font-medium">{pickText(a.names, lang)}</span>
                    <span className="text-slate-400 text-xs">vs</span>
                    <span className="font-medium">{pickText(b.names, lang)}</span>
                    <Avatar person={b} lang={lang} size="w-6 h-6 text-[11px]" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <div className="min-w-[640px]">
            {/* 表头：人物概览卡（头像 + 可点姓名跳详情） */}
            <div className="grid gap-3" style={{ gridTemplateColumns: cols }}>
              <div />
              {selected.map((p) => (
                <div key={p.slug} className="border rounded-xl p-3 bg-white relative">
                  <button
                    onClick={() => remove(p.slug)}
                    className="absolute top-2 right-2 text-[11px] text-slate-400 hover:text-red-500"
                  >
                    {t(lang, 'compare.remove')}
                  </button>
                  <div className="flex items-center gap-3">
                    <Avatar person={p} lang={lang} />
                    <div className="min-w-0">
                      <Link
                        href={`/${lang}/person/${p.slug}`}
                        className="font-semibold hover:text-indigo-600 hover:underline block truncate"
                      >
                        {pickText(p.names, lang)}
                      </Link>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {pickText(p.occupations, lang)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Row
              label={t(lang, 'compare.life')}
              values={selected.map((p) => {
                const by = parseYear(p.birth);
                const dy = parseYear(p.death);
                if (by == null) return '-';
                return `${formatYear(by, lang)} ~ ${dy != null ? formatYear(dy, lang) : ''}`;
              })}
            />
            <Row
              label={t(lang, 'compare.lifespan')}
              values={selected.map((p) => {
                const by = parseYear(p.birth);
                const dy = parseYear(p.death);
                if (by == null) return '-';
                if (dy != null) {
                  return `${dy - by} ${t(lang, 'compare.years')}`;
                }
                return (
                  <span key={p.slug}>
                    {thisYear - by} {t(lang, 'compare.years')}
                    <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 align-middle">
                      {t(lang, 'life.alive')}
                    </span>
                  </span>
                );
              })}
            />
            <Row
              label={t(lang, 'compare.nationality')}
              values={selected.map((p) => (p.nationalities || []).join('、') || '-')}
            />
            <Row
              label={t(lang, 'compare.domains')}
              values={selected.map((p) => (
                <span key={p.slug} className="flex flex-wrap gap-1">
                  {p.domains.map((d) => (
                    <span
                      key={d}
                      className={`text-[11px] px-2 py-0.5 rounded ${
                        sharedDomains.includes(d)
                          ? 'bg-emerald-100 text-emerald-700 font-medium'
                          : 'bg-indigo-50 text-indigo-700'
                      }`}
                    >
                      {DOMAIN_LABELS[d]}
                    </span>
                  ))}
                </span>
              ))}
            />
            <Row
              label={t(lang, 'compare.occupation')}
              values={selected.map((p) => pickText(p.occupations, lang) || '-')}
            />
            <Row
              label={t(lang, 'compare.influence')}
              values={selected.map((p) => {
                const v = p.metrics?.influence;
                if (v == null) return '-';
                return (
                  <Bar
                    key={p.slug}
                    pct={maxInfluence > 0 ? (v / maxInfluence) * 100 : 0}
                    text={String(v)}
                    best={v === maxInfluence && selected.filter((x) => x.metrics?.influence === maxInfluence).length === 1}
                  />
                );
              })}
            />
            {hasNetWorth && (
              <Row
                label={t(lang, 'person.netWorth')}
                values={selected.map((p) => {
                  const v = p.metrics?.netWorth;
                  if (!v) return '-';
                  return (
                    <Bar
                      key={p.slug}
                      pct={maxNetWorth > 0 ? (v / maxNetWorth) * 100 : 0}
                      text={`$${(v / 1e9).toFixed(1)}B`}
                      best={v === maxNetWorth && selected.filter((x) => x.metrics?.netWorth === maxNetWorth).length === 1}
                    />
                  );
                })}
              />
            )}
            <Row
              label={t(lang, 'compare.achievements')}
              values={selected.map((p) => {
                const map = (p as any).achievements as Partial<Record<Lang, string[]>> | undefined;
                const list = (map?.[lang] || map?.en || map?.zh || []).slice(0, 3);
                if (!list.length) return '-';
                return (
                  <ul key={p.slug} className="space-y-1">
                    {list.map((a, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-amber-500 shrink-0">•</span>
                        <span className="text-slate-700">{a}</span>
                      </li>
                    ))}
                  </ul>
                );
              })}
              wrap
            />
            <Row
              label={t(lang, 'compare.summary')}
              values={selected.map((p) => pickText(p.summary, lang) || '-')}
              wrap
            />

            {sharedDomains.length > 0 && (
              <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm">
                <b className="text-emerald-800">{t(lang, 'compare.sharedDomains')}：</b>
                <span className="text-emerald-700">
                  {sharedDomains.map((d) => DOMAIN_LABELS[d]).join('、')}
                </span>
              </div>
            )}
            {sharedRelationNames.length > 0 && (
              <div className="mt-2 p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-sm">
                <b className="text-indigo-800">{t(lang, 'compare.sharedRelations')}：</b>
                <span className="text-indigo-700">{sharedRelationNames.join('、')}</span>
              </div>
            )}

            <div className="mt-5">
              <Link
                href={`/${lang}/ask?q=${encodeURIComponent(
                  selected.map((p) => pickText(p.names, lang)).join(' vs ')
                )}`}
                className="inline-block px-4 py-2 rounded-lg bg-brand text-white text-sm hover:opacity-90"
              >
                {t(lang, 'compare.askAi')}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
