#!/usr/bin/env node
/* %PROJECT_TITLE% · 一键构建脚本 (build.cjs)
 * 把剧本目录（data.json + res/）组装成可运行应用：
 *   1. 拷贝资源  res/ -> out/public/res
 *   2. 写入剧本  data.json + data.preset.json（重置用只读快照）
 *   3. 填充模板  server.js / 前端 js / css / html / bat
 *   4. 主题接入  --theme 预设 或 --genre+--seed 现场生成
 *   5. 质检关卡  validate-data + check-res，不合格即失败
 *
 *   node build.cjs --script ./剧本目录 --out ./my-app \
 *        --title "<剧本标题>" --title-ascii "<Title Ascii>" --port 3031 \
 *        --logo "<logo>" --theme castle --claim-sub "<认领副标题>"
 *
 *   # 现场生成新主题（题材候选池采样，seed 可复现）
 *   node build.cjs --script ./剧本目录 --out ./my-app \
 *        --title "<剧本标题>" --genre gothic --seed 42 --name <主题名>
 *
 * 模板占位符（%X%）见各 *.template.* 文件；bat 中的 %PORT%/%errorlevel% 是
 * 运行时变量，本脚本绝不触碰。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ASSETS = __dirname;
const { run: runValidate } = require('./validate-data.template.cjs');
const { run: runCheckRes } = require('./check-res.template.cjs');

const PRESET_THEMES = ['castle', 'victorian', 'western', 'steam', 'noir', 'science', 'desert', 'theatre', 'cyber', 'qingci', 'hospital', 'maritime', 'fantasy', 'dunhuang', 'light', 'dark'];

/* ---------------- CLI ---------------- */
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

function fail(msg) { console.error('[FAIL] ' + msg); process.exit(1); }

/* ---------------- 文件工具 ---------------- */
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name), d = path.join(dst, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else if (ent.isFile()) fs.copyFileSync(s, d);
  }
}

function replaceTokens(content, map) {
  for (const [k, v] of Object.entries(map)) {
    content = content.split(k).join(v);
  }
  return content;
}

/* 从模板生成目标文件：读取 -> 替换 -> 写盘 */
function renderTemplate(tplFile, outFile, map) {
  const tpl = fs.readFileSync(path.join(ASSETS, tplFile), 'utf8');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, replaceTokens(tpl, map), 'utf8');
}

