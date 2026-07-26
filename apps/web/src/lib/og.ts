// —— OpenGraph / 社交分享卡片共享常量 ——
// 供 app 各 opengraph-image.tsx 与页面 generateMetadata 复用，保持单一事实源。
import type { Domain } from '@gph/types';

/** OG 图标准尺寸（1200×630，Twitter summary_large_image / Facebook 通用） */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png';

/** 站点品牌（Latin，保证 OG 图在任意语言环境下都能渲染，无需内嵌 CJK 字体） */
export const SITE_BRAND = 'GLOBAL PERSONS HUB';
export const SITE_NAME = '全球知名人物志 · Global Persons Hub';

/** 语言码 -> OpenGraph og:locale（下划线格式，如 zh_CN） */
export const OG_LOCALE: Record<string, string> = {
  zh: 'zh_CN',
  en: 'en_US',
  es: 'es_ES',
  fr: 'fr_FR',
  ja: 'ja_JP',
  ru: 'ru_RU',
  ar: 'ar_AR',
  pt: 'pt_BR',
  de: 'de_DE',
  ko: 'ko_KR',
  it: 'it_IT',
  hi: 'hi_IN',
  id: 'id_ID'
};

/** 领域 -> 英文标签（OG 图使用 Latin，避免 CJK 字体缺失导致豆腐块） */
export const DOMAIN_EN: Record<Domain, string> = {
  film: 'Film',
  business: 'Business',
  academic: 'Academic',
  sports: 'Sports',
  music: 'Music',
  politics: 'Politics',
  tech: 'Tech',
  art: 'Art',
  other: 'Notable'
};

/** 领域 -> 主题强调色（OG 图渐变/描边用） */
export const DOMAIN_ACCENT: Record<Domain, string> = {
  film: '#e11d48',
  business: '#0891b2',
  academic: '#7c3aed',
  sports: '#ea580c',
  music: '#db2777',
  politics: '#475569',
  tech: '#2563eb',
  art: '#c026d3',
  other: '#64748b'
};

/** 站点根 URL（与 sitemap/robots 保持一致），用于 metadataBase */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
