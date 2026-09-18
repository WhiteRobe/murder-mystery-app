#!/usr/bin/env node
/* %PROJECT_TITLE% · data.json Schema 校验器 (validate-data.cjs)
 * 在构建前/后校验剧本数据：必填字段、类型、枚举、id 唯一性、code 格式。
 * 可作为 CLI 独立运行，也可被 build.cjs require 调用（run 函数）。
 *
 *   node validate-data.cjs --data ./data.json
 *
 * 硬约束（与 SKILL.md 一致）：
 *   - 角色 id 为语义 slug（a-z0-9_-，如 char_a）
 *   - 线索/认领码为 4 位数字（0001），未解锁时为 null
 *   - 所有图片路径相对 public/，须以 res/ 开头
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PHASES = ['setup', 'prologue', 'started', 'reveal'];
const STATES = ['locked', 'unlocked', 'revealed'];
const VISIBLES = ['private', 'public'];
const RE_4D = /^\d{4}$/;
const RE_HEX = /^#[0-9a-f]{6}$/i;
const RE_SLUG = /^[a-z0-9_-]{1,32}$/;

function isStr(v) { return typeof v === 'string'; }
function isNonEmptyStr(v) { return isStr(v) && v.trim().length > 0; }
function isNum(v) { return typeof v === 'number' && !Number.isNaN(v); }
function isArr(v) { return Array.isArray(v); }
function isObj(v) { return v !== null && typeof v === 'object' && !isArr(v); }
function isResPath(v) { return isNonEmptyStr(v) && /^res\//.test(v.replace(/\\/g, '/')); }

/* 收集器：id 全局唯一 + 资源路径全集（供 check-res 复用） */
function collectIds(d) {
  const seen = new Map(); /* id -> 出处 */
  const dupes = [];
  const mark = (id, where) => {
    if (!isNonEmptyStr(id)) return;
    if (seen.has(id)) dupes.push(`${id}（${seen.get(id)} 与 ${where} 重复）`);
    else seen.set(id, where);
  };
  return { mark, dupes };
}

function collectResourcePaths(d, mark) {
  const paths = [];
  const add = (p, where) => {
    if (isNonEmptyStr(p)) paths.push({ p, where });
  };
  for (const c of d.characters || []) {
    add(c.script, `characters.${c.id}.script`);
    for (const s of c.scriptPages || []) add(s, `characters.${c.id}.scriptPages`);
    add(c.startClue && c.startClue.image, `characters.${c.id}.startClue.image`);
  }
  for (const a of d.areas || []) {
    add(a.mapImage, `areas.${a.id}.mapImage`);
    for (const c of a.clues || []) for (const im of c.images || []) add(im, `areas.${a.id}.clues.${c.id}.images`);
  }
  for (const m of d.medicalFiles || []) add(m.image, `medicalFiles.${m.id}.image`);
  for (const t of d.timeline || []) for (const im of t.images || []) add(im, `timeline.${t.id}.images`);
  add(d.truth && d.truth.image, 'truth.image');
  for (const r of d.rules || []) add(r.file, `rules.${r.id}.file`);
  return paths;
}

