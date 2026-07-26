// 本地磁盘上传器（默认零依赖开发模式）。
// 将图片写入 apps/api/data/uploads/，返回站内路径 /uploads/:file，
// 由 server.ts 的静态路由 app.get('/uploads/:file') 托管。
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Uploader } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, '..', '..', 'data', 'uploads');

export class DiskUploader implements Uploader {
  driver = 'disk' as const;

  async put(filename: string, data: Buffer): Promise<{ url: string }> {
    mkdirSync(UPLOAD_DIR, { recursive: true });
    writeFileSync(join(UPLOAD_DIR, filename), data);
    return { url: `/uploads/${filename}` };
  }
}
