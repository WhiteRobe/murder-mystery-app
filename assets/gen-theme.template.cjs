#!/usr/bin/env node
/* %PROJECT_TITLE% · Theme Generator (gen-theme.cjs)
 * 从题材候选池采样生成一套协调的主题 CSS。随机只在预设候选池内发生，
 * 对比度不达标自动回退下一候选组，全部不达标报错 —— "经得起考验"。
 *
 *   node gen-theme.cjs --genre gothic --seed 42 --name abyss --out public/css
 *   node gen-theme.cjs --genre gothic --palette-file palette.json --name custom
 *
 * 参数：
 *   --genre <key>        题材 key（见 theme-presets.template.json）
 *   --seed <n>           随机种子（默认时间戳；固定后可复现，同 seed 输出一致）
 *   --name <名>          主题名（默认 <genre>-<seed>）
 *   --out <dir>          输出目录（默认当前目录）
 *   --palette-file <p>   从 palette.py 输出的 JSON 读取自定义色板（覆盖候选池）
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------------- 工具 ---------------- */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const v = argv[i + 1];
      out[argv[i].slice(2)] = v === undefined || v.startsWith('--') ? 'true' : v;
      if (v !== undefined && !v.startsWith('--')) i++;
    }
  }
  return out;
}

/* 确定性伪随机：mulberry32 —— 同 seed 同序列 */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/* YIQ 亮度 + 对比度（text 需比 bg 亮） */
function luminance(hex) {
  const { r, g, b } = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
  return (299 * r + 587 * g + 114 * b) / 1000;
}
function contrast(hexText, hexBg) {
  const t = luminance(hexText) + 0.05;
  const b = luminance(hexBg) + 0.05;
  return t / b;
}

/* 校验整板：核心变量齐全 + 对比度达标；返回 {ok, issues[]} */
function validatePalette(p) {
  const issues = [];
  const required = ['bg', 'bg2', 'panel', 'panel2', 'panel3', 'line', 'line2',
    'text', 'muted', 'dim', 'blood', 'blood2', 'gold', 'gold2',
    'ok', 'info', 'warn', 'danger'];
  for (const k of required) {
    if (p[k] === undefined || !hexToRgb(p[k])) issues.push(`缺少或非法颜色: --${k}`);
  }
  if (!issues.length) {
    if (contrast(p.text, p.bg) < 4.5) issues.push(`--text 对比度 ${contrast(p.text, p.bg).toFixed(2)} < 4.5`);
    if (contrast(p.muted, p.bg) < 3) issues.push(`--muted 对比度 ${contrast(p.muted, p.bg).toFixed(2)} < 3`);
    /* 面板梯度：亮度递增 */
    const seq = ['bg', 'panel', 'panel2', 'panel3'].map(k => luminance(p[k]));
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] <= seq[i - 1]) issues.push(`面板梯度异常: ${['bg','panel','panel2','panel3'][i]} 不亮于前一层`);
    }
  }
  return { ok: issues.length === 0, issues };
}

