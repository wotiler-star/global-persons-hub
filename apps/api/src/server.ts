import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { registerRoutes } from './routes.js';
import { createStore } from './store/index.js';
import { createUploader } from './uploader/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = join(__dirname, '..', 'data', 'persons.json');
const UPLOAD_DIR = join(__dirname, '..', 'data', 'uploads');

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
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

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🚀 API 服务已启动: http://localhost:${PORT}  (OpenAPI: /openapi.json)`);
} catch (e) {
  app.log.error(e);
  process.exit(1);
}
