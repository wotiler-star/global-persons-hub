// 纯检索工具（无 React 依赖，服务端/客户端均可复用）
// 全文搜索增强：跨 13 语 names/occupations/summary/bio/aliases/domains 的全文本匹配
// + 领域/时代分面 + 关键词高亮分段。零新增第三方依赖。
import type { Person } from '@gph/types';

/** 从 ISO 日期解析出生年（支持公元前负数，如 -055）；缺失返回 null */
export function birthYear(p: Person): number | null {
  if (!p.birth) return null;
  const m = /^([-+]?\d+)/.exec(p.birth);
  return m ? parseInt(m[1], 10) : null;
}

export interface SearchFilters {
  q: string;
  domain: string; // '' = 全部
  era: string; // '' = 全部；'ancient'|'medieval'|'earlymodern'|'contemporary'
}

/** 时代分桶（与 timeline 页面一致）：古代 <500 / 中世纪 500–1499 / 近代 1500–1899 / 现代 ≥1900 */
export const ERAS: { key: string; uiKey: string; from: number; to: number }[] = [
  { key: 'ancient', uiKey: 'timeline.eraAncient', from: -9999, to: 499 },
  { key: 'medieval', uiKey: 'timeline.eraMedieval', from: 500, to: 1499 },
  { key: 'earlymodern', uiKey: 'timeline.eraModern', from: 1500, to: 1899 },
  { key: 'contemporary', uiKey: 'timeline.eraContemporary', from: 1900, to: 9999 }
];

function eraRange(era: string): { from: number; to: number } | null {
  const e = ERAS.find((x) => x.key === era);
  return e ? { from: e.from, to: e.to } : null;
}

/** 拼接人物全部可搜索文本（跨所有语种），小写化 */
function searchable(p: Person): string {
  const parts: string[] = [];
  const pushRec = (rec: Record<string, string | undefined> | undefined) => {
    if (!rec) return;
    for (const v of Object.values(rec)) if (v) parts.push(v);
  };
  pushRec(p.names as Record<string, string> | undefined);
  pushRec(p.occupations as Record<string, string> | undefined);
  pushRec(p.summary as Record<string, string> | undefined);
  pushRec((p as any).bio as Record<string, string> | undefined);
  if (p.aliases) parts.push(p.aliases.join(' '));
  if (p.domains) parts.push(p.domains.join(' '));
  if (p.nationalities) parts.push(p.nationalities.join(' '));
  return parts.join(' ').toLowerCase();
}

/** 命中评分：姓名 +3 / 职业 +2 / 其它字段 +1；0 表示未命中 */
export function matchScore(p: Person, q: string): number {
  const needle = q.trim().toLowerCase();
  if (!needle) return 0;
  const hay = searchable(p);
  if (!hay.includes(needle)) return 0;
  let score = 1; // 任一字段命中（summary/bio/alias/domain/nationality）
  const names = Object.values(p.names || {}).join(' ').toLowerCase();
  const occ = Object.values(p.occupations || {}).join(' ').toLowerCase();
  if (names.includes(needle)) score += 2; // 1 + 2 = 3
  if (occ.includes(needle)) score += 1; // 1 + 1 = 2
  return score;
}

/** 跨 13 语全文本过滤 + 领域/时代分面 + 相关性排序 */
export function filterPersons(all: Person[], f: SearchFilters): Person[] {
  const q = f.q.trim();
  const scored: { p: Person; score: number }[] = [];
  const era = eraRange(f.era);
  for (const p of all) {
    // 时代过滤（按出生年）
    if (era) {
      const y = birthYear(p);
      if (y == null || y < era.from || y > era.to) continue;
    }
    // 领域过滤
    if (f.domain && !(p.domains || []).includes(f.domain as any)) continue;
    // 关键词过滤
    if (q) {
      const s = matchScore(p, q);
      if (s <= 0) continue;
      scored.push({ p, score: s });
    } else {
      scored.push({ p, score: 0 });
    }
  }
  if (q) {
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        (p_name(a.p).localeCompare(p_name(b.p)))
    );
  }
  return scored.map((x) => x.p);
}

function p_name(p: Person): string {
  return (p.names?.en as string) || Object.values(p.names || {})[0] || p.slug;
}

/** 高亮分段：命中子串包 hit=true，用于渲染 <mark>。多命中全标。 */
export function highlightSegments(text: string, q: string): { s: string; hit: boolean }[] {
  const needle = q.trim();
  if (!needle || !text) return [{ s: text, hit: false }];
  const safe = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${safe})`, 'ig');
  const parts = text.split(re);
  if (parts.length <= 1) return [{ s: text, hit: false }];
  return parts.map((s, i) => ({ s, hit: i % 2 === 1 }));
}
