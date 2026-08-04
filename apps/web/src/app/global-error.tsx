'use client';

import { useEffect } from 'react';

/**
 * 全局错误边界：仅在根 layout 自身渲染失败时接管（此时 NavBar/Footer/样式均不可用），
 * 因此必须自带 <html>/<body>，且不能依赖任何应用级组件与 CSS 变量。
 */
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[boundary:global] root layout failed', error.digest, error.message);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          color: '#0f172a',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
        }}
      >
        <div style={{ maxWidth: 420, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>
            Something went wrong / 页面出错了
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: '#475569', margin: '0 0 20px' }}>
            The application failed to load. Please retry in a moment.
            <br />
            应用加载失败，请稍后重试。
          </p>
          {error.digest ? (
            <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 20px' }}>digest: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              border: 0,
              borderRadius: 8,
              background: '#0f172a',
              color: '#fff',
              padding: '10px 18px',
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            Try again / 重试
          </button>
        </div>
      </body>
    </html>
  );
}
