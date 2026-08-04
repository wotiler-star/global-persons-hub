'use client';

import { useCallback, useEffect, useState } from 'react';
import { getToken, logoutUser } from './api';

/**
 * 客户端登录态 Hook：基于 localStorage 的 gph_token，
 * 并监听跨标签页的 storage 事件，使一处登出/登录其他标签页同步刷新。
 */
export function useAuth() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setToken(getToken());
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'gph_token') sync();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const logout = useCallback(async () => {
    await logoutUser();
    setToken(null);
  }, []);

  return { token, isAuthed: !!token, logout };
}
