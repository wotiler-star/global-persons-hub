'use client';

import { useEffect, useState } from 'react';
import { getToken, getComments, addComment } from '@/lib/api';
import { t } from '@/lib/ui';

export default function Comments({ slug, lang }: { slug: string; lang: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const d = await getComments(slug);
      setItems(d.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
      if (!getToken()) {
      setMsg(t(lang, 'comments.signIn'));
      return;
    }
    if (!body.trim()) return;
    try {
      await addComment(slug, body.trim());
      setBody('');
      await load();
    } catch (e: any) {
      setMsg(e.message || t(lang, 'common.error'));
    }
  }

  return (
    <div className="mt-8">
      <h3 className="font-semibold mb-3">{t(lang, 'comments.title')}</h3>

      <form onSubmit={submit} className="mb-4">
        <textarea
          className="border rounded px-3 py-2 w-full text-sm"
          rows={3}
          placeholder={t(lang, 'comments.placeholder')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex items-center gap-3 mt-2">
          <button className="bg-brand text-white rounded px-4 py-2 text-sm">
            {t(lang, 'comments.post')}
          </button>
          {msg && <span className="text-sm text-accent">{msg}</span>}
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-slate-400">{t(lang, 'common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">
          {t(lang, 'comments.empty')}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="border rounded p-3 bg-white text-sm">
              <div className="flex items-center gap-2 mb-1">
                <b>{c.userName}</b>
                <span className="text-xs text-slate-400">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-slate-700 whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
