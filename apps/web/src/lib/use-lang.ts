'use client';

import { usePathname } from 'next/navigation';
import { LANGS, type Lang } from '@/lib/i18n';

/** 从 pathname 第一段推断当前语种（非 [lang] 路由默认 zh） */
export function useLang(): Lang {
  const pathname = usePathname() || '/';
  const seg = pathname.split('/')[1];
  return (LANGS as string[]).includes(seg) ? (seg as Lang) : 'zh';
}
