// 重算全部向量嵌入（生产维护脚本）：npm run db:reembed
// 以 PG/JSON 为事实源，重新生成整人向量 + 多语分块向量，供语义检索 / RAG 使用。
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createStore } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const store = await createStore();
await store.init();
if (store.reembed) {
  await store.reembed();
  console.log('✅ 向量重算完成');
} else {
  console.log('ℹ️ 当前适配器不支持 reembed');
}
process.exit(0);
