'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import BoundaryCard, { btnPrimary, btnGhost } from '@/components/BoundaryCard';
import { isLang, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';

/**
 * 语种段错误边界：把异常收敛在 /[lang]/* 子树内，
 * 保证 NavBar / Footer 与语种上下文仍然可用（比根边界体验更完整）。
 *
 * 语种：error 边界是客户端组件，拿不到 params、请求头（headers() 仅服务端可用），
 * 且布局 Context 不下传；故在客户端挂载后从真实 URL 首段读取。
 * SSR 阶段默认英文，挂载后立刻纠正为目标语种（错误页极少被收录，影响可忽略）。
 */
export default function LangError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    const seg = window.location.pathname.split('/').filter(Boolean)[0];
    if (isLang(seg)) setLang(seg);
  }, []);

  useEffect(() => {
    console.error('[boundary:lang] render error', error.digest, error.message);
  }, [error]);

  return (
    <BoundaryCard
      icon="⚠️"
      title={t(lang, 'err.title')}
      desc={t(lang, 'err.desc')}
      detail={error.digest ? `digest: ${error.digest}` : undefined}
      actions={
        <>
          <button type="button" onClick={reset} className={btnPrimary}>
            {t(lang, 'err.retry')}
          </button>
          <Link href={`/${lang}`} className={btnGhost}>
            {t(lang, 'err.backHome')}
          </Link>
        </>
      }
    />
  );
}
