# 全球知名人物志 · Global Persons Hub

跨领域 · 全语种 · 结构化知识图谱的**全球知名人物数据库平台**（MVP）。

> 目标：做成全球最大的名人 / 知名人物数据库平台——把影视 / 商业 / 学术 / 体育 / 音乐 / 政治等身份聚合到单一人物档案，中英双核 + 多语种母语可读，Person 实体 + 关系图谱可被 AI 引用、可 API 复用。**阶段二核心：pgvector 向量检索 + RAG 事实问答**，让知识库可被自然语言直接问答、可被 AI 检索引用。

---

## 建设原则（用户硬约束，已落地）

| # | 原则 | 在本仓库的体现 |
|---|------|----------------|
| 1 | **前后端分离开发** | 前端 `apps/web`（Next.js）与后端 `apps/api`（Fastify）是**独立工程**：独立仓库、独立构建、独立部署；仅通过 REST + OpenAPI 契约（`packages/types`）通信，后端不渲染页面、前端不直接访问数据库 |
| 2 | **最先进 / 合理 / 科学 / 实用的技术栈** | Next.js 15 + React 19 + TypeScript + Tailwind v4；Fastify + `@fastify/jwt`；共享类型包 `@gph/types`（契约先行）；pnpm/npm Workspaces + tsx 零摩擦开发 |
| 3 | **利于 SEO 与 GEO 收录** | Next.js App Router **SSR**；人物页输出 **Schema.org Person JSON-LD**；多语种 **hreflang** 交替链接；`sitemap.ts` / `robots.ts`；语义化结构、机器可读事实（GEO：可被 AI 直接引用） |
| 4 | **全球最大人物数据库平台** | 可水平扩展的 `Person` 实体模型 + 众包上传（原则 5）+ 生产就绪的 PostgreSQL / Neo4j 替换位 + **pgvector 向量检索** |
| 5 | **第三方注册用户可上传编辑个人数据库** | `/register` 注册、`/me` 个人数据库：登录用户可创建/编辑自己的人物数据，默认 `ugc_pending` 待审，进入全站图谱 |
| 6 | **全领域 / 全语种 / 结构化知识图谱** | `domains` 跨赛道统一画像；`langVersions` + `names/summary` 多语；`relations` 关系图谱（人物-人物/组织/作品），结构化底座；**可被 AI 引用的 RAG 事实问答底座** |

---

## 架构

```
┌─────────────────────────┐         REST / OpenAPI          ┌──────────────────────────┐
│  前端 apps/web (Next.js) │  ───────────────────────────▶   │  后端 apps/api (Fastify)  │
│  SSR + SEO/GEO + 交互     │  ◀───────────────────────────   │  业务 / 数据 / 鉴权        │
│  :3000                    │                                  │  :8787                    │
└─────────────────────────┘                                  └──────────────────────────┘
            │                                                          │
            │ 共享契约 @gph/types (OpenAPI 3)                          │ 存储：种子 + JSON（生产→PostgreSQL+Neo4j）
            └──────────────────────────────────────────────────────────┘
```

**关键设计**
- 前后端分离：`apps/web` 仅通过 `NEXT_PUBLIC_API_BASE` 调用 `apps/api`，无任何服务端模板耦合。
- 契约先行：`packages/types` 同时导出 TypeScript 类型与 `openapi.ts`，后端在 `/openapi.json` 暴露，前端据此对齐。
- SEO/GEO：人物详情页为 Server Component（SSR），产出 JSON-LD + hreflang，便于搜索引擎与生成式引擎收录/引用。

---

## 目录结构

```
global-persons-hub/
├── package.json              # npm workspaces 根
├── packages/
│   └── types/                # @gph/types：共享类型 + OpenAPI 契约（单一事实来源）
│       └── src/{index,openapi}.ts
├── apps/
│   ├── api/                  # 后端 Fastify 服务（独立进程）
│   │   ├── src/{server,routes}.ts
│   │   ├── src/store/        # 存储抽象层（适配器模式）
│   │   │   ├── types.ts          # DataStore 契约 / RelationView / Network
│   │   │   ├── json-store.ts     # 默认：零依赖 JSON 文件
│   │   │   ├── pg-neo4j-store.ts # 生产：PostgreSQL + Neo4j
│   │   │   ├── schema.sql        # PostgreSQL 建表 + 全文检索
│   │   │   ├── reindex-graph.ts # 以 PG 为源重建 Neo4j 图谱
│   │   │   ├── crypto.ts / util.ts / index.ts（工厂）
│   │   └── data/{persons.json, runtime/}
│   └── web/                  # 前端 Next.js 15（独立进程）
│       └── src/app/...       # 首页/人物页/对比/搜索/问答/登录/注册/我的/管理后台/ sitemap/robots
└── README.md
```

---

## 快速开始

```bash
# 1) 安装（workspaces 一次性安装全部）
cd global-persons-hub
npm install

# 2) 同时启动前端(:3000) 与 后端(:8787)
npm run dev
```

打开 **http://localhost:3000** 即可访问（默认跳转 `/zh`）。

- 后端健康检查：`http://localhost:8787/health`；API 文档：`http://localhost:8787/openapi.json`
- 单独启动：`npm run dev:api` / `npm run dev:web`

### 环境变量
- `apps/web/.env.local`：`NEXT_PUBLIC_API_BASE=http://127.0.0.1:8787`（**用 127.0.0.1 而非 localhost**，避开 Node fetch 对 localhost 的 IPv6 `::1` 解析问题）
- 服务端 SSR 取数优先读取运行时变量 `GPH_API_BASE`（不被构建期内联，便于生产改 IP/域名），缺省回退 `http://127.0.0.1:8787`
- 可选 `NEXT_PUBLIC_SITE_URL`（sitemap 使用的站点域名，默认 `http://localhost:3000`）

