// 前端 API 客户端（浏览器端）。
// 自「折叠 API 进 Next」改造后：所有请求走同源 /api（Next Route Handlers 已实现原 Fastify API）。
// 服务端取数（SSR/ISR/SSG）不再经过本文件，而是直接调用 @/lib/server/data（见各 Server Component）。
// 因此本模块只会被客户端组件导入，绝不包含 node:fs，可安全进入浏览器包。
const PUBLIC_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';

// —— 浏览器侧通用：读取本地 token ——
export function getToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('gph_token') : null;
}

// —— 客户端数据读取（走 /api，供客户端组件按需取数）——
export async function getPersons(opts: { q?: string; domain?: string; lang?: string; pageSize?: number; page?: number } = {}) {
  const p = new URLSearchParams();
  if (opts.q) p.set('q', opts.q);
  if (opts.domain) p.set('domain', opts.domain);
  if (opts.lang) p.set('lang', opts.lang);
  if (opts.page) p.set('page', String(opts.page));
  p.set('pageSize', String(opts.pageSize ?? 60));
  const r = await fetch(`${PUBLIC_BASE}/persons?${p.toString()}`);
  if (!r.ok) throw new Error('加载人物失败');
  return r.json();
}

export async function searchPersons(q: string) {
  const r = await fetch(`${PUBLIC_BASE}/search?q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error('搜索失败');
  return r.json();
}

export async function semanticSearch(q: string, lang = 'zh', limit = 12) {
  const r = await fetch(
    `${PUBLIC_BASE}/search/semantic?q=${encodeURIComponent(q)}&lang=${lang}&limit=${limit}`
  );
  if (!r.ok) throw new Error('语义搜索失败');
  return r.json();
}

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

// —— 账户 / 写入类（需登录；托管只读版部分端点返回 503，前端友好提示）——
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

export async function getMe(): Promise<{ id: string; email: string; name: string; role: string; plan: 'free' | 'pro' }> {
  const t = getToken();
  if (!t) throw new Error('请先登录');
  const r = await fetch(`${PUBLIC_BASE}/me`, { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error('加载用户信息失败');
  return r.json();
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

export async function listApiKeys(): Promise<any> {
  const t = getToken();
  if (!t) throw new Error('请先登录');
  const r = await fetch(`${PUBLIC_BASE}/me/apikeys`, { headers: { Authorization: `Bearer ${t}` } });
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

// —— 社区评论（只读部署：评论不持久化，GET 返回空列表）——
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
