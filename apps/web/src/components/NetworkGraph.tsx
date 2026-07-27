'use client';

// 交互式多跳关系网络图（零依赖力导向布局）— Stage 33 升级版
// 新增：滚轮缩放 + 画布平移 + 节点拖拽、渐变 Monogram 节点、边类型图例筛选、
//       点击节点弹出操作卡（设为中心 / 查看详情）、节点/关系统计、全量 i18n。
import { useEffect, useMemo, useRef, useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/ui';

type Node = { id: string; slug: string; name: string; trustLevel: string };
type Edge = {
  source: string; target: string; type: string;
  label?: string; directed: boolean;
  /** Stage 10：亲属边（KinRelation 键，如 father/spouse），前端翻译为 13 语标签 */
  kinRel?: string;
};

const W = 720;
const H = 460;

const TRUST_COLOR: Record<string, string> = {
  pgc: '#3b5bdb',
  ugc_verified: '#0ca678',
  ugc_pending: '#f59f00',
  ai_draft: '#adb5bd'
};

const EDGE_COLOR: Record<string, string> = {
  family: '#e64980',
  mentor: '#7048e8',
  collab: '#1c7ed6',
  affiliated: '#0ca678',
  influence: '#f76707',
  rival: '#fa5252',
  other: '#94a3b8'
};

// 与 PersonPortrait / 画廊一致的 12 组渐变调色板（按 slug 哈希确定）
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

function monogram(name: string): string {
  const c = (name || '?').trim().charAt(0);
  return c ? c.toUpperCase() : '?';
}

/** 确定性伪随机（避免 SSR/CSR 水合不一致） */
function seededRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** 简易力导向布局：斥力 + 弹簧 + 中心引力，同步迭代若干轮 */
function layout(nodes: Node[], edges: Edge[], centerId: string) {
  const rand = seededRand(42);
  const pos = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => {
    if (n.id === centerId) pos.set(n.id, { x: W / 2, y: H / 2 });
    else {
      const a = (Math.PI * 2 * i) / Math.max(nodes.length, 1) + rand() * 0.5;
      const r = 120 + rand() * 90;
      pos.set(n.id, { x: W / 2 + r * Math.cos(a), y: H / 2 + r * Math.sin(a) });
    }
  });
  const vel = new Map(nodes.map((n) => [n.id, { x: 0, y: 0 }]));
  const K_REPEL = 26000;
  const K_SPRING = 0.015;
  const REST = 130;
  for (let it = 0; it < 260; it++) {
    for (const a of nodes) {
      const pa = pos.get(a.id)!;
      const va = vel.get(a.id)!;
      for (const b of nodes) {
        if (a.id === b.id) continue;
        const pb = pos.get(b.id)!;
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const d2 = Math.max(dx * dx + dy * dy, 100);
        const f = K_REPEL / d2;
        const d = Math.sqrt(d2);
        va.x += (dx / d) * f * 0.01;
        va.y += (dy / d) * f * 0.01;
      }
      va.x += (W / 2 - pa.x) * 0.002;
      va.y += (H / 2 - pa.y) * 0.002;
    }
    for (const e of edges) {
      const ps = pos.get(e.source);
      const pt = pos.get(e.target);
      if (!ps || !pt) continue;
      const dx = pt.x - ps.x;
      const dy = pt.y - ps.y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f = K_SPRING * (d - REST);
      const vs = vel.get(e.source)!;
      const vt = vel.get(e.target)!;
      vs.x += (dx / d) * f;
      vs.y += (dy / d) * f;
      vt.x -= (dx / d) * f;
      vt.y -= (dy / d) * f;
    }
    for (const n of nodes) {
      if (n.id === centerId) continue;
      const p = pos.get(n.id)!;
      const v = vel.get(n.id)!;
      p.x = Math.min(W - 46, Math.max(46, p.x + v.x));
      p.y = Math.min(H - 34, Math.max(34, p.y + v.y));
      v.x *= 0.82;
      v.y *= 0.82;
    }
  }
  return pos;
}

