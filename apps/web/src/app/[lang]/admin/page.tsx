'use client';

// 管理后台：UGC 审核（admin/expert）+ PGC 专家背书（admin/expert）+ 用户角色管理（仅 admin）
// + 数据概览（Stage 4）+ 操作审计日志（Stage 4）
import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';
import { t, domainLabel } from '@/lib/ui';

const BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8787';

type Tab = 'pending' | 'stats' | 'endorse' | 'audit' | 'users';

export default function Admin({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = use(params);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('pending');
  const [items, setItems] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<any[]>([]);
  const [comment, setComment] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [msg, setMsg] = useState('');
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);

  const errMsg = (e: any) => `${t(lang, 'common.error')}: ${e.message}`;

  const authed = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const tk = getToken();
      if (!tk) {
        router.push(`/${lang}/login`);
        throw new Error('未登录');
      }
      const r = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tk}`,
          ...(init.headers || {})
        }
      });
      if (r.status === 401) {
        router.push(`/${lang}/login`);
        throw new Error('登录过期');
      }
      if (r.status === 403) {
        setDenied(true);
        throw new Error('无权限');
      }
      if (!r.ok) throw new Error((await r.json()).message || '请求失败');
      return r.json();
    },
    [router, lang]
  );

  const loadAudit = useCallback(async () => {
    try {
      const d = await authed('/admin/audit').catch(() => null);
      if (d) setAudit(d.items || []);
    } catch {
      /* denied 已处理 */
    }
  }, [authed]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pd, meRes, st] = await Promise.all([
        authed('/admin/persons/pending'),
        authed('/me').catch(() => null),
        authed('/admin/stats').catch(() => null)
      ]);
      setItems(pd.items || []);
      setMe(meRes?.user || null);
      if (st) setStats(st);
      if (meRes?.user?.role === 'admin') {
        const ud = await authed('/admin/users').catch(() => null);
        if (ud) setUsers(ud.items || []);
      }
    } catch {
      /* denied/redirect 已处理 */
    } finally {
      setLoading(false);
    }
  }, [authed]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab === 'audit') loadAudit();
  }, [tab, loadAudit]);

  async function decide(id: string, action: 'approve' | 'reject') {
    setMsg('');
    try {
      const body: any = { action };
      if (action === 'reject' && rejectReason.trim()) body.reason = rejectReason.trim();
      await authed(`/admin/persons/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) });
      setItems((arr) => arr.filter((p) => p.id !== id));
      setRejectReason('');
      setMsg(action === 'approve' ? t(lang, 'admin.approvedMsg') : t(lang, 'admin.rejectedMsg'));
    } catch (e: any) {
      setMsg(errMsg(e));
    }
  }

  async function search() {
    if (!q.trim()) return;
    setMsg('');
    try {
      const r = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      setHits(d.results || []);
    } catch {
      setMsg(t(lang, 'admin.searchFail'));
    }
  }

  async function endorse(id: string) {
    setMsg('');
    try {
      const p = await authed(`/admin/persons/${id}/endorse`, {
        method: 'POST',
        body: JSON.stringify({ comment: comment.trim() || undefined })
      });
      setHits((arr) => arr.map((h) => (h.id === id ? { ...h, trustLevel: p.trustLevel, endorsed: true } : h)));
      setMsg(`${t(lang, 'admin.endorsedMsg')}${p.names?.zh || p.names?.en}（${t(lang, 'admin.trust')}${p.trustLevel}）`);
    } catch (e: any) {
      setMsg(errMsg(e));
    }
  }

  async function setRole(id: string, role: string) {
    setMsg('');
    try {
      const u = await authed(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
      setUsers((arr) => arr.map((x) => (x.id === id ? { ...x, role: u.role } : x)));
      setMsg(t(lang, 'admin.roleSetMsg').replace('{name}', u.name).replace('{role}', u.role));
    } catch (e: any) {
      setMsg(errMsg(e));
    }
  }

  const auditActionLabel = (a: string) => {
    const map: Record<string, string> = {
      approve: t(lang, 'admin.auditApprove'),
      reject: t(lang, 'admin.auditReject'),
      endorse: t(lang, 'admin.auditEndorse'),
      role: t(lang, 'admin.auditRole'),
      pending: t(lang, 'admin.tabPending')
    };
    return map[a] || a;
  };

  if (denied) {
    return (
      <div className="mt-16 text-center">
        <h1 className="text-xl font-bold">{t(lang, 'admin.needPerm')}</h1>
        <p className="text-sm text-slate-500 mt-2">{t(lang, 'admin.needPermDesc')}</p>
        <p className="text-xs text-slate-400 mt-2">
          <code>admin@gph.local / admin123456</code>
        </p>
      </div>
    );
  }

  const TABS: { key: Tab; label: string; adminOnly?: boolean }[] = [
    { key: 'pending', label: `${t(lang, 'admin.tabPending')}${items.length ? ` (${items.length})` : ''}` },
    { key: 'stats', label: t(lang, 'admin.tabStats') },
    { key: 'endorse', label: t(lang, 'admin.tabEndorse') },
    { key: 'audit', label: t(lang, 'admin.tabAudit') },
    { key: 'users', label: t(lang, 'admin.tabUsers'), adminOnly: true }
  ];

  const statCards = stats
    ? [
        { label: t(lang, 'admin.statPersons'), value: stats.persons.total },
        { label: t(lang, 'admin.statPending'), value: stats.pendingUgc },
        { label: t(lang, 'admin.statUsers'), value: stats.users.total },
        { label: t(lang, 'admin.statPro'), value: stats.users.pro },
        { label: t(lang, 'admin.statComments'), value: stats.comments },
        { label: t(lang, 'admin.statApiCalls'), value: stats.apiCallsMonth }
      ]
    : [];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">{t(lang, 'admin.title')}</h1>
      <p className="text-sm text-slate-500 mb-4">
        {t(lang, 'admin.desc')}
        {me ? `${t(lang, 'admin.current')}${me.name} / ${me.role}` : ''}
      </p>

      <div className="flex gap-1 border-b mb-5 flex-wrap">
        {TABS.filter((tt) => !tt.adminOnly || me?.role === 'admin').map((tt) => (
          <button
            key={tt.key}
            onClick={() => setTab(tt.key)}
            className={`px-4 py-2 text-sm rounded-t-lg ${
              tab === tt.key ? 'bg-white border border-b-white font-medium text-brand' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tt.label}
          </button>
        ))}
      </div>

      {msg && <p className="text-sm text-accent mb-3">{msg}</p>}

      {loading ? (
        <p className="text-slate-500">{t(lang, 'common.loading')}</p>
      ) : tab === 'pending' ? (
        <div>
          <input
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t(lang, 'admin.rejectReasonPlaceholder')}
            className="w-full border rounded-lg px-3 py-2 text-sm mb-4"
          />
          {items.length === 0 ? (
            <div className="border rounded-xl bg-white p-10 text-center text-slate-500">{t(lang, 'admin.queueEmpty')}</div>
          ) : (
            <div className="space-y-3">
              {items.map((p) => (
                <div key={p.id} className="border rounded-xl bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <b>{p.names?.zh || p.names?.en || t(lang, 'admin.unnamed')}</b>
                      {p.names?.en && p.names?.zh && <span className="text-slate-400 ml-2">{p.names.en}</span>}
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(p.domains || []).map((d: string) => (
                          <span key={d} className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                            {domainLabel(lang, d)}
                          </span>
                        ))}
                      </div>
                      <p className="text-sm text-slate-600 mt-2 line-clamp-2">
                        {p.summary?.zh || p.summary?.en || t(lang, 'admin.noSummary')}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {t(lang, 'admin.submittedBy')}
                        {p.createdBy || '-'} · {new Date(p.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => decide(p.id, 'approve')}
                        className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm hover:opacity-90"
                      >
                        {t(lang, 'admin.approve')}
                      </button>
                      <button
                        onClick={() => decide(p.id, 'reject')}
                        className="px-3 py-1.5 rounded bg-rose-600 text-white text-sm hover:opacity-90"
                      >
                        {t(lang, 'admin.reject')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === 'stats' ? (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            {statCards.map((c) => (
              <div key={c.label} className="border rounded-xl bg-white p-4">
                <div className="text-2xl font-bold text-brand">{c.value}</div>
                <div className="text-xs text-slate-500 mt-1">{c.label}</div>
              </div>
            ))}
          </div>
          <div className="border rounded-xl bg-white p-4">
            <h3 className="text-sm font-semibold mb-3">{t(lang, 'admin.statByTrust')}</h3>
            {stats && Object.keys(stats.persons.byTrust).length === 0 ? (
              <p className="text-sm text-slate-400">{t(lang, 'admin.queueEmpty')}</p>
            ) : (
              <div className="space-y-2">
                {stats &&
                  Object.entries(stats.persons.byTrust).map(([lv, cnt]) => (
                    <div key={lv} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{t(lang, `trust.${lv}` as any)}</span>
                      <span className="font-medium">{cnt as number}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      ) : tab === 'endorse' ? (
        <div>
          <p className="text-sm text-slate-500 mb-3">{t(lang, 'admin.endorseDesc')}</p>
          <div className="flex gap-2 mb-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder={t(lang, 'admin.searchPlaceholder')}
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
            />
            <button onClick={search} className="px-4 py-2 rounded-lg bg-brand text-white text-sm">
              {t(lang, 'nav.search')}
            </button>
          </div>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t(lang, 'admin.endorseCommentPlaceholder')}
            className="w-full border rounded-lg px-3 py-2 text-sm mb-4"
          />
          <div className="space-y-2">
            {hits.map((h) => (
              <div key={h.id} className="border rounded-xl bg-white p-3 flex items-center justify-between gap-3">
                <div>
                  <b>{h.names?.zh || h.names?.en}</b>
                  {h.names?.en && h.names?.zh && <span className="text-slate-400 ml-2 text-sm">{h.names.en}</span>}
                  <span className="ml-2 text-xs text-slate-400">
                    {t(lang, 'admin.trust')}
                    {h.trustLevel}
                  </span>
                </div>
                <button
                  onClick={() => endorse(h.id)}
                  disabled={h.endorsed}
                  className={`shrink-0 px-3 py-1.5 rounded text-sm ${
                    h.endorsed ? 'bg-slate-200 text-slate-500' : 'bg-emerald-600 text-white hover:opacity-90'
                  }`}
                >
                  {h.endorsed ? t(lang, 'admin.endorsed') : t(lang, 'admin.endorse')}
                </button>
              </div>
            ))}
            {hits.length === 0 && <p className="text-sm text-slate-400">{t(lang, 'admin.endorseEmpty')}</p>}
          </div>
        </div>
      ) : tab === 'audit' ? (
        <div>
          {audit.length === 0 ? (
            <div className="border rounded-xl bg-white p-10 text-center text-slate-500">{t(lang, 'admin.auditEmpty')}</div>
          ) : (
            <div className="border rounded-xl bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-500">
                    <th className="p-3">{t(lang, 'admin.auditActor')}</th>
                    <th className="p-3">{t(lang, 'admin.auditAction')}</th>
                    <th className="p-3">{t(lang, 'admin.auditTarget')}</th>
                    <th className="p-3">{t(lang, 'admin.auditTime')}</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="p-3">{a.actorName}</td>
                      <td className="p-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            a.action === 'reject'
                              ? 'bg-rose-50 text-rose-700'
                              : a.action === 'approve'
                              ? 'bg-emerald-50 text-emerald-700'
                              : a.action === 'role'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-indigo-50 text-indigo-700'
                          }`}
                        >
                          {auditActionLabel(a.action)}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600">
                        {a.targetLabel || a.targetId}
                        {a.meta?.reason && (
                          <span className="block text-xs text-slate-400 mt-0.5">{a.meta.reason}</span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div>
          <p className="text-sm text-slate-500 mb-3">{t(lang, 'admin.usersDesc')}</p>
          <div className="border rounded-xl bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-500">
                  <th className="p-3">{t(lang, 'admin.thUser')}</th>
                  <th className="p-3">{t(lang, 'login.email')}</th>
                  <th className="p-3">{t(lang, 'admin.thRole')}</th>
                  <th className="p-3 w-40">{t(lang, 'admin.thAction')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="p-3">{u.name}</td>
                    <td className="p-3 text-slate-500">{u.email}</td>
                    <td className="p-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          u.role === 'admin'
                            ? 'bg-rose-50 text-rose-700'
                            : u.role === 'expert'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="p-3">
                      <select
                        value={u.role}
                        onChange={(e) => setRole(u.id, e.target.value)}
                        disabled={u.id === me?.id}
                        className="border rounded px-2 py-1 text-xs"
                      >
                        <option value="user">user</option>
                        <option value="expert">expert</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td className="p-4 text-slate-400" colSpan={4}>
                      {t(lang, 'admin.noUsers')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
