import { pickText, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { DOMAIN_LABELS, type Person } from '@gph/types';
import PersonCard from './PersonCard';

// 推荐信号来源（按强度排序，决定展示在主标签上的「为什么相关」）
type ReasonKey = 'kin' | 'graph' | 'relation' | 'domain';
const REASON_PRIORITY: ReasonKey[] = ['kin', 'graph', 'relation', 'domain'];

interface Scored {
  person: Person;
  score: number;
  reason: ReasonKey;
}

/**
 * 相关人物推荐：基于 同领域 + 图谱邻居 + 亲属 + 关系相似度 + 同国籍 计算相关性分数，
 * 取分数最高的前 N 位。纯服务端计算，无客户端 JS、利于 SEO。
 */
function scoreCandidate(person: Person, cand: Person, graphIds: Set<string>): Scored {
  let score = 0;
  const reasons = new Set<ReasonKey>();

  // 1) 同领域（每个重叠领域 +3）
  const pDom = new Set(person.domains);
  let domOverlap = 0;
  for (const d of cand.domains) if (pDom.has(d)) domOverlap++;
  if (domOverlap > 0) {
    score += 3 * domOverlap;
    reasons.add('domain');
  }

  // 2) 图谱邻居（关系网络节点，含二跳）
  if (graphIds.has(cand.id)) {
    score += 6;
    reasons.add('graph');
  }

  // 3) 亲属重叠（族谱中同为库内人物）
  if ((person.kin || []).some((k) => k.slug && k.slug === cand.slug)) {
    score += 8;
    reasons.add('kin');
  }

  // 4) 关系相似（与目标人物共享关系对象，每个 +4）
  const pRelTargets = new Set(person.relations.map((r) => r.targetId));
  let relShared = 0;
  for (const r of cand.relations || []) if (pRelTargets.has(r.targetId)) relShared++;
  if (relShared > 0) {
    score += 4 * relShared;
    reasons.add('relation');
  }

  // 5) 同国籍（+2）
  const pNat = new Set(person.nationalities || []);
  if ((cand.nationalities || []).some((n) => pNat.has(n))) score += 2;

  const reason = REASON_PRIORITY.find((k) => reasons.has(k)) || 'domain';
  return { person: cand, score, reason };
}

export default function RelatedPersons({
  person,
  candidates,
  lang,
  graphIds
}: {
  person: Person;
  candidates: Person[];
  lang: Lang;
  graphIds: Set<string>;
}) {
  const ranked: Scored[] = candidates
    .filter((c) => c.id !== person.id && c.slug !== person.slug)
    .map((c) => scoreCandidate(person, c, graphIds))
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.person.metrics?.influence ?? 0) - (a.person.metrics?.influence ?? 0)
    )
    .slice(0, 6);

  if (ranked.length === 0) return null;

  return (
    <section className="mt-10" aria-label={t(lang, 'related.recommendTitle')}>
      <h2 className="text-xl font-bold mb-4">{t(lang, 'related.recommendTitle')}</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ranked.map(({ person: c, reason }) => (
          <div key={c.slug} className="relative">
            <PersonCard person={c} lang={lang} />
            <span className="pointer-events-none absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
              {t(lang, `related.reason${reason[0].toUpperCase()}${reason.slice(1)}`)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
