// 站点级结构化数据：Organization（组织实体）+ WebSite（含站内搜索 Sitelinks 搜索框）
// 供 app/[lang]/layout.tsx 在每语种页面注入，提升 SEO/GEO 实体识别与 Google Sitelinks 搜索框。
import { SITE_URL, SITE_NAME } from '@/lib/og';
import type { Lang } from '@gph/types';

export const SITE_DESCRIPTION =
  '全球最大的跨领域、全语种、结构化人物知识图谱数据库平台。影视 / 商业 / 学术 / 体育 / 音乐 / 政治 / 艺术，统一画像，母语可读。';

// 组织社交主页（sameAs）。仅填入仓库中可验证的真实地址，避免编造不存在的账号。
// 当前为 GitHub 仓库与所有者主页（来自 git remote，确为真实页面）；
// 若另有官方 X / Facebook / LinkedIn / 公众号等，直接追加到此数组即可自动纳入 Organization 实体。
export const SITE_SOCIALS: string[] = [
  'https://github.com/wotiler-star/global-persons-hub',
  'https://github.com/wotiler-star'
];

/**
 * 构建某语种的 Organization + WebSite + WebApplication 结构化数据（三个独立 JSON-LD 节点）。
 * - Organization：语言中立的单一实体（@id 固定在站点根），全站各页重复出现同一 @id → 被搜索引擎合并为同一组织。
 * - WebSite：每语种独立节点（@id 含语种），声明站内搜索动作（SearchAction），触发 Google Sitelinks 搜索框。
 * - WebApplication：每语种独立节点，描述平台本身（交互式 Web 应用），publisher 反向引用 Organization。
 */
export function buildSiteLd(lang: Lang): Record<string, any>[] {
  const root = SITE_URL.replace(/\/$/, '');
  const langHome = `${root}/${lang}`;
  const orgId = `${root}#organization`; // 语言中立，全站同一实体
  const webId = `${langHome}#website`; // 每语种独立 WebSite 节点
  const appId = `${langHome}#webapp`; // 每语种独立 WebApplication 节点

  const organization: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': orgId,
    name: SITE_NAME,
    url: root,
    logo: `${root}/icon`,
    description: SITE_DESCRIPTION
  };
  if (SITE_SOCIALS.length) organization.sameAs = SITE_SOCIALS;

  const webSite: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': webId,
    name: SITE_NAME,
    url: langHome,
    description: SITE_DESCRIPTION,
    inLanguage: lang,
    publisher: { '@id': orgId },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${langHome}/search?q={search_term_string}`
      },
      'query-input': 'required name=search_term_string'
    }
  };

  const webApp: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': appId,
    name: SITE_NAME,
    url: langHome,
    description: SITE_DESCRIPTION,
    inLanguage: lang,
    operatingSystem: 'Web',
    applicationCategory: 'ReferenceApplication',
    publisher: { '@id': orgId },
    offers: {
      '@type': 'Offer',
      name: 'Free',
      price: '0',
      priceCurrency: 'USD'
    }
  };

  return [organization, webSite, webApp];
}
