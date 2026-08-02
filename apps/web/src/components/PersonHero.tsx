import Link from 'next/link';
import { pickText, type Lang } from '@/lib/i18n';
import { t, domainLabel } from '@/lib/ui';
import PersonPortrait from '@/components/PersonPortrait';
import FavoriteButton from '@/components/FavoriteButton';

/**
 * 人物详情页 Hero 区（服务端组件）：
 * 深色渐变横幅 + 肖像（真实图片或确定性渐变 Monogram）+ 姓名/职业/领域
 * + 关键指标磁贴（生卒 / 国籍 / 影响力 / 净资产）。
 */
export default function PersonHero({ person, lang }: { person: any; lang: Lang }) {
  const name = pickText(person.names, lang);
  const occupation = pickText(person.occupations, lang);
  const lifespan = `${person.birth || '—'}${person.death ? ` ~ ${person.death}` : ''}`;

  const stats: { label: string; value: string }[] = [
    { label: t(lang, 'person.birthDeath'), value: lifespan },
    { label: t(lang, 'person.nationality'), value: (person.nationalities || []).join(' · ') || '—' }
  ];
  if (person.metrics?.influence) {
    stats.push({ label: t(lang, 'person.influence'), value: String(person.metrics.influence) });
  }
  if (person.metrics?.netWorth) {
    stats.push({ label: t(lang, 'person.netWorth'), value: `$${(person.metrics.netWorth / 1e9).toFixed(1)}B` });
  }

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white mb-6">
      {/* 装饰光斑 */}
      <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl" />
      <div className="absolute -bottom-28 -left-10 w-80 h-80 rounded-full bg-fuchsia-500/10 blur-3xl" />

      <div className="relative p-5 sm:p-7 flex flex-col sm:flex-row gap-5 sm:gap-7 items-start">
        <PersonPortrait
          person={person}
          lang={lang}
          className="w-28 h-28 sm:w-36 sm:h-36 rounded-2xl ring-2 ring-white/20 shadow-xl shrink-0"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">{name}</h1>
            <FavoriteButton slug={person.slug} lang={lang} className="relative top-0 right-0 w-9 h-9 text-2xl" />
          </div>
          {occupation && <div className="mt-1 text-indigo-200/90 text-sm sm:text-base">{occupation}</div>}

          <div className="flex flex-wrap gap-1.5 mt-3">
            {(person.domains || []).map((d: string) => (
              <Link
                key={d}
                href={`/${lang}/persons?domain=${d}`}
                className="text-xs px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur border border-white/10 transition-colors"
              >
                {domainLabel(lang, d)}
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5">
            {stats.map((s, i) => (
              <div key={i} className="rounded-xl bg-white/[.07] border border-white/10 px-3 py-2.5 backdrop-blur">
                <div className="text-[11px] uppercase tracking-wide text-indigo-200/70">{s.label}</div>
                <div className="text-sm font-semibold mt-0.5 truncate" title={s.value}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
