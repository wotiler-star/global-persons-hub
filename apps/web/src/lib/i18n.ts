import { LANGS, LANG_LABELS, type Lang, type LocalizedText } from '@gph/types';

export { LANGS, LANG_LABELS };
export type { Lang };

/**
 * 语种 → BCP-47 `<html lang>` 代码（SEO 必需，Google/Bing 据此判定页面语言）。
 * zh 用区域化 zh-CN；其余用 2 字母主码，葡萄牙用 pt-BR。
 */
export const HTML_LANG: Record<string, string> = {
  zh: 'zh-CN', en: 'en', es: 'es', fr: 'fr', ja: 'ja', ru: 'ru',
  ar: 'ar', pt: 'pt-BR', de: 'de', ko: 'ko', it: 'it', hi: 'hi', id: 'id'
};

/** 从右到左书写的语种（阿拉伯语），对应 <html dir="rtl"> */
export const RTL_LANGS = new Set<string>(['ar']);

/** 取 BCP-47 lang 与书写方向，未知语种回退英文/从左到右 */
export function htmlLang(lang: Lang | string): { lang: string; dir: 'ltr' | 'rtl' } {
  return {
    lang: HTML_LANG[lang] || (lang as string) || 'en',
    dir: RTL_LANGS.has(lang) ? 'rtl' : 'ltr'
  };
}

/** 类型守卫：字符串是否为受支持语种 */
export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

/**
 * 从路径首段推断语种（`/ja/person/xxx` → 'ja'）。
 * 供 error.tsx / not-found.tsx 这类拿不到 params 的边界组件使用，回退英文。
 */
export function langFromPath(pathname: string | null | undefined): Lang {
  const seg = (pathname || '').split('/').filter(Boolean)[0];
  return isLang(seg) ? seg : 'en';
}

/** 按当前语种取文案，缺失时回退英文/任意已有语种 */
export function pickText(t: LocalizedText | undefined, lang: Lang, fallback: Lang = 'en'): string {
  if (!t) return '';
  return t[lang] || t[fallback] || (Object.values(t).find(Boolean) as string) || '';
}
