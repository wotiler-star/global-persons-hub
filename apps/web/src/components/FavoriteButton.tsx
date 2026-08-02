'use client';

import { memo } from 'react';
import { useIsFavorite, toggleFavorite } from '@/lib/libraryStore';
import { t } from '@/lib/ui';
import type { Lang } from '@/lib/i18n';

/**
 * 收藏切换按钮。可置于人物卡（客户端）或详情页（服务端）。
 * 在 PersonCard 内嵌于 <Link> 时，点击阻止冒泡以避免触发跳转。
 *
 * 性能：订阅 useIsFavorite(slug) 而非整个收藏数组，配合 memo，
 * 使列表页中点击某一项时只重渲染该按钮，而不是全部数百个按钮。
 */
function FavoriteButton({
  slug,
  lang,
  className
}: {
  slug: string;
  lang: Lang;
  className?: string;
}) {
  const active = useIsFavorite(slug);

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

export default memo(FavoriteButton);
