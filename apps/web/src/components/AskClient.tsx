'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { askRag } from '@/lib/api';
import type { Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';

interface Source {
  slug: string;
  name: string;
  excerpt: string;
  score: number;
  sameAs?: { url: string; title?: string; publisher?: string }[];
}
interface RagResult {
  query: string;
  answer: string;
  sources: Source[];
  generated: boolean;
  model?: string;
}
interface HistItem {
  id: number;
  query: string;
  answer: string;
  sources: Source[];
  generated: boolean;
  model?: string;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default function AskClient({ lang, initial = '' }: { lang: Lang; initial?: string }) {
  const [query, setQuery] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RagResult | null>(null);

  // 问答历史（本地持久化，可回看/重问）
  const [history, setHistory] = useState<HistItem[]>([]);
  const [showHist, setShowHist] = useState(false);
  const histKey = `gph_ask_history_${lang}`;
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    try {
      const raw = localStorage.getItem(histKey);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      /* 忽略损坏的本地数据 */
    }
  }, [histKey]);

  useEffect(() => {
    try {
      localStorage.setItem(histKey, JSON.stringify(history.slice(0, 8)));
    } catch {
      /* 配额或隐私模式下静默忽略 */
    }
  }, [history, histKey]);

  async function submit(q: string) {
    const text = q.trim();
    if (!text || loading) return;
    setLoading(true);
    setError('');
    try {
      const r = (await askRag(text, lang, 5)) as RagResult;
      setResult(r);
      // 写入历史（按 query 去重，最新置顶，最多 8 条）
      setHistory((prev) => {
        const filtered = prev.filter((h) => h.query !== text);
        return [{ id: Date.now(), query: text, answer: r.answer, sources: r.sources, generated: r.generated, model: r.model }, ...filtered].slice(0, 8);
      });
    } catch (e: any) {
      setError(e?.message || t(lang, 'ask.error'));
    } finally {
      setLoading(false);
    }
  }

  function replay(item: HistItem) {
    setQuery(item.query);
    // 直接复用历史答案，避免重复请求
    setResult({ query: item.query, answer: item.answer, sources: item.sources, generated: item.generated, model: item.model });
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
        className="flex gap-2 mb-3"
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

      {/* 历史记录入口 */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setShowHist((v) => !v)}
          className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
        >
          {t(lang, 'ask.history')}
          {history.length > 0 && <span className="ml-1 text-slate-400">({history.length})</span>}
        </button>
        {history.length > 0 && (
          <button
            onClick={() => setHistory([])}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50"
          >
            {t(lang, 'ask.historyClear')}
          </button>
        )}
      </div>

      {showHist && (
        <div className="mb-5 rounded-xl border bg-white p-3">
          {history.length === 0 ? (
            <p className="text-xs text-slate-400">{t(lang, 'ask.historyEmpty')}</p>
          ) : (
            <ul className="space-y-1">
              {history.map((h) => (
                <li key={h.id}>
                  <button
                    onClick={() => replay(h)}
                    className="w-full text-left text-sm px-2 py-1.5 rounded-lg hover:bg-indigo-50 text-slate-700 truncate"
                    title={h.query}
                  >
                    {h.generated ? '✦ ' : '• '}
                    {h.query}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
                    {s.sameAs && s.sameAs.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="text-[11px] text-slate-400 mr-0.5">{t(lang, 'ask.cite')}:</span>
                        {s.sameAs.map((u, j) => (
                          <a
                            key={j}
                            href={u.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                            title={u.title || u.url}
                          >
                            🔗 {u.publisher || hostOf(u.url)}
                          </a>
                        ))}
                      </div>
                    )}
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
