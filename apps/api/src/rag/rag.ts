// RAG 事实问答：向量检索（store.semanticSearch）+ 可选 LLM 生成。
// 流程：嵌入查询 → 取 Top-K 相关片段 → 有 LLM 则基于检索片段生成「带引用」的回答；
//       无 LLM 则退化为「抽取式」作答（直接基于结构化事实 + 出处链接），保证随时可用。
import type { DataStore } from '../store/types.js';
import type { Lang, LocalizedText, Domain } from '@gph/types';
import { DOMAIN_LABELS } from '@gph/types';
import { getLlm } from './llm.js';

export interface RagSource {
  slug: string;
  name: string;
  excerpt: string;
  score: number;
  lang?: string;
}

export interface RagResult {
  query: string;
  answer: string;
  sources: RagSource[];
  generated: boolean;   // true=LLM 生成；false=抽取式兜底
  model?: string;
}

function pickText(t: LocalizedText | undefined, lang: Lang, fallback: Lang = 'en'): string {
  if (!t) return '';
  return t[lang] || t[fallback] || (Object.values(t).find(Boolean) as string) || '';
}

function buildExcerpt(hit: any, lang: Lang): string {
  const summary = pickText(hit.summary as LocalizedText, lang);
  if (summary) return summary;
  const occ = pickText(hit.occupations as LocalizedText, lang);
  if (occ) return occ;
  return (hit.names?.[lang] || hit.names?.en || '') as string;
}

function domainLabels(domains: Domain[] = []): string {
  return domains.map((d) => DOMAIN_LABELS[d]).join('、');
}

/** 抽取式兜底作答：基于检索到的结构化事实，不编造 */
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
      ? `与您的问题最相关的是 ${top.name}（${domainLabels(
          (top as any).domains
        )}）：${top.excerpt} 详见其人物主页。${more}（注：当前未接入生成式大模型，已基于结构化事实作答；配置 GPH_LLM_API_URL 后可生成综合叙述并标注引用。）`
      : `the most relevant person is ${top.name} (${domainLabels((top as any).domains)}): ${top.excerpt} See the profile page.${more}`)
  );
}

/**
 * 执行一次 RAG 问答。
 * @param store  存储（semanticSearch 由适配器实现）
 * @param query  用户问题
 * @param lang   回答语种（影响 LLM 系统提示与抽取式文案）
 * @param limit  返回来源条数
 */
export async function askRag(
  store: DataStore,
  query: string,
  lang: Lang = 'zh',
  limit = 5
): Promise<RagResult> {
  const q = (query || '').trim();
  if (!q) {
    return { query: q, answer: lang === 'zh' ? '请输入您想了解的问题。' : 'Please enter your question.', sources: [], generated: false };
  }

  // 1) 向量检索：取 Top-K 片段（store 内部完成查询嵌入）
  const hits = await store.semanticSearch(q, { limit: limit * 2, lang });

  // 2) 组织来源（去重到人物，取最高分）
  const bySlug = new Map<string, RagSource>();
  for (const h of hits) {
    const slug = h.hit.slug;
    const excerpt = buildExcerpt(h.hit, lang);
    const name = (h.hit.names?.[lang] || h.hit.names?.en || '') as string;
    const existing = bySlug.get(slug);
    if (!existing || h.score > existing.score) {
      bySlug.set(slug, { slug, name, excerpt, score: h.score, lang });
      // 携带 domains 供文案展示
      (bySlug.get(slug) as any).domains = h.hit.domains;
    }
  }
  const sources = [...bySlug.values()].sort((a, b) => b.score - a.score).slice(0, limit);

  // 3) 生成或兜底
  const llm = await getLlm();
  if (llm && sources.length) {
    const context = sources
      .map((s, i) => `[${i + 1}] (${s.name}, slug=${s.slug}) ${s.excerpt}`)
      .join('\n\n');
    const langName = lang === 'zh' ? '中文' : lang;
    const system =
      `你是「全球知名人物志」的事实问答助手。仅依据下面提供的检索片段作答，` +
      `使用${langName}回答，并在相关句末用 [来源N] 标注引用。若资料不足，明确说明不知道，` +
      `绝对不要编造。回答要简洁、客观、可被 AI 直接引用。`;
    const user = `用户问题：${q}\n\n检索到的资料：\n${context}`;
    try {
      const answer = await llm.complete(system, user);
      return { query: q, answer, sources, generated: true, model: process.env.GPH_LLM_MODEL || 'gpt-4o-mini' };
    } catch (e: any) {
      console.warn('[rag] LLM failed, falling back to extractive:', e?.message);
    }
  }

  return { query: q, answer: extractiveAnswer(q, sources, lang), sources, generated: false };
}