### 支付与对象存储（apps/api 环境变量，生产按需配置）
- **默认即跑通**：未配置任何密钥时 `PAYMENT_PROVIDER=mock`，`/me/subscribe` 直接置 pro，可完整演示订阅流程；`UPLOADER_DRIVER=disk` 落本地盘。
- 支付渠道 `PAYMENT_PROVIDER`：`mock`（默认）/ `stripe` / `wechat` / `alipay`，各渠道**零新增依赖**（fetch + node:crypto 验签）。
  - Stripe：`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`（形如 `whsec_xxx`，自动 base64 解码为 HMAC 密钥）、`STRIPE_PRO_AMOUNT`(分)、`STRIPE_CURRENCY`
  - 微信支付 v3：`WECHAT_MCH_ID`、`WECHAT_APP_ID`、`WECHAT_API_KEY`(APIv3 密钥)、`WECHAT_SERIAL`、`WECHAT_PRIVATE_KEY`(商户私钥，可 `file://` 读文件)、`WECHAT_PLATFORM_PUBLIC_KEY`(平台证书)、`WECHAT_NOTIFY_URL`、`WECHAT_PRO_AMOUNT`(分)
  - 支付宝：`ALIPAY_APP_ID`、`ALIPAY_PRIVATE_KEY`(商户私钥)、`ALIPAY_PUBLIC_KEY`(支付宝公钥)、`ALIPAY_GATEWAY`、`ALIPAY_NOTIFY_URL`、`ALIPAY_PRO_AMOUNT`(元)
- 对象存储 `UPLOADER_DRIVER`：`disk`（默认）/ `s3`。S3 兼容 R2 / AWS S3 / 阿里云 OSS / 腾讯云 COS / MinIO，同样**零依赖**（fetch + SigV4 签名）：
  - `S3_ENDPOINT`(虚拟主机风格已含桶名)、`S3_REGION`(R2 用 `auto`)、`S3_BUCKET`、`S3_ACCESS_KEY`、`S3_SECRET_KEY`、`S3_PATH_STYLE`(1=路径风格)、`S3_PUBLIC_BASE`(可选公开基址)

---

## 生产级存储（PostgreSQL + Neo4j）

存储层采用**适配器模式**：`apps/api/src/store/` 定义统一的 `DataStore` 异步契约，两种实现通过 `STORE_DRIVER` 环境变量切换，**前端代码无需改动**。

| 适配器 | 驱动值 | 适用 | 说明 |
|---------|--------|------|------|
| `JsonStore` | `json`（**默认**） | 本地开发 | 零原生依赖、开箱即跑；种子加载 + `data/runtime/` 持久化，行为与原实现一致 |
| `PgNeo4jStore` | `pg` / `pg-neo4j` | 生产 | **PostgreSQL 16** 为系统记录（事务一致、可溯源、全文检索 GIN 索引）；**Neo4j 5** 承载关系图谱遍历（`/graph/network/:id` 多跳 BFS） |

### 为什么 PG + Neo4j 分工
- **PostgreSQL = 事实源（SoT）**：`users` / `persons` / `person_names` / `person_summaries` / `person_occupations` / `relations` 规范化存储，外键级联删除；多语文本拆表避免稀疏列；`search_tsv` 由 `refresh_person_tsv()` 维护，simple 字典对多语种友好，GIN 索引加速 `@@` 匹配。写入走事务，保证结构化数据与关系边一致。
- **Neo4j = 图谱引擎**：`(:Person)-[:RELATES]->(:Person)` 存储关系网络，承担 PG 不擅长的**多跳邻接遍历**。`getNetwork(id, depth)` 用 Cypher 做 BFS；每次涉及关系的写操作后 `syncGraph()` 以 PG 为源整体重建图谱，确保双库一致。Neo4j 不可达时自动降级为 PG 内存 BFS（可用性兜底）。

### 一键起生产存储
```bash
docker compose up -d          # 起 postgres:16 + neo4j:5
# 后端改用生产适配器
STORE_DRIVER=pg-neo4j \
PG_URL=postgresql://gph:gph@localhost:5432/gph \
NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASS=gphgphgph \
npm -w @gph/api run start
# 若图谱与 PG 出现偏差，手动重建：
npm run db:reindex
```
启动后后端会自动 `init()`（建表 + Neo4j 约束）并按需 `seedIfEmpty()`（PG 为空时从 `data/persons.json` 灌入，随后同步图谱）。

### Schema 与维护
- 建表 SQL：`apps/api/src/store/schema.sql`（幂等，`CREATE ... IF NOT EXISTS`，可重复执行）。
- 图谱重建：`apps/api/src/store/reindex-graph.ts`（`npm run db:reindex`），以 PG 为事实源清空并重建 Neo4j 节点与边。
- 接入真实开放数据源（Wikidata / ORCID 等）只需在灌库阶段扩展 `seedIfEmpty` 或新增同步任务，存储层接口不变。

---

## 语义检索与 RAG 事实问答（阶段二核心）

在「全领域 / 全语种 / 结构化知识图谱」底座之上，阶段二引入**向量检索 + 检索增强生成（RAG）**，让知识库可被自然语言直接问答、可被 AI 检索引用（原则 6 的深化）。

### 架构

```
用户问题 ─▶ 嵌入模型(向量化) ─▶ pgvector 余弦近邻检索
                                      │  Top-K 相关片段（整人向量 + 多语分块向量）
                                      ▼
                          RAG 服务：有 LLM → 基于检索片段生成「带引用」回答
                                   无 LLM → 抽取式兜底（基于结构化事实 + 来源链接）
                                      ▼
                          前端 /ask 页：回答 + 可点击来源（人物主页）
```

- **向量底座**：`persons.embedding`（整人向量）+ `person_chunks`（按语种切分的简介/成就/职业分块向量），均存于 PostgreSQL（pgvector 扩展），HNSW 索引加速余弦近邻。
- **嵌入模型（三选一，环境变量切换）**：
  1. `GPH_EMBED_API_URL` 设置 → OpenAI 兼容 `/embeddings`（生产推荐，语义最强；维度随 `GPH_EMBED_DIM`）。
  2. 默认（未设 API）→ **本地 `Xenova/all-MiniLM-L6-v2`（384 维，多语）**，经 transformers.js 本地推理，**零数据外泄**；首调用惰性下载权重（约 23MB）。
  3. 若本地模型不可用 → **零依赖哈希嵌入兜底**，保证整条管线永远可跑（语义较弱，但离线可用）。
- **RAG 生成**：配置 `GPH_LLM_API_URL`（OpenAI 兼容 `/chat/completions`）后，回答由检索片段「接地」生成并标注 `[来源N]`；未配置则退化为抽取式作答（直接基于结构化事实 + 出处），随时可用。

