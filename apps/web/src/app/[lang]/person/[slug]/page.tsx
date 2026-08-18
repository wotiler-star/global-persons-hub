import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getPerson, getRelations, getNetwork, getPersons, getAllPersons } from '@/lib/server/data';
import { pickText, LANGS, type Lang } from '@/lib/i18n';
import { t, domainLabel } from '@/lib/ui';
import { OG_LOCALE, SITE_NAME } from '@/lib/og';
import type { Domain } from '@gph/types';
import PersonCard from '@/components/PersonCard';
import RelatedPersons from '@/components/RelatedPersons';
import NetworkGraph from '@/components/NetworkGraph';
import SecondDegree from '@/components/SecondDegree';
import JsonLd from '@/components/JsonLd';
import Comments from '@/components/Comments';
import AchievementTimeline from '@/components/AchievementTimeline';
import AICard from '@/components/AICard';
import ImageUploader from '@/components/ImageUploader';
import HistoryTracker from '@/components/HistoryTracker';
import PersonHero from '@/components/PersonHero';
import ReadingProgress from '@/components/ReadingProgress';
import SectionNav from '@/components/SectionNav';

// —— GEO：从人物事实生成 FAQ（同一份数据既渲染可见区块，又序列化为 FAQPage JSON-LD）——
function buildFaqItems(person: any, L: Lang): { question: string; answer: string }[] {
  const name = pickText(person.names, L) || pickText(person.names, 'en');
  const qa: { question: string; answer: string }[] = [];
  const summary = pickText(person.summary, L);
  if (summary) qa.push({ question: `Who is ${name}?`, answer: summary });
  if (person.birth) {
    let a = `${name} was born on ${person.birth}.`;
    if (person.death) a += ` ${name} died on ${person.death}.`;
    qa.push({ question: `When was ${name} born?`, answer: a });
  }
  const occ = pickText(person.occupations, L);
  const doms = (person.domains || [])
    .map((d: Domain) => domainLabel('en', d))
    .filter(Boolean)
    .join(', ');
  if (occ || doms) {
    const a = `${name} is known for ${[occ, doms].filter(Boolean).join(' — ')}.`;
    qa.push({ question: `What is ${name} known for?`, answer: a });
  }
  if (person.nationalities?.length) {
    qa.push({
      question: `What nationality is ${name}?`,
      answer: `${name} is ${person.nationalities.join(', ')}.`
    });
  }
  if (person.metrics?.netWorth) {
    qa.push({
      question: `What is ${name}'s net worth?`,
      answer: `As cited, ${name}'s net worth is approximately $${(person.metrics.netWorth / 1e9).toFixed(
        1
      )} billion.`
    });
  }
  return qa;
}

function buildFaqLd(person: any, L: Lang) {
  const qa = buildFaqItems(person, L);
  if (qa.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qa.map((x) => ({
      '@type': 'Question',
      name: x.question,
      acceptedAnswer: { '@type': 'Answer', text: x.answer }
    }))
  };
}

// —— Stage 34 SSG/ISR：构建期预渲染 13 语 × 全部人物，5 分钟增量再生 ——
// 新增人物无需重新构建：dynamicParams 允许未预生成的 slug 按需渲染后进入缓存。
export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  try {
    const d = await getAllPersons();
    const slugs: string[] = (d.items || []).map((p: any) => p.slug).filter(Boolean);
    return LANGS.flatMap((lang) => slugs.map((slug) => ({ lang, slug })));
  } catch {
    // 构建期 API 不可达时退化为全按需渲染（ISR 首访生成）
    return [];
  }
}

