// 生产维护脚本：以 PostgreSQL 为事实源，重建 Neo4j 关系图谱。
// 用法：STORE_DRIVER=pg-neo4j NEO4J_URI=bolt://localhost:7687 NEO4J_PASS=xxx npm run reindex-graph
import { PgNeo4jStore } from './pg-neo4j-store.js';

async function main() {
  const store = new PgNeo4jStore();
  await store.init();
  if (typeof (store as any).syncGraph !== 'function') {
    console.error('当前存储适配器不支持 syncGraph（可能为 JSON 模式）');
    process.exit(2);
  }
  await (store as any).syncGraph();
  console.log('✅ Neo4j 图谱已以 PostgreSQL 为源重建');
  process.exit(0);
}

main().catch((e) => {
  console.error('reindex-graph failed:', e);
  process.exit(1);
});
