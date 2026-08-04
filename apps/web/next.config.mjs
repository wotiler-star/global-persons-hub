/** @type {import('next').NextConfig} */
const nextConfig = {
  // 共享类型包以源码形式引入，需转译；同时与后端分离部署
  transpilePackages: ['@gph/types'],
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },

  // —— 独立部署（Lighthouse Windows + pm2，2GB 内存禁止服务端构建）——
  // 本机 `next build` 产出 .next/standalone（自带运行时，无需服务器装 Node 构建）。
  output: 'standalone',

  // 浏览器端 NEXT_PUBLIC_API_BASE=/api（同源相对路径）→ 经此后端代理访问 Fastify，
  // 因此只需对外开放一个 Web 端口，API(:8787) 不对外暴露、同源免 CORS。
  // 关闭 X-Powered-By: Next.js（减少指纹暴露面）
  poweredByHeader: false,

  async rewrites() {
    return [{ source: '/api/:path*', destination: 'http://127.0.0.1:8787/:path*' }];
  },

  /**
   * 安全响应头（审计 P2-3）。
   * CSP 说明：Next 的流式注入与内联 JSON-LD 需要 'unsafe-inline'；开发态 React Refresh 还需 'unsafe-eval'。
   * 因此采用"够用且不误伤"的策略——收紧外链来源与框架嵌套，
   * 而非严格 nonce CSP（会与当前 SSG/ISR + 结构化数据内联脚本冲突）。
   */
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      // 人物头像来自外部图床（images.remotePatterns 已放开 https://**）
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // 同源 /api 代理；开发态额外放行 HMR websocket 与直连 API 端口
      `connect-src 'self'${isDev ? ' ws: http://127.0.0.1:8787' : ''}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'"
    ].join('; ');

    const common = [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' }
    ];
    // HSTS 仅对 HTTPS 有意义；当前 http://IP:3000 部署下发会误伤，故按站点地址判断
    if ((process.env.NEXT_PUBLIC_SITE_URL || '').startsWith('https://')) {
      common.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
    }

    return [{ source: '/:path*', headers: common }];
  }
};

export default nextConfig;
