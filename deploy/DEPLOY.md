# 全球知名人物志 · Lighthouse 部署与搜索引擎提交 运行手册

> 目标：把 `global-persons-hub`（Next.js web + Fastify api，零依赖 JSON store）部署到腾讯云 Lighthouse（Windows），并向搜索引擎 / AI 引擎提交。
> 约束（来自 `tencent-lighthouse-tat-deploy` 技能）：Lighthouse 仅开 3389(RDP)、2GB 内存**不能服务端构建** → 本机 `output:'standalone'` 构建 → 分片上传 → TAT 下发 PowerShell 拉取解压 → pm2 运行。

---

## 0. 前置条件（需用户/运维提供）
- 腾讯云 **SecretId / SecretKey**（需 `QcloudTATFullAccess` + `QcloudLighthouseFullAccess` + 防火墙 `CreateFirewallRules` 权限）。
- Lighthouse **实例 ID**（形如 `lhins-xxxxxxxx`；若只有 IP，用 IP 反查）。
- 公开访问地址：**域名**或 Lighthouse **公网 IP + 端口**（同机若已跑 ai-tools-nav 占 80，本站点用 `:3000`，避免冲突）。
- 文件源（供服务器直连下载分片，二选一）：
  - **GitHub Release**（需 GitHub Token/PAT，`gh` 未安装则用 `curl + API`）；
  - **腾讯云 COS**（需 `QcloudCOSFullAccess`，子账号默认无，主账号可开；同地域下载最快）。

---

## 1. 本机构建 + 分片
```powershell
cd global-persons-hub
pwsh deploy/package.ps1 -SiteUrl http://<PUBLIC_IP>:3000 -OutDir deploy/dist
# 结束会打印 ShardCount / ExpectedSize
```
产物：`deploy/dist/shards/part00.zip … partNN.zip`。

## 2. 上传分片到文件源
**GitHub Release（无 gh，用 curl + Token）：**
```bash
# 建 release（若未建）
curl -s -X POST -H "Authorization: Bearer $GITHUB_TOKEN" \
  -d '{"tag_name":"deploy","name":"deploy"}' \
  https://api.github.com/repos/wotiler-star/global-persons-hub/releases
# 逐个上传分片（直连，勿走代理）
for f in deploy/dist/shards/part*.zip; do
  curl -s -X POST -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Content-Type: application/octet-stream" \
    --data-binary @$f \
    "https://uploads.github.com/repos/wotiler-star/global-persons-hub/releases/<RELEASE_ID>/assets?name=$(basename $f)"
done
```
Release 基础 URL 形如 `https://github.com/wotiler-star/global-persons-hub/releases/download/deploy`。

## 3. TAT 下发部署脚本（需腾讯云凭证，Python SDK）
```python
# 用 tencentcloud-sdk-python-tat / lighthouse / cvm（见技能 SKILL.md）
# 1) 用 SecretId/Key 定位实例（IP 反查 lhins-xxx）
# 2) 读取 deploy/lighthouse-deploy.ps1 原文 -> base64(UTF-8) -> RunCommand(Content=该base64, Username='Administrator')
#    参数通过脚本 param 注入：ReleaseBase / ShardCount / ExpectedSize / WebPort / SiteUrl / JwtSecret / AdminEmail / AdminPass
# 3) DescribeInvocationTasks(filters invocation-id, HideOutput=False) 取回 base64 输出并解码查看日志
```
⚠️ TAT `Content` 必须是 **base64(UTF-8)** 的脚本原文，不要 `powershell -EncodedCommand` 包装，也不要明文。

## 4. 放行防火墙（Lighthouse API，需凭证）
```python
CreateFirewallRules(FirewallRules=[{
  'Protocol':'TCP','Port':<WebPort>,'CidrBlock':'0.0.0.0/0',
  'Action':'ACCEPT','FirewallRuleDescription':'gph-web'
}])
```

