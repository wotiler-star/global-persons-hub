import { ImageResponse } from 'next/og';

// Stage 34：动态站点图标（favicon / PWA icon 同源生成，无需静态资源）
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 60%, #db2777 100%)',
          color: '#fff',
          fontSize: 300,
          fontWeight: 800,
          borderRadius: 96
        }}
      >
        G
      </div>
    ),
    size
  );
}
