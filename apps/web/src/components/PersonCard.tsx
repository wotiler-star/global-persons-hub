import Link from 'next/link';
import { pickText, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { DOMAIN_LABELS, type Person } from '@gph/types';

export default function PersonCard({ person, lang }: { person: Person; lang: Lang }) {
  return (
    <Link
      href={`/${lang}/person/${person.slug}`}
      className="block border rounded-xl p-4 bg-white hover:shadow-md transition"
    >
      <div className="font-semibold text-lg">{pickText(person.names, lang)}</div>
      <div className="text-xs text-slate-500 mt-1">{pickText(person.occupations, lang)}</div>
      <div className="flex flex-wrap gap-1 mt-2">
        {person.domains.map((d) => (
          <span key={d} className="text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
            {DOMAIN_LABELS[d]}
          </span>
        ))}
      </div>
      <div className="text-xs text-slate-600 mt-2 line-clamp-2">{pickText(person.summary, lang)}</div>
      <div className="text-[10px] mt-2 text-slate-400">{t(lang, 'person.trustLevel')}：{t(lang, `trust.${person.trustLevel}`)}</div>
    </Link>
  );
}