/* 从 rgb 对象取 rgba 字符串（氛围层用） */
function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ---------------- 动画骨架库 ---------------- */
const ANIMATIONS = {
  flicker: `/* 烛火摇曳 · 用于 phase chip */
@keyframes flicker {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px var(--candle); }
  25% { opacity: .82; box-shadow: 0 0 15px var(--candle); }
  50% { opacity: .94; box-shadow: 0 0 6px var(--candle); }
  75% { opacity: .88; box-shadow: 0 0 12px var(--candle); }
}
[data-theme="%NAME%"] #phaseChip { animation: flicker 3s ease-in-out infinite; }`,
  mist: `/* 深渊雾潮 · 全屏蠕动质感 */
[data-theme="%NAME%"] body::before {
  background:
    radial-gradient(ellipse at 18% 26%, %C1% 0%, transparent 42%),
    radial-gradient(ellipse at 82% 74%, %C2% 0%, transparent 40%),
    radial-gradient(ellipse at 50% 118%, %C3% 0%, transparent 45%),
    repeating-linear-gradient(172deg,
      transparent 0px, transparent 110px, %C4% 110px, %C4% 112px);
}`,
  dust: `/* 沙尘氛围 · 斜向粒纹 */
[data-theme="%NAME%"] body::before {
  background:
    radial-gradient(ellipse at 22% 30%, %C1% 0%, transparent 45%),
    radial-gradient(ellipse at 78% 70%, %C2% 0%, transparent 42%),
    repeating-linear-gradient(120deg,
      transparent 0px, transparent 90px, %C4% 90px, %C4% 91px);
}`,
  lampswing: `/* 酒馆灯 · 暖光晕 */
[data-theme="%NAME%"] .brand .logo {
  text-shadow: 0 0 14px %C3%, 0 0 30px %C1%;
}`,
  gear: `/* 齿轮缓转 · 用于 logo 装饰 */
[data-theme="%NAME%"] .brand .logo { text-shadow: 0 0 10px %C1%, 0 0 24px %C2%; }
@keyframes gearspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`,
  piston: `/* 蒸汽脉冲 · 用于 phase chip */
@keyframes piston {
  0%, 100% { transform: scale(1); opacity: 1; }
  40% { transform: scale(.94); opacity: .82; }
}
[data-theme="%NAME%"] #phaseChip { animation: piston 2.4s ease-in-out infinite; }`,
  rain: `/* 雨幕氛围 · 细斜纹 */
[data-theme="%NAME%"] body::before {
  background:
    radial-gradient(ellipse at 18% 22%, %C1% 0%, transparent 40%),
    radial-gradient(ellipse at 84% 76%, %C2% 0%, transparent 38%),
    repeating-linear-gradient(96deg,
      transparent 0px, transparent 36px, %C4% 36px, %C4% 37px);
}`,
  neonbreathe: `/* 霓虹呼吸 · 用于强调 chip */
@keyframes neonbreathe {
  0%, 100% { box-shadow: 0 0 6px %C1%; }
  50% { box-shadow: 0 0 18px %C1%, 0 0 30px %C2%; }
}
[data-theme="%NAME%"] .timer-chip.gold, [data-theme="%NAME%"] #phaseChip {
  animation: neonbreathe 2.8s ease-in-out infinite;
}`,
  scan: `/* 扫描线 · 氛围层 + 数据脉冲 */
[data-theme="%NAME%"] body::before {
  background:
    radial-gradient(ellipse at 50% 40%, %C1% 0%, transparent 50%),
    repeating-linear-gradient(0deg, transparent 0 3px, %C4% 3px 4px);
}
@keyframes datapulse {
  0%, 100% { opacity: .85; } 50% { opacity: 1; }
}`,
  pulse: `/* 数据脉冲 · 用于 timer chip */
@keyframes datapulse {
  0%, 100% { box-shadow: 0 0 6px %C1%; }
  50% { box-shadow: 0 0 16px %C1%; }
}
[data-theme="%NAME%"] .timer-chip.gold { animation: datapulse 2.4s ease-in-out infinite; }`,
  starfall: `/* 星辉氛围 · 星芒点阵 */
[data-theme="%NAME%"] body::before {
  background:
    radial-gradient(ellipse at 30% 18%, %C1% 0%, transparent 36%),
    radial-gradient(ellipse at 74% 82%, %C2% 0%, transparent 40%),
    radial-gradient(circle at 52% 46%, %C4% 0, %C4% 1px, transparent 2px),
    radial-gradient(circle at 68% 30%, %C4% 0, %C4% 1px, transparent 2px),
    radial-gradient(circle at 22% 66%, %C4% 0, %C4% 1px, transparent 2px);
}`,
  sand: `/* 沙流 · 斜向波纹 */
[data-theme="%NAME%"] body::before {
  background:
    radial-gradient(ellipse at 50% 20%, %C1% 0%, transparent 44%),
    repeating-linear-gradient(158deg,
      transparent 0px, transparent 100px, %C4% 100px, %C4% 102px);
}`,
  spotlight: `/* 舞台光 · 顶部光锥 */
[data-theme="%NAME%"] body::before {
  background:
    conic-gradient(from 90deg at 50% -20%, transparent 40%, %C1% 50%, transparent 60%),
    radial-gradient(ellipse at 50% 50%, %C2% 0%, transparent 60%);
}`,
  curtain: `/* 幕布垂纹 · 氛围层 */
[data-theme="%NAME%"] body::before {
  background:
    repeating-linear-gradient(92deg,
      transparent 0 26px, %C4% 26px 27px,
      transparent 27px 60px, %C4% 60px 61px),
    radial-gradient(ellipse at 50% 30%, %C1% 0%, transparent 55%);
}`,
  glow: `/* 圣光微晕 */
[data-theme="%NAME%"] .truth-card {
  box-shadow: 0 0 36px %C1%;
}`,
  smoke: `/* 烟雨氛围 */
[data-theme="%NAME%"] body::before {
  background:
    radial-gradient(ellipse at 25% 30%, %C1% 0%, transparent 45%),
    radial-gradient(ellipse at 75% 65%, %C2% 0%, transparent 40%),
    repeating-linear-gradient(142deg,
      transparent 0px, transparent 80px, %C4% 80px, %C4% 81px);
}`,
  heartbeat: `/* 心跳 · 用于 phase chip */
@keyframes heartbeat {
  0%, 100% { transform: scale(1); } 14% { transform: scale(1.06); }
  28% { transform: scale(1); } 42% { transform: scale(1.04); } 56% { transform: scale(1); }
}
[data-theme="%NAME%"] #phaseChip { animation: heartbeat 1.8s ease-in-out infinite; }`,
  corridor: `/* 走廊灯 · 氛围 */
[data-theme="%NAME%"] body::before {
  background:
    radial-gradient(ellipse at 50% -10%, %C3% 0%, transparent 40%),
    repeating-linear-gradient(90deg, transparent 0 60px, %C4% 60px 61px, transparent 61px 140px);
}`,
  wave: `/* 波浪氛围 */
[data-theme="%NAME%"] body::before {
  background:
    radial-gradient(ellipse at 30% 20%, %C1% 0%, transparent 40%),
    repeating-linear-gradient(4deg,
      transparent 0px, transparent 70px, %C4% 70px, %C4% 71px);
}`,
  fog: `/* 海雾氛围 */
[data-theme="%NAME%"] body::before {
  background:
    radial-gradient(ellipse at 20% 24%, %C1% 0%, transparent 44%),
    radial-gradient(ellipse at 82% 76%, %C2% 0%, transparent 40%);
}`,
  glitch: `/* glitch 文字 */
[data-theme="%NAME%"] .brand .logo { text-shadow: 0 0 8px %C1%, 2px 0 %C2%, -2px 0 %C1%; }`
};

