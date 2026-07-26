import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og';
import { SiteDefaultCard } from '@/lib/og-cards';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Global Persons Hub — cross-domain, multilingual persons knowledge graph';

// —— 站点根默认社交分享卡（所有未自定义 OG 图的页面兜底）——
export default function Image() {
  return new ImageResponse(<SiteDefaultCard />, { ...size });
}
