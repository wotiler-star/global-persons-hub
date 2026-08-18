import { ImageResponse } from 'next/og';
import { getPerson } from '@/lib/server/data';
import { OG_SIZE, OG_CONTENT_TYPE, SITE_BRAND, DOMAIN_EN, DOMAIN_ACCENT } from '@/lib/og';
import { ogFonts, ogNativeText, OG_FONT_FAMILY } from '@/lib/og-font';
import type { Domain } from '@gph/types';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Person profile card — Global Persons Hub';

// —— 人物页动态社交分享卡（每人一张品牌化卡片）——
export default async function Image({ params }: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang, slug } = await params;
  let person: any = null;
  try {
    person = await getPerson(slug);
  } catch {
    /* ignore — 渲染兜底卡 */
  }

  // zh/ja/ko/ru：原生名字为主标题、英文名为副行；其余语言回退英文
  const { primary: name, secondary: nameEn } = ogNativeText(person?.names, lang, person?.slug || slug || 'Unknown');
  const { primary: occ } = ogNativeText(person?.occupations, lang, person?.occupations?.en || '');
  const domains: Domain[] = ((person?.domains as Domain[]) || []).slice(0, 3);
  const life = [person?.birth, person?.death].filter((x: string) => x && x !== '?').join(' – ');
  const accent = domains[0] ? DOMAIN_ACCENT[domains[0]] : '#6366f1';
  const enForInitial: string = person?.names?.en || person?.slug || slug || '?';
  const initial = (enForInitial.trim()[0] || '?').toUpperCase();
  const fonts = ogFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '72px 80px',
          background: `linear-gradient(135deg, #0f172a 0%, ${accent}22 60%, #0f172a 100%)`,
          color: '#f8fafc',
          fontFamily: fonts ? `${OG_FONT_FAMILY}, sans-serif` : 'sans-serif'
        }}
      >
        {/* 顶部品牌条 */}
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

        {/* 主体：monogram + 姓名/职业 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 44, marginTop: 'auto' }}>
          <div
            style={{
              width: 190,
              height: 190,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: accent,
              color: '#fff',
              fontSize: 96,
              fontWeight: 800,
              border: '6px solid rgba(255,255,255,0.15)',
              flexShrink: 0
            }}
          >
            {initial}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 1.05, maxWidth: 760 }}>
              {name}
            </div>
            {nameEn && (
              <div style={{ fontSize: 32, color: '#94a3b8', marginTop: 10, maxWidth: 760 }}>
                {nameEn}
              </div>
            )}
            {occ && (
              <div style={{ fontSize: 34, color: '#cbd5e1', marginTop: 14, maxWidth: 760 }}>
                {occ}
              </div>
            )}
          </div>
        </div>

        {/* 底部：领域徽标 + 生卒年 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 'auto'
          }}
        >
          <div style={{ display: 'flex', gap: 12 }}>
            {domains.map((d) => (
              <div
                key={d}
                style={{
                  display: 'flex',
                  fontSize: 24,
                  padding: '8px 20px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.10)',
                  border: `1px solid ${DOMAIN_ACCENT[d]}`,
                  color: '#e2e8f0'
                }}
              >
                {DOMAIN_EN[d]}
              </div>
            ))}
          </div>
          {life && <div style={{ display: 'flex', fontSize: 30, color: '#94a3b8' }}>{life}</div>}
        </div>
      </div>
    ),
    { ...size, ...(fonts ? { fonts } : {}) }
  );
}
