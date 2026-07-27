#!/usr/bin/env node
/**
 * 数据质量审计脚本（Stage 32）
 * 用法：node scripts/audit-data.mjs [--runtime]
 *   默认审计 apps/api/data/persons.json（seed）；--runtime 审计 runtime 工作副本。
 * 检查项：
 *   E（错误）：重复 id/slug、日期格式非法、卒早于生、寿命>120、领域非法、
 *              relations.targetId 悬空、influence 越界(0-100)、netWorth 非正数
 *   W（警告）：kin.slug 悬空、缺 sources、names/summary 13 语覆盖不全、
 *              langVersions 与 names 不一致、占位日期(-01-01 的公元前人物)、关系未双向
 * 退出码：有 E 则 1，否则 0（可接 CI）。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const useRuntime = process.argv.includes('--runtime');
const FILE = join(ROOT, 'apps/api/data', useRuntime ? 'runtime/persons.json' : 'persons.json');

const LANGS = ['zh', 'en', 'es', 'fr', 'ja', 'ru', 'ar', 'pt', 'de', 'ko', 'it', 'hi', 'id'];
const DOMAINS = new Set(['academic', 'tech', 'business', 'sports', 'music', 'politics', 'film', 'art', 'other']);

const persons = JSON.parse(readFileSync(FILE, 'utf-8'));
const errors = [];
const warns = [];
const E = (slug, msg) => errors.push(`[E] ${slug}: ${msg}`);
const W = (slug, msg) => warns.push(`[W] ${slug}: ${msg}`);

// ---- 全局唯一性 ----
const seenId = new Map(), seenSlug = new Map();
for (const p of persons) {
  if (seenId.has(p.id)) E(p.slug, `id 重复（与 ${seenId.get(p.id)}）`);
  seenId.set(p.id, p.slug);
  if (seenSlug.has(p.slug)) E(p.slug, 'slug 重复');
  seenSlug.set(p.slug, true);
}
const byId = new Map(persons.map((p) => [p.id, p]));
const bySlug = new Map(persons.map((p) => [p.slug, p]));

// ---- 日期解析（容忍负数 ISO：-0551-09-28）----
const DATE_RE = /^(-?\d{1,4})-(\d{2})-(\d{2})$/;
function parseDate(s) {
  const m = DATE_RE.exec(s || '');
  if (!m) return null;
  const y = parseInt(m[1], 10), mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, mo, d };
}

const thisYear = new Date().getFullYear();
for (const p of persons) {
  const slug = p.slug;
  // 日期
  let b = null, dd = null;
  if (p.birth) {
    b = parseDate(p.birth);
    if (!b) E(slug, `birth 非法：${p.birth}`);
  } else W(slug, '缺 birth');
  if (p.death) {
    dd = parseDate(p.death);
    if (!dd) E(slug, `death 非法：${p.death}`);
  }
  if (b && dd) {
    const bo = b.y + (b.mo - 1) / 12 + b.d / 372;
    const doo = dd.y + (dd.mo - 1) / 12 + dd.d / 372;
    if (doo <= bo) E(slug, `卒(${p.death})早于/等于生(${p.birth})`);
    else if (doo - bo > 120) E(slug, `寿命异常 ${Math.round(doo - bo)} 岁`);
  }
  if (b && !dd && b.y > 0 && thisYear - b.y > 110) W(slug, `无 death 但年龄已 ${thisYear - b.y} 岁，疑漏卒年`);
  if (b && b.y < 0 && p.birth.endsWith('-01-01')) W(slug, `公元前 birth 疑为占位日期：${p.birth}`);
  if (dd && dd.y < 0 && p.death.endsWith('-01-01')) W(slug, `公元前 death 疑为占位日期：${p.death}`);

  // 领域
  for (const d of p.domains || []) if (!DOMAINS.has(d)) E(slug, `非法领域：${d}`);
  if (!p.domains?.length) E(slug, '领域为空');

  // metrics
  const m = p.metrics || {};
  if (m.influence != null && (m.influence < 0 || m.influence > 100)) E(slug, `influence 越界：${m.influence}`);
  if (m.netWorth != null && !(m.netWorth > 0)) E(slug, `netWorth 非正数：${m.netWorth}`);
  if (m.netWorth != null && p.death) {
    const noted = (p.sources || []).some((s) => /at death|逝世时点/i.test(s.title || ''));
    if (!noted) W(slug, '已故人物仍带 netWorth（应为逝世时点值，需在来源注明）');
  }

  // 关系
  for (const r of p.relations || []) {
    if (!byId.has(r.targetId)) E(slug, `relation targetId 悬空：${r.targetId}`);
  }
  // kin
  for (const k of p.kin || []) {
    if (k.slug && !bySlug.has(k.slug)) W(slug, `kin.slug 悬空：${k.slug}`);
  }

  // sources
  if (!p.sources?.length) W(slug, '缺 sources（无法溯源）');

  // 13 语覆盖
  for (const field of ['names', 'summary', 'occupations']) {
    const obj = p[field] || {};
    const missing = LANGS.filter((l) => !obj[l]);
    if (missing.length) W(slug, `${field} 缺 ${missing.length} 语：${missing.join(',')}`);
  }
  // langVersions 一致性
  const withName = LANGS.filter((l) => p.names?.[l]);
  const lv = new Set(p.langVersions || []);
  const extra = [...lv].filter((l) => !withName.includes(l));
  const lack = withName.filter((l) => !lv.has(l));
  if (extra.length) W(slug, `langVersions 多出无译名语种：${extra.join(',')}`);
  if (lack.length) W(slug, `langVersions 缺已有译名语种：${lack.join(',')}`);
}

// ---- 关系双向性（无向关系应互相出现；informational）----
for (const p of persons) {
  for (const r of p.relations || []) {
    if (r.directed) continue;
    const t = byId.get(r.targetId);
    if (!t) continue;
    const back = (t.relations || []).some((x) => x.targetId === p.id);
    if (!back) W(p.slug, `无向关系未双向：→ ${t.slug}（type=${r.type}）`);
  }
}

console.log(`审计文件：${useRuntime ? 'runtime/persons.json' : 'persons.json'}（${persons.length} 人）`);
console.log(`错误 ${errors.length} 条，警告 ${warns.length} 条\n`);
for (const e of errors) console.log(e);
if (errors.length && warns.length) console.log('');
for (const w of warns) console.log(w);
if (!errors.length && !warns.length) console.log('✔ 数据完全干净');
process.exit(errors.length ? 1 : 0);
