'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '@/lib/ui';
import { copyText } from '@/lib/clipboard';
import type { Lang } from '@/lib/i18n';

/**
 * 一键复制当前深链接（含全部筛选/排序 query）。
 * 配合 useQuerySync：各 Explorer 已把状态写进 URL，因此复制 location.href 即可分享当前视图。
 *
 * - 复制走 lib/clipboard 的 copyText（含非安全上下文降级），失败时不误报成功。
 * - 复制成功后 1.8s 内显示「已复制」，并通过 aria-live 播报给读屏用户。
 */
export default function ShareLinkButton({
  lang,
  className
}: {
  lang: Lang;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const copy = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const ok = await copyText(window.location.href);
    if (!ok) return; // 复制失败时不误报「已复制」
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }, []);

  return (
    <button
      type="button"
      onClick={copy}
      title={t(lang, 'share.copyHint')}
      aria-label={t(lang, 'share.copyLink')}
      className={
        className
          ? // 传入自定义样式（如文字链）时，仍叠加复制成功的颜色反馈
            className + (copied ? ' !text-emerald-600' : '')
          : 'px-3 py-1.5 rounded-lg border text-sm transition-colors ' +
            (copied
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'text-slate-600 hover:bg-slate-50')
      }
    >
      <span aria-hidden="true" className="mr-1">
        {copied ? '✓' : '🔗'}
      </span>
      <span aria-live="polite">{copied ? t(lang, 'share.copied') : t(lang, 'share.copyLink')}</span>
    </button>
  );
}
