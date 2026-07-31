'use client';

import { type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';

export interface SortOption {
  key: string;
  label: string;
}

/**
 * 通用排序切换 + 可选升降序。
 * - options：排序维度（影响力 / 财富 / 姓名…）
 * - dir / onDirChange：可选，传了则额外渲染一个 升↕/降↕ 按钮（如姓名排序需切换中英顺序）
 */
export default function SortToggle({
  label,
  options,
  value,
  onChange,
  dir,
  onDirChange,
  lang,
  className = ''
}: {
  label?: string;
  options: SortOption[];
  value: string;
  onChange: (v: string) => void;
  dir?: 'asc' | 'desc';
  onDirChange?: (d: 'asc' | 'desc') => void;
  lang?: Lang;
  className?: string;
}) {
  const toggle = (on: boolean) =>
    `px-3 py-1 rounded-md text-sm border transition ${
      on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 hover:bg-slate-100'
    }`;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && <span className="text-sm text-slate-500">{label}</span>}
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={toggle(value === o.key)}
            aria-pressed={value === o.key}
          >
            {o.label}
          </button>
        ))}
      </div>
      {dir && onDirChange && lang && (
        <button
          type="button"
          onClick={() => onDirChange(dir === 'asc' ? 'desc' : 'asc')}
          className={`px-2.5 py-1 rounded-md text-sm border transition ${
            dir === 'asc' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 hover:bg-slate-100'
          }`}
          title={dir === 'asc' ? t(lang, 'common.asc') : t(lang, 'common.desc')}
          aria-label={dir === 'asc' ? t(lang, 'common.asc') : t(lang, 'common.desc')}
        >
          {dir === 'asc' ? '↑' : '↓'}
        </button>
      )}
    </div>
  );
}
