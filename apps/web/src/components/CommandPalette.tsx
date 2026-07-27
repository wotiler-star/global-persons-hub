'use client';

// 全局搜索命令面板（Stage 30）：Ctrl/Cmd+K 唤起，模糊搜人物 + 页面直达。
// - 人物数据在首次打开时懒加载（一次 fetch，会话内缓存）
// - 空查询时展示「最近访问」（复用 libraryStore 浏览历史）+ 页面入口
// - 键盘导航：↑↓ 选择 / Enter 打开 / Esc 关闭；13 语文案；零新增依赖
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { Person } from '@gph/types';
import { LANGS, pickText, type Lang } from '@/lib/i18n';
import { t } from '@/lib/ui';
import { matchScore, highlightSegments } from '@/lib/searchIndex';
import { getHistory } from '@/lib/libraryStore';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8787';

type Item =
  | { kind: 'person'; person: Person; href: string }
  | { kind: 'page'; label: string; href: string }
  | { kind: 'searchAll'; label: string; href: string };

/** 页面直达清单（uiKey → 路径） */
const PAGES: { uiKey: string; path: string }[] = [
  { uiKey: 'nav.home', path: '' },
  { uiKey: 'nav.search', path: '/search' },
  { uiKey: 'nav.persons', path: '/persons' },
  { uiKey: 'nav.timeline', path: '/timeline' },
  { uiKey: 'nav.explore', path: '/explore' },
  { uiKey: 'nav.library', path: '/library' },
  { uiKey: 'nav.gallery', path: '/gallery' },
  { uiKey: 'nav.graph', path: '/graph' },
  { uiKey: 'nav.ask', path: '/ask' },
  { uiKey: 'nav.compare', path: '/compare' },
  { uiKey: 'nav.pricing', path: '/pricing' }
];

