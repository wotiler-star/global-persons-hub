import { readFileSync } from 'node:fs';

/** 解析密钥：支持 file:// 路径、裸 .pem/.key 文件路径、或直接内联 PEM 文本。 */
export function resolveKey(value: string): string | null {
  if (!value) return null;
  if (value.startsWith('file://')) {
    try {
      return readFileSync(value.slice('file://'.length), 'utf8');
    } catch {
      return null;
    }
  }
  if ((value.endsWith('.pem') || value.endsWith('.key')) && !value.includes('\n')) {
    try {
      return readFileSync(value, 'utf8');
    } catch {
      return value;
    }
  }
  return value;
}

/** 订单号编码：把 userId 藏进商户订单号，便于 Webhook 回查用户。 */
export function encodeOrderId(userId: string, ts = Date.now()): string {
  return `gph_${userId}_${ts}`;
}

/** 订单号解码：从商户订单号取回 userId。 */
export function decodeOrderId(orderId: string): string | null {
  const m = /^gph_(.+)_(\d+)$/.exec(orderId);
  return m ? m[1] : null;
}