## 5. 公网验证（本机执行）
```bash
curl -s -o /dev/null -w "home %{http_code}\n" http://<PUBLIC_IP>:<WebPort>/en
curl -s -o /dev/null -w "person %{http_code}\n" http://<PUBLIC_IP>:<WebPort>/en/person/albert-einstein
curl -s -o /dev/null -w "sitemap %{http_code}\n" http://<PUBLIC_IP>:<WebPort>/sitemap.xml
curl -s -o /dev/null -w "llms %{http_code}\n" http://<PUBLIC_IP>:<WebPort>/llms.txt
curl -s -o /dev/null -w "api %{http_code}\n" http://<PUBLIC_IP>:<WebPort>/api/persons?pageSize=1
# 健康检查（浏览器侧 /api/health 经 next.config 重写代理到 API 的 /health）
curl -s http://<PUBLIC_IP>:<WebPort>/api/health
# 期望返回 {"status":"ok","ts":...} 或 {"ok":true}
# 确认无 500、健康检查返回 ok
```

> **健壮性要点（2026-07-28 审计后增强）**
> - API 进程现通过 `dotenv` 自动加载 `apps/api/.env`，部署脚本写入的 `JWT_SECRET` / `GPH_ADMIN_PASSWORD` / `STORE_DRIVER` 等**已实际生效**（此前因未加载 .env，生产环境会静默回退到弱默认值，属安全隐患）。
> - API 仅监听 `127.0.0.1`（`API_BIND`，不对外暴露），由 Web 的 `/api` 重写代理；请勿改为 `0.0.0.0`。
> - **API 改为 esbuild 编译为 `dist/server.mjs` 后由 `node` 直跑（单进程、无 tsx 子进程）**：避免原先 `npx tsx` 派生子进程、pm2 的 SIGTERM 无法送达导致优雅退出失效的问题；同时生产环境不再依赖运行时 TS 编译。
> - pm2 已加 `--max-memory-restart 1500M --max-restarts 10 --min-uptime 5000` 与 `pm2-logrotate`（单文件 10M / 保留 7 份），避免 2GB 实例内存/磁盘被拖垮。
> - API 已加 `setErrorHandler` 全局兜底、未捕获异常兜底、SIGTERM/SIGINT 优雅退出（pm2 stop 不再中断在途请求）。
> - 开机自启脚本先 `pm2 resurrect` 再兜底重拉，确保重启后自动恢复。

## 6. 提交搜索引擎 / 生成式引擎
站点上线且 `sitemap.xml` / `llms.txt` / `llms-full.txt` / `feed.xml` 均可访问后：
- **Google**：`https://www.google.com/ping?sitemap=http://<PUBLIC_IP>:<WebPort>/sitemap.xml`
- **Bing**：`https://www.bing.com/ping?siteMap=http://<PUBLIC_IP>:<WebPort>/sitemap.xml`
- **百度**：搜索资源平台手动提交 sitemap（需站点验证，建议绑定域名后操作）。
- **GEO（AI 引擎）**：在站点 `robots.txt` 已放行 GPTBot/ClaudeBot/PerplexityBot 等；把 `llms.txt` / `llms-full.txt` 作为 AI 爬虫入口对外可访问即可（ChatGPT/Perplexity 会自动发现）。
- 若后续绑定正式域名，记得把 `NEXT_PUBLIC_SITE_URL` 改为域名并**重新构建**（NEXT_PUBLIC_* 构建期内联）。

---

## 拓扑说明
- **同源单端口**：浏览器端 `NEXT_PUBLIC_API_BASE=/api` → `next.config` 的 `rewrites` 把 `/api/*` 代理到本机 `127.0.0.1:8787`，因此只开放 Web 端口，Fastify API 不对外暴露、同源免 CORS。
- **服务端渲染**：`GPH_API_BASE=http://127.0.0.1:8787`（运行时变量），SSR/ISR 直接同机取数。
- **数据**：`STORE_DRIVER=json`，零依赖，50 人种子随包 `apps/api/data` 下发；后续要全功能再切 `pg-neo4j`（需 docker 起 PG+Neo4j）。
- **进程**：`pm2` 跑 `gph-web`(server.js, :WebPort) + `gph-api`(tsx, :8787)，注册 `AtStartup` 计划任务开机自启。

## 回滚
`pm2 stop gph-web gph-api` 即可停服；新版本重新走 1→5 覆盖 `$TARGET` 目录后 `pm2 restart`。
