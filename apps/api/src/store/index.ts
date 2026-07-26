// 存储工厂：按 STORE_DRIVER 选择适配器。
// 采用动态 import，使 JSON 默认模式不会加载 pg / neo4j 依赖（即便未安装也不报错）。
export type { DataStore } from './types.js';

export async function createStore(): Promise<import('./types.js').DataStore> {
  const driver = (process.env.STORE_DRIVER || 'json').toLowerCase();
  if (driver === 'pg' || driver === 'pg-neo4j' || driver === 'postgres') {
    console.log('[store] driver = PostgreSQL + Neo4j');
    const { PgNeo4jStore } = await import('./pg-neo4j-store.js');
    return new PgNeo4jStore();
  }
  console.log('[store] driver = JSON (default, zero-dependency dev mode)');
  const { JsonStore } = await import('./json-store.js');
  return new JsonStore();
}
