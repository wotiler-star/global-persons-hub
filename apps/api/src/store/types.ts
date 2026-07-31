// 存储抽象层类型：所有适配器（JSON / PostgreSQL+Neo4j）必须实现 DataStore
import type {
  Person, User, PublicUser, ListPersonsQuery, ListPersonsResult,
  PersonInput, Relation, RegisterInput, LoginInput, Lang, TrustLevel,
  ApiKeyView, ApiKeyCreated, Comment, UserPlan
} from '@gph/types';

/** 带密码哈希的用户记录（仅后端存储层使用，不向前端暴露） */
export interface UserRecord extends User {
  passwordHash: string;
}

/** 关系视图：在原始 Relation 基础上补全目标人物的多语种名称，供前端图谱渲染 */
export interface RelationView extends Relation {
  targetName?: Partial<Record<Lang, string>>;
  targetSlug?: string;
  /** Stage 37+：该边是否为「他人指向本人物」的入边（双向关系统一后用于侧栏区分） */
  incoming?: boolean;
}

/** 搜索命中（轻量卡片数据，避免一次性回传整份人物档案） */
export interface SearchHit {
  id: string;
  slug: string;
  names: Partial<Record<Lang, string>>;
  domains: Person['domains'];
  occupations?: Partial<Record<Lang, string>>;
  summary?: Partial<Record<Lang, string>>;
  trustLevel: TrustLevel;
}

/** 向量检索命中：基础卡片 + 余弦相似度（0~1，越大越相关） */
export interface VectorHit {
  hit: SearchHit;
  score: number;
}

/** 图谱网络（Neo4j 遍历结果 / JSON 回退 BFS 结果） */
export interface NetworkNode {
  id: string;
  slug: string;
  name: string;
  trustLevel: string;
  /** Stage 37+：节点种类——person(默认) / org(组织·机构·学校·政府) / kin(未收录虚拟亲属) */
  kind?: 'person' | 'org' | 'kin';
  /** 当 kind='org' 时：机构类型（company/school/org/government），前端着色用 */
  orgType?: string;
}
export interface NetworkEdge {
  source: string;
  target: string;
  type: string;
  label?: string;
  directed: boolean;
  /** Stage 10：亲属边标记（KinRelation 键，如 father/spouse），前端据此做 13 语翻译 */
  kinRel?: string;
}
export interface Network {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

/** 管理后台统计快照（Stage 4 治理看板） */
export interface AdminStats {
  persons: { total: number; byTrust: Record<string, number> };
  pendingUgc: number;
  users: { total: number; byRole: Record<string, number>; pro: number };
  comments: number;
  apiCallsMonth: number;
}

/** 管理后台操作审计条目（Stage 4 问责留痕） */
export interface AuditEntry {
  id: string;
  actorId: string;
  actorName: string;
  action: 'approve' | 'reject' | 'pending' | 'endorse' | 'role';
  targetType: 'person' | 'user';
  targetId: string;
  targetLabel?: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

/**
 * 统一存储契约（全异步）。
 * - PostgreSQL+Neo4j 适配器：PG 为系统记录（含全文检索），Neo4j 承担关系图谱遍历
 * - JSON 适配器：零依赖本地开发默认，行为与原实现一致
 */
export interface DataStore {
  init(): Promise<void>;
  seedIfEmpty(seedPath: string): Promise<void>;

  listPersons(opts: ListPersonsQuery): Promise<ListPersonsResult>;
  getPerson(slug: string): Promise<Person | null>;
  search(q: string, limit?: number): Promise<SearchHit[]>;
  createPerson(input: PersonInput, userId: string): Promise<Person>;
  updatePerson(
    slug: string, patch: Partial<PersonInput>, userId: string, role: User['role']
  ): Promise<Person | null>;
  getRelations(idOrSlug: string): Promise<{ person: Person; relations: RelationView[] } | null>;
  mePersons(userId: string): Promise<Person[]>;

  registerUser(input: RegisterInput): Promise<{ user: PublicUser }>;
  loginUser(input: LoginInput): Promise<{ user: PublicUser }>;

  /** Neo4j 支撑的多跳关系网络遍历；JSON 适配器以内存 BFS 提供等价能力 */
  getNetwork(idOrSlug: string, depth?: number): Promise<Network | null>;

