'use client';

import { useEffect, useState } from 'react';

/**
 * 阅读进度条：固定在视口顶部的渐变细条，随页面滚动填充 0-100%。
 * 纯客户端、被动监听（passive scroll），零依赖。
 */
export default function ReadingProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      setPct(max > 0 ? Math.min(100, (doc.scrollTop / max) * 100) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 h-[3px] z-50 pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-[width] duration-150"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