### 新增 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/search/semantic?q=&lang=&limit=` | 向量（语义）检索，返回带余弦相似度的命中 |
| POST | `/rag/ask` | RAG 事实问答（主入口）：`{ query, lang?, limit? }` → `{ answer, sources[], generated, model? }` |
| GET  | `/rag/ask?q=&lang=&limit=` | RAG 问答（GET 便捷入口） |

### 一键起（含语义检索）

```bash
docker compose up -d          # postgres:16+pgvector + neo4j:5
STORE_DRIVER=pg-neo4j \
PG_URL=postgresql://gph:gph@localhost:5432/gph \
NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASS=gphgphgph \
GPH_EMBED_API_URL=https://api.openai.com/v1 GPH_EMBED_API_KEY=sk-xxx \
GPH_LLM_API_URL=https://api.openai.com/v1 GPH_LLM_API_KEY=sk-xxx \
npm -w @gph/api run start
# 种子灌库后重算向量（如更换嵌入模型）：
npm run db:reembed
```

### 关键环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `GPH_EMBED_API_URL` | 空 | 设置则使用 OpenAI 兼容嵌入服务（覆盖本地模型） |
| `GPH_EMBED_API_KEY` | 空 | 嵌入服务 API Key |
| `GPH_EMBED_MODEL` | `text-embedding-3-small` | 嵌入模型名（API 模式） |
| `GPH_EMBED_DIM` | `384` | 向量维度，**必须与嵌入模型输出维度一致**（schema 列 `vector(N)` 据此生成） |
| `GPH_EMBED_LOCAL` | `on` | 设为 `off` 禁用本地 transformers.js，强制哈希兜底 |
| `GPH_LLM_API_URL` | 空 | 设置则开启 RAG 生成（OpenAI 兼容 `/chat/completions`） |
| `GPH_LLM_API_KEY` | 空 | 大模型 API Key |
| `GPH_LLM_MODEL` | `gpt-4o-mini` | 生成模型名 |

> 维度一致性：本地模型固定 384 维；若用 API 嵌入（如 `text-embedding-3-small` = 1536 维），务必设置 `GPH_EMBED_DIM=1536`，后端会在 `init()` 时按该维度生成 `vector(1536)` 列，否则会与嵌入维度不匹配。

## API 概览（REST）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/persons` | 列出/搜索人物（q/domain/lang/分页） |
| POST | `/persons` | 创建人物（需 JWT；第三方用户上传） |
| GET  | `/persons/:slug` | 单个人物详情（结构化 + 关系） |
| PATCH| `/persons/:slug` | 编辑人物（本人/专家/管理员） |
| GET  | `/search?q=` | 跨领域关键词/全文搜索 |
| GET  | `/search/semantic?q=` | 向量（语义）检索（pgvector / 本地余弦） |
| POST | `/rag/ask` | RAG 事实问答（检索增强生成 / 抽取式兜底） |
| GET  | `/relations/:id` | 关系图谱邻接 |
| GET  | `/graph/network/:id?depth=` | 多跳关系网络遍历（Neo4j / BFS 回退） |
| POST | `/auth/register` | 第三方用户注册 |
| POST | `/auth/login` | 登录签发 JWT |
| GET  | `/me/persons` | 当前用户上传/编辑的人物 |
| GET  | `/admin/persons/pending` | UGC 审核队列（admin/expert） |
| PATCH| `/admin/persons/:id/status` | 审核裁决：approve→ugc_verified / reject→ai_draft；`reject` 可带 `reason` 驳回理由（写入审计 meta） |
| POST | `/admin/persons/:id/endorse` | PGC 专家背书（admin/expert）：幂等追加背书，ugc_verified 自动升级 pgc |
| GET  | `/admin/stats` | 运营数据看板（admin/expert）：人物总量与权威分布、待审 UGC、用户/角色/Pro、评论、月度 API 调用 |
| GET  | `/admin/audit` | 操作审计日志（admin/expert）：approve/reject/endorse/role 全量留痕，含操作者/对象/时间/meta |
| GET  | `/admin/users` | 用户列表（仅 admin） |
| PATCH| `/admin/users/:id/role` | 角色调整 user/expert/admin（仅 admin，用于提升 PGC 专家） |
| GET  | `/me` | 当前用户（含订阅套餐 plan） |
| GET  | `/me/apikeys` | 列出我的开放 API 密钥（含用量/配额条） |
| POST | `/me/apikeys` | 创建开放 API 密钥（明文仅此刻返回一次） |
| DELETE| `/me/apikeys/:id` | 吊销 API 密钥 |
| POST | `/me/subscribe` | 升级/降级套餐 free/pro，按渠道创建支付会话（Stripe 跳转 / 微信 Native 扫码 / 支付宝跳转）；未配置真实密钥回退 mock 直接生效 |
| POST | `/webhooks/stripe` `/webhooks/wechat` `/webhooks/alipay` | 支付回调，验签后自动升级 pro（Stripe HMAC-SHA256 / 微信 RSA+AES-GCM / 支付宝 RSA2） |
| GET  | `/payments/providers` | 返回可用支付渠道与密钥配置状态（前端渲染选择项） |
| POST | `/upload` | 图片上传（base64 JSON：{file}）→ 经对象存储抽象层返回可访问 URL（disk/s3） |
| GET  | `/persons/:slug/comments` | 列出人物公开评论 |
| POST | `/persons/:slug/comments` | 发表评论（需登录） |
| GET/POST/… | `/persons`、`/search`、`/search/semantic`、`/rag/ask` | 公开读接口支持 `X-API-Key` 头（替代 JWT，自动计入月度配额） |

---

## 本仓库已验证（端到端跑通）

在本地同时运行后端(Fastify :8787) 与前端(Next.js :3000) 后，以下链路均实测通过：

