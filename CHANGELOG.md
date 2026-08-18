# 发布说明 / Release Notes

本文件记录 global-persons-hub 的对外发布变更。格式参考 [Keep a Changelog](https://keepachangelog.com/)。

## [2026-08-18] — 多语言 SEO 全面落地 + Hostinger 单进程部署

### 新增 Added
- **多语言 SEO（13 语种独立 URL）**：`/zh /en /es /fr /ja /ru /ar /pt /de /ko /it /hi /id` 均为独立、可抓取的子目录 URL，每个语言版输出正确的 `<html lang>`（BCP-47：`zh→zh-CN`、`pt→pt-BR`；阿拉伯语 `ar` 额外 `dir="rtl"`）与完整译文。
- **hreflang 交替链接**：全部页面 `<head>` 输出 13 语 + `x-default`（指向英文）的绝对地址 `hreflang`，由 `metadataBase` + `NEXT_PUBLIC_SITE_URL` 解析。
- **可抓取内链**：语言切换器（LangSwitch）由不可爬取的 `<select>`+`router.push` 重写为 13 个真实 `<a href hreflang lang aria-current>` 锚点，爬虫可发现全部语言版并互相串联。
- **站点地图（sitemap.xml）**：共 1625 条 `<loc>`，每条均带 13 语 + `x-default` 的 `xhtml:link hreflang` 交替链接（覆盖语言首页、人物库、时间轴、探索、画廊、图谱、定价、领域榜、人物详情、对比页、ask、search）；`robots.txt` 含 `Sitemap:` 与 `Host:` 指令。
- **Hostinger 单进程部署**：原独立 Fastify API 折叠进 Next.js Route Handlers（`apps/web/src/app/api/**`），前端同源 `/api` 调用；`next start` 单进程同时承载页面与接口，适配共享主机「仅一个 Node 进程」约束。只读接口带 `Cache-Control: public` 缓存头，语义检索进程内按 `query|lang|limit` 缓存，降低共享主机负载。

### 修复 Fixed
- **sitemap 对比页漏设 hreflang**：`/compare?ids=…` 对比页原先未生成 `xhtml:link` 交替链接（共 234 条），现已补全。全量 1625 条 URL 均带多语种交替链接（修复前 1391 条、修复后 1625 条，新增 3276 条 `xhtml:link`）。

### 上线后：提交 Google Search Console（GSC）
1. 部署到正式域名，构建时务必设置 `NEXT_PUBLIC_SITE_URL=https://你的域名`（否则 sitemap / robots 内的绝对地址会指向 localhost，SEO 失效）。
2. GSC → **添加资源** → 网址前缀 `https://你的域名` → **验证所有权**（HTML 标记或 DNS TXT 记录二选一）。
3. 左侧 **站点地图** → 输入框填 `sitemap.xml`（只需路径，GSC 自动拼接域名）→ **提交**。
4. 验证：GSC「站点地图」页显示「成功」，覆盖 **1625 个网址**；「网页」报告会在数小时~数日内陆续收录，可按国家/地区与语言查看国际定位。
5. 可选：在 GSC「国际定位」中确认各语言首页（如 `/zh`、`/en`）已正确互链，无需手动标注 `x-default` 以外的语言（已由 sitemap 处理）。

### 验证数据（本地，`NEXT_PUBLIC_SITE_URL=https://example.com`）
- `sitemap.xml`：1625 条 `<loc>`、22750 条 `xhtml:link hreflang`（语言集 `zh,en,es,fr,ja,ru,ar,pt,de,ko,it,hi,id,x-default`），**0 条缺交替链接**，XML 格式校验通过。
- `robots.txt`：含 `Sitemap:` + `Host:`。
- `npm run build` 成功；`/[lang]` 页面为 SSG（● 标记）。

### 相关提交
- `aabf0cf` feat: 适配 Hostinger 共享云主机的单进程部署（API 折叠进 Next.js）
- `223d66d` feat: 多语言 SEO（独立子目录 URL + hreflang 交替 + 可抓取内链 + 站点地图）
- 本发布追加：sitemap 对比页 hreflang 补全 + 发布说明
