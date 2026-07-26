// 嵌入服务：把文本转为向量，供 pgvector 语义检索 / RAG 使用。
// 提供三种实现，按环境变量自动选择，保证「离线可跑、生产可用」：
//   1) GPH_EMBED_API_URL 设置        → ApiEmbedder（OpenAI 兼容 /embeddings，生产级语义）
//   2) 否则默认（GPH_EMBED_LOCAL≠off）→ LocalEmbedder（本地 transformers.js all-MiniLM-L6-v2，384 维，多语，零外泄）
//   3) 否则                          → HashEmbedder（零依赖兜底：词袋哈希向量，保证管线永远可跑）
// 维度策略：本地模型固定 384；API / 兜底读取 GPH_EMBED_DIM（默认 384），schema 建表时同步替换。

export interface Embedder {
  /** 批量嵌入，返回与输入等长的向量数组；向量已 L2 归一化（便于余弦相似度 = 点积） */
  embed(texts: string[]): Promise<number[][]>;
  readonly dim: number;
}

/** 嵌入维度：API / 兜底模式下以 GPH_EMBED_DIM 为准，schema 列维度需与之匹配 */
export function getEmbedderDim(): number {
  return Number(process.env.GPH_EMBED_DIM) || 384;
}

// ---------------- 兜底：零依赖词袋哈希向量 ----------------
// 非真正语义，但确定、可复现、零网络，保证整条向量检索管线在任意环境跑通。
export class HashEmbedder implements Embedder {
  readonly dim: number;
  constructor(dim = 384) {
    this.dim = dim;
  }
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => hashEmbed(t, this.dim));
  }
}

function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function hashEmbed(text: string, dim: number): number[] {
  const v = new Array(dim).fill(0);
  const lower = text.toLowerCase();
  const latin = lower.match(/[a-z0-9]+/g) || [];
  const cjk = lower.match(/[一-鿿]/g) || [];
  const tokens = [...latin, ...cjk];
  for (const tok of tokens) {
    const bucket = fnv1a(tok) % dim;
    v[bucket] += 1;
  }
  // L2 归一化
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

// ---------------- 本地：transformers.js（all-MiniLM-L6-v2，384 维，多语） ----------------
// 首次调用惰性下载权重（约 23MB）。若加载失败自动自愈为 HashEmbedder，不中断服务。
export class LocalEmbedder implements Embedder {
  readonly dim = 384;
  private pipe: any = null;
  private loading: Promise<any> | null = null;

  async embed(texts: string[]): Promise<number[][]> {
    try {
      if (!this.pipe) {
        if (!this.loading) {
          this.loading = (async () => {
            const mod: any = await import('@xenova/transformers');
            return mod.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
          })();
        }
        this.pipe = await this.loading;
      }
      const out = await this.pipe(texts, { pooling: 'mean', normalize: true });
      const data: Float32Array = out.data;
      const n = texts.length;
      const res: number[][] = [];
      for (let i = 0; i < n; i++) {
        res.push(Array.from(data.subarray(i * this.dim, (i + 1) * this.dim)));
      }
      return res;
    } catch (e: any) {
      console.warn('[embed] local model unavailable, falling back to hash embedder:', e?.message);
      const fallback = new HashEmbedder(this.dim);
      return fallback.embed(texts);
    }
  }
}

// ---------------- API：OpenAI 兼容 /embeddings ----------------
export class ApiEmbedder implements Embedder {
  readonly dim: number;
  constructor(
    private url: string,
    private key: string | undefined,
    private model: string,
    dim: number
  ) {
    this.dim = dim;
  }
  async embed(texts: string[]): Promise<number[][]> {
    const r = await fetch(`${this.url.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.key ? { Authorization: `Bearer ${this.key}` } : {})
      },
      body: JSON.stringify({ model: this.model, input: texts })
    });
    if (!r.ok) throw new Error(`embed API ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const data = (j.data as any[]).sort((a, b) => a.index - b.index);
    return data.map((d) => d.embedding as number[]);
  }
}

let singleton: Embedder | null = null;

/** 解析嵌入器（单例）：API > 本地 transformers.js > 哈希兜底 */
export async function getEmbedder(): Promise<Embedder> {
  if (singleton) return singleton;
  const apiUrl = process.env.GPH_EMBED_API_URL;
  if (apiUrl) {
    singleton = new ApiEmbedder(
      apiUrl,
      process.env.GPH_EMBED_API_KEY,
      process.env.GPH_EMBED_MODEL || 'text-embedding-3-small',
      getEmbedderDim()
    );
    return singleton;
  }
  if ((process.env.GPH_EMBED_LOCAL ?? 'on') !== 'off') {
    try {
      // 仅做模块解析检查；权重在首次 embed 时惰性下载
      await import('@xenova/transformers');
      singleton = new LocalEmbedder();
      console.log('[embed] provider = local (Xenova/all-MiniLM-L6-v2, 384d)');
      return singleton;
    } catch {
      console.warn('[embed] @xenova/transformers not installed, using hash embedder');
    }
  }
  singleton = new HashEmbedder(getEmbedderDim());
  console.log(`[embed] provider = hash fallback (${getEmbedderDim()}d)`);
  return singleton;
}

/** 把向量转为 pgvector 字面量字符串，如 [0.1,0.2,...] */
export function toPgVector(v: number[]): string {
  return `[${v.join(',')}]`;
}
