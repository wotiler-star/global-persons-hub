import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { openapi } from '@gph/types/openapi';
import type { PersonInput, RegisterInput, LoginInput, Lang } from '@gph/types';
import type { DataStore } from './store/types.js';
import type { Uploader } from './uploader/index.js';
import { getProvider } from './payments/index.js';
import type { PaymentProvider } from './payments/index.js';
import { askRag } from './rag/rag.js';
import { sha256Hex } from './store/crypto.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: { id: string; email: string; name: string; role: string; plan?: string };
  }
}

// API Key 鉴权后的调用方身份（挂在 request 上供配额计数与日志使用）
declare module 'fastify' {
  interface FastifyRequest {
    apiUser?: { id: string; name: string };
  }
}

async function authPreHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'unauthorized', message: '请先登录' });
  }
}

/** 审核权限：仅 admin / expert 可进入审核后台 */
async function moderatorPreHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'unauthorized', message: '请先登录' });
  }
  const role = (request.user as any)?.role;
  if (role !== 'admin' && role !== 'expert') {
    return reply.code(403).send({ error: 'forbidden', message: '需要管理员或专家权限' });
  }
}

/** 仅 admin 可管理用户角色 */
async function adminPreHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'unauthorized', message: '请先登录' });
  }
  if ((request.user as any)?.role !== 'admin') {
    return reply.code(403).send({ error: 'forbidden', message: '需要管理员权限' });
  }
}

