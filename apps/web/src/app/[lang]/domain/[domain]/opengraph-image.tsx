import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, SITE_BRAND, DOMAIN_EN, DOMAIN_ACCENT } from '@/lib/og';
import { ogFonts, OG_FONT_FAMILY } from '@/lib/og-font';
import { DOMAIN_LABELS } from '@gph/types';
import type { Domain } from '@gph/types';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Domain ranking card — Global Persons Hub';

// —— 领域榜单页动态社交分享卡 ——
export default async function Image({ params }: { params: Promise<{ lang: string; domain: string }> }) {
  const { lang, domain } = await params;
  const d = domain as Domain;
  const fonts = ogFonts();
  // 中文：领域标签 + 中文榜单标题；其余语言用 Latin 标签
  const isZh = lang === 'zh' && !!fonts;
  const label = isZh ? DOMAIN_LABELS[d] : DOMAIN_EN[d] || 'Notable';
  const accent = DOMAIN_ACCENT[d] || '#6366f1';
  const tagline = isZh
    ? `结构化多语档案 · 关系图谱 · 可被 AI 引用的 ${label}领域影响力榜单。`
    : `Structured, multilingual profiles · relationship graph · AI-citable rankings of the world's most influential ${(DOMAIN_EN[d] || 'Notable').toLowerCase()} figures.`;
  const title = isZh ? `${label}领域影响力榜单` : 'Influence Ranking';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: `linear-gradient(135deg, #0f172a 0%, ${accent}33 100%)`,
          color: '#f8fafc',
          fontFamily: fonts ? `${OG_FONT_FAMILY}, sans-serif` : 'sans-serif'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: 0.85 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: accent,
              fontSize: 24,
              fontWeight: 700
            }}
          >
            G
          </div>
          <div style={{ fontSize: 24, letterSpacing: 4, fontWeight: 600 }}>{SITE_BRAND}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 56 }}>
          <div style={{ display: 'flex', fontSize: 36, color: accent, fontWeight: 700 }}>
            {label.toUpperCase()}
          </div>
          <div style={{ fontSize: 92, fontWeight: 800, lineHeight: 1.05, marginTop: 8 }}>
            {title}
          </div>
          <div style={{ fontSize: 32, color: '#cbd5e1', marginTop: 24, maxWidth: 940 }}>
            {tagline}
          </div>
        </div>
      </div>
    ),
    { ...size, ...(fonts ? { fonts } : {}) }
  );
}