- **首页 SSR**：`/zh` 返回 200，服务端渲染出种子人物与「影响力排行榜」，无 `"暂时无法连接"` 兜底。
- **人物详情页（SEO/GEO 三件套）**：`/zh/person/albert-einstein` 输出 `Schema.org Person` JSON-LD、**13 语种 `hreflang`** 交替链接、`canonical`；英文 `/en/person/albert-einstein` 正确显示 `Albert Einstein`（多语种母语可读）。支持语种：zh/en/es/fr/ja/ru/ar/pt + **de/ko/it/hi/id**（13 种）。
- **第三方用户上传（原则 5）**：注册 → 登录拿 JWT → `POST /persons` 创建人物（含中文 UTF-8 正常）→ 该人物 `trustLevel=ugc_pending` 进入全站图谱，并在 `GET /me/persons` 中可见。
- **搜索与关系图谱**：`/search?q=musk` 命中 Elon Musk；`/relations/:id` 返回邻接关系；关系图谱 SVG 在详情页渲染。
- **SEO 文件**：`/robots.txt` 含 `Sitemap` 指令；`/sitemap.xml` 含 **13 个语言首页 + 全量人物页（12 人 × 13 语种 = 156 条）+ 领域榜（13×7=91 条）+ 对比页 + 定价页，合计 400+ 条 URL**，保证人物页被搜索引擎全面收录。
- **类型与构建**：`npm run typecheck` 三个包全绿；`next build` 全部路由成功（SSG + SSR 混合）。
- **UGC 审核闭环**：普通用户上传（`ugc_pending`）→ 管理员在 `/admin` 审核后台「通过 / 退回」→ 通过后升级 `ugc_verified` 进入公开图谱；普通用户访问审核接口被 403 拦截。管理员账号由启动时自动种子（默认 `admin@gph.local` / `admin123456`，生产用 `GPH_ADMIN_EMAIL` / `GPH_ADMIN_PASSWORD` 覆盖）。
- **交互式关系图谱**：人物页「二跳网络」力导向图（零依赖 SVG），数据来自 `/graph/network/:id?depth=2`，节点点击跳转、悬停高亮邻接、按权威等级着色。
- **领域榜单页（SEO 聚合着陆页）**：`/{lang}/domain/{domain}` 按影响力排序 + TOP3 高亮 + `ItemList` JSON-LD + 13 语种 hreflang，已进 sitemap（13 语种 × 7 领域 = 91 条）。
- **语义搜索前端入口**：`/{lang}/search?q=...&mode=semantic` 关键词 / 语义（AI 向量）双模式切换，语义模式显示相似度百分比。
- **PGC 专家背书闭环**：专家/管理员对人物 `POST /admin/persons/:id/endorse` 幂等追加背书；当人物原等级为 `ugc_verified` 时自动升级为 `pgc`，`pgc` 保持不动；人物页展示「✓ 专家背书」徽章与评语。重复背书幂等（计数不增）；`expert` 可背书但访问用户管理接口被 403 拦截。
- **用户角色管理（仅 admin）**：`GET /admin/users` 列用户，`PATCH /admin/users/:id/role` 将用户提升/调整为 `expert`（获得审核与背书权限）或 `admin`；禁止管理员降级自己。
- **人物对比页（SEO 着陆页）**：`/{lang}/compare/{a}-vs-{b}` 结构化对比表（领域/职业/生卒/国籍/影响力/成就/背书/权威/简介）+ `ItemList` JSON-LD + hreflang；相关人物列表与人物页均提供「对比」入口；无效组合返回 404。已进 sitemap（TOP12 影响力同领域相邻两两组合，最多 30 对 × 13 语种 = 最多 390 条，实测 12 对 × 13 = 156 条）。
- **开放 API 密钥与配额（Stage 3）**：`POST /me/apikeys` 生成 `gph_live_` 前缀密钥（SHA-256 存储，明文仅此刻返回），`GET /me/apikeys` 查看用量/配额条，`DELETE /me/apikeys/:id` 吊销。公开读接口（`/persons`、`/search`、`/search/semantic`、`/rag/ask`）支持 `X-API-Key` 头替代 JWT，自动按密钥月度配额计数（free=1000、pro=50000 次/月），超额 429 并附 `resetAt`。账户中心 `/[lang]/account` 可管理密钥与订阅。
- **专业订阅（接入真实支付）**：定价页 `/[lang]/pricing` 提供 Stripe / 微信支付 / 支付宝 三通道选择，按渠道创建支付会话（Stripe/支付宝跳转、微信 Native 扫码并轮询 `/me` 检测支付结果）；`POST /me/subscribe` 未配置真实密钥时回退 mock 直接置 pro，保证开发流程可演示。三通道均用 `fetch` + `node:crypto` 实现（HMAC-SHA256 / RSA-SHA256 / AES-256-GCM / RSA2 验签），**零新增第三方依赖**；`/webhooks/*` 回调验签后自动升级 pro，pro 提升 API 配额并返回「专业版」标识。
- **图片上传与图集（对象存储抽象层）**：`POST /upload`（登录）接收 base64 图片（≤5MB，jpg/png/gif/webp），经统一 `Uploader` 抽象层（`disk` 本地盘 / `s3` 对象存储）返回可访问 URL；`UPLOADER_DRIVER=s3` 时走 S3 兼容协议（Cloudflare R2 / AWS S3 / 阿里云 OSS / 腾讯云 COS / MinIO）+ SigV4 签名，同样**零依赖**。人物页 `images` 图集展示 + 登录用户可上传（写入 `PATCH /persons/:slug`）。
- **社区评论（Stage 3）**：人物页新增 `Comments` 讨论区，`GET/POST /persons/:slug/comments` 读写（POST 需登录），评论持久化于 `comments` 存储，规模化社区内容起点。
- **管理后台治理（Stage 4：数据看板 + 操作审计 + 驳回理由）**：`/[lang]/admin` 新增「概览」与「操作日志」两个 Tab。概览调用 `GET /admin/stats` 展示 6 张统计卡（人物总量、待审 UGC、用户数、评论数、Pro 订阅、月度 API 调用）+ 按权威等级（ai_draft/ugc_pending/ugc_verified/pgc）分布；操作日志调用 `GET /admin/audit` 表格化呈现 approve/reject/endorse/role 全量操作留痕（操作者、动作、对象、时间，reject 红 / approve 绿 / role 琥珀色，驳回理由展示于对象下方）。审核裁决支持填写**驳回理由**（`PATCH /admin/persons/:id/status` 的 `reason` 字段写入审计 `meta`）。三类操作（审核/背书/角色）均自动埋点写入 `audit` 存储（JSON 适配器 `audit.json` / PG 适配器 `audit_log` 表），13 语种 UI 字典全覆盖。实测：`typecheck` 三包全绿；`/admin/stats`、`/admin/audit` 返回 200；approve/reject/endorse/role 四类操作均正确留痕（reject 审计 meta 含 `{"reason":"内容不实，予以退回"}`）；13 语 `/[lang]/admin` 全部 200。**零新增第三方依赖**。
- **人物库：分类 + 排行榜导航（Stage 5）**：种子人物由 10 位扩充至 **28 位**，覆盖学术 / 科技 / 商业 / 体育 / 音乐 / 影视 / 政治 七大领域，补齐 `metrics.influence`（0–100）与 `netWorth`（商业/体育人物），含 zh+en 名称与简介、若干跨人物关系边（如盖茨→图灵、贝索斯↔马斯克）。新增 `GET /persons` 客户端可传 `pageSize`（`getPersons({pageSize})`）。新增 `/[lang]/persons` 人物库页：服务端 SSR 取数 + 13 语种 hreflang + canonical + `ItemList` JSON-LD；客户端 `PersonsExplorer` 组件提供**领域分类筛选**（动态 chips：全部 + 库中出现领域）与**排行榜模式切换**（影响力 / 财富 / 姓名 三种排序），排行榜行含名次奖牌、影响力进度条、财富格式化（$420B 等）。导航栏新增「人物库」入口，首页趋势区加「查看全部」CTA，sitemap 增加 13 条 `/[lang]/persons`。UI 字典新增 `nav.persons` 与 `persons.*` 共 11 组 13 语词条。实测：`typecheck` 三包全绿；13 语 `/[lang]/persons` 全部 200（含 `人物库`/`影响力`/`财富`/新增人物牛顿·曼德拉·马斯克等渲染、13 条 hreflang、`ItemList` JSON-LD、分类/排序控件）；web devlog 无 `[ui]` 告警、无编译错误。**零新增第三方依赖**。

