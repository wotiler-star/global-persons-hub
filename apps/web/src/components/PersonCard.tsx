import Link from 'next/link';
import { pickText, type Lang } from '@/lib/i18n';
import { t, domainLabel } from '@/lib/ui';
import { highlightSegments } from '@/lib/searchIndex';
import FavoriteButton from '@/components/FavoriteButton';
import type { CardPerson } from '@/lib/personProjection';

/**
 * props 采用最小展示类型 `CardPerson`（完整 Person 与轻量 PersonLite 都满足），
 * 既让列表页只把轻量投影带进客户端 payload，又兼容详情/库/搜索页传入完整 Person。
 */
export default function PersonCard({
  person,
  lang,
  highlight
}: {
  person: CardPerson;
  lang: Lang;
  highlight?: string;
}) {
  const mark = (text: string, q?: string) => {
    if (!q) return text;
    const segs = highlightSegments(text, q);
    if (segs.length === 1) return text;
    return (
      <>
        {segs.map((seg, i) =>
          seg.hit ? (
            <mark key={i} className="bg-yellow-200 text-slate-900 rounded px-0.5">
              {seg.s}
            </mark>
          ) : (
            <span key={i}>{seg.s}</span>
          )
        )}
      </>
    );
  };

  return (
    <Link
      href={`/${lang}/person/${person.slug}`}
      className="relative block border rounded-xl p-4 bg-white hover:shadow-md transition"
    >
      <FavoriteButton slug={person.slug} lang={lang} />
      <div className="font-semibold text-lg">{mark(pickText(person.names, lang), highlight)}</div>
      <div className="text-xs text-slate-500 mt-1">{mark(pickText(person.occupations, lang), highlight)}</div>
      <div className="flex flex-wrap gap-1 mt-2">
        {person.domains.map((d) => (
          <span key={d} className="text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
            {domainLabel(lang, d)}
          </span>
        ))}
      </div>
      <div className="text-xs text-slate-600 mt-2 line-clamp-2">
        {mark(pickText(person.summary, lang), highlight)}
      </div>
      <div className="text-[10px] mt-2 text-slate-400">
        {t(lang, 'person.trustLevel')}：{t(lang, `trust.${person.trustLevel}`)}
      </div>
    </Link>
  );
}
