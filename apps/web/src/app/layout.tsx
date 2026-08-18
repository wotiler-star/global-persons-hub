import './globals.css';
import type { Metadata } from 'next';
import { SITE_URL, SITE_NAME } from '@/lib/og';

const SITE_DESC =
  '全球最大的跨领域、全语种、结构化人物知识图谱数据库平台。影视 / 商业 / 学术 / 体育 / 音乐 / 政治 / 艺术，统一画像，母语可读。';

// 根布局仅做透传：<html>/<body> 由 app/[lang]/layout.tsx 按当前语种渲染（含正确的 lang/dir），
// 以满足多语言 SEO。顶级重定向页（/login 等）与元数据路由（sitemap/robots/feed）不依赖此处 html。
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: '全球知名人物志 · Global Persons Hub',
    template: '%s · 全球知名人物志'
  },
  description: SITE_DESC,
  robots: { index: true, follow: true },
  // —— GEO/SEO：站点级 RSS 2.0 订阅源（供聚合器与 AI 爬虫发现近期更新）——
  alternates: {
    types: {
      'application/rss+xml': '/feed.xml'
    }
  },
  // —— 站点级默认社交分享卡（子页可覆盖）——
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: '全球知名人物志 · Global Persons Hub',
    description: SITE_DESC,
    url: '/'
    // og:image 由 app/opengraph-image.tsx 文件约定自动注入（绝对地址经 metadataBase 解析）
  },
  twitter: {
    card: 'summary_large_image',
    title: '全球知名人物志 · Global Persons Hub',
    description: SITE_DESC
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}

