'use client';

import { type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import ShareLinkButton from '@/components/ShareLinkButton';

export interface ActiveFilter {
  /** 稳定键，如 'domain' / 'era' / 'nationality' */
  key: string;
  /** 展示文案 */
  label: string;
  /** 点击「×」单独移除该筛选 */
  onRemove: () => void;
}

/**
 * 统一的「已选筛选」展示 + 清空全部 + 复制深链接。
 * 各子板块（人物库 / 搜索 / 探索 / 画廊 / 时间轴 / 收藏夹）共用，避免散落实现。
 * 无选中筛选时整体不渲染（自我隐藏），调用方无需判断。
 * 由于筛选状态已由 useQuerySync 写入 URL，此处内置「复制链接」即可分享当前视图。
 */
export default function ActiveFilters({
  lang,
  filters,
  onClear,
  share = true
}: {
  lang: Lang;
  filters: ActiveFilter[];
  onClear: () => void;
  /** 是否显示「复制链接」（默认显示；URL 不含筛选状态的场景可关闭） */
  share?: boolean;
}) {
  if (filters.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 text-sm" role="group" aria-label={t(lang, 'search.activeFilters')}>
      <span className="text-slate-500">{t(lang, 'search.activeFilters')}：</span>
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={f.onRemove}
          aria-label={`${t(lang, 'search.removeFilter')}: ${f.label}`}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand/10 text-brand"
        >
          {f.label}
          <span className="opacity-60" aria-hidden="true">
            ×
          </span>
        </button>
      ))}
      <button type="button" onClick={onClear} className="text-xs text-slate-500 hover:underline">
        {t(lang, 'search.clearFilter')}
      </button>
      {share && (
        <ShareLinkButton
          lang={lang}
          className="text-xs text-slate-500 hover:underline hover:text-brand"
        />
      )}
    </div>
  );
}