export default function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const seg = pathname.split('/')[1];
  const lang: Lang = (LANGS as string[]).includes(seg) ? (seg as Lang) : 'zh';

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [persons, setPersons] = useState<Person[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  // —— 全局快捷键：Ctrl/Cmd + K 切换，Esc 关闭 ——
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // —— 打开时：锁滚动 + 聚焦 + 懒加载人物 ——
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    setQ('');
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 30);
    if (!persons && !loadingRef.current) {
      loadingRef.current = true;
      fetch(`${API_BASE}/persons?pageSize=500`)
        .then((r) => r.json())
        .then((d) => setPersons(d.items || []))
        .catch(() => setPersons([]))
        .finally(() => {
          loadingRef.current = false;
        });
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open, persons]);

  // —— 结果计算 ——
  const { personItems, pageItems, isRecent } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = persons || [];
    let matchedPersons: Person[] = [];
    let isRecent = false;
    if (!needle) {
      // 空查询：最近访问（浏览历史 → 人物），无历史则不展示人物区
      const hist = typeof window !== 'undefined' ? getHistory() : [];
      const bySlug = new Map(all.map((p) => [p.slug, p]));
      matchedPersons = hist.map((s) => bySlug.get(s)).filter(Boolean).slice(0, 6) as Person[];
      isRecent = true;
    } else {
      matchedPersons = all
        .map((p) => ({ p, s: matchScore(p, needle) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 8)
        .map((x) => x.p);
    }
    const pages = PAGES.map((pg) => ({ label: t(lang, pg.uiKey), path: pg.path })).filter(
      (pg) => !needle || pg.label.toLowerCase().includes(needle)
    );
    const personItems: Item[] = matchedPersons.map((p) => ({
      kind: 'person',
      person: p,
      href: `/${lang}/person/${p.slug}`
    }));
    const pageItems: Item[] = pages.map((pg) => ({
      kind: 'page',
      label: pg.label,
      href: `/${lang}${pg.path}`
    }));
    return { personItems, pageItems, isRecent };
  }, [q, persons, lang]);

  const flat: Item[] = useMemo(() => {
    const arr: Item[] = [...personItems, ...pageItems];
    if (q.trim()) {
      arr.push({
        kind: 'searchAll',
        label: t(lang, 'cmdk.searchAll'),
        href: `/${lang}/search?q=${encodeURIComponent(q.trim())}`
      });
    }
    return arr;
  }, [personItems, pageItems, q, lang]);

  useEffect(() => setActive(0), [q]);

  const go = useCallback(
    (item: Item | undefined) => {
      if (!item) return;
      setOpen(false);
      router.push(item.href);
    },
    [router]
  );

  // —— 面板内键盘导航 ——
  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(flat[active]);
    }
  };

  // 保持激活项可见
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

  return (
    <>
      {/* 触发按钮（导航栏内） */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 px-3 h-8 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 text-xs hover:border-indigo-300 hover:text-indigo-500 transition-colors"
        aria-label={t(lang, 'cmdk.placeholder')}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4-4" />
        </svg>
        <span className="max-w-[9rem] truncate">{t(lang, 'cmdk.placeholder')}</span>
        <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-white text-[10px] font-mono text-slate-400">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>
      {/* 移动端只放一个搜索图标 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="sm:hidden w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-indigo-600"
        aria-label={t(lang, 'cmdk.placeholder')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4-4" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          {/* 遮罩 */}
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onMouseDown={() => setOpen(false)} />
          {/* 面板 */}
          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl ring-1 ring-slate-900/10 overflow-hidden">
            {/* 输入框 */}
            <div className="flex items-center gap-3 px-4 border-b border-slate-100">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="text-slate-400 shrink-0">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4-4" />
              </svg>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onInputKey}
                placeholder={t(lang, 'cmdk.placeholder')}
                className="flex-1 h-12 outline-none text-sm bg-transparent placeholder:text-slate-400"
              />
              <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-[10px] font-mono text-slate-400">esc</kbd>
            </div>

            {/* 结果列表 */}
            <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
              {personItems.length > 0 && (
                <div className="px-2">
                  <div className="px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {isRecent ? t(lang, 'cmdk.recent') : t(lang, 'cmdk.persons')}
                  </div>
                  {personItems.map((it, i) => {
                    if (it.kind !== 'person') return null;
                    const name = pickText(it.person.names, lang);
                    const occ = pickText(it.person.occupations, lang);
                    return (
                      <button
                        key={it.person.slug}
                        type="button"
                        data-idx={i}
                        onClick={() => go(it)}
                        onMouseEnter={() => setActive(i)}
                        className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-start ${
                          active === i ? 'bg-indigo-50' : ''
                        }`}
                      >
                        <span className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-[11px] font-bold flex items-center justify-center">
                          {(name || '?').slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm text-slate-800 truncate">
                            {highlightSegments(name, q).map((s, j) =>
                              s.hit ? (
                                <mark key={j} className="bg-amber-100 text-amber-900 rounded-sm">{s.s}</mark>
                              ) : (
                                <span key={j}>{s.s}</span>
                              )
                            )}
                          </span>
                          {occ && <span className="block text-xs text-slate-400 truncate">{occ}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {pageItems.length > 0 && (
                <div className="px-2 mt-1">
                  <div className="px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {t(lang, 'cmdk.pages')}
                  </div>
                  {pageItems.map((it, k) => {
                    if (it.kind !== 'page') return null;
                    const i = personItems.length + k;
                    return (
                      <button
                        key={it.href}
                        type="button"
                        data-idx={i}
                        onClick={() => go(it)}
                        onMouseEnter={() => setActive(i)}
                        className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-start ${
                          active === i ? 'bg-indigo-50' : ''
                        }`}
                      >
                        <span className="w-7 h-7 shrink-0 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <path d="M14 2v6h6" />
                          </svg>
                        </span>
                        <span className="text-sm text-slate-700">
                          {highlightSegments(it.label, q).map((s, j) =>
                            s.hit ? (
                              <mark key={j} className="bg-amber-100 text-amber-900 rounded-sm">{s.s}</mark>
                            ) : (
                              <span key={j}>{s.s}</span>
                            )
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {q.trim() && (
                <div className="px-2 mt-1 border-t border-slate-100 pt-2">
                  {(() => {
                    const i = flat.length - 1;
                    return (
                      <button
                        type="button"
                        data-idx={i}
                        onClick={() => go(flat[i])}
                        onMouseEnter={() => setActive(i)}
                        className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-start text-sm text-indigo-600 ${
                          active === i ? 'bg-indigo-50' : ''
                        }`}
                      >
                        <span className="w-7 h-7 shrink-0 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m21 21-4-4" />
                          </svg>
                        </span>
                        {t(lang, 'cmdk.searchAll')} · “{q.trim()}”
                      </button>
                    );
                  })()}
                </div>
              )}

              {flat.length === 0 && (
                <div className="py-10 text-center text-sm text-slate-400">{t(lang, 'cmdk.noResults')}</div>
              )}
            </div>

            {/* 底部快捷键提示 */}
            <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded border border-slate-200 bg-white font-mono">↑↓</kbd>
                {t(lang, 'cmdk.hintNav')}
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded border border-slate-200 bg-white font-mono">↵</kbd>
                {t(lang, 'cmdk.hintOpen')}
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded border border-slate-200 bg-white font-mono">esc</kbd>
                {t(lang, 'cmdk.hintClose')}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
