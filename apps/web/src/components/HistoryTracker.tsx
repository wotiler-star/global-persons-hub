'use client';

import { useEffect } from 'react';
import { addHistory } from '@/lib/libraryStore';

/** 挂载即把当前人物记录进浏览历史（去重置顶、截断 50）。 */
export default function HistoryTracker({ slug }: { slug: string }) {
  useEffect(() => {
    if (slug) addHistory(slug);
  }, [slug]);
  return null;
}
