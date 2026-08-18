// RAG 事实问答（Hostinger 单进程版）：语义检索（哈希向量）+ 抽取式作答。
// 不依赖外部 LLM / 数据库即可运行；若部署时配置了 GPH_LLM_API_URL 也可接入生成式回答
// （此处仅实现零依赖的抽取式兜底，保证任意环境随时可用）。
import { gphStore } from './store';
import type { Lang, LocalizedText, Domain } from '@gph/types';
import { DOMAIN_LABELS } from '@gph/types';

export interface RagSource {
  slug: string;
  name: string;
  excerpt: string;
  score: number;
  lang?: string;
  sameAs?: { url: string; title?: string; publisher?: string }[];
}
export interface RagResult {
  query: string;
  answer: string;
  sources: RagSource[];
  generated: boolean;
  model?: string;
}

function pickText(t: LocalizedText | undefined, lang: Lang, fallback: Lang = 'en'): string {
  if (!t) return '';
  return (t[lang] as string) || (t[fallback] as string) || (Object.values(t).find(Boolean) as string) || '';
}

function buildExcerpt(hit: any, lang: Lang): string {
  const summary = pickText(hit.summary as LocalizedText, lang);
  if (summary) return summary;
  const occ = pickText(hit.occupations as LocalizedText, lang);
  if (occ) return occ;
  return (hit.names?.[lang] || hit.names?.en || '') as string;
}

function domainLabels(domains: Domain[] = []): string {
  return domains.map((d) => DOMAIN_LABELS[d]).filter(Boolean).join('、');
}

function extractiveAnswer(query: string, sources: RagSource[], lang: Lang): string {
  if (sources.length === 0) {
    return lang === 'zh'
      ? '知识库中暂未检索到与您问题相关的人物。可尝试更换关键词，或贡献该人物资料。'
      : 'No relevant person was found in the knowledge base for your question. Try different keywords, or contribute this person.';
  }
  const top = sources[0];
  const more =
    sources.length > 1
      ? lang === 'zh'
        ? ` 另有 ${sources.length - 1} 位相关人物见下方来源。`
        : ` ${sources.length - 1} more related people are listed below.`
      : '';
  const head = lang === 'zh' ? '根据「全球知名人物志」知识库检索，' : 'Based on the Global Persons Hub knowledge base, ';
  return (
    head +
    (lang === 'zh'
      ? `与您的问题最相关的是 ${top.name}（${domainLabels((top as any).domains)}）：${top.excerpt} 详见其人物主页。${more}（注：当前未接入生成式大模型，已基于结构化事实作答；配置 GPH_LLM_API_URL 后可生成综合叙述并标注引用。）`
      : `the most relevant person is ${top.name} (${domainLabels((top as any).domains)}): ${top.excerpt} See the profile page.${more}`)
  );
}

/**
 * 执行一次 RAG 问答（抽取式兜底版）。
 * 检索基于 gphStore().semanticSearch（哈希向量余弦，零依赖）。
 */
export async function askRag(query: string, lang: Lang = 'zh', limit = 5): Promise<RagResult> {
  const q = (query || '').trim();
  if (!q) {
    return {
      query: q,
      answer: lang === 'zh' ? '请输入您想了解的问题。' : 'Please enter your question.',
      sources: [],
      generated: false
    };
  }

  const hits = await gphStore().semanticSearch(q, { limit: limit * 2, lang });

  const bySlug = new Map<string, RagSource>();
  for (const h of hits) {
    const slug = h.hit.slug;
    const excerpt = buildExcerpt(h.hit, lang);
    const name = (h.hit.names?.[lang] || h.hit.names?.en || '') as string;
    const existing = bySlug.get(slug);
    if (!existing || h.score > existing.score) {
      const sameAs = (h.hit.sources || [])
        .map((s: any) => ({ url: s.url, title: s.title, publisher: s.publisher }))
        .filter((s: any) => /^https?:\/\//i.test(s.url || ''));
      const entry: RagSource = {
        slug,
        name,
        excerpt,
        score: h.score,
        lang,
        sameAs: sameAs.length ? sameAs : undefined
      };
      (entry as any).domains = h.hit.domains;
      bySlug.set(slug, entry);
    }
  }
  const sources = [...bySlug.values()].sort((a, b) => b.score - a.score).slice(0, limit);

  return { query: q, answer: extractiveAnswer(q, sources, lang), sources, generated: false };
}
