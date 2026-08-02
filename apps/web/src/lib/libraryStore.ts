'use client';

import { useSyncExternalStore } from 'react';

// —— 纯前端收藏夹 + 浏览历史（localStorage，无需登录）——
// 跨组件状态通过 window 自定义事件 + storage 事件同步，避免引入全局 Provider。

/** 收藏 slug 列表（响应 localStorage 变更，跨标签页同步） */
export function useFavorites(): string[] {
  return useSyncExternalStore(subscribe, getFavorites, () => []);
}

/**
 * 单个 slug 的收藏态。
 * 相比 useFavorites()：快照是布尔原始值而非数组引用，因此某一项收藏状态变化时，
 * 只有对应的那个按钮重渲染，列表页（数百张卡）不会整体重渲染。
 */
export function useIsFavorite(slug: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isFavorite(slug),
    () => false
  );
}

/** 浏览历史 slug 列表（响应 localStorage 变更，跨标签页同步） */
export function useHistory(): string[] {
  return useSyncExternalStore(subscribe, getHistory, () => []);
}

export interface HistoryEntry {
  slug: string;
  at: string; // ISO 时间戳
}

/** 浏览历史（含浏览时间，用于收藏库按时间展示） */
export function useHistoryEntries(): HistoryEntry[] {
  return useSyncExternalStore(subscribe, getHistoryEntries, () => []);
}


const FAV_KEY = 'gph:favorites';
const HIST_KEY = 'gph:history';
const HIST_TS_KEY = 'gph:history:ts';
const EVT = 'gph:library-change';
const HIST_MAX = 50;

// —— 缓存快照（useSyncExternalStore 要求 getSnapshot 引用稳定）——
let _fav: string[] = [];
let _favRaw = '';
let _hist: string[] = [];
let _histRaw = '';

function readFav(): string[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(FAV_KEY) || '[]';
  if (raw !== _favRaw) {
    try {
      _fav = JSON.parse(raw);
    } catch {
      _fav = [];
    }
    _favRaw = raw;
  }
  return _fav;
}

function readHist(): string[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(HIST_KEY) || '[]';
  if (raw !== _histRaw) {
    try {
      _hist = JSON.parse(raw);
    } catch {
      _hist = [];
    }
    _histRaw = raw;
  }
  return _hist;
}

function emit() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVT));
  }
}

// —— 收藏 ——
export function getFavorites(): string[] {
  return typeof window === 'undefined' ? [] : readFav();
}

export function isFavorite(slug: string): boolean {
  return getFavorites().includes(slug);
}

/** 切换收藏状态，返回切换后的最新状态 */
export function toggleFavorite(slug: string): boolean {
  const cur = getFavorites();
  let next: string[];
  let nowFav: boolean;
  if (cur.includes(slug)) {
    next = cur.filter((s) => s !== slug);
    nowFav = false;
  } else {
    next = [slug, ...cur];
    nowFav = true;
  }
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(FAV_KEY, JSON.stringify(next));
    _fav = next;
    _favRaw = JSON.stringify(next);
  }
  emit();
  return nowFav;
}

// —— 浏览历史 ——
export function getHistory(): string[] {
  return typeof window === 'undefined' ? [] : readHist();
}

/** 浏览历史（含浏览时间，按浏览顺序返回） */
export function getHistoryEntries(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  const slugs = readHist();
  let tsMap: Record<string, string> = {};
  try {
    tsMap = JSON.parse(window.localStorage.getItem(HIST_TS_KEY) || '{}');
  } catch {
    tsMap = {};
  }
  return slugs.map((slug) => ({ slug, at: tsMap[slug] || '' }));
}

/** 记录一次浏览（去重 + 置顶 + 截断 + 记录时间） */
export function addHistory(slug: string): void {
  if (typeof window === 'undefined' || !slug) return;
  const cur = getHistory().filter((s) => s !== slug);
  cur.unshift(slug);
  const next = cur.slice(0, HIST_MAX);
  window.localStorage.setItem(HIST_KEY, JSON.stringify(next));
  _hist = next;
  _histRaw = JSON.stringify(next);
  // 时间戳映射
  let tsMap: Record<string, string> = {};
  try {
    tsMap = JSON.parse(window.localStorage.getItem(HIST_TS_KEY) || '{}');
  } catch {
    tsMap = {};
  }
  tsMap[slug] = new Date().toISOString();
  window.localStorage.setItem(HIST_TS_KEY, JSON.stringify(tsMap));
  emit();
}

export function clearHistory(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HIST_KEY, '[]');
  _hist = [];
  _histRaw = '[]';
  emit();
}

// —— 订阅（同一标签页 + 跨标签页）——
export function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === FAV_KEY || e.key === HIST_KEY) cb();
  };
  window.addEventListener(EVT, cb);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener('storage', onStorage);
  };
}