- **代码优化（Stage 6：DRY 重构 + 类型化 + 深链接）**：抽取共享件消除重复——新增 `apps/web/src/lib/format.ts`（`formatMoney` 财富格式化 + `buildPersonItemList` schema.org `ItemList` 构建，供人物库页与领域榜页复用）；新增 `apps/web/src/components/RankMedal.tsx`（金/银/铜/灰 名次徽章，供 `PersonsExplorer` 与领域页 TOP3 复用）。`PersonsExplorer` 改用共享件并新增 `initialDomain` / `initialSort` 入参；通过 `history.replaceState` 将筛选/排序**同步到 URL**（深链接可分享、无整页刷新）。`/[lang]/persons` 页读取 `searchParams` 的 `domain`/`sort` 做校验后作为初始态，`items` 类型由 `any[]` 改为 `Person[]`；领域榜页同样复用共享件并类型化。实测：`typecheck` 三包全绿；13 语 `/[lang]/persons` 全部 200；`?domain=business&sort=netWorth` 深链接返回 200、UI 标签与 `ItemList` JSON-LD 正确、商业人物正常渲染；`/[lang]/domain/sports` 重构后 200 且 JSON-LD 正常；web devlog 无 `[ui]` 告警、无编译错误。**零新增第三方依赖**。

- **关系图谱增强（Stage 7：双向遍历 + 数据丰富 + 类型图例）**：发现图谱前端 `NetworkGraph`（确定性力导向布局、按权威等级/关系类型着色、悬停高亮、点击跳转）已存在，但 JSON 适配器 `getNetwork` 仅沿**出边** BFS（PG/Neo4j 实为双向），导致 dev 环境只有约 8 个有出边人物能出图。修复：`json-store.getNetwork` 改为基于**全量双向邻接**的 BFS（被指向的人物也能展开关系网），与 PG/Neo4j 行为一致；顺带修正 PG 回退 `getNetworkFromPg` 的 `name: tid` bug（改用关联人物真实姓名）。**丰富关系数据**：幂等脚本在现有 28 人之间新增 **21 条**跨领域关系（学术影响链、科技创始人竞争网、体育球王之争、音乐/影视合作、政治影响链），seed 与 runtime 同步写入；现在 22/28 人有出边、双向遍历后几乎覆盖全库。UI 字典新增 `rel.*`（family/mentor/collab/affiliated/influence/rival/other）7 组 13 语词条；`NetworkGraph` 新增**关系类型配色图例**（颜色→本地化类型名）。实测：`typecheck` 三包全绿；`/graph/network/p-isaac-newton` 由 0 节点变为 9 节点 18 边、`p-beyonce`/`p-cristiano-ronaldo`（原被指向方）现在出图、`p-einstein` 9 节点 22 边、`p-steve-jobs` 6 节点；13 语 `/[lang]/person/albert-einstein` 全部 200 且渲染 SVG 图谱与关系类型图例（亲属/师徒/合作/隶属/影响/竞争/其他）；web/api devlog 无 error。**零新增第三方依赖**。

- **关系图谱探索页（Stage 8：独立图谱导航 + 深度调节 + 深链接）**：在 Stage 7 基础上把图谱从"详情页嵌入区块"升级为独立导航入口。新增 `/[lang]/graph` 服务端页：SSR 取全量人物（按当前语种名排序）填充**中心人物下拉选择器**，`/[lang]/person/[slug]` 现有 `NetworkGraph` 复用为可视化层；新增客户端组件 `apps/web/src/components/GraphExplorer.tsx`——**中心人物选择 + 遍历深度滑块（1–3 跳）**，客户端按需 `fetch /graph/network/:slug?depth=` 拉取并渲染，通过 `history.replaceState` 把 `?center=&depth=` **同步到 URL**（深链接可分享、无整页刷新）；另设"查看人物详情"按钮直达中心人物档案。导航栏新增「关系图谱」入口（与「人物库」并列置顶），`sitemap.ts` 增加 13 条 `/[lang]/graph`。UI 字典新增 `nav.graph` 与 `graph.*`（title/desc/pickCenter/depth/depthHint/empty/viewDetail）共 7 组 13 语词条。实测：`typecheck` 三包全绿；13 语 `/[lang]/graph` 全部 200（含「关系图谱/中心人物/遍历深度」控件、13 条 hreflang）；`?center=albert-einstein&depth=3` 深链接 SSR 预选中心与深度、`/graph/network/albert-einstein?depth=3` 返回 14 节点 29 边；web devlog 无 `[ui]` 告警、无编译错误。**零新增第三方依赖**。

