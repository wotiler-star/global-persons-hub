'use client';

import { useFavorites, toggleFavorite } from '@/lib/libraryStore';
import { t } from '@/lib/ui';
import type { Lang } from '@/lib/i18n';

/**
 * 收藏切换按钮。可置于人物卡（客户端）或详情页（服务端）。
 * 在 PersonCard 内嵌于 <Link> 时，点击阻止冒泡以避免触发跳转。
 */
export default function FavoriteButton({
  slug,
  lang,
  className
}: {
  slug: string;
  lang: Lang;
  className?: string;
}) {
  const favs = useFavorites();
  const active = favs.includes(slug);

  return (
    <button
      type="button"
      aria-pressed={active}
      title={active ? t(lang, 'library.removeFav') : t(lang, 'library.addFav')}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(slug);
      }}
      className={
        className ??
        'absolute top-2 right-2 z-10 grid place-items-center w-8 h-8 rounded-full bg-white/90 shadow-sm hover:bg-white text-lg leading-none ' +
          (active ? 'text-amber-500' : 'text-slate-400')
      }
    >
      {active ? '★' : '☆'}
    </button>
  );
}