/* 返回 { ok, errors[], warnings[], resources[] } */
function run(dataPath, opts = {}) {
  const errors = [];
  const warnings = [];
  let data;
  try {
    data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (e) {
    return { ok: false, errors: [`无法读取/解析 ${dataPath}: ${e.message}`], warnings, resources: [] };
  }

  if (!isObj(data)) { return { ok: false, errors: ['data.json 顶层必须是对象'], warnings, resources: [] }; }

  /* 顶层键（medicalFiles 是范式 9·角色专长档案的可选字段，未启用时可省略） */
  const { mark, dupes } = collectIds(data);
  const requiredTop = ['settings', 'game', 'characters', 'players', 'areas', 'timeline', 'truth', 'rules'];
  for (const k of requiredTop) if (!(k in data)) errors.push(`缺少顶层键: ${k}`);

  /* settings */
  if (isObj(data.settings)) {
    if ('port' in data.settings && !isNum(data.settings.port)) errors.push('settings.port 必须是数字');
    if ('maxSearchesPerArea' in data.settings && !isNum(data.settings.maxSearchesPerArea)) errors.push('settings.maxSearchesPerArea 必须是数字');
    /* §37 R57：投票门控剧情步，可选，必须是数字且不越界（-1 ~ timeline.length-1） */
    if ('voteFromStep' in data.settings) {
      if (!isNum(data.settings.voteFromStep)) errors.push('settings.voteFromStep 必须是数字');
      else if (isArr(data.timeline) && data.settings.voteFromStep >= data.timeline.length) errors.push('settings.voteFromStep 超出 timeline 范围（' + data.settings.voteFromStep + ' >= ' + data.timeline.length + '）');
    }
  }

  /* game */
  if (isObj(data.game)) {
    if ('phase' in data.game && !PHASES.includes(data.game.phase)) errors.push(`game.phase 非法: ${data.game.phase}（可选 ${PHASES.join('/')}）`);
    if ('truthUnlocked' in data.game && typeof data.game.truthUnlocked !== 'boolean') errors.push('game.truthUnlocked 必须是布尔值');
  }

  /* characters */
  const checkChar = (c, i) => {
    const where = `characters[${i}]`;
    if (!isObj(c)) { errors.push(`${where} 必须是对象`); return; }
    mark(c.id, where);
    if (!RE_SLUG.test(c.id || '')) errors.push(`${where}.id 非法: ${c.id}（须 a-z0-9_- 1-32 位）`);
    for (const k of ['name', 'short', 'title', 'gender', 'desc', 'hint', 'secret']) {
      if (k !== 'short' && k !== 'gender' && !isNonEmptyStr(c[k])) errors.push(`${where}.${k} 缺失或为空`);
      if (c[k] === '[EMPTY]') {
        /* §25 反哺：抽取失败占位标记，警告而非阻断（DM 可人工补全） */
        warnings.push(`${where}.${k} = '[EMPTY]'（文档抽取失败，需人工补全或重跑 extract-docx.py）`);
      }
    }
    if (c.color !== undefined && !RE_HEX.test(c.color || '')) errors.push(`${where}.color 非法: ${c.color}（须 #rrggbb）`);
    /* medical：可选字段（范式 9·角色专长档案，未启用时省略；启用时必须是布尔值） */
    if (c.medical !== undefined && typeof c.medical !== 'boolean') errors.push(`${where}.medical 必须是布尔值`);
    if (!isResPath(c.script)) errors.push(`${where}.script 必须是 res/ 开头的路径: ${c.script}`);
    if (!isArr(c.scriptPages) || c.scriptPages.length === 0) errors.push(`${where}.scriptPages 缺失或为空数组`);
    else {
      c.scriptPages.forEach((s, j) => { if (!isResPath(s)) errors.push(`${where}.scriptPages[${j}] 非法: ${s}`); });
      if (c.scriptPages.length !== new Set(c.scriptPages).size) errors.push(`${where}.scriptPages 存在重复页面`);
      if (c.script && !c.scriptPages.includes(c.script)) warnings.push(`${where}.script 未包含在 scriptPages 中（p1.png 应为第一页）`);
    }
    if (isObj(c.startClue) && !isNonEmptyStr(c.startClue.text)) errors.push(`${where}.startClue.text 缺失或为空`);
  };
  (data.characters || []).forEach(checkChar);

  /* areas + clues */
  const checkClue = (c, areaId, i) => {
    const where = `areas.${areaId}.clues[${i}]`;
    if (!isObj(c)) { errors.push(`${where} 必须是对象`); return; }
    mark(c.id, where);
    if (!RE_SLUG.test(c.id || '')) errors.push(`${where}.id 非法: ${c.id}`);
    if (!isNonEmptyStr(c.title)) errors.push(`${where}.title 缺失或为空`);
    if (!isNonEmptyStr(c.text)) errors.push(`${where}.text 缺失或为空`);
    if (![0, 1].includes(c.card)) errors.push(`${where}.card 非法: ${c.card}（须 0/1）`);
    if (c.state !== undefined && !STATES.includes(c.state)) errors.push(`${where}.state 非法: ${c.state}`);
    if (c.visible !== undefined && !VISIBLES.includes(c.visible)) errors.push(`${where}.visible 非法: ${c.visible}`);
    if (c.code !== undefined && c.code !== null && !RE_4D.test(String(c.code))) errors.push(`${where}.code 非法: ${c.code}（须 4 位数字或 null）`);
    if (c.images !== undefined && !isArr(c.images)) errors.push(`${where}.images 必须是数组`);
  };
  (data.areas || []).forEach((a, i) => {
    const where = `areas[${i}]`;
    if (!isObj(a)) { errors.push(`${where} 必须是对象`); return; }
    mark(a.id, where);
    if (!RE_SLUG.test(a.id || '')) errors.push(`${where}.id 非法: ${a.id}`);
    if (!isNonEmptyStr(a.name)) errors.push(`${where}.name 缺失或为空`);
    if (!isNum(a.apCost) || a.apCost < 0) errors.push(`${where}.apCost 非法: ${a.apCost}`);
    if (a.type !== undefined && !isNonEmptyStr(a.type)) errors.push(`${where}.type 必须是非空字符串`);
    if (a.locked !== undefined && typeof a.locked !== 'boolean') errors.push(`${where}.locked 必须是布尔值`);
    if (a.mapImage !== undefined && a.mapImage !== null && !isResPath(a.mapImage)) errors.push(`${where}.mapImage 非法: ${a.mapImage}`);
    (a.clues || []).forEach((c, j) => checkClue(c, a.id, j));
  });

  /* medicalFiles */
  (data.medicalFiles || []).forEach((m, i) => {
    const where = `medicalFiles[${i}]`;
    if (!isObj(m)) { errors.push(`${where} 必须是对象`); return; }
    mark(m.id, where);
    if (!RE_SLUG.test(m.id || '')) errors.push(`${where}.id 非法: ${m.id}`);
    if (!isNonEmptyStr(m.title)) errors.push(`${where}.title 缺失或为空`);
    if (m.state !== undefined && !STATES.includes(m.state)) errors.push(`${where}.state 非法: ${m.state}`);
    if (m.visible !== undefined && !VISIBLES.includes(m.visible)) errors.push(`${where}.visible 非法: ${m.visible}`);
    if (m.code !== undefined && m.code !== null && !RE_4D.test(String(m.code))) errors.push(`${where}.code 非法: ${m.code}`);
    if (m.image !== undefined && m.image !== null && !isResPath(m.image)) errors.push(`${where}.image 非法: ${m.image}`);
  });

  /* timeline */
  (data.timeline || []).forEach((t, i) => {
    const where = `timeline[${i}]`;
    if (!isObj(t)) { errors.push(`${where} 必须是对象`); return; }
    mark(t.id, where);
    if (!isNonEmptyStr(t.id)) errors.push(`${where}.id 缺失`);
    if (!isNonEmptyStr(t.code)) errors.push(`${where}.code 缺失或为空`);
    if (!isNonEmptyStr(t.time)) errors.push(`${where}.time 缺失或为空`);
    if (!isNonEmptyStr(t.title)) errors.push(`${where}.title 缺失或为空`);
    if (!isNonEmptyStr(t.text)) errors.push(`${where}.text 缺失或为空`);
  });

  /* truth */
  if (isObj(data.truth)) {
    if (!isNonEmptyStr(data.truth.text)) errors.push('truth.text 缺失或为空');
    if (data.truth.image !== undefined && data.truth.image !== null && !isResPath(data.truth.image)) errors.push('truth.image 非法');
  }

  /* rules */
  (data.rules || []).forEach((r, i) => {
    const where = `rules[${i}]`;
    if (!isObj(r)) { errors.push(`${where} 必须是对象`); return; }
    mark(r.id, where);
    if (!isNonEmptyStr(r.title)) errors.push(`${where}.title 缺失或为空`);
    if (!isResPath(r.file)) errors.push(`${where}.file 必须是 res/ 开头的路径: ${r.file}`);
  });

  errors.push(...dupes.map(d => `id 重复: ${d}`));

  const resources = collectResourcePaths(data, mark);
  return { ok: errors.length === 0, errors, warnings, resources };
}

function main() {
  const args = process.argv.slice(2);
  const dataPath = path.resolve((args.includes('--data') ? args[args.indexOf('--data') + 1] : 'data.json') || 'data.json');
  if (!fs.existsSync(dataPath)) { console.error('[ERROR] data.json 不存在:', dataPath); process.exit(1); }
  const r = run(dataPath);
  console.log(`📋 校验 ${dataPath}`);
  console.log(`   资源引用: ${r.resources.length} 处`);
  if (r.warnings.length) { console.log('   ⚠ 警告:'); r.warnings.forEach(w => console.log('     - ' + w)); }
  if (r.ok) {
    console.log('   ✅ 数据通过校验');
    process.exit(0);
  }
  console.log('   ❌ 校验失败:');
  r.errors.forEach(e => console.log('     - ' + e));
  process.exit(1);
}

module.exports = { run, collectResourcePaths };

if (require.main === module) main();