/* ---------------- 主题 CSS 骨架 ---------------- */
function buildThemeCss({ name, p, fonts, motif, anims, radius, label, genre }) {
  const A = {
    C1: rgba(p.blood, 0.06), C2: rgba(p.gold, 0.05),
    C3: rgba(p.text, 0.05), C4: rgba(p.blood, 0.02)
  };
  /* 特殊氛围色映射（不同题材可重定义） */
  const animCtx = {
    gothic:   { C1: rgba(p.eldritch || p.blood, .06), C2: rgba(p.blood, .05), C3: rgba(p.candle || p.text, .05), C4: rgba(p.eldritch || p.blood, .02) },
    victorian:{ C1: rgba(p.candle || p.text, .05), C2: rgba(p.gold, .04), C3: rgba(p.blood, .02), C4: rgba(p.blood, .02) },
    western:  { C1: rgba(p.dust || p.gold, .06), C2: rgba(p.blood, .05), C3: rgba(p.text, .05), C4: rgba(p.gold, .02) },
    steam:    { C1: rgba(p.gold, .06), C2: rgba(p.blood, .04), C3: rgba(p.steam || p.text, .06), C4: rgba(p.gold, .02) },
    noir:     { C1: rgba(p.rain || p.info, .06), C2: rgba(p.blood, .05), C3: rgba(p.text, .04), C4: rgba(p.info, .03) },
    science:  { C1: rgba(p.fluoro || p.gold, .05), C2: rgba(p.blood, .05), C3: rgba(p.text, .04), C4: rgba(p.gold, .03) },
    desert:   { C1: rgba(p.star || p.gold, .06), C2: rgba(p.blood, .04), C3: rgba(p.gold, .05), C4: rgba(p.gold, .03) },
    theatre:  { C1: rgba(p.champagne || p.gold, .06), C2: rgba(p.blood, .05), C3: rgba(p.gold, .05), C4: rgba(p.blood, .03) },
    cyber:    { C1: rgba(p.neon || p.info, .05), C2: rgba(p.blood, .06), C3: rgba(p.text, .04), C4: rgba(p.gold, .03) },
    qingci:   { C1: rgba(p.celadon || p.info, .05), C2: rgba(p.blood, .04), C3: rgba(p.text, .04), C4: rgba(p.gold, .03) },
    hospital: { C1: rgba(p.sterile || p.text, .05), C2: rgba(p.blood, .05), C3: rgba(p.text, .04), C4: rgba(p.info, .03) },
    maritime: { C1: rgba(p.signal || p.gold, .06), C2: rgba(p.blood, .04), C3: rgba(p.text, .05), C4: rgba(p.info, .03) },
    fantasy:  { C1: rgba(p.parchment || p.text, .05), C2: rgba(p.blood, .04), C3: rgba(p.gold, .05), C4: rgba(p.gold, .02) },
    dunhuang: { C1: rgba(p.gold, .06),             C2: rgba(p.blood, .05), C3: rgba(p.indigo || p.gold, .05), C4: rgba(p.gold, .03) },
    light:    { C1: rgba(p.gold || p.warn, .04),    C2: rgba(p.info || p.celadon, .02), C3: rgba(p.text, .03), C4: rgba(p.blood, .02) },
    dark:     { C1: rgba(p.info || p.celadon, .05), C2: rgba(p.blood, .04),           C3: rgba(p.gold, .03),       C4: rgba(p.text, .04) }
  }[genre] || A;

  /* 动画光晕色：高亮（用于 box-shadow/text-shadow，区别于氛围层低透明色） */
  const glowCtx = {
    gothic:   { C1: rgba(p.candle || p.gold, .5),  C2: rgba(p.gold, .3),  C3: rgba(p.eldritch || p.gold, .45), C4: rgba(p.blood, .35) },
    victorian:{ C1: rgba(p.candle || p.gold, .5),  C2: rgba(p.gold, .3),  C3: rgba(p.blood, .35), C4: rgba(p.gold, .3) },
    western:  { C1: rgba(p.gold, .5), C2: rgba(p.blood, .4), C3: rgba(p.text, .35), C4: rgba(p.gold, .3) },
    steam:    { C1: rgba(p.gold, .5), C2: rgba(p.blood, .4), C3: rgba(p.steam || p.text, .4), C4: rgba(p.gold, .3) },
    noir:     { C1: rgba(p.rain || p.info, .5), C2: rgba(p.blood, .4), C3: rgba(p.text, .35), C4: rgba(p.info, .35) },
    science:  { C1: rgba(p.fluoro || p.gold, .5), C2: rgba(p.blood, .4), C3: rgba(p.text, .35), C4: rgba(p.gold, .35) },
    desert:   { C1: rgba(p.star || p.gold, .5), C2: rgba(p.blood, .35), C3: rgba(p.gold, .4), C4: rgba(p.gold, .35) },
    theatre:  { C1: rgba(p.champagne || p.gold, .5), C2: rgba(p.blood, .4), C3: rgba(p.gold, .4), C4: rgba(p.blood, .35) },
    cyber:    { C1: rgba(p.neon || p.info, .5), C2: rgba(p.blood, .5), C3: rgba(p.text, .35), C4: rgba(p.gold, .4) },
    qingci:   { C1: rgba(p.celadon || p.info, .5), C2: rgba(p.blood, .35), C3: rgba(p.text, .35), C4: rgba(p.gold, .35) },
    hospital: { C1: rgba(p.sterile || p.text, .5), C2: rgba(p.blood, .4), C3: rgba(p.text, .35), C4: rgba(p.info, .35) },
    maritime: { C1: rgba(p.signal || p.gold, .5), C2: rgba(p.blood, .35), C3: rgba(p.text, .35), C4: rgba(p.info, .35) },
    fantasy:  { C1: rgba(p.parchment || p.text, .5), C2: rgba(p.blood, .35), C3: rgba(p.gold, .4), C4: rgba(p.gold, .3) },
    dunhuang: { C1: rgba(p.gold, .5),              C2: rgba(p.blood, .45), C3: rgba(p.indigo || p.gold, .45), C4: rgba(p.gold, .4) },
    light:    { C1: rgba(p.warn || p.gold, .25),     C2: rgba(p.info || p.celadon, .2),  C3: rgba(p.text, .2), C4: rgba(p.blood, .2) },
    dark:     { C1: rgba(p.info || p.celadon, .5),   C2: rgba(p.blood, .35),                C3: rgba(p.gold, .35), C4: rgba(p.text, .4) }
  }[genre] || { C1: rgba(p.gold, .5), C2: rgba(p.blood, .4), C3: rgba(p.text, .35), C4: rgba(p.gold, .3) };

  /* 氛围层：合并所有 body::before 类型动画的 background，叠加为多背景 */
  const beforeAnims = anims.filter(a => /body::before/.test(ANIMATIONS[a] || ''));
  let bgLayer = '';
  if (beforeAnims.length) {
    const bgParts = beforeAnims.map(a => {
      const block = ANIMATIONS[a]
        .replace(/%NAME%/g, name)
        .replace(/%C1%/g, animCtx.C1).replace(/%C2%/g, animCtx.C2)
        .replace(/%C3%/g, animCtx.C3).replace(/%C4%/g, animCtx.C4);
      const m = block.match(/background:\s*([\s\S]*?);/);
      return m ? m[1].trim() : null;
    }).filter(Boolean);
    bgLayer = `[data-theme="${name}"] body::before {
  content: "";
  position: fixed; inset: 0; pointer-events: none; z-index: 999;
  background:
    ${bgParts.join(',\n    ')};
}`;
  } else {
    bgLayer = `[data-theme="${name}"] body::before {
  content: "";
  position: fixed; inset: 0; pointer-events: none; z-index: 999;
  background:
    radial-gradient(ellipse at 18% 26%, ${animCtx.C1} 0%, transparent 42%),
    radial-gradient(ellipse at 82% 74%, ${animCtx.C2} 0%, transparent 40%),
    radial-gradient(ellipse at 50% 118%, ${animCtx.C3} 0%, transparent 45%);
}`;
  }

  /* 非氛围层动画（灯影/霓虹/脉冲等光晕）使用高亮色 glowCtx，
   * 否则 0.05 alpha 的氛围色会让 box-shadow/text-shadow 几乎不可见 */
  const animBlocks = anims
    .filter(a => !/body::before/.test(ANIMATIONS[a] || ''))
    .map(a => ANIMATIONS[a]
      .replace(/%NAME%/g, name)
      .replace(/%C1%/g, glowCtx.C1).replace(/%C2%/g, glowCtx.C2)
      .replace(/%C3%/g, glowCtx.C3).replace(/%C4%/g, glowCtx.C4))
    .join('\n\n');

  return `/* Theme: ${name} (${label})
 * 由 gen-theme.cjs 生成 · 题材候选池采样 + 对比度自校验
 * 启用方式：<html data-theme="${name}">
 * 或运行时切换：document.documentElement.dataset.theme = '${name}';
 */

:root[data-theme="${name}"] {
  /* 主色板 */
  --bg:        ${p.bg};
  --bg2:       ${p.bg2};
  --panel:     ${p.panel};
  --panel2:    ${p.panel2};
  --panel3:    ${p.panel3};
  --line:      ${p.line};
  --line2:     ${p.line2};
  --text:      ${p.text};
  --muted:     ${p.muted};
  --dim:       ${p.dim};

  /* 强调色 */
  --blood:     ${p.blood};
  --blood2:    ${p.blood2};
  --gold:      ${p.gold};
  --gold2:     ${p.gold2};

  /* 状态色 */
  --ok:        ${p.ok};
  --info:      ${p.info};
  --warn:      ${p.warn};
  --danger:    ${p.danger};

  /* 字体 */
  --font-disp: ${fonts.disp};
  --font-body: ${fonts.body};
  --font-mono: ${fonts.mono};

  /* 装饰 */
  --radius:    ${radius}px;
  --radius-sm: ${Math.max(2, radius - 3)}px;
  --shadow:    0 8px 30px rgba(0, 0, 0, .6);
  --shadow-lg: 0 14px 52px rgba(0, 0, 0, .72);
  --ornament: '${motif}';
}

/* 氛围层 */
${bgLayer}

/* 顶部栏 */
[data-theme="${name}"] .topbar {
  background: ${rgba(p.bg, 0.92)};
  border-bottom: 1px solid var(--line2);
}

[data-theme="${name}"] .brand .logo {
  font-family: var(--font-disp);
  letter-spacing: 3px;
  color: var(--gold);
}

[data-theme="${name}"] .side-sub {
  color: var(--muted);
  letter-spacing: 4px;
  font-family: var(--font-disp);
  font-size: 11px;
}

/* 卡片 */
[data-theme="${name}"] .card {
  background: linear-gradient(180deg, var(--panel) 0%, var(--panel2) 100%);
  border: 1px solid var(--line2);
  position: relative;
}
[data-theme="${name}"] .card::before,
[data-theme="${name}"] .card::after {
  content: var(--ornament);
  position: absolute;
  color: var(--gold);
  font-size: 13px;
  opacity: .35;
}
[data-theme="${name}"] .card::before { top: 4px; left: 7px; }
[data-theme="${name}"] .card::after { bottom: 4px; right: 7px; }

/* AP 行动点 */
[data-theme="${name}"] .ap-pill {
  border: 1px solid var(--gold);
  background: var(--panel);
  color: var(--gold);
  font-family: var(--font-disp);
  letter-spacing: 2px;
}

/* code chip */
[data-theme="${name}"] .code-chip {
  font-family: var(--font-mono);
  background: rgba(0, 0, 0, .3);
  color: var(--gold);
  border: 1px dashed var(--gold);
}

/* 真相 · 封印 */
[data-theme="${name}"] .truth-card {
  background: linear-gradient(180deg, var(--panel) 0%, var(--bg2) 100%);
  border: 2px double var(--blood);
  position: relative;
}
[data-theme="${name}"] .truth-card::before {
  content: "T R U T H";
  position: absolute;
  top: -15px; left: 50%;
  transform: translateX(-50%);
  background: var(--bg);
  padding: 0 14px;
  font-family: var(--font-disp);
  letter-spacing: 12px;
  color: var(--blood);
  font-size: 14px;
}

/* 未解锁 · 帷幕 */
[data-theme="${name}"] .lock-mask {
  background: ${rgba(p.bg, 0.62)};
  border: 1px dashed var(--gold2);
  color: var(--gold);
}

/* 揭示提示 */
[data-theme="${name}"] .toast.reveal {
  border: 1px double var(--blood);
  background:
    linear-gradient(180deg, ${rgba(p.blood, 0.16)} 0%, ${rgba(p.bg, 0.96)} 100%),
    radial-gradient(circle at center, ${rgba(p.text, 0.08)}, transparent 70%);
  box-shadow: 0 0 32px ${rgba(p.gold, 0.22)};
}

/* 投票卡片 */
[data-theme="${name}"] .vote-card.suspect { border-left: 3px solid var(--blood); }
[data-theme="${name}"] .vote-card.mine { border-left: 3px solid var(--gold); }

/* 特色动画 */
${animBlocks}

/* 移动端适配（继承 reference 07 断点行为，只做视觉增强） */
@media (max-width: 820px) {
  [data-theme="${name}"] .ap-pill { padding: 4px 10px; font-size: 12px; }
  [data-theme="${name}"] .topbar { padding-left: 12px; }
  [data-theme="${name}"] .chip { padding: 3px 8px; font-size: 11px; }
}

/* 角色主题色覆盖（可选微调）
 * 说明：以下按剧本角色 id 微调 .cname 高亮色，生成时按 data.json 的
 * characters[].id / .color 替换。若不想微调可整段删除——style.css 的
 * .cname[data-color] 已用内联 --c 变量兜底角色主题色。
 * 示例：
 * [data-theme="${name}"] .cname[data-color="角色id"] { color: var(--gold); }
 */
`;
}

