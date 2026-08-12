'use client';

import { useState, useId } from 'react';
import { pickText, type Lang } from '@/lib/i18n';
import type { LocalizedText } from '@gph/types';

/** 画像组件只需这几个字段：完整 Person 与轻量 PersonLite 都满足（结构化可赋值） */
interface PortraitPerson {
  slug: string;
  names: LocalizedText;
  imageUrl?: string;
  images?: string[];
}

// 12 组现代渐变（indigo / sky / rose / emerald / amber / pink ...），按 slug 哈希确定
const PALETTES: [string, string][] = [
  ['#6366f1', '#8b5cf6'],
  ['#0ea5e9', '#22d3ee'],
  ['#f43f5e', '#fb7185'],
  ['#10b981', '#34d399'],
  ['#f59e0b', '#fbbf24'],
  ['#ec4899', '#f472b6'],
  ['#8b5cf6', '#6366f1'],
  ['#14b8a6', '#2dd4bf'],
  ['#ef4444', '#f97316'],
  ['#3b82f6', '#6366f1'],
  ['#a855f7', '#d946ef'],
  ['#06b6d4', '#3b82f6']
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function monogram(name: string): string {
  const c = (name || '?').trim().charAt(0);
  return c ? c.toUpperCase() : '?';
}

/**
 * 人物画像组件：
 * - 优先渲染真实图片（imageUrl / images[0]），加载失败自动回退；
 * - 缺失时渲染「确定性渐变 + 字母」的设计化头像，保证画廊中每人均有视觉。
 * 通过 useId 生成唯一 SVG pattern id，避免同 slug 多处渲染时 id 冲突。
 */
export default function PersonPortrait({
  person,
  lang,
  className = ''
}: {
  person: PortraitPerson;
  lang: Lang;
  className?: string;
}) {
  const real = person.imageUrl || person.images?.[0];
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(real) && !failed;
  const pid = useId().replace(/:/g, '');

  const name = pickText(person.names, lang);
  const [c1, c2] = PALETTES[hash(person.slug || name) % PALETTES.length];

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={real as string}
          alt={name}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
          <svg className="absolute inset-0 w-full h-full opacity-25" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id={`pat-${pid}`} width="14" height="14" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.4" fill="white" />
              </pattern>
            </defs>
            <rect width="100" height="100" fill={`url(#pat-${pid})`} />
          </svg>
          <div className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full bg-white/10" />
          <div className="absolute -top-12 -left-12 w-32 h-32 rounded-full bg-white/10" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-white font-bold select-none"
              style={{ fontSize: 'clamp(2.2rem, 9vw, 4.5rem)', textShadow: '0 2px 10px rgba(0,0,0,.28)' }}
            >
              {monogram(name)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
