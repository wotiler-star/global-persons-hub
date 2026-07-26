// 密码哈希与用户脱敏（scrypt，零额外依赖，前后端分离下后端自持）
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import type { User, PublicUser } from '@gph/types';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const valid = Buffer.from(hash, 'hex');
  return candidate.length === valid.length && timingSafeEqual(candidate, valid);
}

export function toPublic(u: User): PublicUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role, plan: u.plan || 'free' };
}

/** SHA-256 十六进制（用于 API 密钥存储，明文不外落） */
export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * 生成开放 API 密钥：`gph_live_` + 24 字节 base64url（≈32 可打印字符）。
 * 返回 { key: 明文, hash: SHA-256, prefix: 前 8 位 }，明文仅创建时返回一次。
 */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const raw = randomBytes(24).toString('base64url');
  const key = `gph_live_${raw}`;
  return { key, hash: sha256Hex(key), prefix: key.slice(0, 12) };
}

/** 配额：free 每月 1000 次；pro 每月 50000 次（按密钥创建时的套餐固定） */
export const QUOTA_BY_PLAN: Record<string, number> = { free: 1000, pro: 50000 };
