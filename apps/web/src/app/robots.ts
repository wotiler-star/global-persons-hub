import type { MetadataRoute } from 'next';

// Stage 35：屏蔽私密/无 SEO 价值路由（账户、后台、登录注册），其余全部放行。
// 路径不带语言前缀时用通配匹配 13 语（如 /zh/admin、/en/admin），同时覆盖顶级 /admin 等。
const PRIVATE = ['admin', 'me', 'account', 'login', 'register'];
const DISALLOW = PRIVATE.flatMap((p) => [`/${p}`, `/*/${p}`]);

// GEO：显式允许主流生成式 AI 爬虫抓取本站结构化人物数据（llms.txt / JSON-LD），
// 使其能在回答中准确引用。默认 * 规则已 allow，此处再次声明以明确 GEO 意图。
const AI_CRAWLERS = [
  'GPTBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Google-Extended',
  'Applebot-Extended',
  'Bytespider',
  'CCBot',
  'OmgiliBot',
  'PerplexityBot'
];

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      { userAgent: AI_CRAWLERS, allow: '/' }
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base
  };
}
