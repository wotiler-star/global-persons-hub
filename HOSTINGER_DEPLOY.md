# Hostinger 共享云主机部署指南（单进程版）

> 适用场景：Hostinger「Node.js Web App」共享云主机（仅能稳定运行**一个** Node 进程）。
> 本仓库已按此目标改造：**原 Fastify 独立后端（:8787）已折叠进 Next.js 的 Route Handlers**，
> 前端与 API 同源（`/api`），由 `next start` 单进程同时承载页面与接口。

---

## 1. 架构变化（为什么能跑在 Hostinger）

| 原架构（双进程） | 改造后（单进程，适配 Hostinger） |
| --- | --- |
| 前端 Next.js（:3000）+ 后端 Fastify（:8787） | 单一 Next.js 进程（端口由 `process.env.PORT` 提供） |
| 前端跨域调用 `http://127.0.0.1:8787` | 前端同源调用 `/api`（无跨域） |
| 后端读 `apps/api/data/persons.json` | 数据随前端自含于 `apps/web/data/persons.json` |

- 只读数据层（`apps/web/src/lib/server/store.ts`）仅依赖 Node 内置模块（`fs`/`path`/`crypto`），**零外部运行时依赖**，可在共享云主机常驻。
- 语义检索（RAG）使用**哈希向量余弦**，零依赖、零网络，任意环境可用；配置 `GPH_LLM_API_URL` 后可接入生成式作答。
- 写类接口（注册/登录/评论/支付）在只读部署下**友好降级**：返回 `401`/`503` 并附说明，不会崩溃。

### 1.1 只读部署已内置的性能优化（共享主机减负）
- **读接口缓存头**：所有只读 GET 接口（`/api/persons`、`/api/relations`、`/api/search`、`/api/search/semantic`、`/api/graph/*`、`/api/rag/ask`、`/api/payments/providers`、`/api/health`）返回 `Cache-Control: public, max-age/s-maxage + stale-while-revalidate`，浏览器与 Hostinger 边缘/CDN 可直接缓存命中，显著减少重复计算与回源请求。
- **语义检索进程内缓存**：`store.semanticSearch` 对相同 `query|lang|limit` 缓存结果（数据进程内不可变），热路径免重排。
- **向量按人物缓存**：`embedCache` 按人物缓存哈希向量，避免重复编码。
- **精简依赖**：见 §3.2，安装只装 web workspace，避免重型 api 依赖拖慢共享主机安装。

---

## 2. 环境要求

- Hostinger 面板创建「Node.js Web App」。
- Node.js 版本：**18.18+ / 20+**（推荐 20 LTS）。
- 应用根目录指向仓库根：`global-persons-hub/`。
- 运行入口：`npm`（Hostinger 会按下面的脚本执行 install → build → start）。
- 端口：Hostinger 注入 `process.env.PORT`，**无需在代码里写死端口**（Next.js 原生支持）。

---

## 3. 部署步骤

### 3.1 上传代码
通过 Git 自动部署，或 FTP/文件管理器上传整个 `global-persons-hub/` 目录（建议含 `.git` 以便后续更新）。

> 注意：`apps/web/data/persons.json` 是数据源（约 2MB，含 88 位人物 + 13 语亲属资料），**必须随仓库一同上传**。

### 3.2 配置 Node.js App（hPanel）

在 Node.js Web App 设置中填写：

- **Node.js 版本**：20.x（或 18.18+）
- **应用根目录**：`global-persons-hub`（仓库根）
- **启动文件 / 入口命令**：`npm start`
- **构建命令**：`npm run build`
- **安装依赖命令**：`npm install --workspace @gph/web`（推荐，见下方说明）
- **环境变量**（见 §4）

> **精简安装（强烈推荐）**：仓库是 npm workspaces，根 `npm install` 会连 `@gph/api`（Fastify/pg/neo4j/openai 等重依赖）一起装，
> 但 Hostinger 单进程只读版**完全不需要 `@gph/api`**（后端已折叠进 web）。请在 hPanel 的「安装依赖命令」填：
> ```bash
> npm install --workspace @gph/web
> ```
> 该命令只装 `@gph/web` + 其依赖 `@gph/types`（含 devDeps：next/typescript/tailwind），安装更快、node_modules 更小，
> 且能避开共享主机因依赖过多导致的安装超时/失败。若面板只支持固定 `npm install`，也能跑通（只是会多装 api 包，无害）。

Hostinger 的执行顺序等价于：

```bash
npm install --workspace @gph/web   # 只装 web + types
npm run build    # = npm -w @gph/web run build  ->  next build
npm start        # = npm -w @gph/web run start  ->  next start  (读取 PORT)
```

