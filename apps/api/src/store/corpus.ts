// 语料构建：把结构化 Person 转换为「整人向量文本」与「可检索分块」，供嵌入与 RAG 使用。
// 两个存储适配器（JSON / PG）共用，保证向量语义一致。
import type { Person } from '@gph/types';
import { LANGS } from '@gph/types';

/** 整人向量文本：聚合所有语种姓名字段、职业、简介、成就、领域、国籍、别名 */
export function personCorpus(p: Person): string {
  const parts: string[] = [];
  for (const l of LANGS) {
    const n = (p.names as any)[l];
    if (n) parts.push(n);
    const occ = (p.occupations as any)?.[l];
    if (occ) parts.push(occ);
    const s = (p.summary as any)?.[l];
    if (s) parts.push(s);
    const a = (p.achievements as any)?.[l];
    if (a) parts.push(a);
  }
  parts.push(...(p.domains ?? []));
  parts.push(...(p.nationalities ?? []));
  parts.push(...(p.aliases ?? []));
  return parts.join(' ').trim();
}

export interface Chunk {
  lang: string;
  type: 'summary' | 'achievement' | 'occupation';
  body: string;
}

/** 把人物拆分为多语分块（RAG 细粒度检索）：简介按句切分 + 每条成就 + 职业 */
export function buildChunks(p: Person): Chunk[] {
  const chunks: Chunk[] = [];
  for (const l of LANGS) {
    const summary = (p.summary as any)?.[l];
    if (summary) {
      for (const sent of splitSentences(summary)) {
        if (sent) chunks.push({ lang: l, type: 'summary', body: sent });
      }
    }
    const ach = (p.achievements as any)?.[l];
    if (Array.isArray(ach)) {
      for (const a of ach) {
        if (a) chunks.push({ lang: l, type: 'achievement', body: String(a) });
      }
    }
    const occ = (p.occupations as any)?.[l];
    if (occ) chunks.push({ lang: l, type: 'occupation', body: occ });
  }
  return chunks;
}

/** 简单多语种分句：中英文句号/换行切分，保留非空片段 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。.!?！？\n])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}