// —— GEO / SEO：多语种 hreflang 交替链接 + 规范链接 ——
export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  let person;
  try {
    person = await getPerson(slug);
  } catch {
    /* ignore */
  }
  // 未命中人物 → 页面随后 notFound()。ISR 预渲染会把 404 页以 200 缓存下发（软 404），
  // 因此必须显式 noindex，避免搜索引擎把"页面不存在"当作正常内容收录。
  if (!person) return { title: '人物未找到', robots: { index: false, follow: false } };
  const L = lang as Lang;
  const languages: Record<string, string> = { 'x-default': `/en/person/${slug}` };
  for (const l of LANGS) languages[l] = `/${l}/person/${slug}`;
  const title = pickText(person.names, L);
  const description = pickText(person.summary, L);
  const url = `/${lang}/person/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: url, languages },
    openGraph: {
      type: 'profile',
      siteName: SITE_NAME,
      title,
      description,
      url,
      locale: OG_LOCALE[L] || 'en_US'
      // og:image 由同目录 opengraph-image.tsx 自动注入
    },
    twitter: { card: 'summary_large_image', title, description }
  };
}

export default async function PersonPage({
  params
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  const L = lang as Lang;
  let person;
  try {
    person = await getPerson(slug);
  } catch {
    /* ignore */
  }
  if (!person) notFound();

  const name = pickText(person.names, L);
  // Stage 34：三路取数并行化（原先串行 3 次往返，TTFB 直降约 2/3）
  const [rel, net, allPersons] = await Promise.all([
    getRelations(person.id).catch(() => ({ relations: [] })),
    getNetwork(person.id, 2).catch(() => null),
    getPersons({ lang: L, pageSize: 200 }).catch(() => ({ items: [] }))
  ]);
  const graphIds = new Set((net?.nodes || []).map((n: any) => n.id));
  // 成就数据改由 <AchievementTimeline> 内部提取（见下方组件调用）

  // —— SEO / GEO：Schema.org Person 结构化数据（Stage 34 补全 url/image/jobTitle/sameAs）——
  const pageUrl = `/${lang}/person/${slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    isAccessibleForFree: true,
    name: person.names.en || pickText(person.names, L),
    alternateName: Object.values(person.names),
    description: pickText(person.summary, L),
    url: pageUrl,
    image: person.imageUrl || `${pageUrl}/opengraph-image`,
    ...(pickText(person.occupations, L) ? { jobTitle: pickText(person.occupations, L) } : {}),
    birthDate: person.birth,
    deathDate: person.death,
    nationality: person.nationalities,
    ...(person.sources?.length
      ? { sameAs: person.sources.map((s: any) => s.url).filter(Boolean).slice(0, 8) }
      : {}),
    knows: (rel.relations || [])
      .filter((r: any) => r.targetName)
      .map((r: any) => ({ '@type': 'Person', name: pickText(r.targetName, L) }))
  };

  // —— Stage 34：BreadcrumbList 面包屑结构化数据（利于富摘要）——
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t(L, 'nav.home'), item: `/${lang}` },
      { '@type': 'ListItem', position: 2, name: t(L, 'nav.persons'), item: `/${lang}/persons` },
      { '@type': 'ListItem', position: 3, name, item: pageUrl }
    ]
  };

  // —— GEO：FAQ（同一份数据：可见区块 + FAQPage JSON-LD）——
  const faqItems = buildFaqItems(person, L);
  const faqLd = buildFaqLd(person, L);

  // —— 粘性目录导航条目（按实际存在的章节动态生成） ——
  const navItems = [
    { id: 'sec-about', label: t(L, 'section.about') },
    { id: 'sec-life', label: t(L, 'life.title') },
    { id: 'sec-aicard', label: t(L, 'aicard.title') },
    { id: 'sec-network', label: t(L, 'person.network') },
    ...(person.kin && person.kin.length > 0 ? [{ id: 'sec-kin', label: t(L, 'person.kinTitle') }] : []),
    ...(faqItems.length > 0 ? [{ id: 'sec-faq', label: t(L, 'section.faq') }] : []),
    { id: 'sec-related', label: t(L, 'person.relatedTitle') },
    { id: 'sec-comments', label: t(L, 'comments.title') }
  ];

  return (
    <>
      <JsonLd data={jsonLd} />
      {faqLd && <JsonLd data={faqLd} />}
      <JsonLd data={breadcrumbLd} />
      <HistoryTracker slug={slug} />
      <ReadingProgress />

      <PersonHero person={person} lang={L} />

      <SectionNav items={navItems} />

      <div className="grid md:grid-cols-3 gap-6 mt-6">
        <div className="md:col-span-2">
          {person.images && person.images.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {person.images.map((u: string, i: number) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={u} alt="" className="w-full h-28 object-cover rounded border" />
              ))}
            </div>
          )}
          <section id="sec-about" className="scroll-mt-24">
            <h3 className="font-semibold">{t(L, 'section.about')}</h3>
            <p className="mt-1 leading-relaxed">{pickText(person.summary, L)}</p>

            {person.bio && pickText(person.bio, L) && (
              <div className="mt-4">
                <h3 className="font-semibold">{t(L, 'section.bio')}</h3>
                <p className="mt-1 leading-relaxed text-slate-700">{pickText(person.bio, L)}</p>
              </div>
            )}
          </section>

          <section id="sec-life" className="scroll-mt-24">
            <AchievementTimeline person={person} lang={L} />
          </section>

          <section id="sec-aicard" className="scroll-mt-24">
            <AICard person={person} lang={L} />
          </section>

          <div id="sec-network" className="mt-6 scroll-mt-24">
            <h3 className="font-semibold mb-2">{t(L, 'person.network')}</h3>
            <NetworkGraph
              network={net || { nodes: [], edges: [] }}
              centerId={person.id}
              lang={lang}
            />
            <SecondDegree
              network={net || { nodes: [], edges: [] }}
              centerId={person.id}
              lang={L}
            />
          </div>

          {person.kin && person.kin.length > 0 && (() => {
            const groups: Record<number, any[]> = {};
            for (const k of person.kin) (groups[k.generation] ||= []).push(k);
            const order = [-2, -1, 0, 1, 2];
            return (
              <div id="sec-kin" className="mt-8 scroll-mt-24">
                <h3 className="text-lg font-semibold mb-4">{t(L, 'person.kinTitle')}</h3>
                <div className="space-y-5">
                  {order
                    .filter((g) => groups[g]?.length)
                    .map((g) => (
                      <div key={g}>
                        <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
                          {t(L, `kin.gen${g}`)}
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3">
                          {groups[g].map((k: any, i: number) => {
                            const life = [k.birth, k.death].filter((x: string) => x && x !== '?').join(' ~ ');
                            return (
                              <div key={i} className="border rounded-xl p-3 bg-white">
                                <div className="flex items-baseline justify-between gap-2">
                                  {k.slug ? (
                                    <Link
                                      href={`/${lang}/person/${k.slug}`}
                                      className="font-medium text-indigo-700 hover:underline"
                                    >
                                      {pickText(k.name, L)} →
                                    </Link>
                                  ) : (
                                    <span className="font-medium text-slate-800">{pickText(k.name, L)}</span>
                                  )}
                                  <span className="shrink-0 text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                                    {t(L, `kin.${k.relation}`)}
                                  </span>
                                </div>
                                {life && <div className="text-xs text-slate-400 mt-0.5">{life}</div>}
                                {pickText(k.bio, L) && (
                                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">{pickText(k.bio, L)}</p>
                                )}
                                {k.wiki && (
                                  <a
                                    href={k.wiki}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-block text-xs text-indigo-600 hover:underline mt-1"
                                  >
                                    Wikipedia ↗
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            );
          })()}

          {person.sources?.length > 0 && (
            <div className="mt-4 text-xs text-slate-500">
              {t(L, 'person.source')}
              {person.sources.map((s: any, i: number) => (
                <a key={i} href={s.url} className="underline mr-2">
                  {s.publisher || s.title || s.url}
                </a>
              ))}
            </div>
          )}
        </div>

        <aside>
          <div className="border rounded-xl p-4 bg-white">
            <h3 className="font-semibold mb-2">{t(L, 'person.basicInfo')}</h3>
            <dl className="text-sm space-y-1">
              <div>
                <dt className="text-slate-500">{t(L, 'person.birthDeath')}</dt>
                <dd>
                  {person.birth || '-'}
                  {person.death ? ` ~ ${person.death}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t(L, 'person.nationality')}</dt>
                <dd>{(person.nationalities || []).join('、')}</dd>
              </div>
              {person.metrics?.netWorth && (
                <div>
                  <dt className="text-slate-500">{t(L, 'person.netWorth')}</dt>
                  <dd>${(person.metrics.netWorth / 1e9).toFixed(1)}B</dd>
                </div>
              )}
              {person.metrics?.influence && (
                <div>
                  <dt className="text-slate-500">{t(L, 'person.influence')}</dt>
                  <dd>{person.metrics.influence}</dd>
                </div>
              )}
            </dl>
            <div className="mt-3 text-xs text-slate-400">{t(L, 'person.trustLevel')}：{person.trustLevel}</div>
          </div>

          {person.endorsements?.length > 0 && (
            <div className="mt-4 border rounded-xl p-4 bg-emerald-50/50 border-emerald-200">
              <h3 className="font-semibold mb-2 text-emerald-800">
                {t(L, 'person.endorsedTitle')}
              </h3>
              <div className="space-y-2">
                {person.endorsements.map((e: any) => (
                  <div key={e.id} className="text-sm">
                    <b className="text-emerald-900">{e.expertName}</b>
                    {e.comment && <p className="text-slate-600 text-xs mt-0.5">{e.comment}</p>}
                    <div className="text-xs text-slate-400">
                      {new Date(e.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4">
            <Link
              href={`/${lang}/ask?q=${encodeURIComponent(name)}`}
              className="block text-center px-3 py-2 rounded-lg bg-brand text-white text-sm hover:opacity-90"
              >
                {t(L, 'person.askAbout') + name}
              </Link>
          </div>

          <div className="mt-4">
            <h3 className="font-semibold mb-2">{t(L, 'person.relatedTitle')}</h3>
            <div className="space-y-2">
              {(rel.relations || [])
                .filter((r: any) => r.targetName)
                .map((r: any, i: number) => (
                  <div key={i} className="text-sm border rounded p-2 flex items-center justify-between gap-2">
                    <span>
                      {r.incoming && <span className="text-amber-500 mr-1" title="被其关联">←</span>}
                      {r.targetSlug ? (
                        <Link href={`/${lang}/person/${r.targetSlug}`} className="hover:underline">
                          {pickText(r.targetName, L)}
                        </Link>
                      ) : (
                        pickText(r.targetName, L)
                      )}{' '}
                      <span className="text-slate-400">· {pickText(r.label, L)}</span>
                    </span>
                    {r.targetSlug && (
                      <Link
                        href={`/${lang}/compare?ids=${person.slug},${r.targetSlug}`}
                        className="shrink-0 text-xs px-2 py-0.5 rounded border text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        {t(L, 'person.compare')}
                      </Link>
                    )}
                  </div>
                ))}
            </div>
          </div>

          <ImageUploader slug={slug} initialImages={person.images || []} lang={lang} />
        </aside>
      </div>

      {faqItems.length > 0 && (
        <div id="sec-faq" className="scroll-mt-24">
          <h2 className="text-xl font-bold mb-3">{t(L, 'section.faq')}</h2>
          <div className="space-y-2">
            {faqItems.map((f, i) => (
              <details key={i} className="border rounded-lg bg-white px-4 py-3">
                <summary className="cursor-pointer font-medium text-slate-800">{f.question}</summary>
                <p className="mt-2 text-sm text-slate-600">{f.answer}</p>
              </details>
            ))}
          </div>
        </div>
      )}

      <div id="sec-related" className="scroll-mt-24">
        <RelatedPersons person={person} candidates={allPersons.items} lang={L} graphIds={graphIds} />
      </div>

      <div id="sec-comments" className="scroll-mt-24">
        <Comments slug={slug} lang={lang} />
      </div>
    </>
  );
}
