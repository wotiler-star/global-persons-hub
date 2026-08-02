'use client';

/**
 * 复制文本到剪贴板，返回是否成功。
 *
 * navigator.clipboard 仅在安全上下文（https / localhost）可用；
 * 站点通过 http://IP:3000 直接访问时会抛错，因此降级到 textarea + execCommand。
 * 调用方应根据返回值决定是否展示「已复制」，避免复制失败却提示成功。
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof window === 'undefined' || !text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* 落到降级路径 */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