export default function NetworkGraph({
  network,
  centerId,
  lang,
  onRecenter
}: {
  network: { nodes: Node[]; edges: Edge[] };
  centerId: string;
  lang: string;
  /** 点击节点操作卡「设为中心」时回调（传 slug） */
  onRecenter?: (slug: string) => void;
}) {
  const router = useRouter();
  const uid = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // 视图变换：world → screen 为 translate(tx,ty) scale(k)
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  // 拖拽后节点位置覆盖
  const [override, setOverride] = useState<Map<string, { x: number; y: number }>>(new Map());
  // 边类型筛选（默认全开）
  const [offTypes, setOffTypes] = useState<Set<string>>(new Set());
  const dragRef = useRef<
    | { mode: 'node'; id: string; startX: number; startY: number; moved: boolean }
    | { mode: 'pan'; startX: number; startY: number; tx0: number; ty0: number; moved: boolean }
    | null
  >(null);

  const { nodes, edges } = network;
  const basePos = useMemo(() => layout(nodes, edges, centerId), [nodes, edges, centerId]);
  const getPos = (id: string) => override.get(id) || basePos.get(id);

  // 数据/中心变化时重置视图与选择
  useEffect(() => {
    setView({ k: 1, tx: 0, ty: 0 });
    setOverride(new Map());
    setSelected(null);
    setHover(null);
  }, [centerId, nodes.length]);

  // 去重边（无向图会出现双向重复）
  const uniqEdges = useMemo(() => {
    const seen = new Set<string>();
    return edges.filter((e) => {
      const k = [e.source, e.target].sort().join('|') + e.type;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [edges]);

  const shownEdges = useMemo(
    () => uniqEdges.filter((e) => !offTypes.has(e.type)),
    [uniqEdges, offTypes]
  );

  /** 边标签：亲属边用 kin.* 13 语词典翻译，普通边用后端 label 原文 */
  const edgeLabel = (e: Edge) => (e.kinRel ? t(lang, `kin.${e.kinRel}`) : e.label);

  const neighbor = useMemo(() => {
    const focus = hover || selected;
    if (!focus) return null;
    const s = new Set<string>([focus]);
    for (const e of shownEdges) {
      if (e.source === focus) s.add(e.target);
      if (e.target === focus) s.add(e.source);
    }
    return s;
  }, [hover, selected, shownEdges]);

  /** 屏幕坐标 → 世界坐标 */
  const toWorld = (clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    const sy = ((clientY - r.top) / r.height) * H;
    return { x: (sx - view.tx) / view.k, y: (sy - view.ty) / view.k };
  };

  // 滚轮缩放（native 非 passive 监听，避免页面滚动）
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      const sx = ((ev.clientX - r.left) / r.width) * W;
      const sy = ((ev.clientY - r.top) / r.height) * H;
      setView((v) => {
        const k2 = Math.min(3, Math.max(0.4, v.k * Math.exp(-ev.deltaY * 0.0012)));
        // 保持光标下世界点不动
        const wx = (sx - v.tx) / v.k;
        const wy = (sy - v.ty) / v.k;
        return { k: k2, tx: sx - wx * k2, ty: sy - wy * k2 };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (ev: React.PointerEvent, nodeId?: string) => {
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    if (nodeId) {
      const w = toWorld(ev.clientX, ev.clientY);
      dragRef.current = { mode: 'node', id: nodeId, startX: w.x, startY: w.y, moved: false };
    } else {
      dragRef.current = { mode: 'pan', startX: ev.clientX, startY: ev.clientY, tx0: view.tx, ty0: view.ty, moved: false };
    }
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === 'node') {
      const w = toWorld(ev.clientX, ev.clientY);
      if (Math.abs(w.x - d.startX) + Math.abs(w.y - d.startY) > 3) d.moved = true;
      if (d.moved) {
        setOverride((m) => {
          const next = new Map(m);
          next.set(d.id, { x: w.x, y: w.y });
          return next;
        });
      }
    } else {
      const el = svgRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = ((ev.clientX - d.startX) / r.width) * W;
      const dy = ((ev.clientY - d.startY) / r.height) * H;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      if (d.moved) setView((v) => ({ ...v, tx: d.tx0 + dx, ty: d.ty0 + dy }));
    }
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.mode === 'node' && !d.moved) {
      // 视为点击：切换选中（弹出操作卡）
      setSelected((s) => (s === d.id ? null : d.id));
    } else if (d.mode === 'pan' && !d.moved) {
      setSelected(null);
    }
  };

  const toggleType = (type: string) => {
    setOffTypes((s) => {
      const next = new Set(s);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  if (nodes.length <= 1) {
    return (
      <div className="w-full rounded-xl border bg-slate-50 py-14 text-center text-sm text-slate-400">
        {t(lang, 'graph.empty')}
      </div>
    );
  }

  const selNode = selected ? nodes.find((n) => n.id === selected) : null;
  const viewChanged = view.k !== 1 || view.tx !== 0 || view.ty !== 0 || override.size > 0;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-xl border bg-slate-50 touch-none select-none"
        onPointerDown={(e) => onPointerDown(e)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ cursor: dragRef.current?.mode === 'pan' ? 'grabbing' : 'grab' }}
      >
        <defs>
          {nodes.map((n, i) => {
            const [c1, c2] = PALETTES[hash(n.slug || n.name || String(i)) % PALETTES.length];
            return (
              <linearGradient key={n.id} id={`ng-${uid}-${i}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={c1} />
                <stop offset="100%" stopColor={c2} />
              </linearGradient>
            );
          })}
        </defs>
        <g transform={`translate(${view.tx},${view.ty}) scale(${view.k})`}>
          {/* 边 */}
          {shownEdges.map((e, i) => {
            const ps = getPos(e.source);
            const pt = getPos(e.target);
            if (!ps || !pt) return null;
            const dim = neighbor && !(neighbor.has(e.source) && neighbor.has(e.target));
            const lbl = edgeLabel(e);
            const virtual = e.source.startsWith('kin:') || e.target.startsWith('kin:');
            return (
              <g key={i} opacity={dim ? 0.12 : 1}>
                <line
                  x1={ps.x} y1={ps.y} x2={pt.x} y2={pt.y}
                  stroke={EDGE_COLOR[e.type] || '#94a3b8'}
                  strokeWidth={1.6}
                  strokeDasharray={virtual ? '4 3' : undefined}
                />
                {lbl && (
                  <text
                    x={(ps.x + pt.x) / 2} y={(ps.y + pt.y) / 2 - 4}
                    textAnchor="middle" fontSize="8.5" fill="#64748b"
                  >
                    {lbl}
                  </text>
                )}
              </g>
            );
          })}
          {/* 节点 */}
          {nodes.map((n, i) => {
            const p = getPos(n.id);
            if (!p) return null;
            const isCenter = n.id === centerId;
            const isVirtual = n.trustLevel === 'kin'; // 未收录亲属（虚拟节点）
            const isSel = n.id === selected;
            const dim = neighbor && !neighbor.has(n.id);
            const r = isCenter ? 30 : isVirtual ? 18 : 22;
            return (
              <g
                key={n.id}
                opacity={dim ? 0.22 : 1}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onPointerDown(e, n.id);
                }}
              >
                {(isCenter || isSel) && (
                  <circle cx={p.x} cy={p.y} r={r + 5} fill="none" stroke={isSel ? '#f59e0b' : '#6366f1'} strokeWidth={2} opacity={0.55} />
                )}
                <circle
                  cx={p.x} cy={p.y} r={r}
                  fill={isVirtual ? '#f8fafc' : `url(#ng-${uid}-${i})`}
                  stroke={isVirtual ? '#cbd5e1' : '#ffffff'}
                  strokeWidth={isVirtual ? 1.5 : 2}
                  strokeDasharray={isVirtual ? '4 3' : undefined}
                />
                {/* 信任等级小圆点 */}
                {!isVirtual && (
                  <circle cx={p.x + r * 0.72} cy={p.y - r * 0.72} r={4} fill={TRUST_COLOR[n.trustLevel] || '#94a3b8'} stroke="#fff" strokeWidth={1} />
                )}
                <text
                  x={p.x} y={p.y + (isVirtual ? 3 : 4)} textAnchor="middle"
                  fontSize={isCenter ? 16 : isVirtual ? 8.5 : 13}
                  fill={isVirtual ? '#64748b' : '#ffffff'}
                  fontWeight={700}
                  style={{ textShadow: isVirtual ? undefined : '0 1px 3px rgba(0,0,0,.35)' }}
                >
                  {isVirtual ? (n.name || '').slice(0, 8) : monogram(n.name)}
                </text>
                {/* 名字放节点下方 */}
                <text
                  x={p.x} y={p.y + r + 11} textAnchor="middle"
                  fontSize={isCenter ? 10.5 : 9}
                  fill="#334155" fontWeight={isCenter ? 700 : 500}
                >
                  {(n.name || '').slice(0, 12)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* 视图重置 */}
      {viewChanged && (
        <button
          onClick={() => {
            setView({ k: 1, tx: 0, ty: 0 });
            setOverride(new Map());
          }}
          className="absolute top-2 right-2 text-xs px-2.5 py-1.5 rounded-lg border bg-white/90 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 shadow-sm"
        >
          {t(lang, 'explore.reset')}
        </button>
      )}

      {/* 选中节点操作卡 */}
      {selNode && (
        <div className="absolute top-2 left-2 rounded-xl border bg-white/95 shadow-lg px-3 py-2.5 max-w-[240px]">
          <div className="text-sm font-semibold text-slate-800 truncate">{selNode.name}</div>
          <div className="text-[11px] text-slate-400 mb-2">
            {selNode.trustLevel === 'kin'
              ? t(lang, 'graph.kinNode')
              : t(lang, `trust.${selNode.trustLevel}`)}
          </div>
          <div className="flex gap-2">
            {selNode.slug && selNode.id !== centerId && onRecenter && (
              <button
                onClick={() => {
                  onRecenter(selNode.slug);
                  setSelected(null);
                }}
                className="text-xs px-2.5 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {t(lang, 'graph.recenter')}
              </button>
            )}
            {selNode.slug && (
              <button
                onClick={() => router.push(`/${lang}/person/${selNode.slug}`)}
                className="text-xs px-2.5 py-1 rounded-lg border text-slate-600 hover:bg-slate-50"
              >
                {t(lang, 'graph.viewDetail')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 统计 + 操作提示 */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="font-medium text-slate-600">
          {nodes.length} {t(lang, 'graph.nodes')} · {shownEdges.length} {t(lang, 'graph.links')}
        </span>
        <span>{t(lang, 'graph.hint')}</span>
        <span>{t(lang, 'graph.clickHint')}</span>
      </div>

      {/* 信任等级图例 */}
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {(['pgc', 'ugc_verified', 'ugc_pending'] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <i className="inline-block h-2 w-2 rounded-full" style={{ background: TRUST_COLOR[k] }} />
            {t(lang, `trust.${k}`)}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-full border border-dashed" style={{ borderColor: '#94a3b8', background: '#f8fafc' }} />
          {t(lang, 'graph.kinNode')}
        </span>
      </div>

      {/* 关系类型图例（可点击筛选） */}
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
        {(Object.keys(EDGE_COLOR) as (keyof typeof EDGE_COLOR)[]).map((type) => {
          const off = offTypes.has(type);
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition ${
                off
                  ? 'border-slate-200 text-slate-300 line-through'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <i
                className="inline-block h-2 w-3 rounded-sm"
                style={{ background: off ? '#e2e8f0' : EDGE_COLOR[type] }}
              />
              {t(lang, `rel.${type}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