/* ---------------- 主流程 ---------------- */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  const scriptDir = path.resolve(args.script || '');
  const outDir = path.resolve(args.out || '');
  if (!fs.existsSync(scriptDir)) fail(`--script 目录不存在: ${scriptDir}`);
  const srcData = path.join(scriptDir, 'data.json');
  const srcRes = path.join(scriptDir, 'res');
  if (!fs.existsSync(srcData)) fail(`--script 目录缺少 data.json: ${srcData}`);
  if (!fs.existsSync(srcRes)) fail(`--script 目录缺少 res/ 资源目录: ${srcRes}`);

  const title = args.title || path.basename(scriptDir);
  const titleAscii = args['title-ascii'] || title.replace(/[^\x20-\x7E]/g, '').trim() || 'Mystery App';
  const port = parseInt(args.port, 10) || 3000;
  const logo = args.logo || '🎭';
  const claimSub = args['claim-sub'] || '向主持人领取 4 位认领码，以受邀宾客的身份进入这场晚宴';
  const claimBtn = args['claim-btn'] || '进入游戏';

  console.log(`🏗  构建剧本杀应用`);
  console.log(`   剧本: ${scriptDir}`);
  console.log(`   输出: ${outDir}  标题: ${title}  端口: ${port}`);

  /* ---- 主题解析 ---- */
  let themeName = null, themeCssLink = '';
  const wantTheme = args.theme && args.theme !== 'true' ? args.theme : null;
  const wantGen = args.genre && args.genre !== 'true' ? args.genre : null;
  const themeFile = args['theme-file'] && args['theme-file'] !== 'true' ? path.resolve(args['theme-file']) : null;

  if (wantGen) {
    const seed = parseInt(args.seed, 10) || 2026;
    const genName = (args.name && args.name !== 'true') ? args.name : `${wantGen}-${seed}`;
    const genOut = path.join(outDir, 'public', 'css');
    await new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      const p = spawn(process.execPath, [
        path.join(ASSETS, 'gen-theme.template.cjs'),
        '--genre', wantGen, '--seed', String(seed), '--name', genName, '--out', genOut
      ], { stdio: 'inherit' });
      p.on('close', code => code === 0 ? resolve() : reject(new Error(`gen-theme 退出码 ${code}`)));
    });
    themeName = genName;
  } else if (themeFile) {
    if (!fs.existsSync(themeFile)) fail(`--theme-file 不存在: ${themeFile}`);
    themeName = (args.name && args.name !== 'true') ? args.name : path.basename(themeFile, path.extname(themeFile)).replace(/^theme-/, '');
    fs.mkdirSync(path.join(outDir, 'public', 'css'), { recursive: true });
    fs.copyFileSync(themeFile, path.join(outDir, 'public', 'css', `theme-${themeName}.css`));
  } else if (wantTheme) {
    themeName = wantTheme;
    const presetCss = path.join(ASSETS, `theme-${wantTheme}.css`);
    if (!fs.existsSync(presetCss)) fail(`预设主题不存在: ${wantTheme}（可用: ${PRESET_THEMES.join(' / ')}，或用 --genre 现场生成）`);
    fs.mkdirSync(path.join(outDir, 'public', 'css'), { recursive: true });
    fs.copyFileSync(presetCss, path.join(outDir, 'public', 'css', `theme-${wantTheme}.css`));
  }

  /* 主题切换库：把所有预置主题一并拷入，保证 ?theme= 可切换到任意预置且无 404 */
  if (wantGen || themeFile || wantTheme) {
    fs.mkdirSync(path.join(outDir, 'public', 'css'), { recursive: true });
    for (const preset of PRESET_THEMES) {
      const presetCss = path.join(ASSETS, `theme-${preset}.css`);
      if (fs.existsSync(presetCss)) {
        fs.copyFileSync(presetCss, path.join(outDir, 'public', 'css', `theme-${preset}.css`));
      }
    }
  }
  if (themeName) {
    themeCssLink = `<link rel="stylesheet" href="/css/theme-${themeName}.css" data-theme-css="${themeName}">`;
    console.log(`   主题: ${themeName}（${themeCssLink.trim()}）`);
  } else {
    console.log(`   主题: 默认（style.css，未指定 --theme/--genre）`);
  }

  /* ---- 1. 资源 ---- */
  copyDir(srcRes, path.join(outDir, 'public', 'res'));
  console.log('   [1/5] 资源已拷贝  res/ -> public/res/');

  /* ---- 2. 数据 ---- */
  const data = JSON.parse(fs.readFileSync(srcData, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'data.json'), JSON.stringify(data, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, 'data.preset.json'), JSON.stringify(data, null, 2), 'utf8');
  console.log('   [2/5] 剧本数据已写入  data.json + data.preset.json');

  /* ---- 3. 模板填充 ---- */
  const map = {
    '%PROJECT_TITLE%': title,
    '%PROJECT_TITLE_ASCII%': titleAscii,
    '%PORT_DEFAULT%': String(port),
    '%DEFAULT_THEME%': themeName || 'default',
    '%THEME_CSS%': themeCssLink,
    '%PROJECT_LOGO%': logo,
    '%CLAIM_SUB%': claimSub,
    '%CLAIM_BTN%': claimBtn,
    '%CHARACTERS_JSON%': JSON.stringify(data.characters || []),
    '%AREAS_JSON%': JSON.stringify(data.areas || []),
    '%MEDICAL_FILES_JSON%': JSON.stringify(data.medicalFiles || []),
    '%TIMELINE_JSON%': JSON.stringify(data.timeline || []),
    '%TRUTH_JSON%': JSON.stringify(data.truth || {}),
    '%RULES_JSON%': JSON.stringify(data.rules || []),
    '%DMREFS_JSON%': JSON.stringify(data.dmRefs || [])
  };
  const batMap = { '%PROJECT_TITLE_ASCII%': titleAscii };  // %PORT%/%errorlevel% 保持运行时

  renderTemplate('server.template.js', path.join(outDir, 'server.js'), map);
  renderTemplate('common.template.js', path.join(outDir, 'public', 'js', 'common.js'), { '%PROJECT_TITLE%': title });
  renderTemplate('player.template.js', path.join(outDir, 'public', 'js', 'player.js'), { '%PROJECT_TITLE%': title });
  renderTemplate('dm.template.js', path.join(outDir, 'public', 'js', 'dm.js'), { '%PROJECT_TITLE%': title });
  renderTemplate('style.template.css', path.join(outDir, 'public', 'css', 'style.css'), { '%PROJECT_TITLE%': title });
  renderTemplate('player.template.html', path.join(outDir, 'public', 'player.html'), map);
  renderTemplate('dm.template.html', path.join(outDir, 'public', 'dm.html'), map);
  for (const bat of ['start', 'install', 'stop']) {
    renderTemplate(`${bat}.template.bat`, path.join(outDir, `${bat}.bat`), batMap);
  }
  console.log('   [3/5] 模板已填充  server.js / 前端 / bat');

  /* ---- 4. 收尾脚本 ---- */
  renderTemplate('pdf-to-png.template.cjs', path.join(outDir, 'tools', 'pdf-to-png.cjs'), { '%PROJECT_TITLE%': title });
  /* api-flow-test 占位符：自动从 data.json 头两位角色推断 A/B；可由 CLI --player-a-id / --player-b-id 覆盖 */
  const flowMap = { '%PROJECT_TITLE%': title, '%PORT_DEFAULT%': String(port) };
  const chars = (data.characters || []);
  flowMap['A_CHAR_ID'] = (args['player-a-id'] && args['player-a-id'] !== 'true') ? args['player-a-id'] : (chars[0]?.id || 'A_CHAR_ID');
  flowMap['B_CHAR_ID'] = (args['player-b-id'] && args['player-b-id'] !== 'true') ? args['player-b-id'] : (chars[1]?.id || 'B_CHAR_ID');
  flowMap['A_VOTE_ID'] = (args['player-a-vote'] && args['player-a-vote'] !== 'true') ? args['player-a-vote'] : flowMap['B_CHAR_ID'];
  flowMap['B_VOTE_ID'] = (args['player-b-vote'] && args['player-b-vote'] !== 'true') ? args['player-b-vote'] : flowMap['A_CHAR_ID'];
  renderTemplate('api-flow-test.template.cjs', path.join(outDir, 'tools', 'api-flow-test.cjs'), flowMap);
  console.log(`   [4/5] 工具脚本已拷贝  tools/pdf-to-png.cjs + api-flow-test.cjs（A=${flowMap['A_CHAR_ID']} 投 ${flowMap['A_VOTE_ID']}，B=${flowMap['B_CHAR_ID']} 投 ${flowMap['B_VOTE_ID']}）`);

  /* ---- 5. 质检关卡 ---- */
  const outData = path.join(outDir, 'data.json');
  const outPublic = path.join(outDir, 'public');
  const v = runValidate(outData);
  const r = runCheckRes(outData, outPublic);
  let gateOk = true;
  console.log('   [5/5] 质检关卡');
  if (v.ok) console.log('     ✅ validate-data 通过');
  else { gateOk = false; v.errors.forEach(e => console.log('     ❌ ' + e)); }
  if (r.ok) console.log(`     ✅ check-res 通过（${r.checked} 处资源）`);
  else { gateOk = false; r.missing.forEach(m => console.log('     ❌ ' + m)); }
  for (const w of [...v.warnings, ...r.warnings]) console.log('     ⚠ ' + w);
  if (!gateOk) fail('质检未通过，请修复后重跑。');

  console.log('');
  console.log('✅ 构建完成');
  console.log('   启动: 双击 start.bat（或 node server.js）');
  console.log(`   玩家端: http://localhost:${port}/   主持人端: http://localhost:${port}/host`);
  console.log('   主题: ' + (themeName ? `data-theme="${themeName}"（?theme= 可切换）` : '默认主题'));
}

main().catch(e => { console.error(e); process.exit(1); });
