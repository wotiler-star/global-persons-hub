// JSON 文件适配器（开发默认）：零原生依赖，开箱即跑。
// 行为与原实现一致；仅改为全异步以适配统一 DataStore 契约。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  Person, User, PublicUser, ListPersonsQuery, ListPersonsResult,
  PersonInput, Relation, RegisterInput, LoginInput, Lang
} from '@gph/types';
import { slugify } from './util.js';
import { hashPassword, verifyPassword, toPublic, generateApiKey, QUOTA_BY_PLAN } from './crypto.js';
import type { DataStore, UserRecord, RelationView, SearchHit, Network, NetworkNode, VectorHit, AdminStats, AuditEntry } from './types.js';
import type { ApiKeyView, ApiKeyCreated, Comment } from '@gph/types';
import { getEmbedder } from '../embedding/index.js';
import { personCorpus } from './corpus.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 数据目录定位需兼容两种运行形态：
//  - 开发态（tsx）：__dirname = apps/api/src/store → 需 ../../data = apps/api/data
//  - 生产态（esbuild 打包后）：__dirname = apps/api/dist → 需 ../data = apps/api/data
// 原硬编码 ../../data 在生产态会解析到 apps/data（不存在 / 陈旧空库），导致 loadPersons 静默回退空数组。
// 故运行时探测 persons.json 实际所在目录，优先取含 persons.json 的 data 目录。
const DATA_CANDIDATES = [
  join(__dirname, '..', 'data'),
  join(__dirname, '..', '..', 'data'),
  join(__dirname, '..', '..', '..', 'data'),
];
const DATA = DATA_CANDIDATES.find((d) => existsSync(join(d, 'persons.json'))) ?? DATA_CANDIDATES[1];
const RT = join(DATA, 'runtime');
const UPLOAD_DIR = join(DATA, 'uploads');
mkdirSync(RT, { recursive: true });
mkdirSync(UPLOAD_DIR, { recursive: true });

const PERSONS_FILE = join(RT, 'persons.json');
const USERS_FILE = join(RT, 'users.json');
const APIKEYS_FILE = join(RT, 'apikeys.json');
const COMMENTS_FILE = join(RT, 'comments.json');
const AUDIT_FILE = join(RT, 'audit.json');
const REVOKED_FILE = join(RT, 'revoked.json');

function loadComments(): any[] {
  return existsSync(COMMENTS_FILE) ? JSON.parse(readFileSync(COMMENTS_FILE, 'utf-8')) : [];
}
function loadAudit(): any[] {
  return existsSync(AUDIT_FILE) ? JSON.parse(readFileSync(AUDIT_FILE, 'utf-8')) : [];
}
function loadRevoked(): string[] {
  return existsSync(REVOKED_FILE) ? JSON.parse(readFileSync(REVOKED_FILE, 'utf-8')) : [];
}

function loadPersons(): Person[] {
  if (existsSync(PERSONS_FILE)) return JSON.parse(readFileSync(PERSONS_FILE, 'utf-8'));
  const seed = join(DATA, 'persons.json');
  const seedData: Person[] = existsSync(seed) ? JSON.parse(readFileSync(seed, 'utf-8')) : [];
  writeFileSync(PERSONS_FILE, JSON.stringify(seedData, null, 2));
  return seedData;
}
function loadUsers(): UserRecord[] {
  return existsSync(USERS_FILE) ? JSON.parse(readFileSync(USERS_FILE, 'utf-8')) : [];
}
function loadApiKeys(): any[] {
  return existsSync(APIKEYS_FILE) ? JSON.parse(readFileSync(APIKEYS_FILE, 'utf-8')) : [];
}

/** 月度配额重置：若已过期则清零用量并把 resetAt 推进到下个月 */
function rollReset(rec: { usedMonth: number; resetAt: string }): boolean {
  const now = Date.now();
  if (now < new Date(rec.resetAt).getTime()) return false;
  rec.usedMonth = 0;
  const d = new Date(rec.resetAt);
  while (d.getTime() <= now) d.setMonth(d.getMonth() + 1);
  rec.resetAt = d.toISOString();
  return true;
}

