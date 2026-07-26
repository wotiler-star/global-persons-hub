// 通用工具：slug 生成（与 URL 友好标识一致）
import { randomUUID } from 'node:crypto';

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, '-')
      .replace(/(^-|-$)/g, '') || randomUUID().slice(0, 8)
  );
}
