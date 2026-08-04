import { type Domain, type Person } from '@gph/types';
import { ERAS } from './searchIndex';

/** 解析出生年（与 searchIndex.birthYear 一致） */
export function birthYearOf(p: Person): number | null {
  if (!p.birth) return null;
  const m = String(p.birth).match(/^(-?\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** 按出生年归类时代 key（未匹配返回 ''） */
export function eraKeyOf(p: Person): string {
  const y = birthYearOf(p);
  if (y == null) return '';
  const e = ERAS.find((x) => y >= x.from && y <= x.to);
  return e ? e.key : '';
}

export interface FacetCounts {
  domain: Map<Domain, number>;
  era: Map<string, number>;
  nationality: Map<string, number>;
}

const isActive = (v?: string) => !!v && v !== 'all';

/**
 * 通用分面计数：对每个维度，忽略该维度自身、应用其它维度的当前筛选。
 * - base 为候选集合（探险/画廊/人物页传全部 items；搜索页传关键词命中集 qMatched）。
 * - 返回的 Map 用于 FilterChips 的 count，使各子板块的分面体验与搜索页一致。
 */
export function computeFacets(
  base: Person[],
  f: { domain?: string; era?: string; nationality?: string }
): FacetCounts {
  const domain = new Map<Domain, number>();
  const era = new Map<string, number>();
  const nationality = new Map<string, number>();
  for (const p of base) {
    const ek = eraKeyOf(p);
    const okDomain = !isActive(f.domain) || p.domains.includes(f.domain as Domain);
    const okEra = !isActive(f.era) || ek === f.era;
    const okNat = !isActive(f.nationality) || (p.nationalities || []).includes(f.nationality as string);
    // 领域计数：忽略自身，应用 时代 + 国籍
    if (okEra && okNat) for (const d of p.domains) domain.set(d, (domain.get(d) || 0) + 1);
    // 时代计数：忽略自身，应用 领域 + 国籍
    if (okDomain && okNat) {
      const k = ek || 'unknown';
      era.set(k, (era.get(k) || 0) + 1);
    }
    // 国籍计数：忽略自身，应用 领域 + 时代
    if (okDomain && okEra) for (const n of p.nationalities || []) nationality.set(n, (nationality.get(n) || 0) + 1);
  }
  return { domain, era, nationality };
}
