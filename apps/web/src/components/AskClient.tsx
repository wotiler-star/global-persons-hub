'use client';

import { useState } from 'react';
import Link from 'next/link';
import { askRag } from '@/lib/api';
import type { Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';

interface Source {
  slug: string;
  name: string;
  excerpt: string;
  score: number;
}
interface RagResult {
  query: string;
  answer: string;
  sources: Source[];
  generated: boolean;
  model?: string;
}

export default function AskClient({ lang, initial = '' }: { lang: Lang; initial?: string }) {
  const [query, setQuery] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RagResult | null>(null);

  async function submit(q: string) {
    const text = q.trim();
    if (!text || loading) return;
    setLoading(true);
    setError('');
    try {
      const r = (await askRag(text, lang, 5)) as RagResult;
      setResult(r);
    } catch (e: any) {
      setError(e?.message || t(lang, 'ask.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">{t(lang, 'ask.title')}</h1>
      <p className="text-sm text-slate-500 mb-4">
        {t(lang, 'ask.subtitle')}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(query);
        }}
        className="flex gap-2 mb-6"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(lang, 'ask.placeholder')}
          className="flex-1 border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-brand text-white disabled:opacity-50"
        >
          {loading ? t(lang, 'ask.thinking') : t(lang, 'ask.ask')}
        </button>
      </form>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {result && (
        <div className="space-y-4">
          <div className="border rounded-xl p-4 bg-white">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                {result.generated
                  ? `${t(lang, 'ask.generated')}${result.model ? ` · ${result.model}` : ''}`
                  : t(lang, 'ask.extractive')}
              </span>
            </div>
            <p className="whitespace-pre-wrap leading-relaxed">{result.answer}</p>
          </div>

          {result.sources.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">{t(lang, 'ask.sources')}</h3>
              <ul className="space-y-2">
                {result.sources.map((s, i) => (
                  <li key={s.slug} className="border rounded-lg p-3 bg-white">
                    <div className="flex items-center justify-between">
                      <Link href={`/${lang}/person/${s.slug}`} className="font-medium text-brand hover:underline">
                        [{i + 1}] {s.name}
                      </Link>
                      <span className="text-xs text-slate-400">
                        {t(lang, 'ask.relevance')} {(s.score ?? 0).toFixed(3)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-3">{s.excerpt}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
