'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, createPerson } from '@/lib/api';
import { DOMAIN_LABELS, type Domain } from '@gph/types';
import { t } from '@/lib/ui';

const DOMAINS = ['film', 'business', 'academic', 'sports', 'music', 'politics', 'tech'] as Domain[];
const BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8787';

export default function Me({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = use(params);
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [mine, setMine] = useState<any[]>([]);
  const [form, setForm] = useState({
    zhName: '',
    enName: '',
    zhSummary: '',
    enSummary: '',
    domains: [] as Domain[]
  });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const tk = getToken();
    setToken(tk);
    if (!tk) {
      router.push(`/${lang}/login`);
      return;
    }
    fetch(`${BASE}/me/persons`, { headers: { Authorization: `Bearer ${tk}` } })
      .then((r) => r.json())
      .then(setMine)
      .catch(() => setMine([]));
  }, [router, lang]);

  function toggleDomain(d: Domain) {
    setForm((f) => ({
      ...f,
      domains: f.domains.includes(d) ? f.domains.filter((x) => x !== d) : [...f.domains, d]
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      const p = await createPerson({
        names: { zh: form.zhName, en: form.enName },
        summary: { zh: form.zhSummary, en: form.enSummary },
        domains: form.domains.length ? form.domains : (['other'] as Domain[]),
        relations: [],
        sources: []
      });
      setMsg(t(lang, 'me.submittedPending') + (p.slug || ''));
      setForm({ zhName: '', enName: '', zhSummary: '', enSummary: '', domains: [] });
    } catch (e: any) {
      setMsg(`${t(lang, 'common.error')}: ${e.message}`);
    }
  }

  if (!token) return <p className="mt-10 text-center text-slate-500">{t(lang, 'me.loginRequired')}</p>;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">{t(lang, 'me.title')}</h1>
      <p className="text-sm text-slate-500 mb-4">{t(lang, 'me.desc')}</p>

      <section className="border rounded-xl p-5 bg-white mb-8">
        <h2 className="font-semibold mb-3">{t(lang, 'me.addPerson')}</h2>
        {msg && <p className="text-sm text-accent mb-2">{msg}</p>}
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              className="border rounded px-3 py-2"
              placeholder={t(lang, 'me.zhName')}
              value={form.zhName}
              onChange={(e) => setForm({ ...form, zhName: e.target.value })}
            />
            <input
              className="border rounded px-3 py-2"
              placeholder={t(lang, 'me.enName')}
              value={form.enName}
              onChange={(e) => setForm({ ...form, enName: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <textarea
              className="border rounded px-3 py-2"
              placeholder={t(lang, 'me.zhSummary')}
              value={form.zhSummary}
              onChange={(e) => setForm({ ...form, zhSummary: e.target.value })}
            />
            <textarea
              className="border rounded px-3 py-2"
              placeholder={t(lang, 'me.enSummary')}
              value={form.enSummary}
              onChange={(e) => setForm({ ...form, enSummary: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {DOMAINS.map((d) => (
              <label key={d} className="text-sm flex items-center gap-1">
                <input type="checkbox" checked={form.domains.includes(d)} onChange={() => toggleDomain(d)} />
                {DOMAIN_LABELS[d]}
              </label>
            ))}
          </div>
          <button className="bg-brand text-white rounded px-4 py-2">{t(lang, 'btn.submit')}</button>
        </form>
      </section>

      <section>
        <h2 className="font-semibold mb-3">
          {t(lang, 'me.myPersons')} ({mine.length})
        </h2>
        <div className="space-y-2">
          {mine.map((p, i) => (
            <div key={i} className="border rounded p-3 bg-white text-sm">
              <b>{p.names?.en || p.names?.zh}</b>
              <span className="text-slate-400 ml-2">[{p.trustLevel}]</span>
              <span className="text-slate-500 ml-2">{p.domains.join('/')}</span>
            </div>
          ))}
          {mine.length === 0 && <p className="text-slate-500">{t(lang, 'me.empty')}</p>}
        </div>
      </section>
    </div>
  );
}
