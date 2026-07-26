-- 全球知名人物志 · PostgreSQL 系统记录 Schema
-- 设计：persons 为主表（结构化属性），多语文本拆到子表避免稀疏列；
-- relations 存边（含人物-人物与人-组织/作品），全文检索向量由 refresh_person_tsv() 维护。
-- 向量检索：persons.embedding 与 person_chunks.embedding 由 pgvector 承载（语义检索 / RAG 检索底座）。
-- 运行：由 PgNeo4jStore.init() 在启动时执行（CREATE ... IF NOT EXISTS，幂等可重复）。
-- 注意：本文件中的 `vector(384)` 会被 init() 按 GPH_EMBED_DIM 实时替换，使向量维度与嵌入模型一致。

-- 向量扩展（pgvector 镜像已内置，普通 postgres 镜像需替换为 pgvector/pgvector:pg16）
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  plan          TEXT NOT NULL DEFAULT 'free',   -- 订阅套餐：free / pro
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS persons (
  id            TEXT PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  trust_level   TEXT NOT NULL DEFAULT 'ugc_pending',
  domains       TEXT[] NOT NULL DEFAULT '{}',
  birth         TEXT,
  death         TEXT,
  nationalities  TEXT[] NOT NULL DEFAULT '{}',
  aliases       TEXT[] NOT NULL DEFAULT '{}',
  achievements  JSONB NOT NULL DEFAULT '[]',
  affiliations  JSONB NOT NULL DEFAULT '[]',
  image_url     TEXT,
  sources       JSONB NOT NULL DEFAULT '[]',
  metrics       JSONB,
  created_by    TEXT,
  lang_versions TEXT[] NOT NULL DEFAULT '{}',
  search_tsv    TSVECTOR,
  embedding     vector(384),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 已存在库（升级场景）补齐向量列，保证幂等
ALTER TABLE persons ADD COLUMN IF NOT EXISTS embedding vector(384);

CREATE TABLE IF NOT EXISTS person_names (
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  lang       TEXT NOT NULL,
  name       TEXT NOT NULL,
  PRIMARY KEY (person_id, lang)
);

CREATE TABLE IF NOT EXISTS person_summaries (
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  lang       TEXT NOT NULL,
  body       TEXT NOT NULL,
  PRIMARY KEY (person_id, lang)
);

CREATE TABLE IF NOT EXISTS person_occupations (
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  lang       TEXT NOT NULL,
  value      TEXT NOT NULL,
  PRIMARY KEY (person_id, lang)
);

CREATE TABLE IF NOT EXISTS relations (
  id         TEXT PRIMARY KEY,
  from_id    TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL,                       -- 可为人物 id，亦可为组织/作品字符串标识
  type       TEXT NOT NULL,
  label      JSONB,
  directed   BOOLEAN DEFAULT FALSE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 语义检索分块表：把人物简介/成就/职业拆分为可检索片段，逐段向量化（RAG 检索粒度更细）
CREATE TABLE IF NOT EXISTS person_chunks (
  id         TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  lang       TEXT NOT NULL,
  chunk_type TEXT NOT NULL,          -- summary | achievement | occupation
  body       TEXT NOT NULL,
  embedding  vector(384),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS person_chunks_person_idx ON person_chunks (person_id);

-- PGC 专家背书：专家/管理员为人物档案背书（同一专家对同一人物唯一，幂等覆盖）
CREATE TABLE IF NOT EXISTS endorsements (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  expert_id   TEXT NOT NULL,
  expert_name TEXT NOT NULL,
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (person_id, expert_id)
);
CREATE INDEX IF NOT EXISTS endorsements_person_idx ON endorsements (person_id);

-- 开放 API 密钥（Stage 3）：key_hash 存储 SHA-256，明文仅创建时返回一次
CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL,
  prefix      TEXT NOT NULL,
  quota_month INTEGER NOT NULL DEFAULT 1000,   -- 月度配额（free=1000 / pro=50000）
  used_month  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  reset_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys (user_id);

-- 社区评论（Stage 3）：用户在人物页讨论，规模化社区内容
CREATE TABLE IF NOT EXISTS comments (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  person_slug TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  user_name   TEXT NOT NULL,
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'published',   -- published / hidden
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_person_idx ON comments (person_id);

-- 管理后台操作审计日志（Stage 4：问责留痕）
CREATE TABLE IF NOT EXISTS audit_log (
  id           TEXT PRIMARY KEY,
  actor_id     TEXT NOT NULL,
  actor_name   TEXT NOT NULL,
  action       TEXT NOT NULL,                            -- approve / reject / pending / endorse / role
  target_type  TEXT NOT NULL,                            -- person / user
  target_id    TEXT NOT NULL,
  target_label TEXT,
  meta         JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);

-- 全文检索：simple 字典对多语种友好；GIN 索引加速 @@ 匹配
CREATE INDEX IF NOT EXISTS persons_search_idx ON persons USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS persons_domains_idx ON persons USING GIN (domains);

-- 向量索引（HNSW，余弦距离）：加速 <=> 近邻检索。dim 与 embedding 列一致（由 init 替换）
CREATE INDEX IF NOT EXISTS persons_embedding_idx ON persons USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON person_chunks USING hnsw (embedding vector_cosine_ops);

-- 维护 search_tsv：聚合姓名 + 简介 + 别名
CREATE OR REPLACE FUNCTION refresh_person_tsv(pid TEXT) RETURNS void AS $$
UPDATE persons p SET search_tsv =
  to_tsvector('simple',
    coalesce((SELECT string_agg(name, ' ') FROM person_names WHERE person_id = p.id), '') || ' ' ||
    coalesce((SELECT string_agg(body, ' ') FROM person_summaries WHERE person_id = p.id), '') || ' ' ||
    coalesce(array_to_string(p.aliases, ' '), '')
  )
WHERE p.id = pid;
$$ LANGUAGE sql;
