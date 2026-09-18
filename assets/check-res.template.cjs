#!/usr/bin/env node
/* %PROJECT_TITLE% · 资源完整性检查器 (check-res.cjs)
 * 收集 data.json 中所有 res/ 引用，逐一核对在 public/ 下真实存在。
 * 同时做脚本分页连续性软检查（p1..pN 缺页告警）。
 *
 *   node check-res.cjs --data ./data.json --public ./public
 *
 * 依赖 validate-data.cjs 的 collectResourcePaths；也可被 build.cjs require。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { collectResourcePaths } = require('./validate-data.template.cjs');

/* 返回 { ok, missing[], warnings[], checked } */
function run(dataPath, publicDir, opts = {}) {
  const missing = [];
  const warnings = [];
  let data;
  try {
    data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (e) {
    return { ok: false, missing: [`无法读取 ${dataPath}: ${e.message}`], warnings, checked: 0 };
  }

  const paths = collectResourcePaths(data);
  const checked = paths.length;
  for (const { p, where } of paths) {
    if (!p) continue;
    const rel = p.replace(/^\/+/, '').replace(/\\/g, '/');
    const fp = path.join(publicDir, rel);
    if (!fs.existsSync(fp)) missing.push(`${p}（${where}）`);
  }

  /* 脚本分页连续性：res/scripts/<char>/p1..pN 缺页检测 */
  for (const c of data.characters || []) {
    const pages = (c.scriptPages || []);
    if (!pages.length) continue;
    const nums = pages.map(p => {
      const m = /p(\d+)\.\w+$/i.exec(p.replace(/\\/g, '/'));
      return m ? parseInt(m[1], 10) : 0;
    }).filter(n => n > 0).sort((a, b) => a - b);
    if (!nums.length) continue;
    for (let i = 1; i <= nums[nums.length - 1]; i++) {
      if (!nums.includes(i)) warnings.push(`角色 ${c.id} 缺少剧本第 ${i} 页（页序 p1..pN 应连续）`);
    }
    if (nums[0] !== 1) warnings.push(`角色 ${c.id} 剧本应从 p1 开始，实际首页 p${nums[0]}`);
  }

  return { ok: missing.length === 0, missing, warnings, checked };
}

function main() {
  const args = process.argv.slice(2);
  const get = (k, d) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : d;
  };
  const dataPath = path.resolve(get('--data', 'data.json'));
  const publicDir = path.resolve(get('--public', 'public'));
  if (!fs.existsSync(dataPath)) { console.error('[ERROR] data.json 不存在:', dataPath); process.exit(1); }
  if (!fs.existsSync(publicDir)) { console.error('[ERROR] public 目录不存在:', publicDir); process.exit(1); }

  const r = run(dataPath, publicDir);
  console.log(`🗂  资源检查 ${dataPath} -> ${publicDir}`);
  console.log(`   引用路径: ${r.checked} 处`);
  if (r.warnings.length) {
    console.log('   ⚠ 警告:');
    r.warnings.forEach(w => console.log('     - ' + w));
  }
  if (r.ok && !r.missing.length) {
    console.log('   ✅ 全部资源存在');
    process.exit(0);
  }
  console.log('   ❌ 缺失资源:');
  r.missing.forEach(m => console.log('     - ' + m));
  process.exit(1);
}

module.exports = { run };

if (require.main === module) main();
