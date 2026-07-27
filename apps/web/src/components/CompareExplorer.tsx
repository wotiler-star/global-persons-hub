'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { pickText, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { DOMAIN_LABELS, type Person, type Relation, type Domain } from '@gph/types';

const MAX = 3;

type Cell = string | React.ReactNode;

function Row({ label, values, wrap }: { label: string; values: Cell[]; wrap?: boolean }) {
  return (
    <div
      className="grid gap-3 mt-3 items-start"
      style={{ gridTemplateColumns: `160px repeat(${values.length}, minmax(180px, 1fr))` }}
    >
      <div className="text-sm font-medium text-slate-500 pt-1">{label}</div>
      {values.map((v, i) => (
        <div key={i} className={`text-sm ${wrap ? 'leading-relaxed' : ''}`}>
          {v}
        </div>
      ))}
    </div>
  );
}

function relName(r: Relation, lang: Lang): string {
  const nm = (r as any).targetName as Partial<Record<Lang, string>> | undefined;
  if (nm) {
    const s = pickText(nm, lang);
    if (s) return s;
  }
  const slug = (r as any).targetSlug as string | undefined;
  return slug || r.targetId;
}

/**
 * 人物对比工具：搜索选择 2–3 人，结构化并排对比（生卒/国籍/领域/职业/影响力/简介），
 * 自动高亮共同领域与共同关联人物，URL 深链 ?ids= 可分享。纯客户端交互，SSR 首屏可见。
 */
