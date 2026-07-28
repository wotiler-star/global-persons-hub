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
  async rewrites() {
    return [{ source: '/api/:path*', destination: 'http://127.0.0.1:8787/:path*' }];
  }
};

export default nextConfig;
