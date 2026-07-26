import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';
import { SiteDefaultCard } from '@/lib/og-cards';
import { ogFonts, OG_NATIVE_LANGS, OG_FONT_FAMILY } from '@/lib/og-font';
import { t } from '@/lib/ui';
import type { Lang } from '@/lib/i18n';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Global Persons Hub — cross-domain, multilingual persons knowledge graph';

// 拉丁字系语言：本地化文案可直接渲染（子集字体含 Latin Extended，覆盖变音符）
const LATIN_LANGS = new Set(['en', 'es', 'fr', 'pt', 'de', 'it', 'id']);

// —— [lang] 段默认卡：首页及未自定义 OG 图的语言子页兜底；标题/副题按语言本地化 ——
export default async function Image({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const fonts = ogFonts();
  // zh/ja/ko/ru 需子集字体；拉丁语种任意；ar/hi 不在字体覆盖内 → 回退英文
  const localizable = LATIN_LANGS.has(lang) || (OG_NATIVE_LANGS.has(lang) && !!fonts);
  const L = (localizable ? lang : 'en') as Lang;
  return new ImageResponse(
    (
      <SiteDefaultCard
        title={t(L, 'home.heroTitle')}
        subtitle={t(L, 'home.heroSub')}
        fontFamily={fonts ? `${OG_FONT_FAMILY}, sans-serif` : 'sans-serif'}
      />
    ),
    { ...size, ...(fonts ? { fonts } : {}) }
  );
}
