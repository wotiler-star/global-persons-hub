import type { Domain, Lang, LocalizedText, Person, TrustLevel } from '@gph/types';

/**
 * 列表类子板块（人物库 / 探索 / 画廊 / 时间轴 / 领域 / 首页推荐）的「轻量人物投影」。
 *
 * 背景：服务端组件把完整 Person[] 作为 props 交给 'use client' 组件时，Next.js 会把整份
 * 数据序列化进 RSC flight payload 塞入 HTML。而 Person 很"重"——bio（13 语整段）约占 36%、
 * summary（13 语）24%、achievements（13 语 × 多条）16%，列表页却一条都用不到 bio/achievements。
 *
 * 设计取舍：**保持字段形状与 Person 一致**（names/summary 仍是 LocalizedText），
 * 这样 pickText()、facets.computeFacets()、PersonCard 等既有逻辑零改动即可复用；
 * 只在两个维度上做裁剪：
 *   1) 语言维度：多语文本仅保留「当前语 + en 回退」两个键（pickText 内建 en 回退，零功能损失）
 *   2) 字段维度：剔除列表页完全不用的 bio / kin / sources / affiliations / endorsements 等
 */
export interface PersonLite {
  id: string;
  slug: string;
  names: LocalizedText;
  occupations?: LocalizedText;
  summary: LocalizedText;
  domains: Domain[];
  nationalities?: string[];
  birth?: string;
  death?: string;
  trustLevel: TrustLevel;
  imageUrl?: string;
  metrics?: { influence?: number; netWorth?: number };
  /** 仅在 withRelationIds 时带上：用于"关系数"打分（首页推荐 / 对比页） */
  relIds?: string[];
  /** 仅在 withAchievements 时带上：当前语前 N 条成就（对比页） */
  achievements?: string[];
  /** 仅在 withCreatedAt 时带上：用于"最新收录"排序（搜索页） */
  createdAt?: string;
  /** 仅在 withAliases 时带上：用于站内检索 */
  aliases?: string[];
}

/**
 * 仅展示用（PersonCard 等）的最小字段交集：完整 Person 与轻量 PersonLite 都满足，
 * 因此两者都能直接传入 PersonCard，互不耦合（也规避 achievements 类型差异导致的不可赋值）。
 */
export interface CardPerson {
  slug: string;
  names: LocalizedText;
  occupations?: LocalizedText;
  domains: Domain[];
  summary: LocalizedText;
  trustLevel: TrustLevel;
}

export interface ProjectOptions {
  /** 携带 relations 的 targetId 列表（默认 false） */
  withRelationIds?: boolean;
  /** 携带当前语成就文本，值为保留条数（默认不带） */
  withAchievements?: number;
  /** 携带 createdAt（默认 false） */
  withCreatedAt?: boolean;
  /** 携带 aliases（默认 false） */
  withAliases?: boolean;
}

/** 多语文本仅保留「当前语 + en」，两者相同或缺失时自动去重/省略 */
function narrow(t: LocalizedText | undefined, lang: Lang): LocalizedText | undefined {
  if (!t) return undefined;
  const out: LocalizedText = {};
  const cur = t[lang];
  if (cur) out[lang] = cur;
  // 保留 en 作为兜底（pickText 的 fallback 即 en）；当前语已是 en 时不重复
  if (lang !== 'en' && t.en) out.en = t.en;
  // 当前语与 en 都缺失时，退而保留任意一条已有译文，避免渲染空白
  if (!Object.keys(out).length) {
    const first = Object.entries(t).find(([, v]) => !!v);
    if (first) out[first[0] as Lang] = first[1] as string;
  }
  return out;
}

/** 将单个 Person 投影为列表用轻量对象 */
export function projectPerson(p: Person, lang: Lang, opts: ProjectOptions = {}): PersonLite {
  const lite: PersonLite = {
    id: p.id,
    slug: p.slug,
    names: narrow(p.names, lang) || {},
    summary: narrow(p.summary, lang) || {},
    domains: p.domains,
    trustLevel: p.trustLevel
  };
  const occ = narrow(p.occupations, lang);
  if (occ && Object.keys(occ).length) lite.occupations = occ;
  if (p.nationalities?.length) lite.nationalities = p.nationalities;
  if (p.birth) lite.birth = p.birth;
  if (p.death) lite.death = p.death;

  const img = p.imageUrl || p.images?.[0];
  if (img) lite.imageUrl = img;

  // metrics 只保留列表页用到的两项（citations 无任何引用）
  const influence = p.metrics?.influence;
  const netWorth = p.metrics?.netWorth;
  if (influence != null || netWorth != null) {
    lite.metrics = {};
    if (influence != null) lite.metrics.influence = influence;
    if (netWorth != null) lite.metrics.netWorth = netWorth;
  }

  if (opts.withRelationIds) {
    const ids = (p.relations || []).map((r) => r.targetId).filter(Boolean);
    if (ids.length) lite.relIds = ids;
  }
  if (opts.withAchievements) {
    const list = (p.achievements || [])
      .map((a) => a?.[lang] || a?.en || '')
      .filter(Boolean)
      .slice(0, opts.withAchievements);
    if (list.length) lite.achievements = list;
  }
  if (opts.withCreatedAt && p.createdAt) lite.createdAt = p.createdAt;
  if (opts.withAliases && p.aliases?.length) lite.aliases = p.aliases;

  return lite;
}

/** 批量投影 */
export function projectPersons(list: Person[], lang: Lang, opts: ProjectOptions = {}): PersonLite[] {
  return list.map((p) => projectPerson(p, lang, opts));
}
