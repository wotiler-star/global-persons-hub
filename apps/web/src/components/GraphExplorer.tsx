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

  // 可搜索选择器状态
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return persons.slice(0, 8);
    return persons.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, persons]);

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

  const centerPerson = persons.find((p) => p.slug === center);

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
