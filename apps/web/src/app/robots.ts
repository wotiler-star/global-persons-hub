import type { MetadataRoute } from 'next';

// Stage 34：屏蔽私密/无 SEO 价值路由（账户、后台、登录注册），其余全部放行。
// 路径不带语言前缀时用通配匹配 13 语（如 /zh/admin、/en/admin）。
const PRIVATE = ['admin', 'me', 'account', 'login', 'register'];

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: PRIVATE.map((p) => `/*/${p}`)
    },
    sitemap: `${base}/sitemap.xml`
  };
}
