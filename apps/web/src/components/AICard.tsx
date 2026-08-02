import Link from 'next/link';
import { pickText, type Lang } from '@/lib/i18n';
import { t, domainLabel } from '@/lib/ui';
import type { Person } from '@gph/types';

/**
 * AI 人物名片（服务端纯渲染，零客户端 JS、零 LLM 调用）：
 * 基于人物现有字段生成结构化名片——头像/姓名/领域/简介 + 4 项关键指标，
 * 底部「向 AI 深入提问」一键跳 /[lang]/ask?q=… 预填提示词。
 */
export default function AICard({ person, lang }: { person: Person; lang: Lang }) {
  const name = pickText(person.names, lang);
  const occupation = pickText(person.occupations, lang);
  const summary = pickText(person.summary, lang);

  // achievements 实际为 Record<Lang, string[]>，安全断言访问
  const achMap = (person.achievements ?? {}) as Partial<Record<Lang, string[]>>;
  const ach = achMap[lang] || achMap.en || achMap.zh || [];
  const langCount = Object.keys(person.names || {}).length;
  const influence = person.metrics?.influence ?? 0;
  const relCount = (person.relations || []).length;

  const prompt = t(lang, 'aicard.promptTpl').replace('{name}', name);
  const askHref = `/${lang}/ask?q=${encodeURIComponent(prompt)}`;
  const initials = name.slice(0, 1);

  return (
    <section className="mt-8 border rounded-2xl overflow-hidden bg-white shadow-sm">
      {/* 头部：AI 渐变标识 */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-white">
        <div className="text-[11px] uppercase tracking-wider opacity-80">{t(lang, 'aicard.title')}</div>
        <div className="text-xs opacity-90 mt-0.5 leading-snug">{t(lang, 'aicard.subtitle')}</div>
      </div>

      <div className="p-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-lg leading-tight truncate">{name}</div>
            <div className="text-xs text-slate-500 truncate">{occupation}</div>
          </div>
        </div>

        {person.domains.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {person.domains.map((d) => (
              <span key={d} className="text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                {domainLabel(lang, d)}
              </span>
            ))}
          </div>
        )}

        {summary && <p className="text-sm text-slate-600 mt-3 line-clamp-3">{summary}</p>}

        {/* 关键指标 */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          <Metric label={t(lang, 'aicard.influence')} value={String(influence)} />
          <Metric label={t(lang, 'aicard.relations')} value={String(relCount)} />
          <Metric label={t(lang, 'section.achievements')} value={String(ach.length)} />
          <Metric label={t(lang, 'aicard.languages')} value={String(langCount)} />
        </div>

        <Link
          href={askHref}
          className="mt-4 block text-center bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg py-2.5 transition"
        >
          {t(lang, 'aicard.ask')} →
        </Link>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center bg-slate-50 rounded-lg py-2">
      <div className="text-lg font-bold text-slate-800 leading-none">{value}</div>
      <div className="text-[10px] text-slate-500 mt-1 leading-tight px-0.5">{label}</div>
    </div>
  );
}