export async function registerRoutes(app: FastifyInstance, store: DataStore, uploader: Uploader) {
  // 保留原始请求体用于支付 Webhook 验签（Stripe / 微信 JSON、支付宝 form）。
  // parseAs:'string' 让我们拿到原始字符串，同时仍解析为对象供其他路由使用。
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, bodyStr, done) => {
    const raw = bodyStr as string;
    (req as any).rawBody = raw;
    try {
      done(null, JSON.parse(raw));
    } catch (e) {
      done(e as Error, undefined);
    }
  });
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, bodyStr, done) => {
    const raw = bodyStr as string;
    (req as any).rawBody = raw;
    try {
      done(null, Object.fromEntries(new URLSearchParams(raw)));
    } catch (e) {
      done(e as Error, undefined);
    }
  });
  /**
   * 开放 API 鉴权（软前置）：读取 X-API-Key，校验哈希 + 激活 + 月度配额。
   * - 校验通过：重置过期配额、计数 +1、回填 request.apiUser，放行。
   * - 配额耗尽：429。无密钥：透传（公开读接口仍可为匿名访问）。
   */
  async function apiKeyPreHandler(request: FastifyRequest, reply: FastifyReply) {
    const key = request.headers['x-api-key'];
    if (!key || typeof key !== 'string') return; // 无密钥 → 透传
    const rec = await store.findApiKeyByHash(sha256Hex(key));
    if (!rec) return reply.code(401).send({ error: 'invalid_api_key', message: 'API 密钥无效' });
    if (!rec.active) return reply.code(403).send({ error: 'key_revoked', message: 'API 密钥已吊销' });
    if (rec.usedMonth >= rec.quotaMonth) {
      return reply.code(429).send({
        error: 'quota_exceeded',
        message: '本月配额已用尽',
        quotaMonth: rec.quotaMonth,
        usedMonth: rec.usedMonth,
        resetAt: rec.resetAt
      });
    }
    await store.bumpApiUsage(rec.keyId);
    request.apiUser = { id: rec.userId, name: rec.name };
  }

  app.get('/health', async () => ({ ok: true }));
  app.get('/openapi.json', async () => openapi);

  // 列出 / 搜索人物（跨领域）——支持 X-API-Key（开放 API 配额计数）
  app.get('/persons', { preHandler: apiKeyPreHandler }, async (request) => {
    const q = request.query as any;
    return store.listPersons({
      q: q.q,
      domain: q.domain,
      lang: q.lang,
      page: q.page ? Number(q.page) : 1,
      pageSize: q.pageSize ? Number(q.pageSize) : 20
    });
  });

  // 第三方用户上传自己的人物数据（需登录）
  app.post('/persons', { preHandler: authPreHandler }, async (request, reply) => {
    const body = request.body as PersonInput;
    if (!body || !body.names || !Object.values(body.names).some(Boolean)) {
      return reply.code(400).send({ error: 'bad_request', message: 'names 不能为空' });
    }
    const uid = (request.user as any).id;
    const person = await store.createPerson(body, uid);
    return reply.code(201).send(person);
  });

  // 单个人物详情（结构化 + 关系）——支持 X-API-Key
  app.get('/persons/:slug', { preHandler: apiKeyPreHandler }, async (request, reply) => {
    const { slug } = request.params as any;
    const p = await store.getPerson(slug);
    if (!p) return reply.code(404).send({ error: 'not_found', message: '人物不存在' });
    return p;
  });

  // 编辑人物（本人 / 专家 / 管理员）
  app.patch('/persons/:slug', { preHandler: authPreHandler }, async (request, reply) => {
    const { slug } = request.params as any;
    const body = request.body as Partial<PersonInput>;
    const u = request.user as any;
    const updated = await store.updatePerson(slug, body, u.id, u.role);
    if (!updated) return reply.code(403).send({ error: 'forbidden', message: '无权编辑或无此人物' });
    return updated;
  });

  // 跨领域语义搜索（关键词 / 全文）——支持 X-API-Key
  app.get('/search', { preHandler: apiKeyPreHandler }, async (request) => {
    const q = (request.query as any).q || '';
    return { q, results: await store.search(q) };
  });

  // 向量（语义）检索：pgvector 余弦 / 本地余弦，返回带相似度的命中（RAG 检索底座）——支持 X-API-Key
  app.get('/search/semantic', { preHandler: apiKeyPreHandler }, async (request) => {
    const q = (request.query as any).q || '';
    const limit = (request.query as any)?.limit ? Number((request.query as any).limit) : 6;
    const lang = ((request.query as any).lang as Lang) || 'zh';
    const hits = await store.semanticSearch(q, { limit, lang });
    return { q, results: hits };
  });

  // RAG 事实问答（GET 便捷入口）——支持 X-API-Key
  app.get('/rag/ask', { preHandler: apiKeyPreHandler }, async (request, reply) => {
    const q = (request.query as any).q || '';
    if (!q) return reply.code(400).send({ error: 'bad_request', message: '缺少 q 参数' });
    const lang = ((request.query as any).lang as Lang) || 'zh';
    const limit = (request.query as any)?.limit ? Number((request.query as any).limit) : 5;
    return askRag(store, q, lang, limit);
  });

  // RAG 事实问答（POST，主要入口）——支持 X-API-Key
  app.post('/rag/ask', { preHandler: apiKeyPreHandler }, async (request, reply) => {
    const body = (request.body || {}) as any;
    const q = body.query || '';
    if (!q) return reply.code(400).send({ error: 'bad_request', message: 'query 不能为空' });
    const lang = (body.lang as Lang) || 'zh';
    const limit = body.limit ? Number(body.limit) : 5;
    return askRag(store, q, lang, limit);
  });

  // 关系图谱邻接（结构化，供前端渲染）
  app.get('/relations/:id', async (request, reply) => {
    const { id } = request.params as any;
    const r = await store.getRelations(id);
    if (!r) return reply.code(404).send({ error: 'not_found', message: '人物不存在' });
    return r;
  });

  // Neo4j 支撑的多跳关系网络（深度可配）
  app.get('/graph/network/:id', async (request, reply) => {
    const { id } = request.params as any;
    const depth = (request.query as any)?.depth ? Number((request.query as any).depth) : 2;
    const net = await store.getNetwork(id, depth);
    if (!net) return reply.code(404).send({ error: 'not_found', message: '人物不存在' });
    return net;
  });

  // Stage 37+：两人之间最短关系路径（BFS 于完整关系图）
  app.get('/graph/path/:from/:to', async (request, reply) => {
    const { from, to } = request.params as any;
    const net = await store.getPath(from, to);
    if (!net) return reply.code(404).send({ error: 'not_found', message: '人物不存在' });
    return net;
  });

  // 注册
  app.post('/auth/register', async (request, reply) => {
    try {
      const { user } = await store.registerUser(request.body as RegisterInput);
      return reply.code(201).send({ user });
    } catch (e: any) {
      return reply.code(e.statusCode || 400).send({ error: 'register_failed', message: e.message });
    }
  });

  // 登录（签发 JWT）
  app.post('/auth/login', async (request, reply) => {
    try {
      const { user } = await store.loginUser(request.body as LoginInput);
      const token = app.jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan });
      return { token, user };
    } catch (e: any) {
      return reply.code(e.statusCode || 401).send({ error: 'login_failed', message: e.message });
    }
  });

  // 当前用户（含订阅套餐 plan）
  app.get('/me', { preHandler: authPreHandler }, async (request) => {
    const u = request.user as any;
    const full = await store.getUserById(u.id);
    return { user: full || u };
  });

  // 当前用户上传/编辑的人物
  app.get('/me/persons', { preHandler: authPreHandler }, async (request) => {
    const uid = (request.user as any).id;
    return store.mePersons(uid);
  });

  // ---------- UGC 审核后台（admin / expert） ----------
  // 待审核队列
  app.get('/admin/persons/pending', { preHandler: moderatorPreHandler }, async () => {
    return { items: await store.listByTrust('ugc_pending') };
  });

  // 审核裁决：approve → ugc_verified；reject → ai_draft（下线出公开图谱层级）
  app.patch('/admin/persons/:id/status', { preHandler: moderatorPreHandler }, async (request, reply) => {
    const { id } = request.params as any;
    const { action, reason } = (request.body || {}) as { action?: string; reason?: string };
    const map: Record<string, 'ugc_verified' | 'ai_draft' | 'ugc_pending'> = {
      approve: 'ugc_verified',
      reject: 'ai_draft',
      pending: 'ugc_pending'
    };
    const trust = map[action || ''];
    if (!trust) return reply.code(400).send({ error: 'bad_request', message: 'action 需为 approve/reject/pending' });
    const p = await store.setTrustLevel(id, trust);
    if (!p) return reply.code(404).send({ error: 'not_found', message: '人物不存在' });
    const u = request.user as any;
    await store.recordAudit({
      actorId: u.id, actorName: u.name,
      action: action as any, targetType: 'person', targetId: id,
      targetLabel: (p.names?.zh || p.names?.en || id) as string,
      meta: reason ? { reason } : undefined
    });
    return p;
  });

  // ---------- PGC 专家背书（admin / expert） ----------
  // 背书即权威升级：ugc_verified → pgc；同一专家幂等覆盖
  app.post('/admin/persons/:id/endorse', { preHandler: moderatorPreHandler }, async (request, reply) => {
    const { id } = request.params as any;
    const { comment } = (request.body || {}) as { comment?: string };
    const u = request.user as any;
    const p = await store.endorsePerson(id, { id: u.id, name: u.name }, comment);
    if (!p) return reply.code(404).send({ error: 'not_found', message: '人物不存在' });
    await store.recordAudit({
      actorId: u.id, actorName: u.name, action: 'endorse', targetType: 'person',
      targetId: id, targetLabel: (p.names?.zh || p.names?.en || id) as string,
      meta: comment ? { comment } : undefined
    });
    return p;
  });

  // ---------- 用户管理（仅 admin） ----------
  app.get('/admin/users', { preHandler: adminPreHandler }, async () => {
    return { items: await store.listUsers() };
  });

  // 角色调整：user / expert / admin（用于提升 PGC 专家）
  app.patch('/admin/users/:id/role', { preHandler: adminPreHandler }, async (request, reply) => {
    const { id } = request.params as any;
    const { role } = (request.body || {}) as { role?: string };
    if (!role || !['user', 'expert', 'admin'].includes(role)) {
      return reply.code(400).send({ error: 'bad_request', message: 'role 需为 user/expert/admin' });
    }
    if (id === (request.user as any).id && role !== 'admin') {
      return reply.code(400).send({ error: 'bad_request', message: '不能降级自己的管理员权限' });
    }
    const updated = await store.setUserRole(id, role as any);
    if (!updated) return reply.code(404).send({ error: 'not_found', message: '用户不存在' });
    const u = request.user as any;
    await store.recordAudit({
      actorId: u.id, actorName: u.name, action: 'role', targetType: 'user',
      targetId: id, targetLabel: updated.name, meta: { role }
    });
    return updated;
  });

  // ---------- 管理后台增强（Stage 4：统计 + 审计） ----------
  app.get('/admin/stats', { preHandler: moderatorPreHandler }, async () => store.getStats());
  app.get('/admin/audit', { preHandler: moderatorPreHandler }, async () => {
    return { items: await store.getAudit(100) };
  });

  // ---------- 开放 API 密钥（Stage 3） ----------
  // 列出我的密钥
  app.get('/me/apikeys', { preHandler: authPreHandler }, async (request) => {
    const uid = (request.user as any).id;
    return { items: await store.listApiKeys(uid) };
  });

  // 创建密钥（明文仅此刻返回一次）
  app.post('/me/apikeys', { preHandler: authPreHandler }, async (request, reply) => {
    const u = request.user as any;
    const { name } = (request.body || {}) as { name?: string };
    const full = await store.getUserById(u.id);
    const plan = (full as any)?.plan || (u as any).plan || 'free';
    const created = await store.createApiKey(u.id, name || 'default', plan);
    return reply.code(201).send(created);
  });

  // 吊销密钥
  app.delete('/me/apikeys/:id', { preHandler: authPreHandler }, async (request, reply) => {
    const uid = (request.user as any).id;
    const { id } = request.params as any;
    const ok = await store.revokeApiKey(uid, id);
    if (!ok) return reply.code(404).send({ error: 'not_found', message: '密钥不存在' });
    return { ok: true };
  });

  // ---------- 专业订阅（支付接入） ----------
  // 按渠道创建支付会话；未配置真实密钥时回退 mock 直接置 pro（保证开发流程可演示）。
  app.post('/me/subscribe', { preHandler: authPreHandler }, async (request, reply) => {
    const uid = (request.user as any).id;
    const u = await store.getUserById(uid);
    if (!u) return reply.code(404).send({ error: 'not_found', message: '用户不存在' });
    const { provider, plan, lang } = (request.body || {}) as { provider?: string; plan?: string; lang?: string };
    const target = plan === 'pro' || plan === 'free' ? (plan as 'pro' | 'free') : 'pro';
    const chosen =
      provider === 'stripe' || provider === 'wechat' || provider === 'alipay'
        ? (provider as 'stripe' | 'wechat' | 'alipay')
        : (process.env.PAYMENT_PROVIDER || 'mock').toLowerCase() === 'mock'
          ? 'mock'
          : (provider as any);
    const prov = getProvider(chosen);
    const origin = `${request.protocol}://${request.headers.host || request.hostname}`;
    const input = { userId: uid, email: u.email, name: u.name, plan: target, lang: lang || 'zh', origin };

    // 未配置真实密钥（且非显式 mock）→ 回退 mock 直接生效
    if (chosen !== 'mock' && !prov.configured()) {
      await store.setPlan(uid, target);
      return reply.send({ provider: 'mock', mock: true, plan: target });
    }
    if (chosen === 'mock') {
      await store.setPlan(uid, target);
      return reply.send({ provider: 'mock', mock: true, plan: target });
    }
    const res = await prov.createCheckout(input);
    return reply.send({ ...res, plan: target });
  });

  // ---------- 支付 Webhook 回调 ----------
  const handleWebhook = (prov: PaymentProvider) => async (request: FastifyRequest, reply: FastifyReply) => {
    const raw = ((request as any).rawBody as string) || '';
    const evt = await prov.verifyWebhook(raw, request.headers as Record<string, string | undefined>);
    if (!evt) return reply.code(400).send({ error: 'invalid_signature' });
    const u = await store.setPlan(evt.userId, evt.plan);
    if (!u) return reply.code(404).send({ error: 'user_not_found' });
    return reply.send({ ok: true });
  };
  app.post('/webhooks/stripe', handleWebhook(getProvider('stripe')));
  app.post('/webhooks/wechat', handleWebhook(getProvider('wechat')));
  app.post('/webhooks/alipay', handleWebhook(getProvider('alipay')));

  // 前端可用的支付渠道清单（含是否已配置密钥）
  app.get('/payments/providers', async () => {
    const names = ['stripe', 'wechat', 'alipay', 'mock'] as const;
    return {
      default: (process.env.PAYMENT_PROVIDER || 'mock').toLowerCase(),
      providers: names.map((n) => ({ name: n, configured: getProvider(n).configured() })),
    };
  });

  // ---------- 图片上传（Stage 3） ----------
  // base64 JSON 上传（MVP 免第三方依赖；生产可切换对象存储）
  app.post('/upload', { preHandler: authPreHandler }, async (request, reply) => {
    const body = (request.body || {}) as { file?: string; name?: string };
    const dataUrl = body.file || '';
    const m = /^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
    if (!m) return reply.code(400).send({ error: 'bad_request', message: 'file 需为 data:image/...;base64,...' });
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1].replace(/[^a-z0-9]/gi, '');
    if (!/^(jpg|png|gif|webp)$/i.test(ext)) {
      return reply.code(400).send({ error: 'bad_type', message: '仅支持 jpg/png/gif/webp' });
    }
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 5 * 1024 * 1024) {
      return reply.code(413).send({ error: 'too_large', message: '图片需 < 5MB' });
    }
    const filename = `${randomUUID()}.${ext}`;
    const res = await uploader.put(filename, buf, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
    return reply.code(201).send(res);
  });

  // ---------- 社区评论（Stage 3） ----------
  // 列出人物公开评论
  app.get('/persons/:slug/comments', async (request, reply) => {
    const { slug } = request.params as any;
    const p = await store.getPerson(slug);
    if (!p) return reply.code(404).send({ error: 'not_found', message: '人物不存在' });
    return { items: await store.listComments(p.id) };
  });

  // 发表评论（需登录）
  app.post('/persons/:slug/comments', { preHandler: authPreHandler }, async (request, reply) => {
    const { slug } = request.params as any;
    const p = await store.getPerson(slug);
    if (!p) return reply.code(404).send({ error: 'not_found', message: '人物不存在' });
    const u = request.user as any;
    const { body } = (request.body || {}) as { body?: string };
    if (!body || !body.trim()) return reply.code(400).send({ error: 'bad_request', message: '评论内容不能为空' });
    const c = await store.addComment(p.id, p.slug, u.id, u.name, body.trim().slice(0, 2000));
    return reply.code(201).send(c);
  });
}
