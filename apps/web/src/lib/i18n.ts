import { LANGS, LANG_LABELS, type Lang, type LocalizedText } from '@gph/types';

export { LANGS, LANG_LABELS };
export type { Lang };

/** 按当前语种取文案，缺失时回退英文/任意已有语种 */
export function pickText(t: LocalizedText | undefined, lang: Lang, fallback: Lang = 'en'): string {
  if (!t) return '';
  return t[lang] || t[fallback] || (Object.values(t).find(Boolean) as string) || '';
}
