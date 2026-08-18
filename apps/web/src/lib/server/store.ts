// 只读数据层（Hostinger 单进程部署版）：把原 Fastify API 的 JsonStore 只读逻辑
// 折叠进 Next.js 服务端，供 Server Components 与 Route Handlers 复用。
// 仅依赖 Node 内置模块（fs/path/crypto），零外部运行时依赖，可在共享云主机常驻。
//
// 本文件只被服务端代码（Server Components / Route Handlers）导入，绝不进入浏览器包；
// 因此可以直接使用 node:fs。返回类型用 any 以与「原 API 经 HTTP 返回的 JSON」保持一致，
// 前端页面此前即以 any 消费这些响应，无需改动。
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// 数据目录：优先用环境变量 GPH_DATA_DIR（部署时可写绝对路径），否则取 cwd/data。
// 在 Hostinger 由 `npm start`（next start）从 apps/web 目录启动时，cwd = apps/web，
// 因此默认读取 apps/web/data/persons.json（已随仓库提供）。
const DATA_DIR = process.env.GPH_DATA_DIR || join(process.cwd(), 'data');
const PERSONS_FILE = join(DATA_DIR, 'persons.json');

type AnyPerson = any;

function loadPersons(): AnyPerson[] {
  if (!existsSync(PERSONS_FILE)) {
    console.warn(`[gph-store] persons.json 未找到: ${PERSONS_FILE}`);
    return [];
  }
  try {
    return JSON.parse(readFileSync(PERSONS_FILE, 'utf-8')) as AnyPerson[];
  } catch (e) {
    console.error(`[gph-store] persons.json 解析失败: ${(e as Error).message}`);
    return [];
  }
}

