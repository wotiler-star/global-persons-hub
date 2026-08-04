import type { ReactNode } from 'react';

/**
 * 边界态统一卡片：错误 / 404 / 加载失败共用同一视觉语言。
 * 无 'use client' 指令 → 既能被服务端的 not-found.tsx 复用，
 * 也能被客户端的 error.tsx 引入（随父组件进入客户端包）。
 */
export default function BoundaryCard({
  icon,
  title,
  desc,
  actions,
  detail
}: {
  icon: string;
  title: string;
  desc: string;
  actions?: ReactNode;
  /** 可选技术细节（仅开发期或摘要化后展示，避免泄露内部信息） */
  detail?: string;
}) {
  return (
    <div className="min-h-[50vh] flex items-center justify-center py-16">
      <div className="max-w-md w-full text-center rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-sm">
        <div className="text-5xl mb-4" aria-hidden="true">
          {icon}
        </div>
        <h1 className="text-xl font-semibold text-slate-900 mb-2">{title}</h1>
        <p className="text-sm text-slate-600 leading-relaxed mb-6">{desc}</p>
        {detail ? (
          <pre className="mb-6 max-h-32 overflow-auto rounded-lg bg-slate-50 p-3 text-left text-[11px] leading-relaxed text-slate-500 whitespace-pre-wrap break-all">
            {detail}
          </pre>
        ) : null}
        {actions ? <div className="flex flex-wrap items-center justify-center gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}

/** 主按钮样式（与站内 CTA 保持一致） */
export const btnPrimary =
  'inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700';
/** 次按钮样式 */
export const btnGhost =
  'inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50';