> 根 `package.json` 的 `start`/`build` 已委派到 `@gph/web` workspace，`next.config.mjs` 默认**不使用** `output: standalone`，
> 因此 `next start` 可正常启动（Hostinger 用 `next start`，非 standalone server）。
> 若走 Lighthouse(pm2) 部署，才需在构建时设 `NEXT_OUTPUT=standalone`。

---

## 4. 环境变量

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `PORT` | 自动 | Hostinger 注入 | 监听端口，由平台提供，不要手动改 |
| `NODE_ENV` | 自动 | `production` | Hostinger 生产环境自动设为 production |
| `NEXT_PUBLIC_API_BASE` | 否 | `/api` | 前端调用 API 的基址；同源部署保持 `/api` 即可 |
| `GPH_DATA_DIR` | 否 | `apps/web/data` | 人物数据目录；默认读取 `cwd/data/persons.json`，一般无需改 |
| `GPH_EMBED_DIM` | 否 | `384` | 哈希向量维度，影响语义检索粒度 |
| `GPH_LLM_API_URL` | 否 | 空 | 若配置，RAG 可走生成式大模型；为空则走零依赖抽取式作答 |
| `NEXT_PUBLIC_SITE_URL` | 否 | 空 | 站点正式域名；以 `https://` 开头时自动下发 HSTS |

示例（hPanel 环境变量面板）：

