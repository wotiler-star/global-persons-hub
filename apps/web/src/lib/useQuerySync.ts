'use client';

import { useEffect, useRef } from 'react';

export type QueryValue = string | number | boolean | null | undefined;

/**
 * 将组件状态同步到 URL query（replaceState，无整页刷新，可分享、可被 SSR 读取）。
 *
 * 用法：
 *   useQuerySync(
 *     () => ({ domain, era, sort }),      // build：返回所有受控键，默认/关闭态给 '' 或 null
 *     ['domain', 'era', 'sort'],          // controlledKeys：仅这些键会被清理/写入，避免误删其它参数
 *     [domain, era, sort]                 // deps：任一变化即同步
 *   );
 *
 * 约定：build() 应返回全部受控键；值为 '' / null / undefined 表示"默认"，将从 URL 中删除；
 * 非默认值以字符串写入。首次挂载也会按 build() 规整 URL（清除脏键）。
 */
export function useQuerySync(
  build: () => Record<string, QueryValue>,
  controlledKeys: string[],
  deps: ReadonlyArray<unknown>
): void {
  const first = useRef(true);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const next = build();
    const controlled = new Set(controlledKeys);

    let changed = false;
    // 1) 删除受控键中"当前 URL 有、但 build 未给出值/给了空值"的脏键
    for (const k of controlledKeys) {
      if (params.has(k) && (next[k] === null || next[k] === undefined || next[k] === '')) {
        params.delete(k);
        changed = true;
      }
    }
    // 2) 写入非空的受控键值
    for (const k of Object.keys(next)) {
      if (!controlled.has(k)) continue; // 只动受控键
      const v = next[k];
      if (v === null || v === undefined || v === '') continue;
      const sv = String(v);
      if (params.get(k) !== sv) {
        params.set(k, sv);
        changed = true;
      }
    }

    if (changed || first.current) {
      first.current = false;
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
