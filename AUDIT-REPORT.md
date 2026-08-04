# 生产就绪审计报告 — global-persons-hub

- **日期**：2026-08-04
- **范围**：`apps/api`（Fastify 路由/存储/部署/安全）、`apps/web`（Next.js 错误边界/代理/安全头/XSS 面）
- **方法**：静态走读关键文件（server.ts / routes.ts / json-store.ts / store/index.ts / web lib/api.ts / next.config.mjs / .gitignore）+ 运行时配置核对
- **结论**：代码整体质量良好，已具备统一错误兜底、JWT+吊销、上传校验、密钥不入库、SSG/ISR、优雅退出。上线前建议处理 **P0 ×1（配置）、P1 ×2（健壮性/内容安全）、P2 ×4（加固）**，P3 为可选打磨。

---

## 总体评分

| 维度 | 状态 | 说明 |
|---|---|---|
| 路由鉴权 | 🟢 良好 | auth/moderator/admin 分层 + 开放 API 软前置（无 key 透传、有 key 计配额） |
| 错误处理 | 🟡 中等 | 后端有 setErrorHandler；**前端缺 error.tsx/not-found.tsx** |
| 存储可靠性 | 🟡 中等 | pg-neo4j 生产可用；**JSON 默认适配器非原子写、无锁** |
| 安全配置 | 🔴 风险 | 缺省弱 JWT 密钥 / 管理员密码，依赖部署注入环境变量 |
| 输入校验 | 🟢 良好 | 上传/评论/角色枚举/names 非空均有校验 |
| 密钥管理 | 🟢 良好 | .gitignore 覆盖 .env* 与 deploy/.secrets*，仅 .env.example 入库 |
| SEO/GEO | 🟢 良好 | SSG/ISR + metadataBase + 动态 OG（详见下一阶段核查） |

---

## 风险清单（按严重度）

### 🔴 P0 — 上线阻断（配置/安全）

**[P0-1] 默认弱密钥与管理员密码**
- `server.ts`：`JWT_SECRET` 缺省 `'dev-secret-change-me'`（已打印告警）；`GPH_ADMIN_PASSWORD` 缺省 `'admin123456'`（**无告警**）。
- 若生产部署未注入上述环境变量，任何人都可用默认密码登录后台、用弱密钥伪造 JWT。
- **修复**：
  1. 缺省 admin 密码时启动即打印高亮告警（`console.warn` 红字）；
  2. 部署模板 `deploy/.env.example` 强制填写，并在 `lighthouse-deploy.ps1` 启动前校验非空；
  3. 可选：未设置 `JWT_SECRET` 时拒绝启动（而非仅告警）。

### 🟠 P1 — 高（健壮性 / 内容安全）

**[P1-1] 前端缺应用级错误边界与 404**
- 全仓搜索无 `error.tsx` / `not-found.tsx` / `loading.tsx` / `global-error.tsx`（含 `apps/web/src/app`）。
- 服务端取数（ISR 5 分钟窗口内 API 抖动/超时）抛错会冒泡为 Next 默认 500/空白页；`notFound()` 无品牌化 404。
- **修复**：新增 `apps/web/src/app/[lang]/error.tsx`（client，`reset` 重试）、`not-found.tsx`、`loading.tsx`，以及 root `app/error.tsx` + `global-error.tsx`。

**[P1-2] 评论即时公开、无审核队列、无频控**
- `addComment` 直接 `status: 'published'`，与站内「UGC 人物需审核」策略不一致；易被垃圾/滥用内容填充。
- **修复**：评论默认 `status: 'pending'`，经审核后台（已有 `/admin` 体系）放行；或至少加发帖频控 + 基础敏感词过滤。

### 🟡 P2 — 中（加固）

**[P2-1] 列表接口 `pageSize` 未封顶**
- `GET /persons?pageSize=999999` 可拖垮服务端（大 payload / 内存）。
- **修复**：`pageSize` 上限（如 ≤100），`page` 下限 1；同样约束 `/admin/users`、`/admin/audit` 等。

