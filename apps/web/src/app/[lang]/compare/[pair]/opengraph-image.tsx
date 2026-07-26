import { ImageResponse } from 'next/og';
import { getPerson } from '@/lib/api';
import { OG_SIZE, OG_CONTENT_TYPE, SITE_BRAND, DOMAIN_ACCENT } from '@/lib/og';
import { ogFonts, ogNativeText, OG_FONT_FAMILY } from '@/lib/og-font';
import type { Domain } from '@gph/types';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Comparison card — Global Persons Hub';

function splitPair(pair: string): [string, string] | null {
  const idx = pair.indexOf('-vs-');
  if (idx <= 0) return null;
  const a = pair.slice(0, idx);
  const b = pair.slice(idx + 4);
  if (!a || !b || a === b) return null;
  return [a, b];
}

// —— 对比页动态社交分享卡（A vs B 双人对决卡）——
export default async function Image({ params }: { params: Promise<{ lang: string; pair: string }> }) {
  const { lang, pair } = await params;
  const parts = splitPair(pair);
  const [pa, pb] = parts
    ? await Promise.all([
        getPerson(parts[0]).catch(() => null),
        getPerson(parts[1]).catch(() => null)
      ])
    : [null, null];
  const fonts = ogFonts();

  const side = (p: any, fallback: string, accentColor: string) => {
    const { primary: name } = ogNativeText(p?.names, lang, p?.names?.en || fallback);
    const domains: Domain[] = ((p?.domains as Domain[]) || []).slice(0, 1);
    const accent = domains[0] ? DOMAIN_ACCENT[domains[0]] : accentColor;
    const enName: string = p?.names?.en || fallback;
    const initial = (enName.trim()[0] || '?').toUpperCase();
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          padding: '0 40px'
        }}
      >
        <div
          style={{
            width: 180,
            height: 180,
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: accent,
            color: '#fff',
            fontSize: 92,
            fontWeight: 800,
            border: '6px solid rgba(255,255,255,0.15)'
          }}
        >
          {initial}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 48,
            fontWeight: 800,
            color: '#f8fafc',
            textAlign: 'center',
            lineHeight: 1.1,
            maxWidth: 440
          }}
        >
          {name}
        </div>
      </div>
    );
  };

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          fontFamily: fonts ? `${OG_FONT_FAMILY}, sans-serif` : 'sans-serif'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            paddingTop: 40,
            opacity: 0.85
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#6366f1',
              fontSize: 24,
              fontWeight: 700,
              color: '#fff'
            }}
          >
            G
          </div>
          <div style={{ fontSize: 24, letterSpacing: 4, fontWeight: 600, color: '#f8fafc' }}>
            {SITE_BRAND}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', position: 'relative' }}>
          {side(pa, parts?.[0] || 'A', '#2563eb')}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 120,
              height: 120,
              borderRadius: 999,
              background: '#111827',
              border: '4px solid #6366f1',
              color: '#e0e7ff',
              fontSize: 46,
              fontWeight: 800
            }}
          >
            VS
          </div>
          {side(pb, parts?.[1] || 'B', '#e11d48')}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingBottom: 44,
            fontSize: 28,
            color: '#94a3b8'
          }}
        >
          Head-to-head comparison · influence, achievements & relationships
        </div>
      </div>
    ),
    { ...size, ...(fonts ? { fonts } : {}) }
  );
}
