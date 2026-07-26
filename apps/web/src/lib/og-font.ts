// —— OG 分享卡 CJK 子集字体加载（供各 opengraph-image.tsx 复用）——
// 字体文件由 scripts/gen-og-font.mjs 生成（Noto Sans CJK SC Bold 按需子集，OFL 许可）。
// Noto Sans CJK 自带拉丁/希腊/西里尔字形 => zh/ja/ko/ru 可原生渲染；ar/hi 不覆盖，保持 Latin 回退。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** OG 图内可用原生文字渲染的语言（其余语言回退英文/Latin） */
export const OG_NATIVE_LANGS = new Set(['zh', 'ja', 'ko', 'ru']);

export const OG_FONT_FAMILY = 'NotoCJK';

let cached: ArrayBuffer | null | undefined; // undefined=未尝试, null=加载失败

/** 读取子集字体（模块级缓存；dev cwd=apps/web，兼容 monorepo 根启动） */
function loadFontData(): ArrayBuffer | null {
  if (cached !== undefined) return cached;
  const candidates = [
    join(process.cwd(), 'src', 'assets', 'og', 'NotoCJK-og.otf'),
    join(process.cwd(), 'apps', 'web', 'src', 'assets', 'og', 'NotoCJK-og.otf')
  ];
  for (const p of candidates) {
    try {
      const buf = readFileSync(p);
      cached = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      return cached;
    } catch {
      /* try next */
    }
  }
  cached = null;
  return cached;
}

/** ImageResponse 的 fonts 选项；字体缺失时返回 undefined（卡片自动回退 Latin） */
export function ogFonts():
  | { name: string; data: ArrayBuffer; weight: 700; style: 'normal' }[]
  | undefined {
  const data = loadFontData();
  if (!data) return undefined;
  return [{ name: OG_FONT_FAMILY, data, weight: 700, style: 'normal' }];
}

/**
 * 选择 OG 图主显文本：语言在原生集合内且字体可用 → 原生文本，否则回退 Latin。
 * 返回 { primary, secondary }：secondary 为与 primary 不同时的英文对照（可为空）。
 */
export function ogNativeText(
  localized: Record<string, string> | undefined,
  lang: string,
  latinFallback: string
): { primary: string; secondary: string } {
  const native = localized?.[lang];
  if (native && OG_NATIVE_LANGS.has(lang) && loadFontData()) {
    const en = localized?.en || latinFallback;
    return { primary: native, secondary: en && en !== native ? en : '' };
  }
  return { primary: localized?.en || latinFallback, secondary: '' };
}
