'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getMe, listApiKeys, createApiKey, revokeApiKey, subscribe } from '@/lib/api';
import { t } from '@/lib/ui';

export default function Account({ params }: { params: Promise<{ lang: string }> }) {
  const router = useRouter();
  const { lang } = use(params);
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<'keys' | 'plan'>('keys');

  const [keys, setKeys] = useState<any[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('');
  const [plan, setPlan] = useState<'free' | 'pro'>('free');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const tk = getToken();
    setToken(tk);
    if (!tk) {
      router.push(`/${lang}/login`);
      return;
    }
    loadKeys();
    // 从服务端拉取真实套餐（避免 Stripe/微信升级后状态滞后）
    getMe()
      .then((m) => setPlan(m.plan === 'pro' ? 'pro' : 'free'))
      .catch(() => {});
  }, [router]);

  async function loadKeys() {
    try {
      const d = await listApiKeys();
      setKeys(d.items || []);
    } catch {
      setKeys([]);
    }
  }

  async function doCreate() {
    setMsg('');
    try {
      const d = await createApiKey(keyName);
      setNewKey(d.key);
      setKeyName('');
      await loadKeys();
    } catch (e: any) {
      setMsg(e.message || t(lang, 'common.error'));
    }
  }

  async function doRevoke(id: string) {
    if (!confirm('确认吊销该密钥？')) return;
    await revokeApiKey(id);
    await loadKeys();
  }

  async function doSubscribe(target: 'free' | 'pro') {
    setMsg('');
    try {
      const d = await subscribe(target);
      setPlan((d && d.plan) || target);
      setMsg(target === 'pro' ? t(lang, 'account.upgraded') : t(lang, 'account.switchedFree'));
    } catch (e: any) {
      setMsg(e.message || t(lang, 'common.error'));
    }
  }

  if (!token) return <p className="mt-10 text-center text-slate-500">{t(lang, 'nav.login')}…</p>;

  const pct = (used: number, quota: number) =>
    quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">{t(lang, 'nav.account')}</h1>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('keys')}
          className={`px-3 py-1.5 rounded ${tab === 'keys' ? 'bg-brand text-white' : 'border'}`}
        >
          {t(lang, 'account.apiKeys')}
        </button>
        <button
          onClick={() => setTab('plan')}
          className={`px-3 py-1.5 rounded ${tab === 'plan' ? 'bg-brand text-white' : 'border'}`}
        >
          {t(lang, 'account.plan')}
        </button>
      </div>

      {msg && <p className="text-sm text-accent mb-3">{msg}</p>}

      {tab === 'keys' && (
        <section className="border rounded-xl p-5 bg-white">
          <h2 className="font-semibold mb-1">{t(lang, 'account.apiKeys')}</h2>
          <p className="text-sm text-slate-500 mb-4">
            {t(lang, 'account.keyDesc')}
          </p>

          <div className="flex gap-2 mb-4">
            <input
              className="border rounded px-3 py-2 text-sm flex-1"
              placeholder={t(lang, 'account.keyNamePlaceholder')}
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
            />
            <button className="bg-brand text-white rounded px-4 py-2 text-sm" onClick={doCreate}>
              {t(lang, 'account.createKey')}
            </button>
          </div>

          {newKey && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
              <b>{t(lang, 'account.secretOnce')}</b>
              <div className="mt-1 font-mono break-all select-all">{newKey}</div>
            </div>
          )}

          <ul className="space-y-2">
            {keys.map((k) => (
              <li key={k.id} className="border rounded p-3 text-sm">
                <div className="flex items-center justify-between">
                  <b>{k.name}</b>
                  <button className="text-red-600 text-xs" onClick={() => doRevoke(k.id)}>
                    {k.active ? t(lang, 'account.revoke') : t(lang, 'account.revoked')}
                  </button>
                </div>
                <div className="text-slate-400 font-mono text-xs">{k.prefix}…</div>
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{k.usedMonth} / {k.quotaMonth}</span>
                    <span>{t(lang, 'account.quota')}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded overflow-hidden mt-1">
                    <div
                      className="h-full bg-brand"
                      style={{ width: `${pct(k.usedMonth, k.quotaMonth)}%` }}
                    />
                  </div>
                </div>
              </li>
            ))}
            {keys.length === 0 && (
              <li className="text-sm text-slate-500">{t(lang, 'account.noKeys')}</li>
            )}
          </ul>
        </section>
      )}

      {tab === 'plan' && (
        <section className="border rounded-xl p-5 bg-white">
          <h2 className="font-semibold mb-1">{t(lang, 'account.plan')}</h2>
          <p className="text-sm text-slate-500 mb-4">
            {t(lang, 'account.planDesc')}
          </p>
          <div className="flex items-center gap-4">
            <div className={`flex-1 border rounded p-4 ${plan === 'free' ? 'ring-2 ring-brand' : ''}`}>
              <div className="font-semibold">{t(lang, 'pricing.free')}</div>
              <div className="text-sm text-slate-500">1,000 次 / 月</div>
            </div>
            <div className={`flex-1 border rounded p-4 ${plan === 'pro' ? 'ring-2 ring-brand' : ''}`}>
              <div className="font-semibold">{t(lang, 'pricing.pro')}</div>
              <div className="text-sm text-slate-500">50,000 次 / 月</div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            {plan !== 'pro' ? (
              <button className="bg-brand text-white rounded px-4 py-2 text-sm" onClick={() => doSubscribe('pro')}>
                {t(lang, 'pricing.upgrade')}
              </button>
            ) : (
              <button className="border rounded px-4 py-2 text-sm" onClick={() => doSubscribe('free')}>
                {t(lang, 'pricing.switchFree')}
              </button>
            )}
            <span className="self-center text-sm text-slate-500">
              {t(lang, 'account.currentIs')}{plan === 'pro' ? t(lang, 'pricing.pro') : t(lang, 'pricing.free')}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
