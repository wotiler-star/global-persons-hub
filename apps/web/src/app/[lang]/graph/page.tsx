import type { Metadata } from 'next';
import { getPersons } from '@/lib/server/data';
import { pickText, LANGS, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import GraphExplorer from '@/components/GraphExplorer';

// —— GEO / SEO：多语种 hreflang 交替链接 + 规范链接 ——
export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const L = lang as Lang;
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[l] = `/${l}/graph`;
  languages['x-default'] = `/en/graph`;
  return {
    title: t(L, 'graph.title'),
    description: t(L, 'graph.desc'),
    alternates: { canonical: `/${lang}/graph`, languages }
  };
}

export default async function GraphPage({
  params,
  searchParams
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ center?: string; depth?: string; to?: string }>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const L = lang as Lang;

  let persons: { slug: string; id: string; name: string }[] = [];
  try {
    const d = await getPersons({ pageSize: 200, lang });
    persons = d.items
      .map((p: any) => ({ slug: p.slug, id: p.id, name: pickText(p.names, L) }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name, L));
  } catch {
    /* API 不可达时静默降级 */
  }

  const initialDepth = sp.depth ? Math.min(3, Math.max(1, Number(sp.depth) || 2)) : 2;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold">{t(L, 'graph.title')}</h1>
      <p className="text-slate-500 mt-1 mb-6">{t(L, 'graph.desc')}</p>
      <GraphExplorer
        lang={lang}
        persons={persons}
        initialCenter={sp.center}
        initialDepth={initialDepth}
        initialTo={sp.to}
      />
    </div>
  );
}
