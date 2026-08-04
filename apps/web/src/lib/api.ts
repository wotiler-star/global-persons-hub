// 前端 API 客户端：仅通过 REST 与独立后端通信（前后端分离）
// 默认走 127.0.0.1 以避开 Node fetch 对 localhost 的 IPv6(::1) 解析问题
const PUBLIC_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8787';
// 服务端取数优先读运行时变量 GPH_API_BASE（不被构建期内联），其次用公开基址
const SERVER_BASE =
  process.env.GPH_API_BASE || process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8787';

// —— 服务端数据获取（Server Components，SSR/ISR 利于 SEO/GEO）——
// Stage 34：默认走 ISR 增量缓存（5 分钟窗口），替代原先的 cache:'no-store' 全动态。
// 人物数据低频变更，5 分钟陈旧度可接受；评论/账户等实时数据均走浏览器端 PUBLIC_BASE，不受影响。
// 可用环境变量 GPH_REVALIDATE 调整窗口；传 { revalidate: false } 可退回逐请求取数。
const DEFAULT_REVALIDATE = Number(process.env.GPH_REVALIDATE ?? 300);

export async function apiGet<T = any>(
  path: string,
  opts: { revalidate?: number | false } = {}
): Promise<T> {
  const revalidate = opts.revalidate ?? DEFAULT_REVALIDATE;
  const res = await fetch(
    `${SERVER_BASE}${path}`,
    revalidate === false || !(revalidate > 0)
      ? { cache: 'no-store' }
      : { next: { revalidate } }
  );
  if (!res.ok) throw new Error(`API ${res.status} ${path}`);
  return res.json();
}

export const getPersons = (opts: { q?: string; domain?: string; lang?: string; pageSize?: number } = {}) => {
  const p = new URLSearchParams();
  if (opts.q) p.set('q', opts.q);
  if (opts.domain) p.set('domain', opts.domain);
  if (opts.lang) p.set('lang', opts.lang);
  p.set('pageSize', String(opts.pageSize ?? 60));
  return apiGet<{ items: any[]; total: number }>(`/persons?${p.toString()}`);
};

export const getPerson = (slug: string) => apiGet<any>(`/persons/${slug}`);
export const getRelations = (id: string) => apiGet<any>(`/relations/${id}`);
export const searchPersons = (q: string) => apiGet<{ results: any[] }>(`/search?q=${encodeURIComponent(q)}`);
export const semanticSearch = (q: string, lang = 'zh', limit = 12) =>
  apiGet<{ results: { hit: any; score: number }[] }>(
    `/search/semantic?q=${encodeURIComponent(q)}&lang=${lang}&limit=${limit}`
  );
export const getNetwork = (id: string, depth = 2) =>
  apiGet<{ nodes: any[]; edges: any[] }>(`/graph/network/${id}?depth=${depth}`);

/** Stage 37+：两人之间最短关系路径（BFS 子图） */
export const getPath = (from: string, to: string) =>
  apiGet<{ nodes: any[]; edges: any[] }>(`/graph/path/${from}/${to}`);

// RAG 事实问答（语义检索 + 可选 LLM 生成）
export async function askRag(query: string, lang = 'zh', limit = 5) {
  const r = await fetch(`${PUBLIC_BASE}/rag/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, lang, limit })
  });
  if (!r.ok) throw new Error((await r.json()).message || '问答失败');
  return r.json();
}

// —— 客户端（浏览器）调用（注册/登录/上传编辑）——
export function getToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('gph_token') : null;
}

export async function registerUser(input: { email: string; password: string; name: string }) {
  const r = await fetch(`${PUBLIC_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!r.ok) throw new Error((await r.json()).message || '注册失败');
  return r.json();
}

export async function loginUser(input: { email: string; password: string }) {
  const r = await fetch(`${PUBLIC_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!r.ok) throw new Error((await r.json()).message || '登录失败');
  const d = await r.json();
  localStorage.setItem('gph_token', d.token);
  return d;
}

/** 登出：通知服务端吊销当前令牌（jti 黑名单），并清除本地 token */
export async function logoutUser(): Promise<void> {
  const t = getToken();
  if (t) {
    try {
      await fetch(`${PUBLIC_BASE}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` }
      });
    } catch {
      /* 即便服务端不可达也强制清本地 token，保证客户端登出成功 */
    }
  }
  localStorage.removeItem('gph_token');
}

export async function createPerson(input: any) {
  const t = getToken();
  if (!t) throw new Error('请先登录');
  const r = await fetch(`${PUBLIC_BASE}/persons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify(input)
  });
  if (!r.ok) throw new Error((await r.json()).message || '创建失败');
  return r.json();
}

