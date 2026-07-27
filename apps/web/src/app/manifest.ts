import type { MetadataRoute } from 'next';

// Stage 34：PWA / 安装清单（提升 Lighthouse PWA 项与移动端加桌体验）
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '全球知名人物志 · Global Persons Hub',
    short_name: 'Persons Hub',
    description:
      '全球最大的跨领域、全语种、结构化人物知识图谱数据库平台。',
    start_url: '/zh',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#4f46e5',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png' }
    ]
  };
}
