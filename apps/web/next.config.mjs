/** @type {import('next').NextConfig} */
const nextConfig = {
  // 共享类型包以源码形式引入，需转译；同时与后端分离部署
  transpilePackages: ['@gph/types'],
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },

  // —— 部署形态（由环境变量切换，避免与 `next start` 冲突）——
  // 默认（undefined）：普通输出，供 `next start` 启动 —— 这是 Hostinger「Node.js Web App」
  // 单进程（npm start -> next start）与本地预览的形态，读取 process.env.PORT 作为端口。
  // Lighthouse(pm2/standalone) 部署：构建时设 NEXT_OUTPUT=standalone 产出 .next/standalone，
  // 再用 `node .next/standalone/server.js` 启动（自带最小化运行时，无需服务器装 Node 构建）。
  // 注意：`next start` 不支持 standalone 输出（会直接退出），故两者二选一、靠 env 切换。
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,

  // 关闭 X-Powered-By: Next.js（减少指纹暴露面）
  poweredByHeader: false,

  // 注：自「折叠 API 进 Next」改造后，原 Fastify API（:8787）已并入 Next Route Handlers
  // （src/app/api/**），同源 /api 由 Next 自身处理，无需再代理到独立后端。
  // Hostinger 共享云主机的「Node.js Web App」以单进程运行 `next start`，
  // 读取 process.env.PORT 作为监听端口（Next 原生支持），只需开放一个端口。

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
