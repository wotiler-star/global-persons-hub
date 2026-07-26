'use client';

// 关系图谱探索器：选择中心人物 + 调节遍历深度，客户端按需拉取 /graph/network
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NetworkGraph from '@/components/NetworkGraph';
import { t } from '@/lib/ui';

type PickPerson = { slug: string; id: string; name: string };
type Network = { nodes: any[]; edges: any[] };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8787';

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
  const [center, setCenter] = useState<string>(initialCenter && persons.some((p) => p.slug === initialCenter) ? initialCenter : fallback);
  const [depth, setDepth] = useState<number>(Math.min(3, Math.max(1, initialDepth)));
  const [net, setNet] = useState<Network | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

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
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-600 mb-1">{t(lang, 'graph.pickCenter')}</label>
          <select
            value={center || ''}
            onChange={(e) => setCenter(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
          >
            {persons.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
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
        <NetworkGraph network={net} centerId={centerPerson?.id || center || ''} lang={lang} />
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
