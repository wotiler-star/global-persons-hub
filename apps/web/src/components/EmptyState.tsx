'use client';

import { type ReactNode } from 'react';

/**
 * 统一空态 / 骨架屏。
 * - skeleton=true：渲染占位骨架（加载中）
 * - 否则渲染标题 + 提示 + 可选操作区（如"去人物库"按钮）
 */
export default function EmptyState({
  title,
  hint,
  skeleton = false,
  skeletonRows = 6,
  children
}: {
  title?: string;
  hint?: string;
  skeleton?: boolean;
  skeletonRows?: number;
  children?: ReactNode;
}) {
  if (skeleton) {
    return (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }
  return (
    <div className="text-center py-10 text-slate-400">
      {title && <p className="font-medium text-slate-500">{title}</p>}
      {hint && <p className="text-sm mt-1">{hint}</p>}
      {children && <div className="mt-4 flex justify-center">{children}</div>}
    </div>
  );
}