**[P2-2] 无速率限制**
- `/auth/login`、`/auth/register`、评论、开放 API 均无限流 → 爆破/ credential stuffing / 刷量风险。
- **修复**：引入 `@fastify/rate-limit`；登录/注册严格（如 10 次/10 分钟/IP），开放 API 已有月度配额可作二级限制。

**[P2-3] Web 缺安全响应头**
- `next.config.mjs` 未注入 CSP / X-Frame-Options / HSTS / X-Content-Type-Options / Referrer-Policy。
- **修复**：`next.config` 的 `headers()` 或 `middleware.ts` 统一注入；CSP 针对本站的 img/font/script 源。

**[P2-4] JSON 存储非原子写**
- `json-store.ts` 的 `save*` 用 `writeFileSync` 直接覆盖，崩溃可能写坏文件；并发写存在 lost-update。
- 仅影响默认 `json` 适配器（生产走 `pg-neo4j`）。
- **修复（一行改动）**：改为「写 `*.tmp` → `fs.rename` 原子替换」。

### 🟢 P3 — 低（可选打磨）

- **[P3-1] JSON-LD 注入**：`JsonLd.tsx` 用 `dangerouslySetInnerHTML` 注入 `JSON.stringify(data)`，人物名含 `</script>` 可逃逸脚本上下文。建议序列化时把 `<` 转义为 `\u003c`。
- **[P3-2] CORS `origin: true` 全反射**：自有前端走同源 `/api` 代理，无需 CORS；若开放 API 需跨域，建议收紧为已知站点源。
- **[P3-3] 未捕获异常 `process.exit(1)`**：依赖 pm2 重启（合理），但丢失在途请求；可改为仅记录不退出，视可用性策略。
- **[P3-4] RAG 出站 LLM 无超时/预算**：建议 `AbortController` 超时 + 单次调用预算上限，防止悬挂/费用失控。

---

## 已具备的良好实践（正面清单）

- ✅ 全局 `setErrorHandler` 结构化 500，异常不冒泡致进程退出
- ✅ JWT 校验 + `jti` 吊销黑名单（登出真正失效）
- ✅ 上传：`data:image` 格式校验 + 扩展名白名单 + 5MB 上限 + 随机文件名；`/uploads/:file` 路径遍历防护
- ✅ 密钥 `.gitignore` 覆盖 `.env*` 与 `deploy/.secrets*`，仅 `.env.example` 入库
- ✅ 优雅退出 SIGTERM/SIGINT + pm2 重启自愈
- ✅ SSG/ISR 利于 SEO；`metadataBase` + 动态 OG 图
- ✅ 路由级鉴权分层 + 开放 API 软前置（无 key 透传、有 key 计配额）
- ✅ 输入基础校验（names 非空、评论 ≤2000、role 枚举、upload 类型限制）

---

## 修复优先级与工作量

| 编号 | 严重度 | 工作量 | 建议时机 |
|---|---|---|---|
| P0-1 | 🔴 | 0.5h | 上线前必做（部署变量 + 告警） |
| P1-1 | 🟠 | 1h | 收口首批 |
| P1-2 | 🟠 | 1.5h | 收口首批 |
| P2-1 | 🟡 | 0.5h | 收口 |
| P2-2 | 🟡 | 1h | 收口 |
| P2-3 | 🟡 | 0.5h | 收口 |
| P2-4 | 🟡 | 0.5h | 收口（仅 dev 适配器） |
| P3-1~4 | 🟢 | 1h | 可选 |

---

## 下一步

1. **立即**：确认部署环境变量齐全（`JWT_SECRET`、`GPH_ADMIN_PASSWORD`、`STORE_DRIVER=pg-neo4j` 等）+ P0-1 告警。
2. **收口（本阶段）**：实现 P1-1 / P1-2 / P2-1~4（均为小改动，可一并提交）。
3. **可选**：P3 打磨。
4. **后续阶段**：SEO/GEO 收尾核查 → graph/compare/ask 板块打磨。
