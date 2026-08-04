'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BoundaryCard, { btnPrimary, btnGhost } from '@/components/BoundaryCard';
import { langFromPath } from '@/lib/i18n';
import { t } from '@/lib/ui';

/**
 * 根级错误边界：拦截 layout 之下任意服务端/客户端渲染异常。
 * 之前缺失该文件时，SSR 取数失败（API 宕机、超时）会直接吐 Next 默认 500 白页。
 */
export default function RootError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const lang = langFromPath(usePathname());

  useEffect(() => {
    // 交给浏览器控制台/前端监控；digest 可与服务端日志对齐定位
    console.error('[boundary] render error', error.digest, error.message);
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
