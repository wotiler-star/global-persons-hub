import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { registerRoutes } from './routes.js';
import { createStore } from './store/index.js';
import { createUploader } from './uploader/index.js';
import { enforceSecrets } from './security.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = join(__dirname, '..', 'data', 'persons.json');
const UPLOAD_DIR = join(__dirname, '..', 'data', 'uploads');

// 弱密钥/弱口令自检：生产环境（NODE_ENV=production 或 GPH_STRICT_SECRETS=1）直接拒绝启动，
// 开发环境仅打印告警。必须在建实例、连存储之前执行，避免半启动状态。
enforceSecrets();

const app = Fastify({ logger: true });

// 全局错误兜底：单条请求异常返回结构化 500，避免异常冒泡导致进程退出（高可用）
app.setErrorHandler((err, request, reply) => {
  app.log.error({ err, reqId: request.id }, '未捕获请求异常');
  const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
  reply.code(status).send({ error: 'internal_error', message: err.message || 'Internal Server Error' });
});

// CORS 策略：
// - 显式白名单 CORS_ORIGINS（逗号分隔）优先；'*' 表示全放行。
// - 未配置时：生产收紧为同源（Web 经 next rewrites /api 代理，本就无需跨域），
//   开发放行（dev 下前端 :3000 直连 API :8787 属跨域）。
const corsEnv = (process.env.CORS_ORIGINS || '').trim();
const corsOrigin: any =
  corsEnv === '*'
    ? true
    : corsEnv
      ? corsEnv.split(',').map((s) => s.trim()).filter(Boolean)
      : process.env.NODE_ENV !== 'production';
await app.register(cors, { origin: corsOrigin });

// JWT 密钥：强度已在 enforceSecrets() 中校验，此处仅保留开发回退值
await app.register(jwt, { secret: process.env.JWT_SECRET || 'dev-secret-change-me' });

// 存储抽象：默认 JSON（零依赖），生产用 STORE_DRIVER=pg-neo4j 切换
const store = await createStore();
await store.init();
await store.seedIfEmpty(SEED);
// 对象存储抽象：默认 disk（零依赖），生产用 UPLOADER_DRIVER=s3 切换
const uploader = await createUploader();
// 确保管理员账号存在（审核后台入口；生产务必用环境变量覆盖默认密码）
await store.ensureAdmin(
  process.env.GPH_ADMIN_EMAIL || 'admin@gph.local',
  process.env.GPH_ADMIN_PASSWORD || 'admin123456',
  process.env.GPH_ADMIN_NAME || 'Admin'
);

// 静态托管用户上传图片（MVP 本地磁盘；生产可切对象存储）
const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp'
};
app.get('/uploads/:file', async (request, reply) => {
  const { file } = request.params as any;
  if (!/^[\w.-]+\.[a-z0-9]+$/i.test(file)) return reply.code(400).send({ error: 'bad_name' });
  const fp = join(UPLOAD_DIR, file);
  if (!existsSync(fp)) return reply.code(404).send({ error: 'not_found' });
  const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
  reply.header('Content-Type', MIME[ext] || 'application/octet-stream');
  reply.send(readFileSync(fp));
});

await registerRoutes(app, store, uploader);

const PORT = Number(process.env.PORT || 8787);
// API 仅本机取数（Web 经 rewrites 代理），不对外暴露；默认监听 127.0.0.1，可用 API_BIND 覆盖
const HOST = process.env.API_BIND || '127.0.0.1';

// 优雅退出：pm2 stop 发送 SIGTERM，先关闭 Fastify 再退出，避免中断在途请求
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.warn(`收到 ${signal}，开始优雅退出...`);
  try {
    await app.close();
    app.log.warn('API 已优雅关闭');
  } catch (e) {
    app.log.error({ err: e }, '优雅退出时发生错误');
  } finally {
    process.exit(0);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// 未捕获异常兜底：记录后退出，交由 pm2 自动重启（避免静默挂死而非自愈）
process.on('uncaughtException', (err) => {
  app.log.error({ err }, '未捕获异常 (uncaughtException)');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  app.log.error({ reason }, '未处理的 Promise 拒绝 (unhandledRejection)');
  process.exit(1);
});

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`🚀 API 服务已启动: http://${HOST}:${PORT}  (OpenAPI: /openapi.json, Health: /health)`);
} catch (e) {
  app.log.error(e);
  process.exit(1);
}
