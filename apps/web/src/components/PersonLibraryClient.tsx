'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getPersons } from '@/lib/api';
import { useFavorites, useHistory, clearHistory } from '@/lib/libraryStore';
import { t } from '@/lib/ui';
import { type Lang } from '@/lib/i18n';
import type { Person } from '@gph/types';
import PersonCard from '@/components/PersonCard';

export default function PersonLibraryClient({
  lang,
  sharedPersons
}: {
  lang: Lang;
  sharedPersons?: Person[];
}) {
  const favs = useFavorites();
  const hist = useHistory();
  const [all, setAll] = useState<Person[]>([]);
  const [copied, setCopied] = useState(false);

  const isShared = Array.isArray(sharedPersons);

  useEffect(() => {
    if (isShared) return; // 共享视图无需拉取全量
    let alive = true;
    (async () => {
      const d = await getPersons({ lang, pageSize: 300 }).catch(() => ({ items: [] as Person[] }));
      if (alive) setAll(d.items || []);
    })();
    return () => {
      alive = false;
    };
  }, [lang, isShared]);

  const bySlug = useMemo(() => new Map(all.map((p) => [p.slug, p])), [all]);
  const favPersons = useMemo(
    () => favs.map((s) => bySlug.get(s)).filter((p): p is Person => Boolean(p)),
    [favs, bySlug]
  );
  const histPersons = useMemo(
    () => hist.map((s) => bySlug.get(s)).filter((p): p is Person => Boolean(p)),
    [hist, bySlug]
  );

  const onShare = async () => {
    const url = `${window.location.origin}/${lang}/library?ids=${favs.join(',')}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* 剪贴板不可用时静默 */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // —— 共享视图（?ids=）——
  if (isShared) {
    const list = sharedPersons as Person[];
    return (
      <div>
        <div className="mb-4 rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-3 text-sm text-indigo-800">
          {t(lang, 'library.sharedView').replace('{n}', String(list.length))}
          <Link href={`/${lang}/library`} className="ml-3 underline hover:opacity-80">
            {t(lang, 'library.backToMine')}
          </Link>
        </div>
        {list.length === 0 ? (
          <p className="text-slate-400">{t(lang, 'library.emptyFav')}</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {list.map((p) => (
              <PersonCard key={p.slug} person={p} lang={lang} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // —— 我的收藏夹 ——
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">{t(lang, 'library.title')}</h1>
        <button
          type="button"
          onClick={onShare}
          disabled={favs.length === 0}
          className="px-3 py-1.5 rounded-lg bg-brand text-white text-sm hover:opacity-90 disabled:opacity-40"
        >
          {copied ? t(lang, 'library.shareDone') : t(lang, 'library.share')}
        </button>
      </div>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">{t(lang, 'library.favorites')}</h2>
        {favPersons.length === 0 ? (
          <p className="text-slate-400">{t(lang, 'library.emptyFav')}</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {favPersons.map((p) => (
              <PersonCard key={p.slug} person={p} lang={lang} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{t(lang, 'library.history')}</h2>
          {histPersons.length > 0 && (
            <button
              type="button"
              onClick={() => clearHistory()}
              className="text-xs px-2 py-1 rounded border text-slate-500 hover:bg-slate-100"
            >
              {t(lang, 'library.clearHist')}
            </button>
          )}
        </div>
        {histPersons.length === 0 ? (
          <p className="text-slate-400">{t(lang, 'library.emptyHist')}</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {histPersons.map((p) => (
              <PersonCard key={p.slug} person={p} lang={lang} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
