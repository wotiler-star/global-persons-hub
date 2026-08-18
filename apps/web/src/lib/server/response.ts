// 只读部署的 HTTP 响应辅助：为「数据在进程生命周期内不可变」的读接口附加 public 缓存头，
// 让浏览器 / Hostinger 边缘 / CDN 缓存命中，显著降低共享云主机的重复计算与请求压力。
// 写接口与错误响应（4xx/5xx）不应缓存。
import { NextResponse } from 'next/server';

/**
 * 以 public 缓存头返回 JSON。
 * @param maxAge 客户端 + 共享缓存的缓存秒数（默认 300）；stale-while-revalidate 额外放宽到 2*maxAge。
 */
export function cachedJson(data: unknown, maxAge = 300): NextResponse {
  const swr = maxAge * 2;
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${swr}`
    }
  });
}