- **三代亲属族谱（Stage 9：全部人物亲属资料 + 分代族谱渲染）**：用户要求"给人物库里所有人物加上本人物上下左右三代人以内的亲人亲属的详细资料介绍以及人物关系族谱"。方案：给每个**现有**人物补结构化 `kin` 字段（而非新建几百个非知名人物节点污染排行榜/SEO）——`packages/types` 新增 `KinRelation` 联合类型、`KinMember` 接口（`name`/`relation`/`generation`(-2 祖辈 / -1 父母 / 0 同辈(配偶·兄弟姐妹) / +1 子女 / +2 孙辈)/`birth`/`death`/`bio`(多语)/`slug`/`wiki`），`Person` 增加可选 `kin?: KinMember[]`。**数据**：幂等脚本为 seed 与 runtime 的 28 位人物按 slug 写入三代内亲属（祖辈/父母/同辈/子女/孙辈，含生卒年、zh+en 详细 bio、维基链接），seed 共 131 条 kin、runtime 3 位 UGC 无 kin（正确）；脚本运行后已删（仅当 `!Array.isArray(p.kin)` 写入，可重跑不覆盖）。UI 字典新增 `person.kinTitle` + `kin.*`（19 个关系标签 father/mother/grandfather/grandmother/spouse/exSpouse/partner/brother/sister/halfBrother/halfSister/son/daughter/grandson/granddaughter/adoptiveFather/adoptiveMother/stepfather/stepmother + 5 个世代带 `kin.gen-2/-1/0/1/2`）各 13 元素。`/[lang]/person/[slug]` 详情页新增"亲属关系族谱"区块：按 `generation` 分代渲染卡片（祖辈/父母/配偶与兄弟姐妹/子女/孙辈），含关系标签徽章、生卒年、多语 bio、Wikipedia 溯源链接。实测：`typecheck` 三包全绿；重启 API 后 `GET /persons/albert-einstein` 返回 `kin=6`；13 语 `/[lang]/person/albert-einstein` 全 200 且渲染「亲属关系族谱」+ 亲属名（赫尔曼·爱因斯坦/米列娃·马里奇）+ Wikipedia 链接；Beyoncé 页正确渲染 父母/配偶与兄弟姐妹/子女 世代带与亲属（Jay-Z/蓝 Ivy·卡特/索兰芝·诺尔斯/马修·诺尔斯）；web devlog 无 `[ui]`/error。**零新增第三方依赖**。

- **族谱互链 + 亲属并入图谱（Stage 10：知名亲属收录 + kin 边可视化）**：两项联动增强——① **族谱卡片可点击跳转站内人物**：收录 4 位本身知名的亲属为正式人物（`venus-williams` 大威、`jay-z`、`pierre-curie` 皮埃尔·居里、`irene-joliot-curie` 伊雷娜·约里奥-居里，均 pgc 级、含完整 summary/metrics/sources/kin），并在双方 `kin` 上互挂 `slug`（塞雷娜↔大威、碧昂丝↔Jay-Z、居里夫人↔皮埃尔↔伊雷娜）；详情页族谱卡片有 `slug` 时姓名渲染为站内 `Link`（靛蓝色 + →），无 slug 保持纯文本。② **亲属关系并入图谱**：`NetworkEdge` 契约新增可选 `kinRel`（KinRelation 键）；`json-store.getNetwork` 双向 BFS 并入 kin 边——`kin.slug` 可解析 → 真实人物-人物 `family` 边（全局双向）；无 slug → 仅**中心人物**展开为虚拟节点（`trustLevel='kin'`、id `kin:<pid>:<i>`，避免多跳图面爆炸），同时数据侧为互链人物补 `family` 类型 `relations` 边（PG/Neo4j 路径天然并入）。前端 `NetworkGraph`：kin 边标签用 `t(lang, 'kin.'+kinRel)` 13 语翻译；虚拟节点灰底虚线圆、不可点击（无 slug 不给 cursor-pointer）；图例新增「未收录亲属」（`graph.kinNode` 13 语）。实测：`typecheck` 三包全绿；`/graph/network/marie-curie?depth=1` 7 节点 11 边（皮埃尔/伊雷娜为真实可点节点 + 3 个 kin 虚拟节点，kin 边带 spouse/daughter/father/mother）；4 位新人物页 13 语全 200；居里夫人详情页族谱卡片含 `person/pierre-curie`、`person/irene-joliot-curie` 站内链接；`/[lang]/graph?center=marie-curie&depth=2` 多语 200；无 UI key 泄漏。**零新增第三方依赖**。

- **新收录 4 人的 13 语 SEO 检查（Stage 11：补齐多语内容 + 复验）**：针对 Stage 10 收录的 4 位人物（`venus-williams`/`jay-z`/`pierre-curie`/`irene-joliot-curie`）做 13 语 SEO 体检。体检发现：hreflang 交替链接（13 条）+ canonical 实际齐全（HTML 属性为 `hrefLang` 驼峰，小写正则易漏判），但**多语内容仅 zh+en**——11 种语言的 `<title>`/`description` 回退英文、`bio`/`achievements` 全空（页面内容过薄）。修复：为 4 人补齐 13 语 `names`/`occupations`/`summary`/`bio`/`achievements`（seed + runtime 同步，脚本断言每键 13 元素），并为 4 人加**回向 kin**（venus↔serena、jay-z↔beyonce、pierre↔marie/irene、irene↔marie/pierre）以强化站内内链。重启 API 后复验：4 人 × 13 语全部本地化（非 en 语言 description 与英文不同且含目标语种字符；ru 西里尔、ar 阿拉伯、ja/ko/zh 等已验证）；4 人页族谱卡片正确渲染站内链接、图谱纳入 kin 边（sister/father/mother 等）。**零新增第三方依赖**。

