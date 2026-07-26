// —— OG 分享卡 CJK 字体子集生成脚本 ——
// 用法：node scripts/gen-og-font.mjs
// 前置：_fonts_src/NotoSansCJKsc-Bold.otf（Noto Sans CJK SC Bold，OFL 许可）
//       managed python venv 已安装 fonttools
// 输出：apps/web/src/assets/og/NotoCJK-og.otf（仅含站点实际用到的字符，几百 KB）
//
// 说明：Noto Sans CJK 自带 Latin/希腊/西里尔字形，因此 zh/ja/ko/ru 四语可原生渲染；
// ar/hi 不在其覆盖范围（OG 卡对这两语保持 Latin 回退）。
// 新增人物后必须重跑本脚本，否则新名字里的生僻字会渲染成豆腐块。

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_FONT = join(ROOT, '_fonts_src', 'NotoSansCJKsc-Bold.otf');
const OUT_DIR = join(ROOT, 'apps', 'web', 'src', 'assets', 'og');
const OUT_FONT = join(OUT_DIR, 'NotoCJK-og.otf');
const CHARS_FILE = join(ROOT, '_fonts_src', 'og-chars.txt');
const PYTHON = 'C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe';

// 1) 收集字符：persons 数据（zh/ja/ko/ru 的 names/occupations）+ 13 语 UI 文案 + 品牌串
const NATIVE_LANGS = ['zh', 'ja', 'ko', 'ru'];
const chars = new Set();
const addStr = (s) => { for (const ch of String(s || '')) chars.add(ch); };

for (const f of ['apps/api/data/persons.json', 'apps/api/data/runtime/persons.json']) {
  const p = join(ROOT, f);
  if (!existsSync(p)) continue;
  const arr = JSON.parse(readFileSync(p, 'utf8'));
  const persons = Array.isArray(arr) ? arr : Object.values(arr);
  for (const person of persons) {
    for (const l of NATIVE_LANGS) {
      addStr(person?.names?.[l]);
      addStr(person?.occupations?.[l]);
    }
  }
}

// ui.ts 里 hero 标题/副标题（正则粗提取该两行的全部字符即可，宁多勿少）
const uiSrc = readFileSync(join(ROOT, 'apps/web/src/lib/ui.ts'), 'utf8');
for (const key of ['home.heroTitle', 'home.heroSub']) {
  const m = uiSrc.match(new RegExp(`'${key.replace('.', '\\.')}':\\s*\\[([^\\]]*)\\]`));
  if (m) addStr(m[1]);
}
addStr('全球知名人物志 · Global Persons Hub');
addStr('影视商业学术体育音乐政治科技艺术其他 传记 对比 · – — VS');

// 2) 生成 unicodes 参数：基础区段（拉丁/标点/假名/西里尔/CJK 标点）+ 收集到的字符码点
const RANGES = [
  'U+0020-007E', // ASCII
  'U+00A0-024F', // Latin-1 + Extended A/B（欧洲人名变音符）
  'U+0370-03FF', // 希腊
  'U+0400-04FF', // 西里尔（俄语全区段，防未来新增人物缺字）
  'U+2000-206F', // 常用标点（– — ' ' " " …）
  'U+3000-303F', // CJK 标点（、。「」·）
  'U+3040-30FF', // 平假名+片假名全区段
  'U+31F0-31FF', // 片假名扩展
  'U+FF01-FF65'  // 全角标点/字母
];
const unicodes = RANGES.join(',');
// 字符集写入文件（--text-file 读取），避免 Windows 命令行长度限制
writeFileSync(CHARS_FILE, [...chars].join(''), 'utf8');
console.log(`collected ${chars.size} unique chars`);

// 3) 校验源字体完整性（下载可能被截断），再 pyftsubset 子集化
if (!existsSync(SRC_FONT)) {
  console.error(`SOURCE FONT MISSING: ${SRC_FONT}`);
  process.exit(1);
}
try {
  execFileSync(PYTHON, ['-c',
    `from fontTools.ttLib import TTFont; TTFont(r'${SRC_FONT}', lazy=True)`
  ], { stdio: 'pipe' });
} catch {
  console.error(`SOURCE FONT CORRUPT/TRUNCATED: ${SRC_FONT} — re-download it`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
execFileSync(PYTHON, [
  '-m', 'fontTools.subset',
  SRC_FONT,
  `--unicodes=${unicodes}`,
  `--text-file=${CHARS_FILE}`,
  `--output-file=${OUT_FONT}`,
  '--no-hinting',
  '--desubroutinize',
  '--name-IDs=1,2', // 仅保留 family/style 名，减体积
  '--layout-features=*',
  '--drop-tables+=vhea,vmtx' // 不需要竖排
], { stdio: 'inherit' });

const kb = (statSync(OUT_FONT).size / 1024).toFixed(1);
console.log(`OK -> ${OUT_FONT} (${kb} KB)`);