// 零依赖词袋哈希向量（与原 API HashEmbedder 等价）：确定、可复现、零网络。
function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function hashEmbed(text: string, dim: number): number[] {
  const v = new Array(dim).fill(0);
  const lower = text.toLowerCase();
  const latin = lower.match(/[a-z0-9]+/g) || [];
  const cjk = lower.match(/[一-鿿]/g) || [];
  const tokens = [...latin, ...cjk];
  for (const tok of tokens) {
    const bucket = fnv1a(tok) % dim;
    v[bucket] += 1;
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

const EMBED_DIM = Number(process.env.GPH_EMBED_DIM) || 384;

/** 把任意形态字段（string | string[] | LocalizedText | (LocalizedText|string)[]）压成纯文本 */
function fieldToText(v: any): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(fieldToText).join(' ');
  if (typeof v === 'object') return Object.values(v).map((x) => (typeof x === 'string' ? x : fieldToText(x))).join(' ');
  return String(v);
}

/** 人物语料（用于哈希向量检索）：综合姓名/职业/摘要/领域（对字段形态做容错） */
function personCorpus(p: AnyPerson): string {
  const names = fieldToText(p.names);
  const aliases = fieldToText(p.aliases);
  const occ = fieldToText(p.occupations);
  const summary = fieldToText(p.summary);
  const domains = fieldToText(p.domains);
  return [names, aliases, occ, summary, domains].join(' ');
}

export class GphStore {
  private persons: AnyPerson[] = loadPersons();
  private embedCache = new Map<string, { vec: number[]; key: string }>();
  private semanticCache = new Map<string, any[]>();

  get size(): number {
    return this.persons.length;
  }

  listPersons(opts: { q?: string; domain?: string; lang?: string; page?: number; pageSize?: number } = {}): any {
    let arr = this.persons.slice();
    if (opts.q) {
      const t = opts.q.toLowerCase();
      arr = arr.filter((p: AnyPerson) => {
        const hay = [
          Object.values(p.names || {}).join(' '),
          ...(p.aliases ?? []),
          Object.values(p.summary || {}).join(' '),
          (p.domains || []).join(' ')
        ].join(' ').toLowerCase();
        return hay.includes(t);
      });
    }
    if (opts.domain) arr = arr.filter((p: AnyPerson) => (p.domains || []).includes(opts.domain as string));
    if (opts.lang) arr = arr.filter((p: AnyPerson) => (p.langVersions || []).includes(opts.lang as string));
    const total = arr.length;
    const page = opts.page ?? 1;
    const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 500);
    const items = arr.slice((page - 1) * pageSize, page * pageSize);
    return { items, total, page, pageSize };
  }

  getPerson(slugOrId: string): AnyPerson | null {
    return this.persons.find((p: AnyPerson) => p.slug === slugOrId || p.id === slugOrId) ?? null;
  }

  search(q: string, limit = 12): any[] {
    const t = (q || '').toLowerCase();
    return this.persons
      .filter((p: AnyPerson) => {
        const hay = [
          Object.values(p.names || {}).join(' '),
          ...(p.aliases ?? []),
          (p.domains || []).join(' '),
          Object.values(p.summary || {}).join(' ')
        ].join(' ').toLowerCase();
        return hay.includes(t);
      })
      .slice(0, limit)
      .map((p: AnyPerson) => ({
        id: p.id,
        slug: p.slug,
        names: p.names,
        domains: p.domains,
        occupations: p.occupations,
        summary: p.summary,
        trustLevel: p.trustLevel || 'ai_draft',
        sources: p.sources || []
      }));
  }

  getRelations(idOrSlug: string): any {
    const p = this.getPerson(idOrSlug);
    if (!p) return null;
    const relations: any[] = [];
    for (const r of p.relations || []) {
      const target = this.persons.find((x: AnyPerson) => x.id === r.targetId);
      relations.push({ ...r, targetName: target?.names, targetSlug: target?.slug, incoming: false });
    }
    for (const other of this.persons) {
      if (other.id === p.id) continue;
      for (const r of other.relations || []) {
        if (r.targetId === p.id) {
          relations.push({ ...r, targetName: other.names, targetSlug: other.slug, incoming: true });
        }
      }
    }
    return { person: p, relations };
  }

  // —— 图谱：人物 + 组织 + 亲属节点与邻接表（供 getNetwork / getPath 复用）——
  private buildGraph(): { nodeInfo: Map<string, any>; adj: Map<string, any[]> } {
    const byId = new Map(this.persons.map((p: AnyPerson) => [p.id, p]));
    const bySlug = new Map(this.persons.map((p: AnyPerson) => [p.slug, p]));
    const nodeInfo = new Map<string, any>();
    const addNode = (n: any) => {
      if (!nodeInfo.has(n.id)) nodeInfo.set(n.id, n);
    };
    for (const p of this.persons) {
      addNode({ id: p.id, slug: p.slug, name: p.names?.en || p.names?.zh || p.id, trustLevel: p.trustLevel || 'ai_draft', kind: 'person' });
    }
    const adj = new Map<string, any[]>();
    const addEdge = (from: string, to: string, type: string, label?: any, directed = false, kinRel?: string) => {
      if (!adj.has(from)) adj.set(from, []);
      adj.get(from)!.push({ to, type, label, directed, kinRel });
    };
    for (const p of this.persons) {
      for (const r of p.relations || []) {
        if (!byId.has(r.targetId)) continue;
        const lbl = r.label?.en || r.label?.zh;
        addEdge(p.id, r.targetId, r.type, lbl, !!r.directed);
        addEdge(r.targetId, p.id, r.type, lbl, !!r.directed);
      }
      for (const k of p.kin || []) {
        if (!k.slug) continue;
        const target = bySlug.get(k.slug);
        if (!target || target.id === p.id) continue;
        addEdge(p.id, target.id, 'family', undefined, false, k.relation);
        addEdge(target.id, p.id, 'family', undefined, false, k.relation);
      }
      for (const a of p.affiliations || []) {
        const oname = (a.name?.en || a.name?.zh || '').trim();
        if (!oname) continue;
        const oid = `org:${oname.toLowerCase().replace(/\s+/g, '_')}`;
        addNode({ id: oid, slug: '', name: oname, trustLevel: 'org', kind: 'org', orgType: a.type || 'org' });
        addEdge(p.id, oid, 'affiliated', undefined, false);
        addEdge(oid, p.id, 'affiliated', undefined, false);
      }
    }
    return { nodeInfo, adj };
  }

  getNetwork(idOrSlug: string, depth = 2): any {
    const start = this.getPerson(idOrSlug);
    if (!start) return null;
    const bySlug = new Map(this.persons.map((p: AnyPerson) => [p.slug, p]));
    const { nodeInfo, adj } = this.buildGraph();
    const visited = new Set<string>([start.id]);
    const nodes: any[] = [{ ...nodeInfo.get(start.id)!, id: start.id }];
    const edges: any[] = [];
    let frontier = [start.id];
    for (let d = 0; d < depth; d++) {
      const next: string[] = [];
      for (const cur of frontier) {
        for (const e of adj.get(cur) || []) {
          if (!visited.has(e.to)) {
            visited.add(e.to);
            next.push(e.to);
            nodes.push({ ...nodeInfo.get(e.to)!, id: e.to });
          }
          edges.push({ source: cur, target: e.to, type: e.type, label: e.label, directed: e.directed, kinRel: e.kinRel });
        }
      }
      frontier = next;
    }
    (start.kin || []).forEach((k: any, i: number) => {
      if (k.slug && bySlug.has(k.slug)) return;
      const vid = `kin:${start.id}:${i}`;
      nodes.push({
        id: vid,
        slug: '',
        name: k.name?.en || k.name?.zh || vid,
        trustLevel: 'kin',
        kind: 'kin',
        kinName: k.name,
        kinRelation: k.relation,
        kinGeneration: k.generation,
        kinBirth: k.birth,
        kinDeath: k.death,
        kinBio: k.bio,
        kinWiki: k.wiki
      });
      edges.push({ source: start.id, target: vid, type: 'family', directed: false, kinRel: k.relation });
    });
    return { nodes, edges };
  }

  getPath(fromIdOrSlug: string, toIdOrSlug: string): any {
    const a = this.getPerson(fromIdOrSlug);
    const b = this.getPerson(toIdOrSlug);
    if (!a || !b) return null;
    const { nodeInfo, adj } = this.buildGraph();
    const parent = new Map<string, any>();
    const visited = new Set<string>([a.id]);
    let frontier = [a.id];
    let found = false;
    for (let d = 0; d < 6 && !found; d++) {
      const next: string[] = [];
      for (const cur of frontier) {
        for (const e of adj.get(cur) || []) {
          if (visited.has(e.to)) continue;
          visited.add(e.to);
          parent.set(e.to, { from: cur, edge: e });
          if (e.to === b.id) {
            found = true;
            break;
          }
          next.push(e.to);
        }
        if (found) break;
      }
      frontier = next;
    }
    if (!parent.has(b.id)) return { nodes: [], edges: [] };
    const pathIds: string[] = [b.id];
    let cur = b.id;
    while (cur !== a.id) {
      cur = parent.get(cur)!.from;
      pathIds.push(cur);
    }
    pathIds.reverse();
    const nodes: any[] = pathIds.map((id) => ({ ...nodeInfo.get(id)!, id }));
    const edges: any[] = [];
    for (let i = 0; i < pathIds.length - 1; i++) {
      const from = pathIds[i];
      const to = pathIds[i + 1];
      const e = (adj.get(from) || []).find((x: any) => x.to === to) || (adj.get(to) || []).find((x: any) => x.to === from);
      if (e) edges.push({ source: from, target: to, type: e.type, label: e.label, directed: e.directed, kinRel: e.kinRel });
    }
    return { nodes, edges };
  }

  // —— 向量（语义）检索：哈希向量余弦，零外部依赖 ——
  private embedPerson(p: AnyPerson): number[] {
    const key = `${p.updatedAt || ''}`;
    const cached = this.embedCache.get(p.id);
    if (cached && cached.key === key) return cached.vec;
    const vec = hashEmbed(personCorpus(p), EMBED_DIM);
    this.embedCache.set(p.id, { vec, key });
    return vec;
  }

  async semanticSearch(query: string, opts: { limit?: number; lang?: string } = {}): Promise<any[]> {
    const key = `${query || ''}|${opts.lang || 'zh'}|${opts.limit ?? 6}`;
    const cached = this.semanticCache.get(key);
    if (cached) return cached;
    const qv = hashEmbed(query || '', EMBED_DIM);
    const k = opts.limit ?? 6;
    const scored: { person: AnyPerson; score: number }[] = [];
    for (const p of this.persons) {
      const v = this.embedPerson(p);
      scored.push({ person: p, score: cosine(qv, v) });
    }
    scored.sort((a, b) => b.score - a.score);
    const out = scored.slice(0, k).map(({ person, score }) => ({
      hit: {
        id: person.id,
        slug: person.slug,
        names: person.names,
        domains: person.domains,
        occupations: person.occupations,
        summary: person.summary,
        trustLevel: person.trustLevel || 'ai_draft',
        sources: person.sources || []
      },
      score
    }));
    // 进程内不可变数据，缓存结果避免热路径重复计算（共享主机减负）
    this.semanticCache.set(key, out);
    return out;
  }
}

// 单例：模块加载一次，整进程共享内存图谱，所有请求复用。
let _store: GphStore | null = null;
export function gphStore(): GphStore {
  if (!_store) _store = new GphStore();
  return _store;
}
