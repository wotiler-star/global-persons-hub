'use client';

// 关系图谱探索器（Stage 33 升级）：可搜索中心人物选择器（带渐变头像下拉）+
// 遍历深度调节 + 客户端按需拉取 /graph/network + 「设为中心」联动。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import NetworkGraph from '@/components/NetworkGraph';
import { t } from '@/lib/ui';

type PickPerson = { slug: string; id: string; name: string };
type Network = { nodes: any[]; edges: any[] };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8787';

// 与 PersonPortrait 一致的调色板
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

function Avatar({ slug, name, size = 28 }: { slug: string; name: string; size?: number }) {
  const [c1, c2] = PALETTES[hash(slug || name) % PALETTES.length];
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-bold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.45,
        background: `linear-gradient(135deg, ${c1}, ${c2})`
      }}
    >
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

export default function GraphExplorer({
  lang,
  persons,
  initialCenter,
  initialDepth = 2
}: {
  lang: string;
  persons: PickPerson[];
  initialCenter?: string;
  initialDepth?: number;
}) {
  const router = useRouter();
  const fallback = persons[0]?.slug;
  const [center, setCenter] = useState<string>(
    initialCenter && persons.some((p) => p.slug === initialCenter) ? initialCenter : fallback
  );
  const [depth, setDepth] = useState<number>(Math.min(3, Math.max(1, initialDepth)));
  const [net, setNet] = useState<Network | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  // Stage 37+：最短关系路径查询
  const [toSlug, setToSlug] = useState<string>('');
  const [toQuery, setToQuery] = useState('');
  const [toOpen, setToOpen] = useState(false);
  const [path, setPath] = useState<Network | null>(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [pathErr, setPathErr] = useState<string | null>(null);
  const toBoxRef = useRef<HTMLDivElement | null>(null);

  // 可搜索选择器状态
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return persons.slice(0, 8);
    return persons.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, persons]);

  const toMatches = useMemo(() => {
    const q = toQuery.trim().toLowerCase();
    if (!q) return persons.slice(0, 8);
    return persons.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [toQuery, persons]);

  // 点击外部关闭下拉
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(`${API_BASE}/graph/network/${encodeURIComponent(center)}?depth=${depth}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: Network) => {
        if (!cancelled) setNet({ nodes: d.nodes || [], edges: d.edges || [] });
      })
      .catch(() => {
        if (!cancelled) setErr(t(lang, 'graph.empty'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [center, depth, lang]);

  // 深链接：把当前选择同步到 URL（可分享，无整页刷新）
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('center', center);
    url.searchParams.set('depth', String(depth));
    window.history.replaceState({}, '', url.toString());
  }, [center, depth]);

  // 切换中心/目标时清除旧路径结果
  useEffect(() => {
    setPath(null);
    setPathErr(null);
  }, [center, toSlug]);

  const centerPerson = persons.find((p) => p.slug === center);

  // Stage 37+：查找两人之间最短关系路径
  const findPath = () => {
    if (!toSlug || !center) return;
    setPathLoading(true);
    setPathErr(null);
    fetch(`${API_BASE}/graph/path/${encodeURIComponent(center)}/${encodeURIComponent(toSlug)}`)
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then((d: Network) => setPath({ nodes: d.nodes || [], edges: d.edges || [] }))
      .catch(() => setPathErr(t(lang, 'graph.pathNone')))
      .finally(() => setPathLoading(false));
  };
  const swapPath = () => {
    if (!toSlug) return;
    const c = center;
    setCenter(toSlug);
    setToSlug(c);
    setToOpen(false);
    setToQuery('');
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-4">
        <div className="flex-1 relative" ref={boxRef}>
          <label className="block text-sm font-medium text-slate-600 mb-1">{t(lang, 'graph.pickCenter')}</label>
          <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
            {centerPerson && <Avatar slug={centerPerson.slug} name={centerPerson.name} size={24} />}
            <input
              value={open ? query : centerPerson?.name || ''}
              placeholder={t(lang, 'compare.select')}
              onFocus={() => {
                setOpen(true);
                setQuery('');
              }}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              className="w-full text-sm outline-none bg-transparent"
            />
            <svg viewBox="0 0 20 20" className="w-4 h-4 text-slate-400 shrink-0" fill="currentColor">
              <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </div>
          {open && matches.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-lg max-h-72 overflow-auto py-1">
              {matches.map((p) => (
                <li key={p.slug}>
                  <button
                    onClick={() => {
                      setCenter(p.slug);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-indigo-50 ${
                      p.slug === center ? 'bg-indigo-50/60 text-indigo-700 font-medium' : 'text-slate-700'
                    }`}
                  >
                    <Avatar slug={p.slug} name={p.name} />
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="sm:w-56">
          <label className="block text-sm font-medium text-slate-600 mb-1">
            {t(lang, 'graph.depth')}：<b>{depth}</b>
          </label>
          <input
            type="range"
            min={1}
            max={3}
            step={1}
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="w-full accent-indigo-600"
          />
          <p className="text-xs text-slate-400 mt-0.5">{t(lang, 'graph.depthHint')}</p>
        </div>
      </div>

      {/* Stage 37+：最短关系路径查询控件 */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4 mt-3 p-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40">
        <p className="sm:w-full text-[11px] leading-relaxed text-slate-500">
          💡 {t(lang, 'graph.pathTip')}
        </p>
        <div className="flex-1 relative" ref={toBoxRef}>
          <label className="block text-sm font-medium text-slate-600 mb-1">
            {t(lang, 'graph.from')}：<b className="text-indigo-700">{centerPerson?.name || center}</b>
          </label>
          <label className="block text-sm font-medium text-slate-600 mb-1 mt-2">{t(lang, 'graph.to')}</label>
          <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
            {toSlug && (() => {
              const tp = persons.find((p) => p.slug === toSlug);
              return tp ? <Avatar slug={tp.slug} name={tp.name} size={24} /> : null;
            })()}
            <input
              value={toOpen ? toQuery : (persons.find((p) => p.slug === toSlug)?.name || '')}
              placeholder={t(lang, 'graph.target')}
              onFocus={() => {
                setToOpen(true);
                setToQuery('');
              }}
              onChange={(e) => {
                setToQuery(e.target.value);
                setToOpen(true);
              }}
              className="w-full text-sm outline-none bg-transparent"
            />
            <svg viewBox="0 0 20 20" className="w-4 h-4 text-slate-400 shrink-0" fill="currentColor">
              <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </div>
          {toOpen && toMatches.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full rounded-xl border bg-white shadow-lg max-h-72 overflow-auto py-1">
              {toMatches.map((p) => (
                <li key={p.slug}>
                  <button
                    onClick={() => {
                      setToSlug(p.slug);
                      setToOpen(false);
                      setToQuery('');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-indigo-50 ${
                      p.slug === toSlug ? 'bg-indigo-50/60 text-indigo-700 font-medium' : 'text-slate-700'
                    }`}
                  >
                    <Avatar slug={p.slug} name={p.name} />
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={findPath}
            disabled={!toSlug || pathLoading}
            className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pathLoading ? '…' : t(lang, 'graph.findPath')}
          </button>
          <button
            onClick={swapPath}
            disabled={!toSlug}
            title={t(lang, 'graph.swap')}
            className="text-sm px-3 py-2 rounded-lg border text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ⇄
          </button>
        </div>
      </div>

      {loading && (
        <div className="w-full rounded-xl border bg-slate-50 py-14 text-center text-sm text-slate-400">
          …
        </div>
      )}
      {!loading && err && (
        <div className="w-full rounded-xl border bg-slate-50 py-14 text-center text-sm text-slate-400">{err}</div>
      )}
      {!loading && !err && net && (
        <NetworkGraph
          network={net}
          centerId={centerPerson?.id || center || ''}
          lang={lang}
          onRecenter={(slug) => {
            if (persons.some((p) => p.slug === slug)) setCenter(slug);
          }}
        />
      )}

      {/* Stage 37+：最短关系路径结果 */}
      {!loading && !err && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">{t(lang, 'graph.pathTitle')}</h3>
          {pathLoading && (
            <div className="w-full rounded-xl border bg-slate-50 py-10 text-center text-sm text-slate-400">…</div>
          )}
          {!pathLoading && pathErr && (
            <div className="w-full rounded-xl border bg-slate-50 py-10 text-center text-sm text-slate-400">{pathErr}</div>
          )}
          {!pathLoading && !pathErr && path && path.nodes.length === 0 && (
            <div className="w-full rounded-xl border bg-slate-50 py-10 text-center text-sm text-slate-400">
              {t(lang, 'graph.pathHint')}
            </div>
          )}
          {!pathLoading && !pathErr && path && path.nodes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {path.nodes.map((n, i) => {
                const isLast = i === path.nodes.length - 1;
                const next = isLast ? null : path.nodes[i + 1];
                const e = next
                  ? path.edges.find(
                      (x) =>
                        [x.source, x.target].sort().join('|') === [n.id, next.id].sort().join('|')
                    )
                  : null;
                const lbl = e ? (e.kinRel ? t(lang, `kin.${e.kinRel}`) : e.label) : '';
                return (
                  <span key={n.id} className="contents">
                    <span className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 shadow-sm">
                      <Avatar slug={n.slug || n.id} name={n.name} size={28} />
                      <span className="text-sm font-medium text-slate-800">{n.name}</span>
                    </span>
                    {!isLast && (
                      <span className="flex flex-col items-center px-0.5 text-slate-400">
                        <span className="text-base leading-none">→</span>
                        {lbl && <span className="text-[10px] text-indigo-500">{lbl}</span>}
                      </span>
                    )}
                  </span>
                );
              })}
              <span className="ml-1 text-xs text-slate-500">
                · {path.nodes.length - 1} {t(lang, 'graph.hop')}
              </span>
            </div>
          )}
        </div>
      )}

      {centerPerson && (
        <div className="mt-4">
          <button
            onClick={() => router.push(`/${lang}/person/${centerPerson.slug}`)}
            className="text-sm px-3 py-2 rounded-lg border text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
          >
            {t(lang, 'graph.viewDetail')} → {centerPerson.name}
          </button>
        </div>
      )}
    </div>
  );
}
