'use client';

// 交互式多跳关系网络图（零依赖力导向布局）— Stage 33 升级版
// 新增：滚轮缩放 + 画布平移 + 节点拖拽、渐变 Monogram 节点、边类型图例筛选、
//       点击节点弹出操作卡（设为中心 / 查看详情）、节点/关系统计、全量 i18n。
import { useEffect, useMemo, useRef, useState, useId } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/ui';
import { pickText } from '@/lib/i18n';
import type { Lang } from '@gph/types';

type Node = {
  id: string; slug: string; name: string; trustLevel: string;
  kind?: 'person' | 'org' | 'kin'; orgType?: string;
  /** Stage 10+：亲属虚拟节点携带的详细资料，选中卡展示「详细情况介绍」 */
  kinName?: Partial<Record<Lang, string>>;
  kinRelation?: string; kinGeneration?: number;
  kinBirth?: string; kinDeath?: string;
  kinBio?: Partial<Record<Lang, string>>; kinWiki?: string;
};
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

/** Stage 37+：组织节点按机构类型着色（company/school/org/government） */
const ORG_COLOR: Record<string, string> = {
  company: '#0ea5e9',
  school: '#8b5cf6',
  org: '#0ca678',
  government: '#e8590c'
};
const ORG_COLOR_FALLBACK = '#64748b';

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

/**
 * 最短路径（无向 BFS）：在已加载的图谱（人物 + 亲属 + 组织）中，
 * 返回从 fromId 到 toId 的有序节点 id 数组；不可达返回 null。
 * 用于「路径模式」图内点击两节点即时高亮，无需额外请求。
 */
function bfsPath(nodes: Node[], edges: Edge[], fromId: string, toId: string): string[] | null {
  if (fromId === toId) return [fromId];
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (!adj.has(e.source) || !adj.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }
  const prev = new Map<string, string>();
  const seen = new Set<string>([fromId]);
  const queue: string[] = [fromId];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === toId) break;
    for (const nb of adj.get(cur) || []) {
      if (!seen.has(nb)) {
        seen.add(nb);
        prev.set(nb, cur);
        queue.push(nb);
      }
    }
  }
  if (!seen.has(toId)) return null;
  const path: string[] = [];
  let cur: string | undefined = toId;
  while (cur !== undefined) {
    path.unshift(cur);
    cur = prev.get(cur);
  }
  return path[0] === fromId ? path : null;
}