export default function CompareExplorer({
  lang,
  allPersons,
  initialIds
}: {
  lang: Lang;
  allPersons: Person[];
  initialIds: string[];
}) {
  const router = useRouter();
  const bySlug = useMemo(() => new Map(allPersons.map((p) => [p.slug, p])), [allPersons]);

  const [selected, setSelected] = useState<Person[]>(() =>
    initialIds.map((id) => bySlug.get(id)).filter((p): p is Person => Boolean(p))
  );
  const [q, setQ] = useState('');

  // 选中变更 → 同步 URL（可分享、可回退）
  useEffect(() => {
    const ids = selected.map((p) => p.slug).join(',');
    router.replace(`/${lang}/compare${ids ? `?ids=${ids}` : ''}`, { scroll: false });
  }, [selected, lang, router]);

  const matches = useMemo(() => {
    const sel = new Set(selected.map((p) => p.slug));
    const term = q.trim().toLowerCase();
    return allPersons
      .filter((p) => !sel.has(p.slug))
      .filter((p) => {
        if (!term) return true;
        const name = pickText(p.names, lang).toLowerCase();
        const occ = (pickText(p.occupations, lang) || '').toLowerCase();
        return name.includes(term) || occ.includes(term);
      })
      .slice(0, 8);
  }, [q, selected, allPersons, lang]);

  const add = (p: Person) =>
    setSelected((prev) => {
      if (prev.length >= MAX || prev.some((x) => x.slug === p.slug)) return prev;
      return [...prev, p];
    });
  const remove = (slug: string) => setSelected((prev) => prev.filter((x) => x.slug !== slug));
  const clear = () => setSelected([]);

  // 共同领域（所有选中人物的领域交集）
  const sharedDomains = useMemo(() => {
    if (selected.length < 2) return [] as Domain[];
    const first = new Set(selected[0].domains);
    const rest = selected.slice(1);
    const inter = new Set<Domain>(
      [...first].filter((d) => rest.every((p) => p.domains.includes(d)))
    );
    return [...inter];
  }, [selected]);

  // 共同关联人物（关系 targetId 的交集）
  const sharedRelationNames = useMemo(() => {
    if (selected.length < 2) return [] as string[];
    const first = new Set(selected[0].relations.map((r) => r.targetId));
    const rest = selected.slice(1);
    const inter = new Set<string>(
      [...first].filter((id) =>
        rest.every((p) => (p.relations || []).some((r) => r.targetId === id))
      )
    );
    const ids = [...inter];
    if (!ids.length) return [];
    const names: string[] = [];
    for (const r of selected[0].relations || []) {
      if (ids.includes(r.targetId)) {
        const n = relName(r, lang);
        if (n && !names.includes(n)) names.push(n);
      }
    }
    return names;
  }, [selected, lang]);

  const cols = `160px repeat(${Math.max(selected.length, 1)}, minmax(180px, 1fr))`;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">{t(lang, 'compare.title')}</h1>
      <p className="text-slate-500 mt-1">{t(lang, 'compare.subtitle')}</p>

      {/* 搜索选择区 */}
      <div className="mt-6 relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t(lang, 'compare.select')}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
        {q.trim() && matches.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-72 overflow-auto">
            {matches.map((p) => (
              <li key={p.slug}>
                <button
                  onClick={() => add(p)}
                  className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center justify-between gap-3"
                >
                  <span className="font-medium text-sm">{pickText(p.names, lang)}</span>
                  <span className="text-xs text-slate-400 truncate">{pickText(p.occupations, lang)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="text-xs text-slate-400 mt-1 flex items-center gap-3">
        <span>{t(lang, 'compare.maxHint')} · {selected.length}/{MAX}</span>
        {selected.length > 0 && (
          <button onClick={clear} className="text-indigo-600 hover:underline">
            {t(lang, 'compare.clear')}
          </button>
        )}
      </div>

      {selected.length < 2 ? (
        <p className="mt-10 text-slate-500 text-center">{t(lang, 'compare.empty')}</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <div className="min-w-[640px]">
            {/* 表头：人物概览 */}
            <div className="grid gap-3" style={{ gridTemplateColumns: cols }}>
              <div />
              {selected.map((p) => (
                <div key={p.slug} className="border rounded-xl p-3 bg-white relative">
                  <button
                    onClick={() => remove(p.slug)}
                    className="absolute top-2 right-2 text-[11px] text-slate-400 hover:text-red-500"
                  >
                    {t(lang, 'compare.remove')}
                  </button>
                  <div className="font-semibold">{pickText(p.names, lang)}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{pickText(p.occupations, lang)}</div>
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover mt-2 border"
                    />
                  )}
                </div>
              ))}
            </div>

            <Row
              label={t(lang, 'compare.life')}
              values={selected.map((p) => `${p.birth || '-'}${p.death ? ` ~ ${p.death}` : ''}`)}
            />
            <Row
              label={t(lang, 'compare.nationality')}
              values={selected.map((p) => (p.nationalities || []).join('、') || '-')}
            />
            <Row
              label={t(lang, 'compare.domains')}
              values={selected.map((p) => (
                <span key={p.slug} className="flex flex-wrap gap-1">
                  {p.domains.map((d) => (
                    <span
                      key={d}
                      className={`text-[11px] px-2 py-0.5 rounded ${
                        sharedDomains.includes(d)
                          ? 'bg-emerald-100 text-emerald-700 font-medium'
                          : 'bg-indigo-50 text-indigo-700'
                      }`}
                    >
                      {DOMAIN_LABELS[d]}
                    </span>
                  ))}
                </span>
              ))}
            />
            <Row
              label={t(lang, 'compare.occupation')}
              values={selected.map((p) => pickText(p.occupations, lang) || '-')}
            />
            <Row
              label={t(lang, 'compare.influence')}
              values={selected.map((p) =>
                p.metrics?.influence != null ? String(p.metrics.influence) : '-'
              )}
            />
            <Row
              label={t(lang, 'compare.summary')}
              values={selected.map((p) => pickText(p.summary, lang) || '-')}
              wrap
            />

            {sharedDomains.length > 0 && (
              <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm">
                <b className="text-emerald-800">{t(lang, 'compare.sharedDomains')}：</b>
                <span className="text-emerald-700">
                  {sharedDomains.map((d) => DOMAIN_LABELS[d]).join('、')}
                </span>
              </div>
            )}
            {sharedRelationNames.length > 0 && (
              <div className="mt-2 p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-sm">
                <b className="text-indigo-800">{t(lang, 'compare.sharedRelations')}：</b>
                <span className="text-indigo-700">{sharedRelationNames.join('、')}</span>
              </div>
            )}

            <div className="mt-5">
              <Link
                href={`/${lang}/ask?q=${encodeURIComponent(
                  selected.map((p) => pickText(p.names, lang)).join(' vs ')
                )}`}
                className="inline-block px-4 py-2 rounded-lg bg-brand text-white text-sm hover:opacity-90"
              >
                {t(lang, 'compare.askAi')}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
