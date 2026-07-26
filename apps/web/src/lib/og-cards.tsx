import { SITE_BRAND } from './og';

// —— 站点默认社交分享卡（根 / [lang] 段共用，避免重复）——
// title/subtitle 可传本地化文案（zh/ja/ko/ru 原生文字，需配合 og-font 子集字体）；
// fontFamily 由调用方按字体可用性传入。
export function SiteDefaultCard({
  title = 'Global Persons Hub',
  subtitle = "Cross-domain · Multilingual · Structured knowledge graph of the world's notable people.",
  fontFamily = 'sans-serif'
}: {
  title?: string;
  subtitle?: string;
  fontFamily?: string;
} = {}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #312e81 100%)',
        color: '#f8fafc',
        fontFamily
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: 0.85 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#6366f1',
            fontSize: 26,
            fontWeight: 700
          }}
        >
          G
        </div>
        <div style={{ fontSize: 26, letterSpacing: 4, fontWeight: 600 }}>{SITE_BRAND}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40 }}>
        <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>{title}</div>
        <div style={{ fontSize: 34, color: '#c7d2fe', marginTop: 24, maxWidth: 900 }}>
          {subtitle}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 48 }}>
        {['13 Languages', '9 Domains', 'Relationship Graph', 'AI-citable'].map((tag) => (
          <div
            key={tag}
            style={{
              display: 'flex',
              fontSize: 24,
              padding: '10px 22px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: '#e0e7ff'
            }}
          >
            {tag}
          </div>
        ))}
      </div>
    </div>
  );
}