export class JsonStore implements DataStore {
  private persons: Person[] = loadPersons();
  private users: UserRecord[] = loadUsers();
  private apiKeys: any[] = loadApiKeys();
  private comments: any[] = loadComments();
  private audit: any[] = loadAudit();
  private revoked: Set<string> = new Set(loadRevoked());
  private embedCache = new Map<string, { vec: number[]; updatedAt: string }>();

  async init() {}
  async seedIfEmpty() {}

  private savePersons() {
    writeFileSync(PERSONS_FILE, JSON.stringify(this.persons, null, 2));
  }
  private saveUsers() {
    writeFileSync(USERS_FILE, JSON.stringify(this.users, null, 2));
  }
  private saveApiKeys() {
    writeFileSync(APIKEYS_FILE, JSON.stringify(this.apiKeys, null, 2));
  }
  private saveComments() {
    writeFileSync(COMMENTS_FILE, JSON.stringify(this.comments, null, 2));
  }
  private saveAudit() {
    writeFileSync(AUDIT_FILE, JSON.stringify(this.audit, null, 2));
  }
  private saveRevoked() {
    writeFileSync(REVOKED_FILE, JSON.stringify([...this.revoked]));
  }

  async listPersons(opts: ListPersonsQuery): Promise<ListPersonsResult> {
    let arr = this.persons.slice();
    if (opts.q) {
      const t = opts.q.toLowerCase();
      arr = arr.filter((p) => {
        const hay = [
          Object.values(p.names).join(' '),
          ...(p.aliases ?? []),
          Object.values(p.summary).join(' '),
          p.domains.join(' ')
        ].join(' ').toLowerCase();
        return hay.includes(t);
      });
    }
    if (opts.domain) arr = arr.filter((p) => p.domains.includes(opts.domain!));
    if (opts.lang) arr = arr.filter((p) => p.langVersions.includes(opts.lang!));
    const total = arr.length;
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 20;
    const items = arr.slice((page - 1) * pageSize, page * pageSize);
    return { items, total, page, pageSize };
  }

  async getPerson(slug: string): Promise<Person | null> {
    return this.persons.find((p) => p.slug === slug || p.id === slug) ?? null;
  }

  async search(q: string, limit = 12): Promise<SearchHit[]> {
    const t = (q || '').toLowerCase();
    return this.persons
      .filter((p) => {
        const hay = [
          Object.values(p.names).join(' '),
          ...(p.aliases ?? []),
          p.domains.join(' '),
          Object.values(p.summary).join(' ')
        ].join(' ').toLowerCase();
        return hay.includes(t);
      })
      .slice(0, limit)
      .map((p) => ({
        id: p.id,
        slug: p.slug,
        names: p.names,
        domains: p.domains,
        occupations: p.occupations,
        summary: p.summary,
        trustLevel: p.trustLevel
      }));
  }

  async createPerson(input: PersonInput, userId: string): Promise<Person> {
    const now = new Date().toISOString();
    const person: Person = {
      ...input,
      id: randomUUID(),
      slug: slugify(input.names.en || input.names.zh || Object.values(input.names)[0] || 'person'),
      trustLevel: input.trustLevel ?? 'ugc_pending',
      langVersions: (Object.keys(input.names) as Lang[]).filter(
        (k) => (input.names as any)[k]
      ) as Lang[],
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };
    this.persons.unshift(person);
    this.embedCache.delete(person.id);
    this.savePersons();
    return person;
  }

  async updatePerson(
    slug: string, patch: Partial<PersonInput>, userId: string, role: User['role']
  ): Promise<Person | null> {
    const p = await this.getPerson(slug);
    if (!p) return null;
    if (p.createdBy && p.createdBy !== userId && role === 'user') return null;
    const updated: Person = { ...p, ...patch, updatedAt: new Date().toISOString() } as Person;
    const idx = this.persons.findIndex((x) => x.id === p.id);
    this.persons[idx] = updated;
    this.embedCache.delete(updated.id);
    this.savePersons();
    return updated;
  }

