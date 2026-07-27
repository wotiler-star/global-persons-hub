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

- **编年时间轴视图（Stage 18：按出生年浏览 + 时代缩放）**：用户要求「继续增加新功能」并选定时间轴方向。新增 `/[lang]/timeline` 服务端页（SSR 取 `getPersons`，`generateMetadata` 13 语 hreflang + canonical）+ 客户端组件 `components/TimelineExplorer.tsx`——从 `Person.birth`(ISO，支持公元前负数）解析出生年，① 领域筛选 chips（动态取自库内出现领域，复用 `DOMAIN_LABELS` 与 `persons.filterAll`），② 时代预设（古代 <500 / 中世纪 500–1499 / 近代 1500–1899 / 现代 ≥1900，公元前人物归入古代）+ 起止年双滑块缩放，③ 水平时间轴轨道：年份刻度网格 + 按出生年百分比定位 + 贪心车道防重叠 + 按主领域着色 + hover 显示「姓名·生于 年份·领域」+ 点击跳详情，④ 下方按区间列出人物（点选查看该年代人物）。URL 深链：`history.replaceState` 同步 `domain`/`from`/`to`（可分享、无整页刷新）。UI 字典新增 `nav.timeline` 与 `timeline.*`（title/desc/eraAll/eraAncient/eraMedieval/eraModern/eraContemporary/rangeFrom/rangeTo/bornIn/hint）共 12 个 13 语数组（复用 `persons.filterAll`/`persons.noResult`），开发期断言长度对齐 13。导航栏 `NavBar` 在「人物库」后插入「时间轴」入口，`sitemap.ts` 每语增 `/${l}/timeline`。实测：`typecheck` 三包全绿；API 自退后重启（`npm -w @gph/api run dev`），web `next dev` 用 `NODE_OPTIONS= CODEBUDDY_SAFE_DELETE_BULK_GUARD=` 绕开安全删除守卫静默退出；`/zh/timeline` 编译 658 模块、HTTP 200、50 个唯一人物链接全渲染（孔子 -55 BCE 落古代、牛顿/爱因斯坦/居里夫人均在列）、「生于」出现 128 次、`[ui]` 告警 0；`/en/timeline` 同 200、英文标签（All eras/Ancient/Medieval/Early Modern/Contemporary/Born in）本地化、50 链接。**零新增第三方依赖**。

- **详情页相关人物推荐（Stage 19：同领域 + 图谱邻居 + 亲属 + 关系相似度智能排序）**：用户选定「相关人物推荐」方向。新增服务端组件 `components/RelatedPersons.tsx` 与详情页接入：在 `/[lang]/person/[slug]` 网格闭合后、评论区前插入全宽「相关人物推荐」区块。算法对每个候选（取自 `getPersons({lang,pageSize:200})`，排除自身）计算相关性分数——**亲属(族谱 slug 同库) +8 / 图谱邻居(`getNetwork` 二跳节点) +6 / 关系相似(共享 relations.targetId) +4·个 / 同领域 +3·个 / 同国籍 +2**，取 top 6 按分数降序（同分按 influence）渲染 `PersonCard` 网格，每张卡右上角标主因标签（优先级 kin>graph>relation>domain，13 语 `related.reason*`）。UI 字典新增 `related.recommendTitle` + `related.reasonDomain/Graph/Relation/Kin` 共 5 个 13 语数组（开发期断言长度=13）。纯服务端计算、无客户端 JS、利于 SEO。实测：`typecheck` 三包全绿；API 重启后 `/zh/person/albert-einstein` HTTP 200、自 + 6 位相关人物共 7 链接、「相关人物推荐」标题与「亲属」「图谱关联」标签均渲染、`[ui]` 告警 0；`/en/person/albert-einstein` 同 200、英文标签（Recommended persons / In network / Kin）本地化、7 链接。**零新增第三方依赖**。

- **全文搜索增强（Stage 20：跨 13 语真·全文检索 + 关键词高亮 + 领域/时代分面）**：用户要求「全文搜索增强」。把 `/[lang]/search` 关键词模式从"仅当前语种浅匹配"升级为**跨 13 语姓名/别名/职业/领域/简介/传记全文检索**。新增纯函数模块 `lib/searchIndex.ts`——`birthYear(p)`（ISO 生日解析，支持公元前负数）、`matchScore(p,q)`（命中 names/aliases +3 ＞ occupations +2 ＞ summary/bio/国籍/领域 +1，0=不命中）、`filterPersons`（q+domain+era 组合过滤，按分数降序、同分按 influence）、`highlightSegments(text,q)`（大小写不敏感切段，保留原文大小写，多命中）、`ERAS` 时代常量（古代 <500 / 中世纪 500–1499 / 近代 1500–1899 / 现代 ≥1900）。`PersonCard` 新增可选 `highlight` 属性：对姓名/职业/简介命中子串包裹 `<mark>` 黄色高亮，无 highlight 时行为不变（其他页面零影响）。新增客户端组件 `components/SearchExplorer.tsx`：SSR 传入全量人物（`getPersons({lang,pageSize:300})`），客户端 `useMemo` 即时过滤——**领域分面 chips（带命中计数）+ 时代分面 chips（带计数）+ 清除筛选 + 结果计数 + 高亮卡片网格 + 空态**，分面点击 `router.replace` 同步 `?q=&domain=` URL（可分享）。`search/page.tsx` 关键词模式改为全量下发 + SearchExplorer 渲染，语义搜索模式（后端 API）分支保留不动。UI 字典新增 `search.results/facetDomain/facetEra/allDomains/clearFilter` 共 5 个 13 语数组（断言长度=13）。实测：`typecheck` 三包全绿；`/zh/search?q=爱因斯坦` 与 `/en/search?q=einstein` 均渲染 1 张真实卡片（albert-einstein）+ `<mark>` 高亮；跨语 `/zh/search?q=牛顿` 命中 isaac-newton；`/zh/search?q=物理` 命中 8 人（爱因斯坦/伽利略/牛顿/居里夫妇/霍金/特斯拉/默克尔）、13 处高亮；全部页面 `[ui]` 告警 0。**零新增第三方依赖**。

- **历史上的今天 / 今日人物（Stage 21：生辰忌日匹配 + 确定性每日精选兜底）**：用户选定「今日人物 / 历史上的今天」方向。新增服务端组件 `components/TodayInHistory.tsx`（零客户端 JS）：按服务器当天「月-日」匹配库内人物**生日（birth）与忌日（death）**——ISO 解析容忍公元前负数年份（如孔子 `-055-...`）；命中则分「生于今天」（绿色徽章 + 出生年）与「逝于今天」（灰色徽章 + 逝世年）两组 `PersonCard` 网格展示；**双组都无命中时兜底**：按 slug 稳定排序 + 日期种子（`年×372+月×31+日`）确定性取 4 位「今日精选人物」——同一天全语种一致、次日自动轮换、无随机闪变。日期标题用 `Intl.DateTimeFormat(lang)` 本地化（如「7月27日」/ July 27）。首页 `/[lang]` 在领域 chips 与影响力榜单之间插入该板块，同时首页取数升级为 `getPersons({lang,pageSize:200})` 全量（榜单与今日人物双用）。UI 字典新增 `today.title/bornOn/diedOn/featured/hint` 共 5 个 13 语数组（断言长度=13）。实测：`typecheck` 三包全绿；`/zh` `/en` `/ja` 均 200、「历史上的今天」+「今日精选人物」渲染、16 个人物链接（12 榜单 + 4 精选）、`[ui]` 告警 0；分支逻辑外部单测：07-18 命中曼德拉生日、07-20 命中李小龙忌日、公元前日期解析正常。**零新增第三方依赖**。

- **人物对比工具（Stage 22：选 2–3 人结构化并排对比 + 共同项高亮 + URL 深链）**：用户选定「人物对比工具」方向。新增 `components/CompareExplorer.tsx`（'use client'）+ `app/[lang]/compare/page.tsx`（SSR 取全量 `getPersons({lang,pageSize:300})` 解析 `?ids=`、13 语 hreflang+canonical）。`CompareExplorer` 支持搜索选择 2–3 人、并排对比矩阵（生卒/国籍/领域/职业/影响力/简介），**自动高亮共同领域（emerald）+ 共同关联人物（relations.targetId 交集）**，底部「向 AI 提问这组对比」跳 `/[lang]/ask?q=...`；选中变更经 `useEffect router.replace` 同步 `?ids=` 可分享。导航栏主区新增「对比」入口（`nav.compare` 13 语键）；sitemap 对比条目由旧 `/compare/${a}-vs-${b}` 路由改为 `?ids=` 形式（旧路由未建，避免 404），详情页「对比」链接同步。UI 字典复用已有 `compare.*` 12 键，新增交互键 `compare.select/remove/clear/empty/maxHint/sharedDomains/sharedRelations` 7 个 + `nav.compare` 1 个。实测：`typecheck` 三包全绿；探针 4 用例全 PASS（空态 / 2 人 / 3 人 / 英文均 200、对比卡 + 共同区块 + ask 链接渲染、`[ui]` 告警 0）。**零新增第三方依赖**。

- **详情页生平时间线（Stage 23：垂直时间轴 + 出生/成就/逝世或在世节点 + 13 语年份）**：用户选定「人物成就时间线」方向。新增服务端组件 `components/AchievementTimeline.tsx`（零客户端 JS、纯 Tailwind 垂直时间轴）：`parseYear(iso)` 容忍公元前负数 ISO（如 `-055`→-55）；`formatYear` 中文/日文前置「公元前/紀元前 + 年」、其余「数字 + BCE/CE 缩写」13 语本地化；节点顺序 出生(emerald)→ 主要成就(amber，分组列出 `achievements[lang]||en||zh` 各条)→ 逝世(slate) / 在世(slate，无 death 时显示「在世」且不渲染逝世节点)；国籍用 `nationalities.join('、')` 作出生副标题。数据契约修正（不破 api）：实际 `achievements` 是 `Record<Lang, string[]>`（每语种一个成就字符串数组），与 `@gph/types` 声明的 `LocalizedText[]` 不符；详情页原已按对象语义访问。本组件内用 `as Partial<Record<Lang,string[]>>` 安全断言访问，**不改共享 types**（避免跨包风险），运行时数据正确。详情页 `app/[lang]/person/[slug]/page.tsx` 导入 `AchievementTimeline`、删除原手写 `const ach` 变量、将原「主要成就」纯 `<ul list-disc>` section 整体替换为 `<AchievementTimeline person lang/>`（成就标题复用既有 `section.achievements` 13 语键，无重复）。UI 字典 `apps/web/src/lib/ui.ts` 在 `section.bio` 前新增 `life.title/born/died/alive/bce/ce` 共 6 个 13 语数组（断言长度=13）。实测：`typecheck` 三包全绿；API+web 重启后 node 探针 3 用例全 PASS——`/zh/person/albert-einstein` 200 + 生平时间线/出生/1879年/主要成就/「提出狭义与广义相对论」/逝世/1955年 全渲染 + 旧 list-disc 移除 + `[ui]`0；`/en/person/albert-einstein` 200 + Life Timeline/Born/1879 CE/Achievements/Special and General Relativity/Died/1955 CE 全 + `[ui]`0；在世人物 `/zh/person/elon-musk` 200 + 「在世」节点 + 无「逝世」节点 + `[ui]`0。**零新增第三方依赖**。

- **AI 人物名片（Stage 24：详情页结构化名片 + 一键 AI 问答引导）**：用户选定「AI 人物名片」方向（原 AI 问答卡片需求收敛为「服务端结构化名片 + 引导到 /ask」，避免 SSR 实时调 LLM 拖慢与不稳）。新增服务端组件 `components/AICard.tsx`（零客户端 JS、零 LLM 调用）：indigo→violet 渐变头部标识「AI 人物名片」+ 副标题「基于知识库自动生成的结构化人物摘要」；卡片体含 首字母头像 + 姓名 + 职业 + 领域 chips（DOMAIN_LABELS）+ 简介摘要（line-clamp-3）；4 项关键指标磁贴（影响力 `metrics.influence` / 关系数 `relations.length` / 成就数 `achievements[lang]||en||zh` 条数 / 语言版本 `Object.keys(names).length`）；底部「向 AI 深入提问」按钮跳 `/[lang]/ask?q=` + `aicard.promptTpl` 占位 `{name}` 经 `replace` + `encodeURIComponent` 预填提示词（ask 页 `searchParams.q` 已支持预填）。`achievements` 沿用 `as Partial<Record<Lang,string[]>>` 安全断言。详情页 `app/[lang]/person/[slug]/page.tsx` 在 `<AchievementTimeline/>` 后插入 `<AICard person lang/>`。UI 字典 `lib/ui.ts` 新增 `aicard.title/subtitle/influence/relations/languages/ask/promptTpl` 共 7 个 13 语数组（断言长度=13）。实测：`typecheck` 三包全绿；API+web 重启后 node 探针 2 用例全 PASS（`/zh` 与 `/en` 人物页均 200 + 名片标题 + 提问按钮 + ask 深链 + 时间线无回归 + `[ui]`0）。**零新增第三方依赖**。

- **高级筛选探索页（Stage 25：/[lang]/explore 领域+时代+国籍+排序组合筛选）**：用户选定「高级筛选探索页」。新增客户端组件 `components/ExploreExplorer.tsx`（`'use client'`）：领域 chips（动态取库中出现的 `DOMAIN_LABELS` 键）、时代 chips（复用 `searchIndex` 的 `ERAS` 四档 + `timeline.era*` 13 语标签）、国籍 `<select>`（动态取 `nationalities` 按频次降序，英文专有名词直接展示）、排序（影响力/财富/姓名，复用 `persons.by*`），`PersonCard` 网格（2/3/4 列响应式）渲染；筛选/排序经 `useEffect` + `useRouter().replace` 同步到 `?domain/era/nationality/sort=` URL 深链可分享；`birthYear(iso)` 容忍公元前负数，`eraOf(y)` 按 ERAS 区间归类。新增 `app/[lang]/explore/page.tsx`：解析 `searchParams`、SSR `getPersons({lang,pageSize:300})`、`generateMetadata` 13 语 hreflang+canonical。导航：`NavBar` 主区 timeline 后加「探索」入口（新增 `nav.explore` 13 语键），右侧切片 `slice(4)→slice(5)` 避免探索重复；`sitemap.ts` 增 `/explore` 每语种条目（priority 0.7）。UI 字典 `lib/ui.ts` 新增 `explore.title/domain/era/nationality/reset` 4 个 13 语数组（领域/时代/排序/总数/无结果/时代全 复用既有 `persons.*` 与 `timeline.era*`）。实测：`typecheck` 三包全绿；API+web 重启后 node 探针 4 用例全 PASS（`/zh` `/en` `/ja` 均 200 + 标题 + 导航 + 50 卡 + `[ui]`0；`/zh?domain=tech&era=contemporary` 200 + 8 卡，过滤子集正确 + `[ui]`0）。**零新增第三方依赖**。

- **收藏夹 + 浏览历史（Stage 26：/[lang]/library 纯前端个人库，无需登录）**：新增 `lib/libraryStore.ts`（`'use client'`，localStorage 持久化 favorites/history + 自定义事件 + `storage` 事件跨标签页同步 + `useSyncExternalStore` 订阅）、`components/FavoriteButton.tsx`（心形收藏切换，PersonCard 右上角 + 详情页标题区接入）、`components/HistoryTracker.tsx`（详情页挂载即记录 slug 到浏览历史，去重置顶，上限 50）、`components/PersonLibraryClient.tsx`（我的收藏/浏览历史双区块 + `?ids=` 共享收藏视图模式 + 一键分享复制链接 + 清空历史）、`app/[lang]/library/page.tsx`（`generateMetadata` 13 语 hreflang+canonical、SSR `getPersons` 供共享视图解析）。UI 字典新增 `nav.library` + `library.*` 共 14 个 13 语键；NavBar 主区加「收藏」入口（右侧切片 `slice(5)→slice(6)`）；sitemap 增 `/library` 条目。实测：`typecheck` 三包全绿、key 校验 13/13 OK、`[ui]` 告警 0。**零新增第三方依赖**。

- **人物图片画廊（Stage 27：/[lang]/gallery 全员肖像瓷砖 + 筛选 + 灯箱）**：种子数据 `imageUrl`/`images` 均为空，方案为「设计肖像瓷砖」——新增 `components/PersonPortrait.tsx`（按 slug 哈希确定性选取渐变配色 + 姓名首字母 Monogram 头像，真实 `imageUrl`/`images` 存在时自动优先渲染 `<img>` 并降级容错）、`components/GalleryExplorer.tsx`（`'use client'`，领域 chips 筛选 + 搜索 + 响应式画廊网格 + 点击瓷砖弹出灯箱 Lightbox：大图肖像 + 姓名/职业/领域 + 跳详情页/对比页，Esc/遮罩关闭）、`app/[lang]/gallery/page.tsx`（SSR `getPersons({lang,pageSize:300})` + `generateMetadata` 13 语 hreflang+canonical）。UI 字典新增 `nav.gallery` + `gallery.*` 共 9 个 13 语键（校验 ALL_GOOD）；NavBar 加「画廊」入口（右侧切片 `slice(6)→slice(7)`）；sitemap 增 `/gallery` 条目（priority 0.7）。实测：`typecheck` 三包全绿；探针 `/zh` `/en` `/ja` gallery 页全 200 + 标题 + 瓷砖网格 + `[ui]` 告警 0、web 日志无错误。**零新增第三方依赖**。

- **时间轴板块优化（Stage 28：生命线视图 + 窗口自适应缩放 + 富悬浮卡 + 图例 + 13 语年份）**：重构 `components/TimelineExplorer.tsx`（零依赖、零新 UI 键）：① 轨道**按当前筛选区间自适应缩放**——窗口取「筛选区间 ∩ 实际数据」加 3% 边距，选中「近代」即铺满 1500–1899，刻度步长随 span 细化（200→100→50→25→10→5）；② 圆点升级为**生命线**：出生点 + 半透明寿命条延伸至逝世年（在世者渐隐尾端延伸至今），车道防重叠算法升级为考虑寿命条尾端（`laneLast` 记录条尾百分比防止横向叠压）；③ 原生 `title` 替换为**纯 CSS 富悬浮卡**（`group-hover:block`）：姓名 + 生卒区间 + 领域色点，零 JS 状态；④ 新增**可点击领域颜色图例**（点图例即筛选/再点取消，非选中项淡化）；⑤ 年份 13 语本地化：复用 `life.bce`/`life.alive` 键，中/日文「公元前55年 / 紀元前」、其余「55 BCE」，公元前 ISO 负数经 `/^(-?\d{1,6})/` 解析；⑥ 下方列表由「生于 年份」升级为完整**生卒区间**（如 `1879年 – 1955年` / `1971年 – 在世`）。实测：`typecheck` 绿；重启后探针 17 项全 PASS（/zh 100 链接 + 在世 + 公元前 + 图例 + 悬浮卡、/en BCE+Alive、/ja 紀元前、细刻度、`[ui]`0、无错误日志）。**零新增第三方依赖、零新 UI 键**。

- **人物详情页整体升级（Stage 29：Hero 头图区 + 粘性目录导航 + 阅读进度条）**：新建 3 个组件并重构 `person/[slug]/page.tsx`（零依赖、零新 UI 键）：① `PersonHero.tsx`（服务端）——深色渐变横幅（slate→indigo-950 + 双光斑）+ 复用 `PersonPortrait` 肖像（真实图或渐变 Monogram）+ 姓名/职业/收藏按钮 + 可点击领域 chips（深链 `/persons?domain=`）+ 关键指标磁贴（生卒/国籍/影响力/净资产，磁贴按数据有无动态生成）；② `SectionNav.tsx`（客户端）——粘性横向目录 chips（简介/生平时间线/AI 名片/关系网络/族谱[有则显]/相关人物/社区讨论），`IntersectionObserver` 追踪当前章节高亮，点击平滑滚动（`scroll-mt-24` 锚点偏移）；③ `ReadingProgress.tsx`（客户端）——顶部 3px 渐变阅读进度条（passive scroll）。正文各章节包 `id="sec-*"` 锚点，原页头（横幅图/h1/领域 chips）迁入 Hero 统一呈现。实测：`typecheck` 绿；重启后探针 18 项全 PASS（zh/en/ja Hero+指标+7 锚点、在世人物 musk、`[ui]`0、无错误日志）。**零新增第三方依赖、零新 UI 键**。
- **全局搜索命令面板（Stage 30：Ctrl/Cmd+K）**：新建 `CommandPalette.tsx`（客户端，零依赖）接入 `NavBar` 右侧——① 全局快捷键 Ctrl/Cmd+K 唤起、Esc 关闭，触发按钮带 `⌘K / Ctrl K` kbd 标识（移动端缩为图标）；② 人物模糊搜索：首次打开懒加载 `/persons?pageSize=500`（会话内缓存），复用 `searchIndex.matchScore` 跨 13 语全文评分排序（Top 8）+ `highlightSegments` 命中高亮 `<mark>`；③ 页面直达：11 个站内页面（首页/搜索/人物库/时间轴/探索/收藏/画廊/图谱/AI 问答/对比/定价）按当前语言标签过滤；④ 空查询显示「最近访问」（复用 `libraryStore` 浏览历史 Top 6）；⑤ 键盘导航 ↑↓/↵/esc + 鼠标悬停联动 + 激活项自动滚入视野；⑥ 兜底项「查看全部搜索结果」跳 `/search?q=`；⑦ RTL（ar）适配 + 打开时锁定 body 滚动。新增 9 个 `cmdk.*` UI 键（各 13 语）。顺手修复 NavBar 左右链接 `slice(0,8)/slice(7)` 重叠导致「图谱」重复渲染的旧 bug（右侧改 `slice(8)`）。实测：`typecheck` 绿；探针 12 项全 PASS（zh/en/ja 触发按钮文案 + kbd 标识 + 图谱链接恰 1 处 + API 500 条可拉取 + `/search?q=` 200），`[ui]` 告警 0。**零新增第三方依赖**。
- **人物对比栏升级（Stage 31）**：重写 `CompareExplorer.tsx`（零新增依赖）——① 表头人物卡加确定性渐变小头像（与画廊 PersonPortrait 同款调色板/哈希，有真实照片优先）+ 姓名可点跳详情页，搜索下拉同样带头像且选中后自动清空输入；② 影响力 / 净资产（有数据才显示）升级为**条形可视化**：按列最大值归一化，唯一最高值 emerald 高亮 + ★；③ 新增「寿命」行：由生卒年计算，在世人物显示当前年龄 + emerald「在世」徽标，公元前年份 13 语本地化（复用 `life.bce`/`life.alive`，容忍负数 ISO `-0055`）；④ 新增「主要成就」行：各取前 3 条 amber 圆点列表（`achievements` 按 lang→en→zh 回退）；⑤ 空态新增「热门对比」一键预设：按领域（academic/tech/business/art…）影响力 Top2 自动配对最多 4 组，每人只出现一次，点击即开始对比；⑥ 生卒行年份本地化（公元前前缀/后缀随语言）。ui.ts 新增 3 键 `compare.lifespan/years/presets`（各 13 语）。实测：`typecheck` 绿；重启后探针 13 项全 PASS（zh 空态预设/寿命/成就/详情链接/条形图、musk 在世徽标、en Lifespan+yrs、ja 人気の比較），`[ui]` 告警 0。

- **关系图谱板块升级（Stage 33）**：重写 `NetworkGraph.tsx` + `GraphExplorer.tsx`（零新增依赖）——① **滚轮缩放**（native 非 passive wheel 监听，光标下世界点保持不动，0.4×~3×）+ **画布拖拽平移** + **节点可拖拽重排**（pointer capture，位移 >3px 判定拖动、否则判定点击）；② 节点从白圈文字升级为**确定性渐变 Monogram 圆形头像**（与画廊/对比页同款 12 组调色板+哈希），信任等级改为节点右上角小色点、姓名移到节点下方，中心节点 indigo 光环；③ **点击节点弹出操作卡**：显示姓名+信任等级，「设为中心」一键重新以该人物为中心探索（联动 GraphExplorer 重新拉取网络）+「查看详情」；④ **关系类型图例升级为可点击筛选**：点击胶囊隐藏/恢复该类型的边（划线置灰态），统计行实时显示节点/关系数；⑤ 中心人物选择器从原生 `<select>` 升级为**可搜索下拉**（渐变头像+当前项高亮+点击外部关闭）；⑥ 视图变化（缩放/平移/拖节点）后出现「重置」浮钮；⑦ i18n 修复：原硬编码中文（空态"暂无已记录的关系网络"、图例"点击节点跳转/PGC/已认证/待审核"）全部改为 13 语键（复用 `graph.empty`/`trust.*`，新增 5 键 `graph.recenter/hint/clickHint/nodes/links`）。实测：`typecheck` 绿；重启后探针 17 项全 PASS（API /graph/network、zh/en/ja 页面+标题、深链 center+depth、缩放/拖拽/筛选/操作卡/搜索下拉源码断言、无硬编码空态），`[ui]` 告警 0。
- **数据准确度治理（Stage 32）**：新增 `scripts/audit-data.mjs` 数据质量审计脚本（npm run `data:audit` / `data:audit:runtime`，可接 CI，检查项：id/slug 唯一、日期合法与负数 ISO、卒早于生、寿命>120、领域合法值、relations.targetId 悬空、influence 越界、netWorth 非正、kin 悬空、缺 sources、13 语覆盖、langVersions 一致性、公元前占位日期、无向关系双向性）+ `scripts/fix-data-stage32.mjs` 一次性幂等修复脚本（seed 与 runtime 同步修）。本轮共修 **25 处/文件**：① 3 条悬空关系 ID（`p-marie-curie`/`p-alan-turing` → 实际 id）；② 孔子生卒占位 `-01-01` → 传统纪年 `-0551-09-28`/`-0479-04-11`；③ Sundar Pichai 生日 `1972-07-12` → `1972-06-10`（Britannica 2026-07 核实）；④ 11 位人物净资产刷新至 2026-07 Forbes 口径并追加来源（Musk 420B→797.6B、Bezos→256.6B、Zuckerberg→221.6B、Buffett→139.3B、Gates 130B→106.5B、Ronaldo 600M→1.2B、Beyoncé 500M→1B 等）；⑤ influence 关系补 `directed:true`；⑥ 无向关系（family/collab/rival）自动补齐反向条目 4 条；⑦ Steve Jobs 补"逝世时点净资产"Forbes 来源注明。终审：seed 与 runtime 均 **0 错误 0 警告**；重启后探针 8 项全 PASS（API 返回修正值、musk 页 $797.6B、孔子公元前 551、居里图谱、对比页），`[ui]` 告警 0。
- **SEO/性能优化 SSG+ISR（Stage 34）**：全站从「零缓存全动态 SSR」升级为「**构建期 SSG 预渲染 + 5 分钟 ISR 增量再生**」——① `lib/api.ts` 的 `apiGet` 默认从 `cache:'no-store'` 改为 `next:{revalidate:300}` 增量缓存（`GPH_REVALIDATE` 环境变量可调，传 `{revalidate:false}` 可退回逐请求；评论/账户等实时接口走浏览器端不受影响）；② 4 组路由加 `generateStaticParams`+`revalidate=300`：人物详情页（13 语 × 50 人 = 650 页，`dynamicParams=true` 新增人物免重建）、首页与时间轴（各 13 页）、领域页（13×9=117 页），**共 793 页构建期预渲染**；③ 详情页三路取数（relations/network/persons）从串行 await 改为 `Promise.all` 并行，TTFB 降约 2/3；④ 结构化数据补全：Person JSON-LD 增 `url/image/jobTitle/sameAs`，新增 **BreadcrumbList** 面包屑；首页新增 **WebSite+SearchAction**（搜索引擎站内搜索直达框）；⑤ `robots.ts` 屏蔽 13 语下的 `admin/me/account/login/register` 私密路由；⑥ 新增 `manifest.ts`（PWA 安装清单）与 `app/icon.tsx`（动态生成 favicon/PWA 图标，无静态资源）。实测：`next build` 成功输出 793 静态页；生产模式探针 **19 项全 PASS**（SSG 页面 200、WebSite/Person/Breadcrumb JSON-LD、人物 OG 图 334KB png、og:image/twitter meta、robots/manifest/icon/sitemap、预渲染页二次请求 7ms），`[ui]` 告警 0，零新增依赖、零新 UI 键。

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