export async function updatePerson(slug: string, patch: any): Promise<any> {
  const t = getToken();
  if (!t) throw new Error('请先登录');
  const r = await fetch(`${PUBLIC_BASE}/persons/${slug}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify(patch)
  });
  if (!r.ok) throw new Error((await r.json()).message || '更新失败');
  return r.json();
}

// —— 开放 API 密钥（Stage 3）——
export async function listApiKeys(): Promise<any> {
  const t = getToken();
  if (!t) throw new Error('请先登录');
  const r = await fetch(`${PUBLIC_BASE}/me/apikeys`, {
    headers: { Authorization: `Bearer ${t}` }
  });
  if (!r.ok) throw new Error((await r.json()).message || '获取失败');
  return r.json();
}

export async function createApiKey(name: string): Promise<any> {
  const t = getToken();
  if (!t) throw new Error('请先登录');
  const r = await fetch(`${PUBLIC_BASE}/me/apikeys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify({ name })
  });
  if (!r.ok) throw new Error((await r.json()).message || '创建失败');
  return r.json();
}

export async function revokeApiKey(id: string): Promise<void> {
  const t = getToken();
  if (!t) throw new Error('请先登录');
  const r = await fetch(`${PUBLIC_BASE}/me/apikeys/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${t}` }
  });
  if (!r.ok) throw new Error((await r.json()).message || '吊销失败');
}

// —— 当前用户（含套餐 / 支付渠道轮询）——
export async function getMe(): Promise<{ id: string; email: string; name: string; role: string; plan: 'free' | 'pro' }> {
  const t = getToken();
  if (!t) throw new Error('请先登录');
  const r = await fetch(`${PUBLIC_BASE}/me`, {
    headers: { Authorization: `Bearer ${t}` }
  });
  if (!r.ok) throw new Error('加载用户信息失败');
  return r.json();
}

// —— 专业订阅（Stage 3）——
export async function subscribe(plan: 'free' | 'pro', provider?: string, lang = 'zh'): Promise<any> {
  const t = getToken();
  if (!t) throw new Error('请先登录');
  const r = await fetch(`${PUBLIC_BASE}/me/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify({ plan, provider, lang })
  });
  if (!r.ok) throw new Error((await r.json()).message || '订阅失败');
  return r.json();
}

// —— 图片上传（Stage 3）——
export async function uploadImage(dataUrl: string): Promise<{ url: string }> {
  const t = getToken();
  if (!t) throw new Error('请先登录');
  const r = await fetch(`${PUBLIC_BASE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify({ file: dataUrl })
  });
  if (!r.ok) throw new Error((await r.json()).message || '上传失败');
  return r.json();
}

// —— 社区评论（Stage 3）——
export async function getComments(slug: string): Promise<{ items: any[] }> {
  const r = await fetch(`${PUBLIC_BASE}/persons/${slug}/comments`);
  if (!r.ok) throw new Error('加载评论失败');
  return r.json();
}

export async function addComment(slug: string, body: string): Promise<any> {
  const t = getToken();
  if (!t) throw new Error('请先登录');
  const r = await fetch(`${PUBLIC_BASE}/persons/${slug}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify({ body })
  });
  if (!r.ok) throw new Error((await r.json()).message || '评论失败');
  return r.json();
}
