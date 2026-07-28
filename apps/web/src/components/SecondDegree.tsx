import Link from 'next/link';
import { t } from '@/lib/ui';
import type { Lang } from '@gph/types';

type Node = { id: string; slug?: string; name: string; trustLevel?: string };
type Edge = { source: string; target: string; type: string; label?: string; directed: boolean; kinRel?: string };

/**
 * 二度人脉面板（Stage 36 智能推荐）：基于已抓取的关系图谱（二跳网络），
 * 推导「通过一度关系还能认识的人」，列出二度连接人与桥接人。
 * 纯服务端计算，无客户端 JS，利于 SEO 与 GEO 引用。
 */
export default function SecondDegree({
  network,
  centerId,
  lang
}: {
  network: { nodes: Node[]; edges: Edge[] };
  centerId: string;
  lang: Lang;
}) {
  const { nodes, edges } = network;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // 一度（直接）邻居
  const direct = new Set<string>();
  for (const e of edges) {
    if (e.source === centerId) direct.add(e.target);
    if (e.target === centerId) direct.add(e.source);
  }

  // 二度：与一度相邻、但非中心、非一度的节点；记录桥接人
  const second = new Map<string, string>(); // nodeId -> bridgeId
  for (const e of edges) {
    const { source: a, target: b } = e;
    if (direct.has(a) && b !== centerId && !direct.has(b) && !second.has(b)) second.set(b, a);
    if (direct.has(b) && a !== centerId && !direct.has(a) && !second.has(a)) second.set(a, b);
  }

  const items = [...second.keys()]
    .map((id) => nodeMap.get(id))
    .filter((n): n is Node => !!n && !!n.slug && n.trustLevel !== 'kin')
    .sort((a, b) => (a.slug || '').localeCompare(b.slug || ''))
    .slice(0, 18);

  if (items.length === 0) return null;

  return (
    <div className="mt-6 rounded-xl border bg-white p-4">
      <h3 className="font-semibold mb-1">{t(lang, 'network.degree2Title')}</h3>
      <p className="text-xs text-slate-500 mb-3">{t(lang, 'network.degree2Sub')}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((n) => {
          const bridge = nodeMap.get(second.get(n.id || '') || '');
          return (
            <Link
              key={n.id}
              href={`/${lang}/person/${n.slug}`}
              className="group inline-flex items-center gap-1.5 rounded-full border bg-slate-50 px-3 py-1.5 text-sm text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700"
            >
              <span className="font-medium">{n.name}</span>
              {bridge && (
                <span className="text-[11px] text-slate-400 group-hover:text-indigo-500">
                  {t(lang, 'network.through')} {bridge.name}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