- **文库规模翻倍至 50 人 + 详情页传记渲染（Stage 12：50 人库 + 13 语全字段 + 艺术领域）**：用户要求「扩大到 50 人规模人物库」。两项补课 + 一次扩容：① **补齐 28 位基础人物的 13 语全字段**——上轮 Stage 11 仅 4 人补齐，基础 28 人的 `bio`/`achievements` 仍只有 7 语种（5 个并行子代理批次中 2 批曾静默失败）。本轮用 5 个批次（`_bio_batch1-5.json`，6/7/7/5/3 人）重新并行生成 28 人的 13 语 `names`/`occupations`/`summary`/`bio`/`achievements`，合并脚本仅填缺失语种、保留既有 7 语内容（零数据丢失）。② **新增 18 位人物（32→50）**：A 批（伽利略·伽利雷 / 尼古拉·特斯拉 / 阿达·洛芙莱斯〔互链 alan-turing〕/ 亚历山大·弗莱明 / 凯瑟琳·约翰逊 / 桑达尔·皮查伊）、B 批（圣雄甘地〔互链 nelson-mandela〕/ 亚伯拉罕·林肯 / 罗莎·帕克斯 / 列奥纳多·达·芬奇 / 巴勃罗·毕加索 / 弗里达·卡罗）、C 批（列夫·托尔斯泰 / 鲍勃·马利 / 猫王 / 黑泽明 / 李小龙 / 穆罕默德·阿里），各含完整 13 语五字段 + `relations` + `langVersions=13`。③ **类型与渲染**：`packages/types` 新增 `art` 领域（`DOMAIN_LABELS` 加「艺术」，3 位画家在 `/persons` 显示分类 chip）；`ui.ts` 新增 `section.bio`（传记，13 语），`/[lang]/person/[slug]` 详情页在 summary 后、achievements 前渲染多语「传记」区块（`pickText` 回退）。④ **治理清理**：runtime 移除 3 个治理测试人物（`test-reject-person`/`jane-moderation-test`/`pg-store-verify`，仅 runtime 存在、无入边引用，已从公开 `/persons` 列表剔除）；所有人物 `langVersions` 统一置 13（4 位 Stage 11 人物此前仅 2 语，会破坏语种筛选）。领域分布：学术 14 / 商业 10 / 政治 7 / 影视 7 / 科技 9 / 音乐 6 / 体育 6 / 艺术 3 / 其他 2。实测：`typecheck` 三包全绿；重启 API 加载 50 人；`/zh/persons` 列出 50 位人物链接；galileo 详情页 `/zh` 渲染「传记」、`/en` 渲染「Biography」；50 人 × 13 语 SEO 全 0 失败（非拉丁语检测西里尔/阿拉伯/假名/谚文/天城体/汉字，拉丁语以「与英文描述不同」为准，en 行 differs=false 属设计预期）；`/zh/persons` 含 leonardo-da-vinci/mahatma-gandhi/bruce-lee/muhammad-ali 等新增 slug。**零新增第三方依赖**。

- **SEO 覆盖补全（Stage 13：sitemap 领域动态化 + art 领域页 404 修复）**：Stage 12 新增 `art` 领域后暴露两处遗漏——① `sitemap.ts` 的域名榜单 URL 列表硬编码为旧 7 领域，漏收 `art`/`other`（实为 9 领域）；② 领域页 `apps/web/src/app/[lang]/domain/[domain]/page.tsx` 的 `VALID` 白名单同样漏 `art`，导致 `/[lang]/domain/art` 命中 `notFound()` 返回 404。两处均改为从 `DOMAIN_LABELS` 动态取 `Object.keys`（与 `Domain` 类型单一事实源对齐，今后新增领域永不再漏）。修复后：9 领域 × 13 语 = 117 条 `/domain/<d>` 全进 sitemap；`/zh/domain/art` 返回 200 并列出 3 位画家（达芬奇 / 毕加索 / 弗里达·卡罗），en/ja 同理；sitemap 仍含全部 50 人 × 13 语（650 条人物 URL）+ 对比页。`typecheck` 三包全绿。**零新增第三方依赖**。
- **社交分享卡片真·多语言化（Stage 15：内嵌 CJK 字体子集，OG 图原生显示中文/日文/韩文/俄文）**：用户确认将 Stage 14 的 Latin-only OG 图推进为原生文字。方案：**Noto Sans CJK 按需子集化**——脚本 `scripts/gen-og-font.mjs` 扫描 `apps/api/data/persons.json`（seed + runtime）里 `zh/ja/ko/ru` 的 `names`/`occupations` 字段，叠加 `ui.ts` 的 `home.heroTitle/heroSub` 文案，用 `fontTools`/`pyftsubset` 从 17MB 源字体生成仅含实际使用字符的 **362KB 子集 OTF**（`apps/web/src/assets/og/NotoCJK-og.otf`），压缩比约 98%，同时覆盖汉字、假名、谚文、西里尔。字体加载器 `lib/og-font.ts` 按 `lang` 判断：人物卡/对比卡/默认卡/领域卡对 `zh/ja/ko/ru` 显示原生名字与标题（英文作副行），`ar`/`hi` 等不在字体覆盖范围的语言仍回退 Latin，避免豆腐块。实测：爱因斯坦中文卡显示「阿尔伯特·爱因斯坦」、达芬奇日文卡显示「レオナルド・ダ・ヴィンチ」、李小龙韩文卡显示「브루스 리」、居里夫人俄文卡显示「Мария Кюри」、中文首页卡显示「全球知名人物志」、中文对比卡显示「阿尔伯特·爱因斯坦 vs 埃隆·马斯克」、中文艺术领域卡显示「艺术领域影响力榜单」。人物/对比/领域/默认卡均注入 `fonts` 选项并设 `fontFamily` 以启用子集。新增 `npm run gen:og-font` 重跑子集，新增 `.gitignore` 排除临时字体源目录 `_fonts_src/` 与预览目录 `_ogout/`。**新增运行时第三方依赖：0**（`fontTools` 仅作用于构建/生成脚本，不进入 node_modules 运行时）。`typecheck` 三包全绿；OG 图各路由返回 `image/png` 1200×630；HTML 页面 `og:image` 与 `og:title` 已本地化验证。

---

## 路线图（对齐建设说明书三阶段）