export default function NetworkGraph({
  network,
  centerId,
  lang,
  onRecenter,
  enablePathMode = true
}: {
  network: { nodes: Node[]; edges: Edge[] };
  centerId: string;
  lang: string;
  /** 点击节点操作卡「设为中心」时回调（传 slug） */
  onRecenter?: (slug: string) => void;
  /** 是否允许「路径模式」（图内点击两节点高亮最短路径），默认开 */
  enablePathMode?: boolean;
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
  // Stage 37+：路径模式（点击两节点高亮最短路径）
  const [pathMode, setPathMode] = useState(false);
  const [pathStart, setPathStart] = useState<string | null>(null);
  const [pathEnd, setPathEnd] = useState<string | null>(null);
  const [pathIds, setPathIds] = useState<string[] | null>(null);
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

  /** 路径高亮集合：路径节点 id + 路径边（无序对）集合，供渲染 dim / 高亮 */
  const pathSet = useMemo(() => {
    if (!pathIds || pathIds.length < 2) return null;
    const ns = new Set(pathIds);
    const es = new Set<string>();
    for (let i = 0; i < pathIds.length - 1; i++) {
      es.add([pathIds[i], pathIds[i + 1]].sort().join('|'));
    }
    return { nodes: ns, edges: es };
  }, [pathIds]);

  /** 路径模式：点击节点拾取起点/终点并计算最短路径（仅当前可见图谱内） */
  const handlePathPick = (id: string) => {
    const armed = pathStart !== null && pathEnd === null && pathIds === null;
    if (!armed) {
      setPathStart(id);
      setPathEnd(null);
      setPathIds(null);
    } else if (id !== pathStart) {
      setPathEnd(id);
      setPathIds(bfsPath(nodes, edges, pathStart, id));
    }
  };

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
      // 路径模式下：点击节点用于拾取起点 / 终点，不再弹出操作卡
      if (enablePathMode && pathMode) {
        handlePathPick(d.id);
      } else {
        // 视为点击：切换选中（弹出操作卡）
        setSelected((s) => (s === d.id ? null : d.id));
      }
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
            const inPath = !!pathSet && pathSet.edges.has([e.source, e.target].sort().join('|'));
            const dim = pathSet
              ? !inPath
              : neighbor && !(neighbor.has(e.source) && neighbor.has(e.target));
            const lbl = edgeLabel(e);
            const virtual = e.source.startsWith('kin:') || e.target.startsWith('kin:');
            return (
              <g key={i} opacity={dim ? 0.1 : 1}>
                <line
                  x1={ps.x} y1={ps.y} x2={pt.x} y2={pt.y}
                  stroke={inPath ? '#f59e0b' : (EDGE_COLOR[e.type] || '#94a3b8')}
                  strokeWidth={inPath ? 3.4 : 1.6}
                  strokeDasharray={virtual && !inPath ? '4 3' : undefined}
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
            const isOrg = n.kind === 'org' || n.trustLevel === 'org';
            const isVirtual = n.kind === 'kin' || n.trustLevel === 'kin'; // 未收录亲属（虚拟节点）
            const isSel = n.id === selected;
            const inPath = !!pathSet && pathSet.nodes.has(n.id);
            const dim = pathSet ? !inPath : neighbor && !neighbor.has(n.id);
            const r = isCenter ? 30 : isVirtual ? 18 : 22;
            const orgColor = isOrg ? ORG_COLOR[n.orgType || 'org'] || ORG_COLOR_FALLBACK : '';
            const isPathStart = pathSet && n.id === pathStart;
            const isPathEnd = pathSet && n.id === pathEnd;
            return (
              <g
                key={n.id}
                opacity={dim ? 0.16 : 1}
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
                {isPathStart && (
                  <circle cx={p.x} cy={p.y} r={r + 7} fill="none" stroke="#16a34a" strokeWidth={3} />
                )}
                {isPathEnd && (
                  <circle cx={p.x} cy={p.y} r={r + 7} fill="none" stroke="#dc2626" strokeWidth={3} />
                )}
                {isOrg ? (
                  // 组织节点：圆角方块，按机构类型着色
                  <rect
                    x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} rx={5}
                    fill={orgColor}
                    stroke="#ffffff" strokeWidth={2}
                  />
                ) : (
                  <circle
                    cx={p.x} cy={p.y} r={r}
                    fill={isVirtual ? '#f8fafc' : `url(#ng-${uid}-${i})`}
                    stroke={isVirtual ? '#cbd5e1' : '#ffffff'}
                    strokeWidth={isVirtual ? 1.5 : 2}
                    strokeDasharray={isVirtual ? '4 3' : undefined}
                  />
                )}
                {/* 信任等级小圆点（仅真实人物节点） */}
                {!isVirtual && !isOrg && (
                  <circle cx={p.x + r * 0.72} cy={p.y - r * 0.72} r={4} fill={TRUST_COLOR[n.trustLevel] || '#94a3b8'} stroke="#fff" strokeWidth={1} />
                )}
                <text
                  x={p.x} y={p.y + (isVirtual ? 3 : 4)} textAnchor="middle"
                  fontSize={isCenter ? 16 : isVirtual ? 8.5 : 13}
                  fill={isVirtual ? '#64748b' : isOrg ? '#ffffff' : '#ffffff'}
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
                  {(n.name || '').slice(0, isOrg ? 16 : 12)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* 路径模式（Stage 37+）：图内点击两节点高亮最短路径 */}
      {enablePathMode && (
        <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setPathMode((v) => !v);
                if (pathMode) {
                  setPathStart(null);
                  setPathEnd(null);
                  setPathIds(null);
                }
              }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                pathMode
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'border border-indigo-300 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              {pathMode ? `● ${t(lang, 'graph.pathMode')}` : `○ ${t(lang, 'graph.pathMode')}`}
            </button>
            {pathMode && (
              <>
                <span className="text-xs text-slate-500">
                  {!pathStart
                    ? t(lang, 'graph.pickStart')
                    : !pathEnd
                    ? t(lang, 'graph.pickEnd')
                    : ''}
                </span>
                {(pathStart || pathEnd) && (
                  <button
                    onClick={() => {
                      setPathStart(null);
                      setPathEnd(null);
                      setPathIds(null);
                    }}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-white"
                  >
                    {t(lang, 'graph.clear')}
                  </button>
                )}
                <button
                  onClick={() => {
                    setPathMode(false);
                    setPathStart(null);
                    setPathEnd(null);
                    setPathIds(null);
                  }}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-white"
                >
                  {t(lang, 'graph.exit')}
                </button>
              </>
            )}
          </div>

          {pathMode && !pathStart && (
            <p className="mt-2 text-xs text-slate-500">{t(lang, 'graph.pathTip')}</p>
          )}

          {pathSet && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
              {pathIds!.map((id, i) => {
                const n = nodes.find((x) => x.id === id);
                const isS = id === pathStart;
                const isE = id === pathEnd;
                return (
                  <span key={id} className="contents">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${
                        isS
                          ? 'bg-green-100 text-green-700'
                          : isE
                          ? 'bg-red-100 text-red-700'
                          : 'bg-indigo-100 text-indigo-700'
                      }`}
                    >
                      {isS
                        ? `${t(lang, 'graph.pathStartTag')} · ${n?.name || id}`
                        : isE
                        ? `${t(lang, 'graph.pathEndTag')} · ${n?.name || id}`
                        : (n?.name || id)}
                    </span>
                    {i < pathIds!.length - 1 && <span className="text-slate-400">→</span>}
                  </span>
                );
              })}
              <span className="ml-1 text-xs text-slate-500">
                · {pathIds!.length - 1} {t(lang, 'graph.hop')}
              </span>
            </div>
          )}

          {pathMode && pathStart && pathEnd && pathIds === null && (
            <p className="mt-2 text-xs text-slate-500">{t(lang, 'graph.pathNoView')}</p>
          )}
        </div>
      )}

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
        <div className="absolute top-2 left-2 rounded-xl border bg-white/95 shadow-lg px-3 py-2.5 max-w-[280px]">
          <div className="text-sm font-semibold text-slate-800 truncate">
            {pickText(selNode.kinName, lang as Lang) || selNode.name}
          </div>
          <div className="text-[11px] text-slate-400 mb-2">
            {selNode.kind === 'org' || selNode.trustLevel === 'org'
              ? t(lang, 'graph.nodeOrg')
              : selNode.kind === 'kin' || selNode.trustLevel === 'kin'
              ? (selNode.kinRelation ? t(lang, `kin.${selNode.kinRelation}`) : t(lang, 'graph.kinNode'))
              : t(lang, `trust.${selNode.trustLevel}`)}
          </div>
          {selNode.kind === 'kin' || selNode.trustLevel === 'kin' ? (
            <div className="space-y-1.5">
              {(() => {
                const life = [selNode.kinBirth, selNode.kinDeath].filter((x) => x && x !== '?').join(' ~ ');
                const bio = pickText(selNode.kinBio, lang as Lang);
                return (
                  <>
                    {life && <div className="text-[11px] text-slate-400">{life}</div>}
                    {bio && (
                      <p className="text-xs leading-relaxed text-slate-600 line-clamp-5">{bio}</p>
                    )}
                    {selNode.kinWiki && (
                      <a
                        href={selNode.kinWiki}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-[11px] text-indigo-600 hover:underline"
                      >
                        Wikipedia ↗
                      </a>
                    )}
                  </>
                );
              })()}
            </div>
          ) : (
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
          )}
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

      {/* 组织节点图例（Stage 37+） */}
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {(Object.keys(ORG_COLOR) as (keyof typeof ORG_COLOR)[]).map((otype) => (
          <span key={otype} className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ORG_COLOR[otype] }} />
            {t(lang, `org.${otype}`)}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ORG_COLOR_FALLBACK }} />
          {t(lang, 'graph.nodeOrg')}
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
