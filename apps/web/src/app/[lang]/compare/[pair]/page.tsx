import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getPerson } from '@/lib/api';
import { pickText, LANGS, type Lang } from '@/lib/i18n';
import { t, domainLabel } from '@/lib/ui';
import { OG_LOCALE, SITE_NAME } from '@/lib/og';
import JsonLd from '@/components/JsonLd';

// 人物对比页（SEO 着陆页）：/zh/compare/albert-einstein-vs-elon-musk
// pair 约定为 "{slugA}-vs-{slugB}"，SSR 渲染结构化对比表 + JSON-LD + hreflang。

function splitPair(pair: string): [string, string] | null {
  const idx = pair.indexOf('-vs-');
  if (idx <= 0) return null;
  const a = pair.slice(0, idx);
  const b = pair.slice(idx + 4);
  if (!a || !b || a === b) return null;
  return [a, b];
}

async function loadPair(pair: string) {
  const parts = splitPair(pair);
  if (!parts) return null;
  const [a, b] = await Promise.all([
    getPerson(parts[0]).catch(() => null),
    getPerson(parts[1]).catch(() => null)
  ]);
  if (!a || !b) return null;
  return [a, b] as const;
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string; pair: string }>;
}): Promise<Metadata> {
  const { lang, pair } = await params;
  const L = lang as Lang;
  const pp = await loadPair(pair);
  if (!pp) return { title: '对比未找到' };
  const [a, b] = pp;
  const na = pickText(a.names, L);
  const nb = pickText(b.names, L);
  const title = `${na} vs ${nb} · ${t(L, 'compare.title')}`;
  const description = t(L, 'compare.subtitle');
  const url = `/${lang}/compare/${pair}`;
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[l] = `/${l}/compare/${pair}`;
  languages['x-default'] = `/en/compare/${pair}`;
  return {
    title,
    description,
    alternates: { canonical: url, languages },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title,
      description,
      url,
      locale: OG_LOCALE[L] || 'en_US'
    },
    twitter: { card: 'summary_large_image', title, description }
  };
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="border-t p-3 align-top text-sm">{children}</td>;
}

export default async function ComparePage({
  params
}: {
  params: Promise<{ lang: string; pair: string }>;
}) {
  const { lang, pair } = await params;
  const L = lang as Lang;
  const pp = await loadPair(pair);
  if (!pp) notFound();
  const [a, b] = pp;
  const na = pickText(a.names, L);
  const nb = pickText(b.names, L);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${na} vs ${nb}`,
    itemListElement: [a, b].map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Person',
        name: p.names.en || pickText(p.names, L),
        description: pickText(p.summary, L),
        url: `/${lang}/person/${p.slug}`
      }
    }))
  };

  const rows: { label: string; render: (p: any) => React.ReactNode }[] = [
    {
      label: t(L, 'compare.domains'),
      render: (p) => (
        <div className="flex flex-wrap gap-1">
          {(p.domains || []).map((d: string) => (
            <span key={d} className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
              {domainLabel(L, d)}
            </span>
          ))}
        </div>
      )
    },
    {
      label: t(L, 'compare.occupation'),
      render: (p) => pickText(p.occupations, L) || '-'
    },
    {
      label: t(L, 'compare.life'),
      render: (p) => `${p.birth || '-'}${p.death ? ` ~ ${p.death}` : ''}`
    },
    {
      label: t(L, 'compare.nationality'),
      render: (p) => (p.nationalities || []).join(' / ') || '-'
    },
    {
      label: t(L, 'compare.influence'),
      render: (p) => (p.metrics?.influence ? <b>{p.metrics.influence}</b> : '-')
    },
    {
      label: t(L, 'compare.achievements'),
      render: (p) => {
        const ach: string[] = (p.achievements && (p.achievements[L] || p.achievements.en)) || [];
        return ach.length ? (
          <ul className="list-disc pl-4 space-y-0.5">
            {ach.slice(0, 5).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        ) : (
          '-'
        );
      }
    },
    {
      label: t(L, 'compare.endorsements'),
      render: (p) =>
        p.endorsements?.length ? (
          <span className="text-emerald-700">
            ✓ {p.endorsements.length} {t(L, 'compare.expertsCount')}
          </span>
        ) : (
          '-'
        )
    },
    {
      label: t(L, 'compare.trust'),
      render: (p) => <code className="text-xs">{p.trustLevel}</code>
    },
    {
      label: t(L, 'compare.summary'),
      render: (p) => <p className="leading-relaxed">{pickText(p.summary, L)}</p>
    }
  ];

  return (
    <>
      <JsonLd data={jsonLd} />
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold">
          {na} <span className="text-slate-400 mx-1">vs</span> {nb}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {t(L, 'compare.subtitle')}
        </p>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full border rounded-xl bg-white overflow-hidden">
            <thead>
              <tr className="bg-slate-50">
                <th className="p-3 text-left text-sm text-slate-500 w-28"></th>
                {[a, b].map((p) => (
                  <th key={p.id} className="p-3 text-left">
                    <Link href={`/${lang}/person/${p.slug}`} className="text-brand hover:underline text-base">
                      {pickText(p.names, L)}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="border-t p-3 text-sm text-slate-500 font-medium">{r.label}</td>
                  <Cell>{r.render(a)}</Cell>
                  <Cell>{r.render(b)}</Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex gap-3 text-sm">
          <Link href={`/${lang}/person/${a.slug}`} className="text-brand underline">
            {na}
          </Link>
          <Link href={`/${lang}/person/${b.slug}`} className="text-brand underline">
            {nb}
          </Link>
          <Link
            href={`/${lang}/ask?q=${encodeURIComponent(`${na} vs ${nb}`)}`}
            className="text-slate-500 underline"
          >
            {t(L, 'compare.askAi')}
          </Link>
        </div>
      </div>
    </>
  );
}
