import type { Metadata } from 'next';
import { getPersons } from '@/lib/server/data';
import { LANGS, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { type Person } from '@gph/types';
import { projectPersons } from '@/lib/personProjection';
import CompareExplorer from '@/components/CompareExplorer';

// —— SEO：对比页多语种 hreflang + canonical ——
export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[l] = `/${l}/compare`;
  languages['x-default'] = `/en/compare`;
  return {
    title: t(lang as Lang, 'compare.title'),
    description: t(lang as Lang, 'compare.subtitle'),
    alternates: { canonical: `/${lang}/compare`, languages }
  };
}

export default async function ComparePage({
  params,
  searchParams
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ ids?: string }>;
}) {
  const { lang } = await params;
  const L = lang as Lang;
  const sp = await searchParams;
  const ids = (sp.ids || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);

  let items: Person[] = [];
  try {
    const d = await getPersons({ lang, pageSize: 300 });
    items = d.items as Person[];
  } catch {
    /* API 不可达时静默降级 */
  }

  const projected = projectPersons(items, L, { withAchievements: 3, withRelationIds: true });
  return <CompareExplorer lang={L} allPersons={projected} initialIds={ids} />;
}
