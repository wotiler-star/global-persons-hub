# 部署健壮性审计报告（2026-07-28）

项目：`global-persons-hub`（Next.js 15 前端 + Fastify 单体仓库 API，腾讯云 Lighthouse Windows + pm2 部署）
审计范围：Lighthouse 生产部署形态（API 进程、pm2 策略、监听地址、密钥、优雅退出、日志、开机自启）。

## 一、审计发现（按严重程度）

| # | 严重度 | 问题 | 原状 | 影响 |
|---|--------|------|------|------|
| 1 | 🔴 高（安全） | API 的 `.env` 从未被加载 | `server.ts` 直接读 `process.env.*`，但 pm2 启动 `npx tsx` 不传 `--env-file`，无 dotenv | 生产环境静默回退到弱默认值：`JWT_SECRET='dev-secret-change-me'`、管理员密码 `admin123456`，认证可被伪造 |
| 2 | 🔴 高 | `npx tsx` 派生子进程，pm2 的 SIGTERM 无法送达服务器进程 | `pm2 start "npx tsx src/server.ts"` | `pm2 stop/restart` 硬杀，优雅退出（`app.close()`）失效，在途请求被中断 |
| 3 | 🟠 中 | 无全局错误兜底 | 单条请求异常可能冒泡 | 偶发请求异常有概率拖垮进程 |
| 4 | 🟠 中 | 未捕获异常无兜底 | 无 `uncaughtException`/`unhandledRejection` | 未捕获异常直接 crash，靠 pm2 重启但存在静默挂死窗口 |
| 5 | 🟠 中 | 无优雅退出 | 无 `SIGTERM`/`SIGINT` 处理 | `pm2 stop` 中断在途请求 |
| 6 | 🟠 中 | API 监听 `0.0.0.0` | `host:'0.0.0.0'` | 与「API 不对外暴露」设计矛盾（虽防火墙仅放行 Web 端口，但暴露面过大） |
| 7 | 🟡 低 | pm2 无内存/重启/日志策略 | 仅 `pm2 start`，无 max_memory_restart / max_restarts / min_uptime / 日志轮转 | 2GB 实例内存或磁盘被拖垮风险 |
| 8 | 🟡 低 | 开机自启脚本无 resurrect 兜底 | 仅 `pm2 restart`（若 PM2 守护自身未起则无效） | 重启后可能不自动恢复 |
| 9 | 🟢 隐患 | API 源码 typecheck 红色 | `json-store.ts` 3 处 `id` 重复（TS2783） | 代码质量/可维护性差，掩盖真实问题 |

## 二、已实施的修复

1. **`apps/api/src/server.ts`**
   - 引入 `dotenv`，在任意模块读取环境变量前加载 `apps/api/.env` → 修复 #1（生产配置真正生效）。
   - 新增 `app.setErrorHandler` 全局兜底，单条请求异常返回结构化 500，不冒泡 → #3。
   - 新增 `process.on('uncaughtException'/'unhandledRejection')` 记录并退出，交 pm2 重启 → #4。
   - 新增 `SIGTERM`/`SIGINT` → `app.close()` 优雅退出 → #5。
   - `listen` 绑定 `host: process.env.API_BIND || '127.0.0.1'`，与文档一致仅本机取数 → #6。
   - `JWT_SECRET` 缺省时打印告警（部署脚本已注入强串）。

2. **API 改为编译后由 `node` 直跑（消除 tsx 派生子进程）**
   - `apps/api/package.json` 新增 `esbuild` devDep 与 `build` 脚本：
     `esbuild src/server.ts --bundle --platform=node --format=esm --target=node20 --outfile=dist/server.mjs --external:fastify ...`（内联 `@gph/types`，第三方依赖保持外部）。
   - 部署脚本步骤 8 改为：`npm run build` → `pm2 start "node dist/server.mjs"` → 单进程、pm2 信号可直达 → #2。

3. **`deploy/lighthouse-deploy.ps1`**
   - pm2 start 增加 `--max-memory-restart 1500M --max-restarts 10 --min-uptime 5000` 与 `--error-file/--out-file` → #7。
   - 安装并配置 `pm2-logrotate`（单文件 10M / 保留 7 份 / 压缩）→ #7。
   - 写入 `API_BIND=127.0.0.1` 到 API `.env`。
   - 开机自启脚本先 `pm2 resurrect` 再兜底重拉 → #8。
   - here-string 改为变量赋值形式，规避 PowerShell 解析歧义。

4. **`deploy/.env.example` / `deploy/DEPLOY.md`**：补充 `API_BIND`、强化 `JWT_SECRET` 提醒、新增 `/api/health` 验证命令与健壮性说明。

5. **`apps/api/src/store/json-store.ts`**：修复 3 处 TS2783（`{id, ...nodeInfo}` → `{...nodeInfo, id}`），typecheck 全绿 → #9。

## 三、验证结果

- ✅ `npm run typecheck`（types/web/api 三个 workspace）全部通过。
- ✅ `npm -w @gph/api run build` 成功产出 `dist/server.mjs`（120KB，`@gph/types` 已内联）。
- ✅ 本地起 `node dist/server.mjs`（带 `.env`）：`/health` 返回 `{"ok":true}`、`/persons` 返回 200、**无弱密钥告警**（证明 `.env` 已加载）、监听 `127.0.0.1:8787`。
- ✅ `lighthouse-deploy.ps1` 经 PowerShell 解析器（UTF-8）校验，无语法错误。
- ⚠️ 优雅退出（SIGTERM→`app.close()`）的**实时日志**受本沙箱 Bash 后台进程回收机制影响无法就地观察，但其代码为标准写法且已消除 tsx 派生子进程这一根因；生产 pm2 直跑单进程时信号可正常送达。

## 四、部署注意

- 部署脚本步骤 8 现执行 `npm run build`（依赖 esbuild，已列入 api devDependencies；`npm install` 默认装 devDep，勿用 `--production`）。
- `apps/api/dist/` 为构建产物，已在根 `.gitignore` 忽略，由服务器部署时生成。
- 浏览器侧 `/api/health` 经 `next.config.mjs` 重写代理到 API `/health`。