```
NEXT_PUBLIC_API_BASE=/api
GPH_DATA_DIR=/home/uXXXXXXX/public_html/global-persons-hub/apps/web/data
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

---

## 5. 数据更新流程

人物数据集中在 **`apps/web/data/persons.json`**（仓库内、随部署发布）。

1. 在本地修改 `apps/web/data/persons.json`（或开发态改 `apps/api/data/persons.json` 后经脚本同步）。
2. 提交并推送到 Git。
3. Hostinger 触发重新部署（`npm install && npm run build && npm start`），新数据随构建生效。
4. 若需**不重新构建**热更新数据：直接通过文件管理器覆盖服务器上的 `apps/web/data/persons.json`，然后重启 Node.js App 即可（store 为进程内单例，重启后重新加载）。

> 当前为**只读部署**：不支持通过 API 写入新人物。如需后台录入/审核，请使用原双进程（PG/Neo4j）架构或后续扩展写接口。

---

## 6. 接口对照（同源 `/api`）

| 路由 | 方法 | 说明 | 只读行为 |
| --- | --- | --- | --- |
| `/api/health` | GET | 健康检查 | 始终 200 |
| `/api/persons` | GET | 人物列表（q/domain/lang/分页） | 200 |
| `/api/persons/[slug]` | GET | 人物详情 | 200 / 404 |
| `/api/relations/[id]` | GET | 关系邻接 | 200 / 404 |
| `/api/search` | GET | 关键词搜索 | 200 |
| `/api/search/semantic` | GET | 语义检索（哈希向量） | 200 |
| `/api/graph/network/[id]` | GET | 多跳关系网络 | 200 / 404 |
| `/api/graph/path/[from]/[to]` | GET | 两人最短关系路径 | 200 / 404 |
| `/api/rag/ask` | GET/POST | 事实问答（抽取式 RAG） | 200 |
| `/api/me` | GET | 当前用户 | 未登录 401 |
| `/api/auth/login` `/register` | POST | 登录/注册 | 只读版 503 |
| `/api/auth/logout` | POST | 登出 | 200 |
| `/api/persons/[slug]/comments` | GET/POST | 评论 | GET `[]` / POST 503 |
| `/api/payments/providers` | GET | 支付渠道清单 | 静态 200 |

---

## 7. 故障排查

- **页面打不开 / 502**：确认 hPanel 里「应用根目录」指向仓库根、`npm start` 能跑起来；查看「日志」里的 `next start` 输出。
- **`next start` 启动即退出并提示 standalone**：本仓库 `next.config.mjs` 已默认关闭 standalone；若你手动开启了 `NEXT_OUTPUT=standalone`，请移除（Hostinger 用 `next start`，不支持 standalone 输出）。
- **`/api/*` 全部 404**：确认 `apps/web/src/app/api/**` 已部署，且 `npm run build` 成功（动态路由会在构建日志中以 `ƒ` 标记）。
- **语义检索 / RAG 返回 500**：检查 `apps/web/data/persons.json` 是否为合法 JSON 且存在；store 对字段形态做了容错，但仍需 JSON 可解析。
- **数据未更新**：修改 `persons.json` 后需重新部署或重启 Node.js App 进程。
- **内存占用偏高**：共享主机内存有限时，可下调 `GPH_EMBED_DIM`（如 128）减少向量计算开销；本应用为只读单进程，常规 1GB+ 内存即可运行。

---

## 8. 本地冒烟测试（可选）

部署前可在本地用相同方式验证：

```bash
cd apps/web
NODE_OPTIONS="" PORT=3300 npm run start
# 另开终端
curl -s "http://127.0.0.1:3300/api/health"            # 期望 {"ok":true,...}
curl -s "http://127.0.0.1:3300/api/persons?pageSize=2" # 期望真实人物数组
curl -s "http://127.0.0.1:3300/api/rag/ask?q=Einstein&lang=zh" # 期望抽取式答案
curl -s "http://127.0.0.1:3300/api/graph/path/p-einstein/p-isaac-newton" # 期望路径节点
# 检查缓存头
curl -sI "http://127.0.0.1:3300/api/persons" | grep -i cache-control
```

预期：各接口 200 且返回真实数据；`/api/persons` 响应头含 `Cache-Control: public, ...`。

---

## 9. 多语言 SEO（独立 URL + hreflang + 内链 + 站点地图）

本应用已内置完整的多语言 SEO 体系，部署后默认生效。**关键前提**：必须在环境变量中设置
`NEXT_PUBLIC_SITE_URL` 为你的真实域名（含 `https://`），否则 hreflang 与站点地图会指向
`localhost`，搜索引擎无法正确收录。

### 9.1 可抓取的独立 URL（子目录形态）
- 每个语言版本拥有独立、可抓取的 URL：`/zh/...`、`/en/...`、`/es/...`、`/fr/...`、`/ja/...`、
  `/ru/...`、`/ar/...`、`/pt/...`、`/de/...`、`/ko/...`、`/it/...`、`/hi/...`、`/id/...`
  （共 13 种，均在 `packages/types` 的 `LANGS` 中定义）。
- 子目录形态对 Hostinger 单进程零额外配置（无需子域名 DNS / 证书），推荐此形态。

### 9.2 `<html lang>` 按语言输出（服务端）
- `apps/web/src/app/[lang]/layout.tsx` 按当前语种渲染正确的 `<html lang="...">`（BCP-47，
  如 `zh`→`zh-CN`、`pt`→`pt-BR`），阿拉伯语额外输出 `dir="rtl"`。
- 根布局（`app/layout.tsx`）改为透传，避免所有语言版被写死成 `zh-CN`。
- 这让 Google/Bing 正确判定每个页面的语言，配合 hreflang 避免重复内容惩罚。

### 9.3 hreflang 交替链接（页面 `<head>` + 站点地图）
- 每个页面 `generateMetadata` 输出 `alternates.languages`：`<head>` 中生成
  `<link rel="alternate" hrefLang="xx" href="https://域名/xx/...">`，覆盖全部 13 语 + `x-default`
  （指向英文版）。经 `metadataBase` 解析为绝对地址。
- `sitemap.xml` 每条 URL 附带 `xhtml:link rel="alternate" hreflang=...`（13 语 + x-default），
  并在 `<urlset>` 声明 `xmlns:xhtml` 命名空间。

### 9.4 跨语言内链（可抓取）
- `LangSwitch` 组件（导航栏，所有语言版页面均有）渲染真实 `<a href="/xx/...">` 锚点
  （含 `hreflang`/`lang` 属性），而非旧版的 `<select>`+`router.push`（后者不产锚点、爬虫不可见）。
- 每个语言版都互相链接到**同一页面**的其他语言版本，形成完整跨语言内部链接网。

### 9.5 站点地图与 robots
- `sitemap.xml`：1625+ 条 URL（语言首页、人物库/时间轴/探索/收藏/画廊/图谱/定价/问答/搜索、
  领域榜单页、全部人物详情页、影响力 TOP 对比页），全部含 hreflang 交替。
- `robots.txt`：放行全站、屏蔽 `/admin`/`/me`/`/account`/`/login`/`/register`，
  显式允许主流 AI 爬虫，并声明 `Sitemap:` 与 `Host:`。

### 9.6 部署检查清单
1. 设置 `NEXT_PUBLIC_SITE_URL=https://你的域名`（hPanel 环境变量）。
2. `npm run build` → `npm start`。
3. 验证：`curl -s https://你的域名/en/person/albert-einstein | grep -o 'hrefLang="[a-z-]*"'`
   应看到 13 种语言码 + `x-default`；`curl -s https://你的域名/sitemap.xml | grep -c '<loc>'`
   应远大于 1000；`curl -s https://你的域名/robots.txt` 含 `Sitemap:`。
4. 在 Google Search Console 提交 `sitemap.xml` 并做国际定位（国际目标）配置。