  async getRelations(idOrSlug: string): Promise<{ person: Person; relations: RelationView[] } | null> {
    const p = await this.getPerson(idOrSlug);
    if (!p) return null;
    const relations: RelationView[] = [];
    // 出边（本人物指向他人）
    for (const r of p.relations || []) {
      const target = this.persons.find((x) => x.id === r.targetId);
      relations.push({ ...r, targetName: target?.names, targetSlug: target?.slug, incoming: false });
    }
    // 入边（他人指向本人物）——Stage 37+ 统一为双向，修正原先 JSON 仅出边的不一致
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

  async mePersons(userId: string): Promise<Person[]> {
    return this.persons.filter((p) => p.createdBy === userId);
  }

  async registerUser(input: RegisterInput): Promise<{ user: PublicUser }> {
    if (this.users.find((u) => u.email === input.email)) {
      throw { statusCode: 409, message: '该邮箱已注册' };
    }
    const user: UserRecord = {
      id: randomUUID(),
      email: input.email,
      name: input.name,
      role: 'user',
      plan: 'free',
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(input.password)
    };
    this.users.push(user);
    this.saveUsers();
    return { user: toPublic(user) };
  }

  async loginUser(input: LoginInput): Promise<{ user: PublicUser }> {
    const u = this.users.find((x) => x.email === input.email);
    if (!u || !verifyPassword(input.password, u.passwordHash)) {
      throw { statusCode: 401, message: '邮箱或密码错误' };
    }
    return { user: toPublic(u) };
  }

  /**
   * 统一构建完整关系图（人物 + 组织 + 亲属）的节点信息与邻接表，供 getNetwork / getPath 复用。
   * Stage 10：亲属（kin.slug 可解析）作为人物-人物 family 边并入。
   * Stage 37+：affiliations（company/school/org/government）作为独立 org 节点并入，边类型 affiliated。
   */
  private buildGraph(): {
    nodeInfo: Map<string, NetworkNode>;
    adj: Map<string, { to: string; type: string; label?: string; directed: boolean; kinRel?: string }[]>;
  } {
    const byId = new Map(this.persons.map((p) => [p.id, p]));
    const bySlug = new Map(this.persons.map((p) => [p.slug, p]));
    const nodeInfo = new Map<string, NetworkNode>();
    const addNode = (n: NetworkNode) => {
      if (!nodeInfo.has(n.id)) nodeInfo.set(n.id, n);
    };
    for (const p of this.persons) {
      addNode({ id: p.id, slug: p.slug, name: p.names.en || p.names.zh || p.id, trustLevel: p.trustLevel, kind: 'person' });
    }
    const adj = new Map<string, { to: string; type: string; label?: string; directed: boolean; kinRel?: string }[]>();
    const addEdge = (from: string, to: string, type: string, label?: any, directed = false, kinRel?: string) => {
      if (!adj.has(from)) adj.set(from, []);
      adj.get(from)!.push({ to, type, label, directed, kinRel });
    };
    for (const p of this.persons) {
      for (const r of p.relations || []) {
        if (!byId.has(r.targetId)) continue; // 仅人物-人物边
        const lbl = r.label?.en || r.label?.zh;
        addEdge(p.id, r.targetId, r.type, lbl, !!r.directed);
        addEdge(r.targetId, p.id, r.type, lbl, !!r.directed);
      }
      // 亲属边（slug 可解析）：全局并入，family 类型 + kinRel 供前端 13 语翻译
      for (const k of p.kin || []) {
        if (!k.slug) continue;
        const target = bySlug.get(k.slug);
        if (!target || target.id === p.id) continue;
        addEdge(p.id, target.id, 'family', undefined, false, k.relation);
        addEdge(target.id, p.id, 'family', undefined, false, k.relation);
      }
      // Stage 37+：组织/机构/学校/政府作为独立节点并入图谱（kind='org'）
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

  /** Neo4j 等价能力：JSON 适配器以内存 BFS 遍历关系网络（双向，与 PG/Neo4j 一致） */
  async getNetwork(idOrSlug: string, depth = 2): Promise<Network | null> {
    const start = await this.getPerson(idOrSlug);
    if (!start) return null;
    const bySlug = new Map(this.persons.map((p) => [p.slug, p]));
    const { nodeInfo, adj } = this.buildGraph();
    const visited = new Set<string>([start.id]);
    const nodes: Network['nodes'] = [{ ...nodeInfo.get(start.id)!, id: start.id }];
    const edges: Network['edges'] = [];
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
    // 中心人物的未收录亲属 → 虚拟节点（kind='kin'，前端不可点击、灰色虚线）
    (start.kin || []).forEach((k, i) => {
      if (k.slug && bySlug.has(k.slug)) return; // 已作为真实节点并入
      const vid = `kin:${start.id}:${i}`;
      nodes.push({ id: vid, slug: '', name: k.name.en || k.name.zh || vid, trustLevel: 'kin', kind: 'kin' });
      edges.push({ source: start.id, target: vid, type: 'family', directed: false, kinRel: k.relation });
    });
    return { nodes, edges };
  }

  /** Stage 37+：在完整关系图上做无向 BFS，返回两人之间最短路径的子图（含 org 节点） */
  async getPath(fromIdOrSlug: string, toIdOrSlug: string): Promise<Network | null> {
    const a = await this.getPerson(fromIdOrSlug);
    const b = await this.getPerson(toIdOrSlug);
    if (!a || !b) return null;
    const { nodeInfo, adj } = this.buildGraph();
    const parent = new Map<string, { from: string; edge: { to: string; type: string; label?: string; directed: boolean; kinRel?: string } }>();
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
    if (!parent.has(b.id)) return { nodes: [], edges: [] }; // 无可达路径
    const pathIds: string[] = [b.id];
    let cur = b.id;
    while (cur !== a.id) {
      cur = parent.get(cur)!.from;
      pathIds.push(cur);
    }
    pathIds.reverse();
    const nodes: Network['nodes'] = pathIds.map((id) => ({ ...nodeInfo.get(id)!, id }));
    const edges: Network['edges'] = [];
    for (let i = 0; i < pathIds.length - 1; i++) {
      const from = pathIds[i];
      const to = pathIds[i + 1];
      const e =
        (adj.get(from) || []).find((x) => x.to === to) || (adj.get(to) || []).find((x) => x.to === from);
      if (e) edges.push({ source: from, target: to, type: e.type, label: e.label, directed: e.directed, kinRel: e.kinRel });
    }
    return { nodes, edges };
  }

  // ---------------- 向量（语义）检索（内存余弦，开发默认） ----------------
  private async embedPerson(p: Person): Promise<number[]> {
    const cached = this.embedCache.get(p.id);
    if (cached && cached.updatedAt === p.updatedAt) return cached.vec;
    const emb = await getEmbedder();
    const [vec] = await emb.embed([personCorpus(p)]);
    this.embedCache.set(p.id, { vec, updatedAt: p.updatedAt });
    return vec;
  }

  async semanticSearch(query: string, opts: { limit?: number; lang?: string } = {}): Promise<VectorHit[]> {
    const emb = await getEmbedder();
    const [qv] = await emb.embed([query || '']);
    const qn = norm(qv);
    const k = opts.limit ?? 6;
    const scored: { person: Person; score: number }[] = [];
    for (const p of this.persons) {
      const v = await this.embedPerson(p);
      scored.push({ person: p, score: cosine(qv, qn, v) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).map(({ person, score }) => ({
      hit: {
        id: person.id,
        slug: person.slug,
        names: person.names,
        domains: person.domains,
        occupations: person.occupations,
        summary: person.summary,
        trustLevel: person.trustLevel
      },
      score
    }));
  }

  async reembed(): Promise<void> {
    this.embedCache.clear();
    console.log('[embed] json cache cleared (re-embed on next query)');
  }

  // ---------------- UGC 审核 ----------------
  async listByTrust(trust: Person['trustLevel'], limit = 100): Promise<Person[]> {
    return this.persons.filter((p) => p.trustLevel === trust).slice(0, limit);
  }

  async setTrustLevel(idOrSlug: string, trust: Person['trustLevel']): Promise<Person | null> {
    const p = await this.getPerson(idOrSlug);
    if (!p) return null;
    const idx = this.persons.findIndex((x) => x.id === p.id);
    this.persons[idx] = { ...p, trustLevel: trust, updatedAt: new Date().toISOString() };
    this.embedCache.delete(p.id);
    this.savePersons();
    return this.persons[idx];
  }

  async ensureAdmin(email: string, password: string, name = 'Admin'): Promise<void> {
    const existing = this.users.find((u) => u.email === email);
    if (existing) {
      if (existing.role !== 'admin') {
        existing.role = 'admin';
        this.saveUsers();
      }
      return;
    }
    this.users.push({
      id: randomUUID(),
      email,
      name,
      role: 'admin',
      plan: 'free',
      createdAt: new Date().toISOString(),
      passwordHash: hashPassword(password)
    });
    this.saveUsers();
    console.log(`[seed] admin user ensured: ${email}`);
  }

  // ---------------- PGC 专家背书 ----------------
  async endorsePerson(
    idOrSlug: string, expert: { id: string; name: string }, comment?: string
  ): Promise<Person | null> {
    const p = await this.getPerson(idOrSlug);
    if (!p) return null;
    const list = (p.endorsements ?? []).filter((e) => e.expertId !== expert.id);
    list.push({
      id: randomUUID(),
      expertId: expert.id,
      expertName: expert.name,
      comment,
      createdAt: new Date().toISOString()
    });
    const idx = this.persons.findIndex((x) => x.id === p.id);
    this.persons[idx] = {
      ...p,
      endorsements: list,
      // 专家背书即权威升级：ugc_verified → pgc（待审/草稿不越级，需先过审）
      trustLevel: p.trustLevel === 'ugc_verified' ? 'pgc' : p.trustLevel,
      updatedAt: new Date().toISOString()
    };
    this.embedCache.delete(p.id);
    this.savePersons();
    return this.persons[idx];
  }

  // ---------------- 用户管理（admin） ----------------
  async listUsers(limit = 200): Promise<PublicUser[]> {
    return this.users.slice(0, limit).map(toPublic);
  }

  async setUserRole(userId: string, role: User['role']): Promise<PublicUser | null> {
    const u = this.users.find((x) => x.id === userId);
    if (!u) return null;
    u.role = role;
    this.saveUsers();
    return toPublic(u);
  }

  async getUserById(id: string): Promise<PublicUser | null> {
    const u = this.users.find((x) => x.id === id);
    return u ? toPublic(u) : null;
  }

  // ---------------- 开放 API 密钥 ----------------
  async createApiKey(userId: string, name: string, plan: 'free' | 'pro'): Promise<ApiKeyCreated> {
    const { key, hash, prefix } = generateApiKey();
    const now = new Date();
    const resetAt = new Date(now);
    resetAt.setMonth(resetAt.getMonth() + 1);
    const rec = {
      id: randomUUID(),
      userId,
      name: name || 'default',
      hash,
      prefix,
      quotaMonth: QUOTA_BY_PLAN[plan] || QUOTA_BY_PLAN.free,
      usedMonth: 0,
      active: true,
      resetAt: resetAt.toISOString(),
      createdAt: now.toISOString()
    };
    this.apiKeys.push(rec);
    this.saveApiKeys();
    return {
      key,
      view: {
        id: rec.id, name: rec.name, prefix: rec.prefix,
        quotaMonth: rec.quotaMonth, usedMonth: rec.usedMonth,
        active: rec.active, resetAt: rec.resetAt, createdAt: rec.createdAt
      }
    };
  }

  async listApiKeys(userId: string): Promise<ApiKeyView[]> {
    return this.apiKeys
      .filter((k) => k.userId === userId)
      .map((k) => ({
        id: k.id, name: k.name, prefix: k.prefix,
        quotaMonth: k.quotaMonth, usedMonth: k.usedMonth,
        active: k.active, resetAt: k.resetAt, createdAt: k.createdAt
      }));
  }

  async revokeApiKey(userId: string, id: string): Promise<boolean> {
    const k = this.apiKeys.find((x) => x.id === id && x.userId === userId);
    if (!k) return false;
    k.active = false;
    this.saveApiKeys();
    return true;
  }

  async findApiKeyByHash(hash: string): Promise<{
    keyId: string; userId: string; name: string;
    quotaMonth: number; usedMonth: number; resetAt: string; active: boolean;
  } | null> {
    const k = this.apiKeys.find((x) => x.hash === hash);
    if (!k) return null;
    if (rollReset(k)) this.saveApiKeys();
    return {
      keyId: k.id, userId: k.userId, name: k.name,
      quotaMonth: k.quotaMonth, usedMonth: k.usedMonth,
      resetAt: k.resetAt, active: k.active
    };
  }

  async bumpApiUsage(keyId: string): Promise<void> {
    const k = this.apiKeys.find((x) => x.id === keyId);
    if (!k) return;
    k.usedMonth += 1;
    this.saveApiKeys();
  }

  // ---------------- 专业订阅 ----------------
  async subscribe(userId: string, plan: 'free' | 'pro'): Promise<PublicUser | null> {
    const u = this.users.find((x) => x.id === userId);
    if (!u) return null;
    u.plan = plan;
    this.saveUsers();
    return toPublic(u);
  }

  async setPlan(userId: string, plan: 'free' | 'pro'): Promise<PublicUser | null> {
    const u = this.users.find((x) => x.id === userId);
    if (!u) return null;
    u.plan = plan;
    this.saveUsers();
    return toPublic(u);
  }

  // ---------------- 登出 / 令牌吊销 ----------------
  async revokeToken(jti: string): Promise<void> {
    this.revoked.add(jti);
    this.saveRevoked();
  }
  isTokenRevoked(jti: string): boolean {
    return this.revoked.has(jti);
  }

  // ---------------- 管理后台增强（Stage 4：统计 + 审计） ----------------
  async getStats(): Promise<AdminStats> {
    const byTrust: Record<string, number> = {};
    for (const p of this.persons) byTrust[p.trustLevel] = (byTrust[p.trustLevel] || 0) + 1;
    const byRole: Record<string, number> = {};
    let pro = 0;
    for (const u of this.users) {
      byRole[u.role] = (byRole[u.role] || 0) + 1;
      if (u.plan === 'pro') pro += 1;
    }
    const apiCallsMonth = this.apiKeys.reduce((s: number, k: any) => s + (k.usedMonth || 0), 0);
    return {
      persons: { total: this.persons.length, byTrust },
      pendingUgc: byTrust['ugc_pending'] || 0,
      users: { total: this.users.length, byRole, pro },
      comments: this.comments.length,
      apiCallsMonth
    };
  }

  async recordAudit(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<void> {
    this.audit.push({ ...entry, id: randomUUID(), createdAt: new Date().toISOString() });
    this.saveAudit();
  }

  async getAudit(limit = 100): Promise<AuditEntry[]> {
    return [...this.audit]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  // ---------------- 社区评论 ----------------
  async listComments(personId: string): Promise<Comment[]> {
    return this.comments
      .filter((c) => c.personId === personId && c.status === 'published')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((c) => ({
        id: c.id, personId: c.personId, personSlug: c.personSlug,
        userId: c.userId, userName: c.userName, body: c.body,
        status: c.status, createdAt: c.createdAt
      }));
  }

  async addComment(
    personId: string, personSlug: string, userId: string, userName: string, body: string
  ): Promise<Comment | null> {
    const comment = {
      id: randomUUID(),
      personId, personSlug, userId, userName,
      body, status: 'published', createdAt: new Date().toISOString()
    };
    this.comments.push(comment);
    this.saveComments();
    return {
      id: comment.id, personId, personSlug, userId, userName,
      body, status: 'published', createdAt: comment.createdAt
    };
  }
}

// 向量工具：余弦相似度（对查询做 L2 归一化后等于点积）
function norm(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s) || 1;
  return v.map((x) => x / n);
}
function cosine(a: number[], an: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += an[i] * b[i];
  return dot;
}
