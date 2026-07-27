import type { Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import type { Person } from '@gph/types';

/** 从 ISO 日期解析年份（支持公元前，如 -055 → -55） */
function parseYear(iso?: string): number | null {
  if (!iso) return null;
  const m = String(iso).match(/^(-?\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** 年份本地化：中文/日文前置「公元前/紀元前 + 年」，其余「数字 + 缩写」 */
function formatYear(y: number | null, lang: Lang): string {
  if (y === null) return '—';
  if (y < 0) {
    const a = Math.abs(y);
    if (lang === 'zh') return `公元前${a}年`;
    if (lang === 'ja') return `紀元前${a}年`;
    return `${a} ${t(lang, 'life.bce')}`;
  }
  if (lang === 'zh' || lang === 'ja') return `${y}年`;
  return `${y} ${t(lang, 'life.ce')}`;
}

/**
 * 生平时间线（垂直时间轴，服务端纯渲染）：
 * 出生 → 主要成就（分组） → 逝世 / 在世。
 * achievements 实际为 Record<Lang, string[]>，这里安全断言访问。
 */
export default function AchievementTimeline({ person, lang }: { person: Person; lang: Lang }) {
  const achMap = (person.achievements ?? {}) as Partial<Record<Lang, string[]>>;
  const ach = achMap[lang] || achMap.en || achMap.zh || [];
  const birthY = parseYear(person.birth);
  const deathY = parseYear(person.death);
  const alive = !person.death;
  const nat = (person.nationalities || []).join('、');

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold mb-4">{t(lang, 'life.title')}</h2>
      <ol className="relative border-l-2 border-slate-200 ml-3 space-y-6">
        {/* 出生 */}
        <li className="relative pl-7">
          <span className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white" />
          <div className="text-sm text-slate-400">{formatYear(birthY, lang)}</div>
          <div className="font-semibold">{t(lang, 'life.born')}</div>
          {nat && <div className="text-sm text-slate-500 mt-0.5">{nat}</div>}
        </li>

        {/* 主要成就（分组节点） */}
        {ach.length > 0 && (
          <li className="relative pl-7">
            <span className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-amber-500 border-2 border-white" />
            <div className="font-semibold">{t(lang, 'section.achievements')}</div>
            <ul className="mt-1 space-y-1">
              {ach.map((a, i) => (
                <li key={i} className="text-sm text-slate-700 leading-relaxed flex gap-2">
                  <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </li>
        )}

        {/* 逝世或在世 */}
        {alive ? (
          <li className="relative pl-7">
            <span className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-slate-400 border-2 border-white" />
            <div className="font-semibold">{t(lang, 'life.alive')}</div>
          </li>
        ) : (
          deathY !== null && (
            <li className="relative pl-7">
              <span className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-slate-500 border-2 border-white" />
              <div className="text-sm text-slate-400">{formatYear(deathY, lang)}</div>
              <div className="font-semibold">{t(lang, 'life.died')}</div>
            </li>
          )
        )}
      </ol>
    </section>
  );
}
