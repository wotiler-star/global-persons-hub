#!/usr/bin/env node
/**
 * Stage 32 数据准确度修复（一次性，幂等可重跑）
 * 依据 2026-07 联网核实的权威来源（Forbes 实时富豪榜 2026-07、Forbes 2026 名人榜、Britannica）：
 *  1. 悬空关系 ID：p-marie-curie → marie-curie 实际 id；p-alan-turing → alan-turing 实际 id
 *  2. 孔子生卒占位日期 → 传统纪年：前551-09-28 / 前479-04-11（史记/公羊传传统日期）
 *  3. Sundar Pichai 生日：1972-07-12（旧维基错误）→ 1972-06-10（Britannica 2026-07 确认）
 *  4. 净资产全面刷新至 2026-07 口径（USD），并为受影响人物追加 Forbes 来源
 *  5. influence 类型关系补 directed:true（影响关系天然有方向）
 * 同时修 seed（apps/api/data/persons.json）与 runtime 工作副本（按 slug 合并，保留 runtime 独有字段）。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SEED = join(ROOT, 'apps/api/data/persons.json');
const RT = join(ROOT, 'apps/api/data/runtime/persons.json');

const FORBES_RT = {
  url: 'https://www.forbes.com/real-time-billionaires/',
  title: 'Forbes Real-Time Billionaires (retrieved 2026-07)',
  publisher: 'Forbes'
};
const FORBES_CELEB = {
  url: 'https://www.forbes.com/sites/idonnkanga/2026/03/10/the-worlds-celebrity-billionaires-2026/',
  title: 'The World\u2019s Celebrity Billionaires 2026',
  publisher: 'Forbes'
};

// slug → 修正后的 netWorth（USD，2026-07 口径）+ 来源
const NET_WORTH = {
  'elon-musk': { v: 797_600_000_000, src: FORBES_RT },        // 原 420B
  'jeff-bezos': { v: 256_600_000_000, src: FORBES_RT },       // 原 200B
  'mark-zuckerberg': { v: 221_600_000_000, src: FORBES_RT },  // 原 180B
  'warren-buffett': { v: 139_300_000_000, src: FORBES_RT },   // 原 120B
  'bill-gates': { v: 106_500_000_000, src: FORBES_RT },       // 原 130B（2024 年福布斯大幅下调）
  'jack-ma': { v: 29_600_000_000, src: FORBES_RT },           // 原 30B
  'michael-jordan': { v: 4_300_000_000, src: FORBES_CELEB },  // 原 3B
  'oprah-winfrey': { v: 3_200_000_000, src: FORBES_CELEB },   // 原 3B
  'jay-z': { v: 2_800_000_000, src: FORBES_CELEB },           // 原 2.5B
  'cristiano-ronaldo': { v: 1_200_000_000, src: FORBES_RT },  // 原 600M（2025 起成为现役亿万富豪）
  'beyonce': { v: 1_000_000_000, src: FORBES_CELEB }          // 原 500M（2026 新晋十亿俱乐部）
};

function patch(persons, tag) {
  const bySlug = new Map(persons.map((p) => [p.slug, p]));
  const idOf = (slug) => bySlug.get(slug)?.id;
  const log = [];

  // 1. 悬空关系 ID 重映射
  const remap = { 'p-marie-curie': idOf('marie-curie'), 'p-alan-turing': idOf('alan-turing') };
  for (const p of persons) {
    for (const r of p.relations || []) {
      if (remap[r.targetId]) {
        log.push(`${p.slug}: relation ${r.targetId} → ${remap[r.targetId]}`);
        r.targetId = remap[r.targetId];
      }
    }
  }

  // 2. 孔子传统生卒日期
  const kong = bySlug.get('confucius');
  if (kong) {
    if (kong.birth !== '-0551-09-28') { log.push(`confucius: birth ${kong.birth} → -0551-09-28`); kong.birth = '-0551-09-28'; }
    if (kong.death !== '-0479-04-11') { log.push(`confucius: death ${kong.death} → -0479-04-11`); kong.death = '-0479-04-11'; }
  }

  // 3. Pichai 生日
  const pichai = bySlug.get('sundar-pichai');
  if (pichai && pichai.birth !== '1972-06-10') {
    log.push(`sundar-pichai: birth ${pichai.birth} → 1972-06-10`);
    pichai.birth = '1972-06-10';
  }

  // 4. 净资产刷新 + 补 Forbes 来源
  for (const [slug, { v, src }] of Object.entries(NET_WORTH)) {
    const p = bySlug.get(slug);
    if (!p) continue;
    p.metrics = p.metrics || {};
    if (p.metrics.netWorth !== v) {
      log.push(`${slug}: netWorth ${p.metrics.netWorth} → ${v}`);
      p.metrics.netWorth = v;
    }
    p.sources = p.sources || [];
    if (!p.sources.some((s) => s.url === src.url)) p.sources.push({ ...src });
  }

  // 5. influence 关系补方向
  for (const p of persons) {
    for (const r of p.relations || []) {
      if (r.type === 'influence' && !r.directed) {
        log.push(`${p.slug}: influence relation → directed:true`);
        r.directed = true;
      }
    }
  }

  // 6. 无向关系（family/collab/rival 等非 directed）补齐反向条目
  const byId = new Map(persons.map((p) => [p.id, p]));
  for (const p of persons) {
    for (const r of p.relations || []) {
      if (r.directed) continue;
      const t = byId.get(r.targetId);
      if (!t) continue;
      t.relations = t.relations || [];
      if (!t.relations.some((x) => x.targetId === p.id)) {
        t.relations.push({ targetId: p.id, type: r.type, ...(r.note ? { note: r.note } : {}) });
        log.push(`${t.slug}: 补反向关系 → ${p.slug}（type=${r.type}）`);
      }
    }
  }

  // 更新 updatedAt（仅被改动者）
  const touched = new Set(log.map((l) => l.split(':')[0]));
  const now = new Date().toISOString();
  for (const p of persons) if (touched.has(p.slug)) p.updatedAt = now;

  console.log(`--- ${tag}：${log.length} 处修正 ---`);
  for (const l of log) console.log('  ' + l);
  return persons;
}

const seed = JSON.parse(readFileSync(SEED, 'utf-8'));
writeFileSync(SEED, JSON.stringify(patch(seed, 'seed'), null, 2));

if (existsSync(RT)) {
  const rt = JSON.parse(readFileSync(RT, 'utf-8'));
  writeFileSync(RT, JSON.stringify(patch(rt, 'runtime'), null, 2));
}
console.log('done');
