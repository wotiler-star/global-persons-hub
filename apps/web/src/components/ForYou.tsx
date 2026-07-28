'use client';

import { t } from '@/lib/ui';
import { useHistory } from '@/lib/libraryStore';
import type { Lang } from '@gph/types';
import PersonCard from './PersonCard';

type Person = {
  id: string;
  slug: string;
  domains?: string[];
  nationalities?: string[];
  relations?: { targetId: string }[];
  metrics?: { influence?: number };
};

type Cat = 'domain' | 'relation' | 'nat';

/**
 * 「为你推荐」智能推荐（Stage 36）：基于本地浏览历史（localStorage），
 * 以最近看过的人物为种子，按 同领域/关系相连/同国籍/影响力相近 计算相似度，
 * 推荐你可能感兴趣的人物。纯前端、无额外请求、隐私安全。
 */
function scoreAgainstSeeds(cand: Person, seeds: Person[]): { score: number; cat: Cat | null } {
  let score = 0;
  let dom = 0;
  let rel = 0;
  let nat = 0;
  const cDom = new Set(cand.domains || []);
  const cNat = new Set(cand.nationalities || []);

  for (const s of seeds) {
    for (const d of s.domains || []) if (cDom.has(d)) dom += 3;
    for (const n of s.nationalities || []) if (cNat.has(n)) nat += 2;
    const sRel = new Set((s.relations || []).map((r) => r.targetId));
    for (const r of cand.relations || []) if (sRel.has(r.targetId)) rel += 4;
    const ci = cand.metrics?.influence || 0;
    const si = s.metrics?.influence || 0;
    if (ci > 0 && si > 0) score += Math.max(0, 3 - Math.abs(ci - si) / 25);
  }
  score += dom + rel + nat;
  const cat: Cat | null = dom >= rel && dom >= nat && dom > 0 ? 'domain' : rel > 0 ? 'relation' : nat > 0 ? 'nat' : null;
  return { score, cat };
}

export default function ForYou({ items, lang }: { items: Person[]; lang: Lang }) {
  const hist = useHistory();
  if (hist.length === 0) return null;

  const seeds = items.filter((p) => hist.includes(p.slug));
  if (seeds.length === 0) return null;

  const ranked = items
    .filter((c) => c.slug && !hist.includes(c.slug))
    .map((c) => ({ p: c, ...scoreAgainstSeeds(c, seeds) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.p.metrics?.influence ?? 0) - (a.p.metrics?.influence ?? 0))
    .slice(0, 6);

  if (ranked.length === 0) return null;

  return (
    <section className="mt-10" aria-label={t(lang, 'home.foryou')}>
      <h2 className="text-xl font-semibold">{t(lang, 'home.foryou')}</h2>
      <p className="text-sm text-slate-500 mt-1">{t(lang, 'home.foryouSub')}</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        {ranked.map(({ p, cat }) => (
          <div key={p.slug} className="relative">
            <PersonCard person={p as any} lang={lang} />
            {cat && (
              <span className="pointer-events-none absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                {cat === 'nat'
                  ? t(lang, 'related.reasonDomain')
                  : t(lang, cat === 'relation' ? 'related.reasonRelation' : 'related.reasonDomain')}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
