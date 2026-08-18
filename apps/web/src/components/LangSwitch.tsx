'use client';

import { usePathname } from 'next/navigation';
import { LANGS, LANG_LABELS, HTML_LANG, type Lang } from '@/lib/i18n';

// —— SEO 内链：渲染全部 13 个语言版本的 <a href> 锚点（可被爬虫抓取）——
// 旧版用 <select> + router.push，不产出 <a href>，爬虫无法发现其他语言版。
// 现改为服务端渲染的真实链接：每个语言版都互相链接到同页面的其他语言 URL，
// 配合页面 <head> 的 hreflang 交替，形成完整的跨语言内部链接网。
export default function LangSwitch() {
  const pathname = usePathname() || '/';
  const segments = pathname.split('/');
  const current = segments[1] && (LANGS as string[]).includes(segments[1]) ? segments[1] : 'zh';
  // 当前路径去掉语言首段后的剩余部分（含前导斜杠）
  const rest = '/' + segments.slice(2).join('/');
  const hrefFor = (l: string) => (rest === '/' ? `/${l}` : `/${l}${rest}`);

  return (
    <nav
      aria-label="语言版本"
      className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs"
    >
      {LANGS.map((l) => {
        const isCur = l === current;
        return (
          <a
            key={l}
            href={hrefFor(l)}
            hrefLang={HTML_LANG[l] || l}
            lang={HTML_LANG[l] || l}
            aria-current={isCur ? 'true' : undefined}
            title={LANG_LABELS[l]}
            className={
              isCur
                ? 'px-1.5 py-0.5 rounded bg-indigo-600 text-white font-semibold'
                : 'px-1.5 py-0.5 rounded text-slate-600 hover:text-indigo-700 hover:bg-indigo-50'
            }
          >
            {l.toUpperCase()}
          </a>
        );
      })}
    </nav>
  );
}
