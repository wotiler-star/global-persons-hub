import { LANGS, LANG_LABELS, type Lang, type LocalizedText } from '@gph/types';

export { LANGS, LANG_LABELS };
export type { Lang };

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
