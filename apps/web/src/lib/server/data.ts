// 服务端数据门面：Server Components / Route Handlers 复用。
// 返回结构与「原 Fastify API 的 HTTP 响应」逐一对齐（与旧 api.ts 的 apiGet<T> 返回类型一致），
// 因此前端页面代码无需改动。仅在服务端导入（绝不会进入浏览器包）。
import { gphStore } from './store';

// 与旧 api.ts 的 apiGet<T> 返回类型保持一致（数组元素用 any，避免破坏页面内的 .map/.catch 推断）。
type PersonList = { items: any[]; total: number };
type SemanticResult = { q: string; results: { hit: any; score: number }[] };
type Network = { nodes: any[]; edges: any[] };

/** 列出 / 搜索人物（支持 q / domain / lang / 分页） */
export async function getPersons(opts: { q?: string; domain?: string; lang?: string; pageSize?: number; page?: number } = {}): Promise<PersonList> {
  const r = gphStore().listPersons(opts);
  return { items: r.items, total: r.total };
}

/**
 * 全量取数（分页聚合）：供 sitemap / RSS / llms-full / generateStaticParams 等
 * 必须拿全库的场景使用。后端已将单页上限收敛到 500。
 */
export async function getAllPersons(
  opts: { lang?: string; domain?: string; pageSize?: number; maxPages?: number } = {}
): Promise<PersonList> {
  const pageSize = Math.min(opts.pageSize ?? 500, 500);
  const maxPages = opts.maxPages ?? 20;
  const items: any[] = [];
  let total = 0;
  for (let page = 1; page <= maxPages; page++) {
    const r = gphStore().listPersons({ lang: opts.lang, domain: opts.domain, page, pageSize });
    items.push(...r.items);
    total = r.total ?? items.length;
    if (items.length >= total || r.items.length === 0) break;
  }
  return { items, total: total || items.length };
}

/** 单个人物详情（结构化 + 关系）。不存在返回 null。 */
export async function getPerson(slug: string): Promise<any> {
  return gphStore().getPerson(slug);
}

/** 关系图谱邻接（结构化）。 */
export async function getRelations(id: string): Promise<any> {
  return gphStore().getRelations(id);
}

/** 跨领域关键词搜索。 */
export async function searchPersons(q: string): Promise<{ q: string; results: any[] }> {
  return { q, results: gphStore().search(q) };
}

/** 向量（语义）检索：哈希向量余弦，返回带相似度的命中。 */
export async function semanticSearch(q: string, lang: string = 'zh', limit = 12): Promise<SemanticResult> {
  return { q, results: await gphStore().semanticSearch(q, { limit, lang }) };
}

/** 多跳关系网络（深度可配）。 */
export async function getNetwork(id: string, depth = 2): Promise<Network | null> {
  return gphStore().getNetwork(id, depth);
}

/** 两人之间最短关系路径（BFS 子图）。 */
export async function getPath(from: string, to: string): Promise<Network | null> {
  return gphStore().getPath(from, to);
}
