import { pickText, type Lang } from './i18n';
import type { Person } from '@gph/types';
import { SITE_URL } from '@/lib/og';

/**
 * 财富格式化：自动选择 B/M/K 单位。返回 null 表示无财富数据。
 * 例：420_000_000_000 -> "$420B"，300_000_000 -> "$300M"。
 */
export function formatMoney(n?: number): string | null {
  if (!n || n <= 0) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

/**
 * 构建 schema.org ItemList 结构化数据（人物榜单/人物库可被搜索引擎与 AI 引用）。
 * 按影响力降序取前 limit 条。
 */
export function buildPersonItemList(items: Person[], lang: Lang, name: string, limit = 30) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList' as const,
    name,
    itemListElement: [...items]
      .sort((a, b) => (b.metrics?.influence || 0) - (a.metrics?.influence || 0))
      .slice(0, limit)
      .map((p, i) => ({
        '@type': 'ListItem' as const,
        position: i + 1,
        item: {
          '@type': 'Person' as const,
          name: p.names?.en || pickText(p.names, lang),
          url: `/${lang}/person/${p.slug}`
        }
      }))
  };
}

/**
 * 构建 schema.org CollectionPage 结构化数据（人物库列表页）。
 * 复用 buildPersonItemList 作为 mainEntity（ItemList of Person），
 * isPartOf 反向引用 [lang]/layout 注入的 WebSite @id，形成站点实体图谱闭环。
 */
export function buildPersonCollectionPage(
  items: Person[],
  lang: Lang,
  name: string,
  limit = 30
): Record<string, any> {
  const langHome = `${SITE_URL.replace(/\/$/, '')}/${lang}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    url: `${langHome}/persons`,
    inLanguage: lang,
    isPartOf: { '@id': `${langHome}#website` },
    mainEntity: buildPersonItemList(items, lang, name, limit)
  };
}