  /** Stage 37+：在完整关系图（人物+组织+亲属）上做 BFS，返回两人之间的最短路径子图 */
  getPath(fromIdOrSlug: string, toIdOrSlug: string): Promise<Network | null>;

  /** 向量（语义）检索：基于 pgvector / 本地余弦，返回带相似度的命中（RAG 检索底座） */
  semanticSearch(query: string, opts?: { limit?: number; lang?: string }): Promise<VectorHit[]>;

  /** 以 PG 为事实源重建 Neo4j 图谱（reindex 脚本调用） */
  syncGraph?(): Promise<void>;

  /** 重算全部向量嵌入（reindex 脚本调用；JSON 适配器清缓存） */
  reembed?(full?: boolean): Promise<void>;

  // ---------- UGC 审核（admin / expert） ----------
  /** 按权威等级列出人物（审核队列：trust=ugc_pending） */
  listByTrust(trust: TrustLevel, limit?: number): Promise<Person[]>;
  /** 审核裁决：调整人物权威等级（通过→ugc_verified / 退回→ugc_pending / 下线→ai_draft） */
  setTrustLevel(idOrSlug: string, trust: TrustLevel): Promise<Person | null>;
  /** 确保存在管理员账号（种子/环境变量驱动，幂等） */
  ensureAdmin(email: string, password: string, name?: string): Promise<void>;

  // ---------- PGC 专家背书 ----------
  /**
   * 专家/管理员为人物背书：追加背书记录；若人物当前为 ugc_verified 则自动升级为 pgc。
   * 同一专家对同一人物仅保留一条背书（幂等覆盖 comment）。
   */
  endorsePerson(
    idOrSlug: string, expert: { id: string; name: string }, comment?: string
  ): Promise<Person | null>;

  // ---------- 用户管理（admin） ----------
  /** 列出注册用户（不含密码哈希） */
  listUsers(limit?: number): Promise<PublicUser[]>;
  /** 调整用户角色：user / expert / admin */
  setUserRole(userId: string, role: User['role']): Promise<PublicUser | null>;
  /** 按 id 取公开用户（API Key 鉴权时回填调用方身份） */
  getUserById(id: string): Promise<PublicUser | null>;

  // ---------- 开放 API 密钥（Stage 3） ----------
  /** 创建密钥：按创建时的套餐给定月度配额；明文仅此刻返回一次 */
  createApiKey(userId: string, name: string, plan: UserPlan): Promise<ApiKeyCreated>;
  /** 列出某用户的所有密钥（不含哈希/明文） */
  listApiKeys(userId: string): Promise<ApiKeyView[]>;
  /** 吊销密钥 */
  revokeApiKey(userId: string, id: string): Promise<boolean>;
  /**
   * 按哈希查找密钥（用于 X-API-Key 鉴权）。
   * 返回已应用月度配额重置的当前用量；无匹配/已吊销返回 null。
   */
  findApiKeyByHash(hash: string): Promise<{
    keyId: string; userId: string; name: string;
    quotaMonth: number; usedMonth: number; resetAt: string; active: boolean;
  } | null>;
  /** 配额计数 +1（每次成功鉴权并放行后调用） */
  bumpApiUsage(keyId: string): Promise<void>;

  // ---------- 专业订阅（Stage 3 / 支付接入） ----------
  /** 调整订阅套餐：free / pro（mock 升级，无真实支付） */
  subscribe(userId: string, plan: UserPlan): Promise<PublicUser | null>;
  /** 直接设定套餐（支付 Webhook 回调成功后置 pro；或从 pro 降回 free） */
  setPlan(userId: string, plan: UserPlan): Promise<PublicUser | null>;

  // ---------- 管理后台增强（Stage 4：统计 + 审计） ----------
  /** 平台运营统计快照（治理看板） */
  getStats(): Promise<AdminStats>;
  /** 追加一条操作审计记录（审核/背书/改角色等治理动作均留痕） */
  recordAudit(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<void>;
  /** 最近审计记录（按时间倒序） */
  getAudit(limit?: number): Promise<AuditEntry[]>;

  // ---------- 社区评论（Stage 3） ----------
  /** 列出人物公开评论（按时间正序） */
  listComments(personId: string): Promise<Comment[]>;
  /** 新增评论（默认 published） */
  addComment(
    personId: string, personSlug: string, userId: string, userName: string, body: string
  ): Promise<Comment | null>;
}
