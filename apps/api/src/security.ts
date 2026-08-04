/**
 * 安全加固：启动期弱配置自检 + 进程内滑动窗口限流。
 *
 * 设计取舍：
 * - 零第三方依赖（与项目"JSON 存储 / 无原生模块"的零依赖基线一致）。
 * - 当前生产形态为 pm2 单进程单实例，进程内计数即可覆盖；若日后横向扩容，
 *   将 `createRateLimiter` 的存储替换为 Redis 即可，调用点无需改动。
 */
import type { FastifyRequest, FastifyReply } from 'fastify';

// ---------------------------------------------------------------- 弱配置自检

/** 已知弱值：代码内默认值 + .env.example 占位串（部署时忘了替换是最常见的事故） */
const WEAK_JWT_SECRETS = new Set([
  'dev-secret-change-me',
  'change-me-to-a-long-random-string',
  'changeme',
  'secret',
  'jwt-secret'
]);
const WEAK_ADMIN_PASSWORDS = new Set([
  'admin123456',
  'change-me-admin-password',
  'admin',
  'password',
  '123456'
]);

export interface WeakConfigIssue {
  key: string;
  detail: string;
}

/** 收集当前环境中的弱密钥/弱口令问题（不抛异常，供调用方决定告警还是阻断） */
export function auditSecrets(env: NodeJS.ProcessEnv = process.env): WeakConfigIssue[] {
  const issues: WeakConfigIssue[] = [];

  const jwt = env.JWT_SECRET;
  if (!jwt) {
    issues.push({ key: 'JWT_SECRET', detail: '未设置，回退到内置弱默认值（令牌可被伪造）' });
  } else if (WEAK_JWT_SECRETS.has(jwt)) {
    issues.push({ key: 'JWT_SECRET', detail: '仍是示例/占位值，未替换为随机串' });
  } else if (jwt.length < 32) {
    issues.push({ key: 'JWT_SECRET', detail: `长度仅 ${jwt.length}，建议 ≥ 32 位随机串` });
  }

  const pass = env.GPH_ADMIN_PASSWORD;
  if (!pass) {
    issues.push({ key: 'GPH_ADMIN_PASSWORD', detail: '未设置，回退到内置默认口令 admin123456' });
  } else if (WEAK_ADMIN_PASSWORDS.has(pass)) {
    issues.push({ key: 'GPH_ADMIN_PASSWORD', detail: '仍是示例/占位口令，未替换' });
  } else if (pass.length < 12) {
    issues.push({ key: 'GPH_ADMIN_PASSWORD', detail: `长度仅 ${pass.length}，建议 ≥ 12 位` });
  }

  return issues;
}

/**
 * 启动期强制校验：
 * - 生产（NODE_ENV=production 或 GPH_STRICT_SECRETS=1）：发现弱配置直接拒绝启动，
 *   避免"带着默认管理员口令上线"这类静默高危；可用 GPH_ALLOW_WEAK_SECRETS=1 显式豁免。
 * - 开发：打印醒目告警但放行。
 */
export function enforceSecrets(env: NodeJS.ProcessEnv = process.env): void {
  const issues = auditSecrets(env);
  if (issues.length === 0) return;

  const strict =
    env.GPH_ALLOW_WEAK_SECRETS !== '1' &&
    (env.NODE_ENV === 'production' || env.GPH_STRICT_SECRETS === '1');

  const lines = issues.map((i) => `   • ${i.key}：${i.detail}`).join('\n');
  const banner =
    '\n============================================================\n' +
    (strict ? '❌ 安全配置校验未通过，拒绝启动\n' : '⚠️  安全配置存在弱项（仅开发环境放行）\n') +
    lines +
    '\n============================================================';

  if (strict) {
    console.error(banner);
    console.error('请在 apps/api/.env 注入强随机值后重启，例如：');
    console.error("   node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
    console.error('确需临时放行可设置 GPH_ALLOW_WEAK_SECRETS=1（不建议）。');
    process.exit(1);
  }
  console.warn(banner);
}

// -------------------------------------------------------------------- 限流器

export interface RateLimitRule {
  /** 窗口长度（毫秒） */
  windowMs: number;
  /** 窗口内允许的最大请求数 */
  max: number;
}

export interface RateLimiter {
  /** 返回 null 表示放行；返回数字表示需等待的秒数（Retry-After） */
  hit(key: string): number | null;
}

/** 进程内滑动窗口计数器；惰性清理过期桶，并对 key 总量设上限防内存膨胀 */
export function createRateLimiter(rule: RateLimitRule, maxKeys = 5000): RateLimiter {
  const buckets = new Map<string, number[]>();
  let lastSweep = Date.now();

  function sweep(now: number) {
    if (now - lastSweep < rule.windowMs) return;
    lastSweep = now;
    for (const [k, arr] of buckets) {
      const alive = arr.filter((t) => now - t < rule.windowMs);
      if (alive.length === 0) buckets.delete(k);
      else buckets.set(k, alive);
    }
  }

  return {
    hit(key: string): number | null {
      const now = Date.now();
      sweep(now);
      // 极端情况下（大量不同 IP）整表重置，牺牲精度换取内存安全
      if (buckets.size > maxKeys) buckets.clear();

      const arr = (buckets.get(key) || []).filter((t) => now - t < rule.windowMs);
      if (arr.length >= rule.max) {
        buckets.set(key, arr);
        const retryMs = rule.windowMs - (now - arr[0]);
        return Math.max(1, Math.ceil(retryMs / 1000));
      }
      arr.push(now);
      buckets.set(key, arr);
      return null;
    }
  };
}

/** 取客户端标识：优先反代透传的真实 IP（Web 经 next rewrites 代理时 remoteAddress 恒为 127.0.0.1） */
export function clientKey(request: FastifyRequest): string {
  const fwd = request.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  if (first) return String(first).split(',')[0].trim();
  return request.ip || 'unknown';
}

/**
 * 生成 Fastify preHandler：按 IP（可叠加业务维度）限流，超限返回 429 + Retry-After。
 * @param extraKey 额外维度，例如按登录用户 id 限制评论频率
 */
export function rateLimitPreHandler(
  limiter: RateLimiter,
  scope: string,
  extraKey?: (request: FastifyRequest) => string | undefined
) {
  return async function preHandler(request: FastifyRequest, reply: FastifyReply) {
    const extra = extraKey?.(request);
    const key = `${scope}:${extra || clientKey(request)}`;
    const retryAfter = limiter.hit(key);
    if (retryAfter !== null) {
      reply.header('Retry-After', String(retryAfter));
      return reply.code(429).send({
        error: 'rate_limited',
        message: `请求过于频繁，请 ${retryAfter} 秒后重试`,
        retryAfter
      });
    }
  };
}
