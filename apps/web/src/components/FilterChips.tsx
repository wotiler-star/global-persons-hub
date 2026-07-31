'use client';

export interface ChipOption {
  value: string;
  label: string;
  /** 可选分面计数（展示在标签后） */
  count?: number;
}

/**
 * 通用筛选 chips（领域 / 时代 / 国籍 等多选一维度复用）。
 * - value 为当前选中值；点击已选中的非 all 项可再次点击取消（onChange('')）
 * - allValue 表示"全部"态，点击回到默认
 */
export default function FilterChips({
  label,
  options,
  value,
  onChange,
  allValue = 'all',
  allLabel,
  className = ''
}: {
  label?: string;
  options: ChipOption[];
  value: string;
  onChange: (v: string) => void;
  allValue?: string;
  allLabel?: string;
  className?: string;
}) {
  const chip = (active: boolean) =>
    `px-3 py-1 rounded-full border text-sm transition ${
      active ? 'bg-brand text-white border-brand' : 'bg-white text-slate-700 hover:bg-indigo-50'
    } ${className}`;

  return (
    <div className="mb-3">
      {label && <div className="text-sm text-slate-500 mb-2">{label}</div>}
      <div className="flex flex-wrap gap-2">
        {allLabel && (
          <button type="button" onClick={() => onChange(allValue)} className={chip(value === allValue)}>
            {allLabel}
          </button>
        )}
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(value === o.value ? '' : o.value)}
            className={chip(value === o.value)}
            aria-pressed={value === o.value}
          >
            {o.label}
            {typeof o.count === 'number' && <span className="ml-1 opacity-60">{o.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
