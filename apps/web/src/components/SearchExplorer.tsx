'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { DOMAIN_LABELS, type Domain, type Person } from '@gph/types';
import PersonCard from '@/components/PersonCard';
import { filterPersons, matchScore, birthYear, ERAS } from '@/lib/searchIndex';

export default function SearchExplorer({
  lang,
  allPersons,
  initialQ = '',
  initialDomain = ''
}: {
  lang: Lang;
  allPersons: Person[];
  initialQ?: string;
  initialDomain?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [domain, setDomain] = useState(initialDomain);
  const [era, setEra] = useState('');

  // 关键词命中的基础集合（忽略领域/时代筛选，用于分面计数）
  const qMatched = useMemo(
    () => (q.trim() ? allPersons.filter((p) => matchScore(p, q) > 0) : allPersons),
    [allPersons, q]
  );

  const filtered = useMemo(
    () => filterPersons(allPersons, { q, domain, era }),
    [allPersons, q, domain, era]
  );

  // 领域分面计数（应用 q + 时代，忽略领域选择）
  const domainCounts = useMemo(() => {
    const m = new Map<Domain, number>();
    const eraR = ERAS.find((e) => e.key === era);
    for (const p of qMatched) {
      if (eraR) {
        const y = birthYear(p);
        if (y == null || y < eraR.from || y > eraR.to) continue;
      }
      for (const d of p.domains) m.set(d, (m.get(d) || 0) + 1);
    }
    return m;
  }, [qMatched, era]);

  // 时代分面计数（应用 q + 领域，忽略时代选择）
  const eraCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of qMatched) {
      if (domain && !p.domains.includes(domain as Domain)) continue;
      const y = birthYear(p);
      const e = y == null ? null : ERAS.find((x) => y >= x.from && y <= x.to);
      const key = e ? e.key : 'unknown';
      m.set(key, (m.get(key) || 0) + 1);
    }
    return m;
  }, [qMatched, domain]);

  const presentDomains = (Object.keys(DOMAIN_LABELS) as Domain[]).filter((d) =>
    allPersons.some((p) => p.domains.includes(d))
  );

  const buildHref = (over: { domain?: string; era?: string } = {}) => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    const dd = over.domain !== undefined ? over.domain : domain;
    const ee = over.era !== undefined ? over.era : era;
    if (dd) p.set('domain', dd);
    if (ee) p.set('era', ee);
    return `/${lang}/search?${p.toString()}`;
  };

  const onDomain = (d: string) => {
    const nd = domain === d ? '' : d;
    setDomain(nd);
    router.replace(buildHref({ domain: nd }), { scroll: false });
  };
  const onEra = (k: string) => {
    const ne = era === k ? '' : k;
    setEra(ne);
    router.replace(buildHref({ era: ne }), { scroll: false });
  };
  const onClear = () => {
    setDomain('');
    setEra('');
    router.replace(buildHref({ domain: '', era: '' }), { scroll: false });
  };

  const hasFilter = !!(domain || era);

  return (
    <div>
      {/* 分面：领域 + 时代 */}
      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-slate-500">{t(lang, 'search.facetDomain')}：</span>
          <button
            onClick={() => onDomain('')}
            className={`px-3 py-1 rounded-full border ${
              !domain ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600'
            }`}
          >
            {t(lang, 'search.allDomains')}
          </button>
          {presentDomains.map((d) => (
            <button
              key={d}
              onClick={() => onDomain(d)}
              className={`px-3 py-1 rounded-full border ${
                domain === d ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600'
              }`}
            >
              {DOMAIN_LABELS[d]}
              <span className="ml-1 opacity-60">{domainCounts.get(d) || 0}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-slate-500">{t(lang, 'search.facetEra')}：</span>
          {ERAS.map((e) => (
            <button
              key={e.key}
              onClick={() => onEra(e.key)}
              className={`px-3 py-1 rounded-full border ${
                era === e.key ? 'bg-brand text-white border-brand' : 'bg-white text-slate-600'
              }`}
            >
              {t(lang, e.uiKey)}
              <span className="ml-1 opacity-60">{eraCounts.get(e.key) || 0}</span>
            </button>
          ))}
          {hasFilter && (
            <button onClick={onClear} className="ml-1 text-xs text-brand hover:underline">
              {t(lang, 'search.clearFilter')}
            </button>
          )}
        </div>
      </div>

      {/* 结果计数 */}
      <p className="text-sm text-slate-500 mb-3">
        {filtered.length} {t(lang, 'search.results')}
      </p>

      {/* 结果网格 */}
      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((p) => (
          <PersonCard key={p.id || p.slug} person={p} lang={lang} highlight={q.trim() || undefined} />
        ))}
      </div>

      {filtered.length === 0 && <p className="text-slate-500 mt-6">{t(lang, 'search.noResult')}</p>}
    </div>
  );
}
