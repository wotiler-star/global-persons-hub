'use client';

// 交互式多跳关系网络图（零依赖力导向布局）
// 数据来自后端 /graph/network/:id（Neo4j 遍历 / BFS 回退），节点可点击跳转人物页
import { useMemo, useState } from 'react';
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
    // 斥力
    for (const a of nodes) {
      const pa = pos.get(a.id)!;
      const va = vel.get(a.id)!;
      for (const b of nodes) {
        if (a.id === b.id) continue;
        const pb = pos.get(b.id)!;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        const d2 = Math.max(dx * dx + dy * dy, 100);
        const f = K_REPEL / d2;
        const d = Math.sqrt(d2);
        va.x += (dx / d) * f * 0.01;
        va.y += (dy / d) * f * 0.01;
      }
      // 中心引力
      va.x += (W / 2 - pa.x) * 0.002;
      va.y += (H / 2 - pa.y) * 0.002;
    }
    // 弹簧
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
    // 应用 + 阻尼 + 边界
    for (const n of nodes) {
      if (n.id === centerId) continue; // 中心固定
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
  lang
}: {
  network: { nodes: Node[]; edges: Edge[] };
  centerId: string;
  lang: string;
}) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const { nodes, edges } = network;
  const pos = useMemo(() => layout(nodes, edges, centerId), [nodes, edges, centerId]);

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

  /** 边标签：亲属边用 kin.* 13 语词典翻译，普通边用后端 label 原文 */
  const edgeLabel = (e: Edge) => (e.kinRel ? t(lang, `kin.${e.kinRel}`) : e.label);

  const neighbor = useMemo(() => {
    if (!hover) return null;
    const s = new Set<string>([hover]);
    for (const e of uniqEdges) {
      if (e.source === hover) s.add(e.target);
      if (e.target === hover) s.add(e.source);
    }
    return s;
  }, [hover, uniqEdges]);

  if (nodes.length <= 1) {
    return (
      <div className="w-full rounded-xl border bg-slate-50 py-14 text-center text-sm text-slate-400">
        暂无已记录的关系网络
      </div>
    );
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border bg-slate-50">
        {/* 边 */}
        {uniqEdges.map((e, i) => {
          const ps = pos.get(e.source);
          const pt = pos.get(e.target);
          if (!ps || !pt) return null;
          const dim = neighbor && !(neighbor.has(e.source) && neighbor.has(e.target));
          const lbl = edgeLabel(e);
          const virtual = e.source.startsWith('kin:') || e.target.startsWith('kin:');
          return (
            <g key={i} opacity={dim ? 0.15 : 1}>
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
        {nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const isCenter = n.id === centerId;
          const isVirtual = n.trustLevel === 'kin'; // 未收录亲属（虚拟节点，不可点击）
          const dim = neighbor && !neighbor.has(n.id);
          return (
            <g
              key={n.id}
              opacity={dim ? 0.25 : 1}
              className={n.slug ? 'cursor-pointer' : undefined}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => n.slug && router.push(`/${lang}/person/${n.slug}`)}
            >
              <circle
                cx={p.x} cy={p.y} r={isCenter ? 34 : isVirtual ? 20 : 24}
                fill={isCenter ? '#3b5bdb' : isVirtual ? '#f8fafc' : '#ffffff'}
                stroke={isVirtual ? '#cbd5e1' : TRUST_COLOR[n.trustLevel] || '#94a3b8'}
                strokeWidth={isCenter ? 0 : isVirtual ? 1.5 : 2}
                strokeDasharray={isVirtual ? '4 3' : undefined}
              />
              <text
                x={p.x} y={p.y + 3.5} textAnchor="middle"
                fontSize={isCenter ? 11 : isVirtual ? 8.5 : 9.5}
                fill={isCenter ? '#fff' : isVirtual ? '#64748b' : '#334155'}
                fontWeight={isCenter ? 700 : 500}
              >
                {(n.name || '').slice(0, isCenter ? 12 : 10)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>点击节点跳转人物页 · 悬停高亮邻接</span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-full" style={{ background: '#3b5bdb' }} /> PGC
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-full" style={{ background: '#0ca678' }} /> 已认证
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-full" style={{ background: '#f59f00' }} /> 待审核
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-2 w-2 rounded-full border border-dashed" style={{ borderColor: '#94a3b8', background: '#f8fafc' }} />
          {t(lang, 'graph.kinNode')}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="text-slate-400">关系：</span>
        {(Object.keys(EDGE_COLOR) as (keyof typeof EDGE_COLOR)[]).map((type) => (
          <span key={type} className="inline-flex items-center gap-1">
            <i className="inline-block h-2 w-3 rounded-sm" style={{ background: EDGE_COLOR[type] }} />
            {t(lang, `rel.${type}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