/* ---------------- 主流程 ---------------- */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const presetPath = path.join(__dirname, 'theme-presets.template.json');
  if (!fs.existsSync(presetPath)) {
    console.error('[ERROR] 找不到 theme-presets.template.json（应在本脚本同目录）');
    process.exit(1);
  }
  const presets = JSON.parse(fs.readFileSync(presetPath, 'utf8'));

  const genre = args.genre;
  if (!genre || !presets[genre]) {
    console.error('[ERROR] 需要 --genre，可选值：' + Object.keys(presets).join(' / '));
    process.exit(1);
  }
  const preset = presets[genre];
  const seed = args.seed && args.seed !== 'true' ? parseInt(args.seed, 10) : Date.now();
  const name = (args.name && args.name !== 'true') ? args.name : `${genre}-${seed}`;
  const outDir = (args.out && args.out !== 'true') ? path.resolve(args.out) : process.cwd();

  /* 自定义色板（palette.py 输出）覆盖候选池 */
  let palettes = preset.palettes;
  if (args['palette-file'] && args['palette-file'] !== 'true') {
    const pf = path.resolve(args['palette-file']);
    if (!fs.existsSync(pf)) { console.error('[ERROR] palette 文件不存在:', pf); process.exit(1); }
    const custom = JSON.parse(fs.readFileSync(pf, 'utf8'));
    /* palette.py 输出格式：{bg, blood, gold, accent, ...} 或 {palettes:[...]} */
    const single = custom.palettes ? null : custom;
    palettes = single ? [single] : custom.palettes;
    if (!palettes || !palettes.length) { console.error('[ERROR] palette 文件无有效色板'); process.exit(1); }
  }

  const rnd = mulberry32(seed);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];

  /* 逐候选组尝试：选色板 → 校验，不达标换下一组 */
  let chosen = null;
  let issues = [];
  const order = [...palettes.keys()].sort(() => rnd() - 0.5); /* seed 决定考察顺序 */
  for (const idx of order) {
    const cand = palettes[idx];
    const v = validatePalette(cand);
    if (v.ok) { chosen = cand; break; }
    issues = v.issues;
  }
  if (!chosen) {
    console.error('[FAIL] 所有候选色板均不达标：');
    for (const i of issues) console.error('  ❌ ' + i);
    console.error('请编辑 theme-presets.template.json 修正该题材候选池。');
    process.exit(1);
  }

  const fonts = { disp: pick(preset.fonts.disp), body: pick(preset.fonts.body), mono: pick(preset.fonts.mono) };
  const motif = pick(preset.motifs);
  const anims = preset.anim.slice().sort(() => rnd() - 0.5); /* 保持顺序但 seed 决定组合 */
  const radius = preset.radius || 6;
  const label = preset.label || genre;

  const css = buildThemeCss({ name, p: chosen, fonts, motif, anims, radius, label, genre });
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `theme-${name}.css`);
  fs.writeFileSync(outFile, css, 'utf8');

  const contrastText = contrast(chosen.text, chosen.bg).toFixed(2);
  console.log(`✅ 主题生成成功: ${outFile}`);
  console.log(`   题材: ${label} (${genre}) · seed: ${seed} · 主题名: ${name}`);
  console.log(`   主色: bg=${chosen.bg} blood=${chosen.blood} gold=${chosen.gold}`);
  console.log(`   对比度: text/bg=${contrastText} (≥4.5 达标)`);
  console.log(`   字体: ${fonts.disp.slice(0, 40)}...`);
  console.log(`   动画: ${anims.join(', ')} · motif: ${motif}`);
  console.log('');
  console.log('   HTML 接入:');
  console.log(`     <link rel="stylesheet" href="/css/theme-${name}.css">`);
  console.log(`     <html data-theme="${name}">  (或运行时 ?theme=${name})`);
}

main().catch(e => { console.error(e); process.exit(1); });