- **阶段一 数据底座（0→1）**：✅ 前后端分离骨架、✅ 共享契约、✅ 种子人物（全领域/多语/关系）、✅ PostgreSQL + Neo4j 生产级存储适配器
- **阶段二 体验与流量（1→10）**：✅ **pgvector 向量检索 + RAG 事实问答**（`/ask` 问答页、语义检索 API）、✅ 交互式关系图谱可视化（二跳力导向）、✅ 领域榜单/聚合页（SEO 着陆）、✅ UGC 审核后台（`/admin`）、✅ PGC 专家背书与用户角色管理
- **阶段三 生态与变现（10→N）**：✅ 开放 API 数据授权（X-API-Key + 月度配额）、✅ 专业订阅（free/pro，提升配额）、✅ 图片上传与图集、✅ 社区评论（人物页讨论）、✅ **多语种扩展至 13 种（新增 de/ko/it/hi/id，每种均补 names/summary 译文 + hreflang/sitemap 全覆盖）**、✅ **13 语 UI 框架文案（导航/按钮/区块标题/表单/状态全本地化，新增 `lib/ui.ts` 字典 + `t()` 回退，客户端 NavBar 读 pathname 取 lang）**

---

## 开放 API 与生态（阶段三核心）

把「全球最大人物数据库」转化为可复用、可变现的平台能力：开发者用 API 密钥调用、专业用户享更高配额、社区在人物页沉淀讨论。

### 1. 开放 API 密钥（X-API-Key + 月度配额）
- 生成：`POST /me/apikeys`（JWT 登录后），返回 `gph_live_xxx` 明文（**仅此刻可见**）+ 8 位前缀；密钥以 SHA-256 存储，明文不外落。
- 管理：`GET /me/apikeys` 查看用量/配额条；`DELETE /me/apikeys/:id` 吊销。
- 调用：公开读接口（`/persons`、`/search`、`/search/semantic`、`/rag/ask`）支持 `X-API-Key` 头**替代 JWT**；每次成功调用自动 `usedMonth +1`。
- 配额：free=1000、pro=50000 次/月；月度滚动重置（`resetAt`）；超额返回 `429` 并附 `resetAt`。
- 实现：适配器统一 `createApiKey / listApiKeys / revokeApiKey / findApiKeyByHash / bumpApiUsage`；JsonStore 存 `runtime/apikeys.json`，PgNeo4jStore 存 `api_keys` 表。

### 2. 专业订阅（free / pro）
- `POST /me/subscribe` 切换套餐（**mock，无真实支付**；接入 Stripe 只需替换此端点）。
- pro 提升 API 密钥配额（创建密钥时按当时套餐固定），并带「专业版」标识。定价页 `/[lang]/pricing` 展示能力对比与一键升级；`/me` 返回 `plan`。

### 3. 图片上传与图集
- `POST /upload`（登录）：接收 `data:` base64 JSON（≤5MB，jpg/png/gif/webp），落盘 `apps/api/data/uploads/`，后端 `/uploads/*` 静态托管。
- 人物页展示 `images` 图集；登录用户可上传，写入 `PATCH /persons/:slug`。
- 生产建议：将 `saveUpload` 实现切换为对象存储（如腾讯云 COS），前端无需改动。

### 4. 社区评论
- 人物页 `Comments` 讨论区：`GET/POST /persons/:slug/comments`（POST 需登录）。
- 评论持久化于 `comments` 存储（JsonStore→`runtime/comments.json`，PgNeo4jStore→`comments` 表），按时间正序展示，是社区规模化的起点（后续可扩展点赞/回复/审核）。

### 5. 前端 13 语 UI 文案（界面本地化）
- 字典 `apps/web/src/lib/ui.ts`：`RAW`（key → 13 语种数组，顺序固定 `zh,en,es,fr,ja,ru,ar,pt,de,ko,it,hi,id`）+ `build()` 组装为 `UI[lang][key]`，导出 `t(lang, key)`（当前语种优先，缺失回退英文 → 中文 → key 本身）。开发期会断言每个 key 的翻译数量对齐 13。
- 客户端导航 `components/NavBar.tsx` 通过 `usePathname()` 取当前语种（非 `[lang]` 路由默认 zh），渲染 `t()` 本地化导航，并用 `useEffect` 动态设置 `<html lang>`；阿拉伯语自动 `dir="rtl"`。`components/Footer.tsx` 同理。
- 页面/组件统一调用 `t()`：首页、定价、账户、个人数据库(me)、管理后台(admin)、人物页、搜索、问答、领域榜、对比页、登录、注册，以及 `Comments`/`ImageUploader`/`SearchBar`/`PersonCard`/`AskClient`。`pricing`/`account`/`login`/`register`/`me`/`admin` 用 React `use(params)` 在 SSR 阶段即取正确语种（避免 hydration 前回退 zh）。
- **登录/注册/个人数据库(me)/管理后台(admin) 均已迁入 `/[lang]/login`、`/[lang]/register`、`/[lang]/me`、`/[lang]/admin`**（原根路由 `/login`、`/register`、`/me`、`/admin` 改为 `redirect('/zh/...')` 兼容旧链接），实现真正 100% 全站 13 语本地化；导航与 `account`/`pricing`/`me`/`admin` 的缺 token 重定向均带语种前缀（`/me`、`/admin` 登录后跳 `/[lang]/login`），登录/注册后跳 `/[lang]/account`。
- 数据层多语（人物 names/summary）见阶段三「多语种扩展」：API 与种子已含 13 语种译文，人物页按 `pickText` 回退英文。

---

## 备注

- MVP 默认用 JSON 文件存储（`apps/api/data/`，零原生依赖、开箱即跑）；**生产级适配器 PostgreSQL 16 + pgvector（系统记录 + 全文检索 + 向量检索）+ Neo4j 5（关系图谱）已实现**，通过 `STORE_DRIVER=pg-neo4j` 切换，前端代码无需改动。**向量检索与 RAG 事实问答已在阶段二落地**（`/search/semantic`、`/rag/ask`、`/[lang]/ask` 页）。嵌入模型默认本地 `Xenova/all-MiniLM-L6-v2`（384 维），可切 OpenAI 兼容服务；大模型未配置时 RAG 退化为抽取式作答。
- 所有密码使用 `scrypt` 哈希，JWT 鉴权；JSON 模式下运行时数据写入 `data/runtime/`，不污染种子。
