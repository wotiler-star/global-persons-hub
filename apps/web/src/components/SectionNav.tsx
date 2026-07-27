'use client';

import { useEffect, useState } from 'react';

export interface SectionNavItem {
  id: string;
  label: string;
}

/**
 * 粘性目录导航：横向 chips 粘在导航栏下方，
 * IntersectionObserver 追踪当前所在章节并高亮，点击平滑滚动到锚点。
 */
export default function SectionNav({ items }: { items: SectionNavItem[] }) {
  const [active, setActive] = useState<string>(items[0]?.id || '');

  useEffect(() => {
    const els = items
      .map((it) => document.getElementById(it.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (els.length === 0) return;

    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.intersectionRatio);
          else visible.delete(e.target.id);
        }
        // 取文档顺序里第一个可见章节为当前
        for (const it of items) {
          if (visible.has(it.id)) {
            setActive(it.id);
            return;
          }
        }
      },
      { rootMargin: '-96px 0px -55% 0px', threshold: [0, 0.05, 0.25] }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 88;
    window.scrollTo({ top, behavior: 'smooth' });
    setActive(id);
  };

  return (
    <nav className="sticky top-0 z-40 -mx-4 px-4 py-2 bg-white/85 backdrop-blur border-b overflow-x-auto">
      <div className="flex gap-1.5 min-w-max">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => jump(it.id)}
            className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
              active === it.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
