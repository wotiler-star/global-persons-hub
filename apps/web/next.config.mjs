/** @type {import('next').NextConfig} */
const nextConfig = {
  // 共享类型包以源码形式引入，需转译；同时与后端分离部署
  transpilePackages: ['@gph/types'],
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] }
};

export default nextConfig;
