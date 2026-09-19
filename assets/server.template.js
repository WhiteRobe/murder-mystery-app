/* %PROJECT_TITLE% · Murder Mystery DM Server (zero-dependency Node.js) */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const os   = require('os');
const { URL } = require('url');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const RES_DIR = PUBLIC_DIR;  // 资源根 = public，所有资源路径以 'res/' 开头
const PORT_DEFAULT = %PORT_DEFAULT%;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js':  'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg'
};

/* ======================== 工具 ======================== */
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randStr(len, cs) {
  cs = cs || ALPHA;
  let s = '';
  for (let i = 0; i < len; i++) s += cs[crypto.randomInt(cs.length)];
  return s;
}
function newToken()   { return randStr(32); }
function claimCode()  {
  let c;
  do { c = String(crypto.randomInt(1000, 10000)); }
  while (DB.players.some(p => p.claimCode === c));
  return c;
}
/* 线索 code 随机化（4 位数字，0-9999）
 *
 * 设计原则：
 * - 硬约束 #4 要求 4 位数字（0001-9999），保持兼容
 * - 旧实现 clueCode(seq)=padStart(4,'0') 是全局严格递增；玩家看到 0001/0002/0003
 *   即可反推"这是我连续搜的第 N 条" → 暴露游戏节奏与搜证顺序
 * - 新实现：从 [1000, 9999] 范围内真随机抽取（避开 0000 让 4 位看起来更像真实序号）
 * - 防近邻：拒绝与"最近 N 条已用 code"差值 ≤ NEAR_GAP 的候选，防止玩家连搜几条后
 *   看出相邻规律
 * - 防反推：拒绝与"任意其他玩家已解锁线索 code"差值 ≤ INFER_GAP 的候选，防止
 *   通过 B 的公开 code 反推 A 的隐藏 code
 * - 唯一性：维护 usedClueCodes Set，O(1) 去重
 * - 兜底：候选冲突 > MAX_TRIES 时回退到全局随机 + 去重（保证总能生成）
 * - 仍然零依赖，只用 crypto.randomInt（已是 crypto.randomInt 而非 Math.random）
 */
const CODE_MIN = 1000;             // 0000 看起来像"未生成"，避开
const CODE_MAX = 10000;            // 上界 10000（含）
const NEAR_GAP = 50;               // 与最近 N 条差值 < 50 → 拒绝
const NEAR_WINDOW = 10;            // 考虑最近 10 条
const INFER_GAP = 5;               // 与任意其他 code 差值 < 5 → 拒绝（防反推）
const MAX_TRIES = 200;             // 找候选的最大尝试次数

let usedClueCodes = new Set();     // 全局已用 code
let recentCodes = [];              // 最近生成的 code（FIFO，限长 NEAR_WINDOW）

function randomClueCode() {
  for (let i = 0; i < MAX_TRIES; i++) {
    const n = crypto.randomInt(CODE_MIN, CODE_MAX);
    if (usedClueCodes.has(n)) continue;
    /* 防近邻：与最近 NEAR_WINDOW 条 code 差值都不能 < NEAR_GAP */
    let tooClose = false;
    for (const r of recentCodes) {
      if (Math.abs(r - n) < NEAR_GAP) { tooClose = true; break; }
    }
    if (tooClose) continue;
    /* 防反推：与全局已用 code 差值不能 < INFER_GAP */
    let inferable = false;
    for (const u of usedClueCodes) {
      if (u !== n && Math.abs(u - n) < INFER_GAP) { inferable = true; break; }
    }
    if (inferable) continue;
    return n;
  }
  /* 兜底：找任意未用的 code（仍保证唯一） */
  for (let i = 0; i < MAX_TRIES; i++) {
    const n = crypto.randomInt(CODE_MIN, CODE_MAX);
    if (!usedClueCodes.has(n)) return n;
  }
  /* 终极兜底（理论不会到这，10000-1000=9000 个槽位用完才会触发） */
  throw new Error('线索 code 池已耗尽，请重启游戏。');
}
function nextClueCode() {
  const n = randomClueCode();
  usedClueCodes.add(n);
  recentCodes.push(n);
  if (recentCodes.length > NEAR_WINDOW) recentCodes.shift();
  return String(n).padStart(4, '0');
}
function now()        { return Date.now(); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ======================== 数据存取 ======================== */
let DB = null;
const sessions = new Map();

function pickDataFile() {
  const preset = path.join(ROOT, 'data.preset.json');
  const pick = (fp) => {
    try {
      const d = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (d && d.characters && d.characters.length && d.areas && d.areas.length) return d;
    } catch (e) { /* fall through */ }
    return null;
  };
  const d = fs.existsSync(DATA_FILE) ? pick(DATA_FILE) : null;
  if (d) return d;
  if (fs.existsSync(preset)) return pick(preset);
  return null;
}

function loadDB() {
  const loaded = pickDataFile();
  if (loaded) { DB = loaded; }
  else {
    DB = buildDefaultData();
    saveDB();
  }
  normalizeGameState();
  /* settings 兜底（新增范式开关等）：data.json 可省略，由此处补齐默认值，避免下游访问 undefined.xxx 崩 */
  DB.settings = DB.settings || {};
  if (typeof DB.settings.enableMedicalFiles !== 'boolean') DB.settings.enableMedicalFiles = false;
  if (DB.settings.maxSearchesPerArea === undefined) DB.settings.maxSearchesPerArea = 2;
  if (typeof DB.settings.combatEnabled !== 'boolean') DB.settings.combatEnabled = false;
  if (migrateCodes()) saveDB();
  initClueSeq();
  loadMessageSeq();
}
/* 兼容旧存档：补全计时器字段 */
function normalizeGameState() {
  const g = DB.game = DB.game || {};
  if (!Array.isArray(g.phaseHistory)) g.phaseHistory = [];
  if (g.startedAt === undefined) g.startedAt = 0;
  if (!Array.isArray(g.messages)) g.messages = [];
  if (typeof g.messageSeq !== 'number') g.messageSeq = 0;
  if (!Array.isArray(g.combats)) g.combats = [];
  /* 玩家 items/state 兜底（references/12 范式 3+5） */
  for (const p of (DB.players || [])) {
    if (!Array.isArray(p.items)) p.items = [];
    if (!p.state) p.state = 'healthy';
  }
}
/* 兼容旧存档：把旧格式线索码（C01-ZQAV）迁移为 4 位数字码（0001） */
function migrateCodes() {
  let changed = false;
  const isOld = x => x && typeof x.code === 'string' && /^C\d{2}-[A-Z0-9]{4}$/i.test(x.code);
  for (const a of DB.areas) for (const c of a.clues) if (isOld(c)) { c.code = null; changed = true; }
  for (const m of (DB.medicalFiles || [])) if (isOld(m)) { m.code = null; changed = true; }
  if (changed) initClueSeq();
  for (const a of DB.areas) for (const c of a.clues) if (c.state === 'unlocked' && !c.code) c.code = nextClueCode();
  for (const m of (DB.medicalFiles || [])) if (m.state === 'unlocked' && !m.code) m.code = nextClueCode();
  return changed;
}
function initClueSeq() {
  /* 初始化线索 code 池：把所有已存在的 4 位数字 code 加入 usedClueCodes；
   * recentCodes 留空（新游戏不与历史 code 形成"连续感"）。
   * 旧实现是 clueSeq = maxSeq + 1（连续递增），新实现改为集合去重。
   */
  usedClueCodes = new Set();
  recentCodes = [];
  for (const a of DB.areas) for (const c of a.clues) {
    const m = /^(\d{4})$/.exec(String(c.code || ''));
    if (m) usedClueCodes.add(parseInt(m[1], 10));
  }
  for (const m of (DB.medicalFiles || [])) {
    const m2 = /^(\d{4})$/.exec(String(m.code || ''));
    if (m2) usedClueCodes.add(parseInt(m2[1], 10));
  }
}
function saveDB() {
  try {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(DB, null, 2), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(DB, null, 2), 'utf8'); }
    catch (e2) { console.error('[ERROR] cannot write data.json: ' + e2.message); }
  }
}
function addLog(text) {
  DB.log.push({ time: now(), text });
  if (DB.log.length > 500) DB.log = DB.log.slice(-500);
}
function announce(text, type) {
  type = type || 'info';
  DB.game.announcements.push({
    id: 'a' + Date.now().toString(36) + randStr(2),
    text, type, time: now()
  });
  if (DB.game.announcements.length > 80) DB.game.announcements = DB.game.announcements.slice(-80);
  addLog('[announce] ' + text);
}
function notifyPlayer(playerId, text, type) {
  const p = getPlayer(playerId);
  if (!p) return;
  p.notifications = p.notifications || [];
  p.notifications.push({
    id: 'n' + Date.now().toString(36) + randStr(2),
    text, type: type || 'info', time: now(), read: false
  });
  if (p.notifications.length > 100) p.notifications = p.notifications.slice(-100);
}

/* ======================== 默认数据 ======================== */
function buildDefaultData() {
  return {
    version: 1,
    settings: {
      port: PORT_DEFAULT,
      maxSearchesPerArea: 2,
      searchIntervalMinutes: 0,
      /* 打斗/裁决机制（references/12 范式 6） */
      combatEnabled: false,             // 总开关；剧本启用了才生效；旧剧本不影响
      combatItemAdvantage: ['gun', 'sharp', 'normal'],  // 默认优势表：gun > sharp > normal
      /* 医疗档案机制（references/12 范式 9，可选） */
      enableMedicalFiles: false         // 总开关；data.json 有 medicalFiles 且设 true 才启用
    },
    game: {
      phase: 'setup',
      phaseUpdatedAt: now(),
      currentStep: -1,
      truthUnlocked: false,
      announcements: []
    },
    characters: %CHARACTERS_JSON%,
    players: [],
    areas: %AREAS_JSON%,
    medicalFiles: %MEDICAL_FILES_JSON%,
    timeline: %TIMELINE_JSON%,
    truth: %TRUTH_JSON%,
    rules: %RULES_JSON%,
    log: [],
    dmRefs: %DMREFS_JSON%
  };
}

/* ======================== 查找 ======================== */
function getPlayer(id)        { return DB.players.find(p => p.id === id); }
function getCharacter(id)     { return DB.characters.find(c => c.id === id); }
function getArea(id)          { return DB.areas.find(a => a.id === id); }
function getClue(areaId, id)  {
  const a = getArea(areaId); if (!a) return null;
  return a.clues.find(c => c.id === id);
}
function getMedicalFile(id)   { return DB.medicalFiles.find(m => m.id === id); }

/* ======================== code 反查 ======================== */
function findClueByCode(code) {
  code = String(code || '').toUpperCase();
  if (/^\d{1,4}$/.test(code)) code = code.padStart(4, '0');
  for (const a of DB.areas) {
    for (const c of a.clues) {
      if (c.code && c.code.toUpperCase() === code) {
        return { kind: 'clue', ref: c, area: a };
      }
    }
  }
  for (const m of DB.medicalFiles) {
    if (m.code && m.code.toUpperCase() === code) {
      return { kind: 'medical', ref: m };
    }
  }
  return null;
}
function findRefByPath(p) {
  for (const c of DB.characters) {
    if (c.script === p) return { kind: 'script', charId: c.id };
    if (c.scriptPages && c.scriptPages.includes(p)) return { kind: 'script', charId: c.id };
    if (c.startClue && c.startClue.image === p) return { kind: 'startClue', charId: c.id };
  }
  for (const a of DB.areas) {
    for (const c of a.clues) if ((c.images || []).includes(p)) return { kind: 'clue', clueId: c.id, areaId: a.id };
  }
  for (const m of DB.medicalFiles) if (m.image === p) return { kind: 'medical', fileId: m.id };
  if (DB.truth && DB.truth.image === p) return { kind: 'truth' };
  for (const r of DB.rules) if (r.file === p) return { kind: 'rule' };
  for (const d of (DB.dmRefs || [])) {
    const pages = d.pages && d.pages.length ? d.pages : (d.file ? [d.file] : []);
    if (pages.includes(p)) return { kind: 'dmref', dmRefId: d.id };
  }
  return null;
}

/* ======================== 鉴权 ======================== */
function viewerFromReq(req, body) {
  const token = (req.headers['x-token'] || (body && body.token) || '').trim();
  if (!token) return null;
  const sess = sessions.get(token);
  if (!sess) return null;
  if (sess.type === 'dm') return { dm: true, token };
  if (sess.type === 'player') {
    const p = getPlayer(sess.playerId);
    if (!p) return null;
    return { player: p, token };
  }
  return null;
}
function clueAccessibleByPlayer(clue, player) {
  if (clue.state !== 'unlocked') return false;
  if (clue.visible === 'public')  return true;
  if (clue.holder === player.id)  return true;
  return false;
}
function medicalAccessibleByPlayer(m, player) {
  if (m.state !== 'unlocked') return false;
  if (m.visible === 'public') return true;
  if (m.holder === player.id) return true;
  return false;
}

/* ======================== 资源白名单 ======================== */
const DM_REF_FILES = [];  // 服务启动时从 DB.dmRefs 填充

function reloadDMRefs() {
  DM_REF_FILES.length = 0;
  for (const d of (DB.dmRefs || [])) {
    const pages = d.pages && d.pages.length ? d.pages : (d.file ? [d.file] : []);
    for (const pg of pages) DM_REF_FILES.push(pg);
  }
}

/* ======================== 玩家逻辑 ======================== */
function doClaim(code) {
  code = String(code || '').trim();
  if (/^\d{1,4}$/.test(code)) code = code.padStart(4, '0');
  const p = DB.players.find(x => x.claimCode === code);
  if (!p) return { ok: false, error: '认领码无效。' };
  if (!getCharacter(p.characterId)) return { ok: false, error: '角色数据缺失。' };
  const token = newToken();
  sessions.set(token, { type: 'player', playerId: p.id });
  addLog('玩家认领：' + (p.playerName || '') + ' → ' + p.characterId);
  return { ok: true, token, player: p };
}

function doSearch(player, areaId) {
  const area = getArea(areaId);
  if (!area) return { ok: false, error: '区域不存在。' };
  if (area.locked) return { ok: false, error: '该区域已被主持人锁定。' };
  if (DB.game.phase === 'setup') return { ok: false, error: '游戏尚未开始。' };
  const char = getCharacter(player.characterId);
  if (area.type === 'bullets' && player.characterId !== 'carter') {
    return { ok: false, error: '只有指定角色才能执行此操作。' };
  }
  if ((area.owner || []).includes(player.characterId) && !area.allowOwner) {
    return { ok: false, error: '不能搜索自己持有的物品（证据保全）。' };
  }
  if (player.ap < area.apCost) return { ok: false, error: 'AP 不足，需要 ' + area.apCost + ' 点 AP。' };
  const st = player.searches[areaId] || { count: 0, last: 0 };
  if (st.count >= DB.settings.maxSearchesPerArea) {
    return { ok: false, error: '该区域最多搜索：' + DB.settings.maxSearchesPerArea };
  }
  const intervalMin = DB.settings.searchIntervalMinutes;
  if (intervalMin > 0) {
    const waitMs = st.last + intervalMin * 60000 - now();
    if (waitMs > 0) {
      return { ok: false, error: '请等待 ' + Math.ceil(waitMs / 60000) + ' 分钟后再搜索。' };
    }
  }
  if (area.requireUnlocked && area.requireUnlocked.length) {
    for (const rid of area.requireUnlocked) {
      const c = getClue(areaId, rid);
      if (!c || c.state !== 'unlocked') return { ok: false, error: area.note || '前置线索未解锁。' };
    }
  }
  const nextClue = area.clues.find(c => c.state === 'locked' && (c.unlockStep === undefined || c.unlockStep <= DB.game.currentStep));
  if (!nextClue) {
    /* 无线索 / 阶段未到：不扣 AP、不计入搜证次数，玩家可换区域或等下一轮（按需时） */
    addLog(player.playerName + ' 搜索了“' + area.name + '”：无结果（未扣 AP）');
    return { ok: true, ap: player.ap, empty: true, error: '该区域当前没有可搜的线索（未扣 AP）。' };
  }
  player.ap -= area.apCost;
  nextClue.state = 'unlocked';
  nextClue.holder = player.id;
  if (!nextClue.code) nextClue.code = nextClueCode();
  player.searches[areaId] = { count: st.count + 1, last: now() };
  saveDB();
  addLog(player.playerName + ' 搜索了“' + area.name + '”获得：' + nextClue.title);
  return { ok: true, ap: player.ap, clue: nextClue, areaName: area.name };
}

function doMedical(player, fileId, interpreterId) {
  /* 范式 9 · 角色专长档案（可选）：开关未启用时直接拒绝 */
  if (!DB.settings.enableMedicalFiles) return { ok: false, error: '本剧本未启用医疗档案机制。' };
  const m = getMedicalFile(fileId);
  if (!m) return { ok: false, error: '档案不存在。' };
  if (m.state === 'unlocked') return { ok: false, error: '该档案已解锁。' };
  if (player.ap < 1) return { ok: false, error: 'AP 不足。' };
  const char = getCharacter(player.characterId);
  if (char.medical) {
    player.ap -= 1;
    m.state = 'unlocked';
    m.holder = player.id;
    if (!m.code) m.code = nextClueCode();
    saveDB();
    addLog(player.playerName + ' 解读了医疗档案：' + m.title);
    return { ok: true, ap: player.ap, file: m, via: 'self' };
  }
  if (!interpreterId) return { ok: false, error: '请选择医疗解读人。' };
  const interp = DB.players.find(p => p.id === interpreterId);
  if (!interp || !getCharacter(interp.characterId).medical) {
    return { ok: false, error: '解读人必须是医护人员。' };
  }
  player.ap -= 1;
  interp.ap -= 1;
  m.state = 'unlocked';
  m.holder = player.id;
  if (!m.code) m.code = nextClueCode();
  saveDB();
  addLog(player.playerName + ' 通过 ' + interp.playerName + ' 解读了医疗档案：' + m.title);
  return { ok: true, ap: player.ap, file: m, via: 'interpreter' };
}

function doVisible(player, clueId, visible) {
  let clue = null, areaId = null;
  for (const a of DB.areas) {
    const c = a.clues.find(x => x.id === clueId);
    if (c) { clue = c; areaId = a.id; break; }
  }
  if (!clue) return { ok: false, error: '线索不存在。' };
  if (clue.holder !== player.id) return { ok: false, error: '只有持有者可以修改可见性。' };
  /* §34 反哺：公开后不可收回（鼓励「信息一旦发布即不可撤回」的游戏机制） */
  if (clue.visible === 'public' && visible === 'private') {
    return { ok: false, error: '公开线索不可收回（一旦公开即对所有人可见）' };
  }
  clue.visible = visible;
  saveDB();
  return { ok: true };
}

function doVote(player, suspectId) {
  /* §26 反哺：投票只在 started 阶段 + 真相未揭晓时开放 */
  if (DB.game.phase !== 'started') {
    return { ok: false, error: '投票仅在「进行中」阶段开放，当前阶段：' + (PHASE_LABEL[DB.game.phase] || {}).label + '。' };
  }
  if (DB.game.truthUnlocked) {
    return { ok: false, error: '投票已结束（真相已揭晓）。' };
  }
  /* §37 R57：分轮开放投票——settings.voteFromStep 指定"指认投票"所在的剧情步（timeline 索引），
     未推进到该步前拒绝投票（默认 0 = 一进 started 即可投，兼容旧剧本） */
  const voteFrom = (DB.settings && typeof DB.settings.voteFromStep === 'number') ? DB.settings.voteFromStep : 0;
  if (DB.game.currentStep < voteFrom) {
    return { ok: false, error: '尚未到指认阶段，投票未开放。' };
  }
  const suspect = getCharacter(suspectId);
  if (!suspect) return { ok: false, error: '无效的指认对象。' };
  if (suspect.id === player.characterId) return { ok: false, error: '不能指认自己。' };
  player.vote = { suspectId: suspect.id, time: now() };
  saveDB();
  addLog(player.playerName + ' 指认了 ' + suspect.name);
  return { ok: true, suspectId: suspect.id, ap: player.ap };
}

/* ======================== 打斗 / 裁决（references/12 范式 6） ========================
 * 设计：DM 是法官。所有打斗请求先进 pending 队列，等 DM 在 DM 端裁决。
 * 零依赖：复用现有 player.item / player.state；不引入猜拳库（DM 端手点）。
 * 泛化：data.json settings.combatEnabled 开关（默认 false → 旧剧本不受影响）；
 *        items[].type ∈ ['gun','sharp','normal'] 用于裁决时的优势比较；
 *        失败方进入 injured 状态（范式 3 已有 player.state）。
 */
function findItemOnPlayer(p, itemId) {
  if (!Array.isArray(p.items)) return null;
  return p.items.find(it => it.id === itemId) || null;
}
function doCombatRequest(player, body) {
  if (!(DB.settings && DB.settings.combatEnabled)) return { ok: false, error: '本剧本未开启打斗。' };
  if (DB.game.phase !== 'started') return { ok: false, error: '当前阶段不能发起打斗。' };
  const targetId = String((body && body.targetId) || '');
  if (!targetId || targetId === player.id) return { ok: false, error: '无效的打击目标。' };
  const target = getPlayer(targetId);
  if (!target) return { ok: false, error: '目标玩家不存在。' };
  /* 失败方状态限制：昏迷/死亡/已受伤不能被新发起 */
  if (target.state === 'dead') return { ok: false, error: '目标已死亡。' };
  if (target.state === 'coma') return { ok: false, error: '目标处于昏迷状态。' };
  /* 发起者物品（可选） */
  const itemId = body && body.itemId;
  let attackerItem = null;
  if (itemId) {
    attackerItem = findItemOnPlayer(player, itemId);
    if (!attackerItem) return { ok: false, error: '你没有这件物品。' };
    if ((attackerItem.usesLeft || 0) <= 0) return { ok: false, error: '这件物品已用完。' };
  }
  const combat = {
    id: 'cbt_' + randStr(8).toLowerCase(),
    attackerId: player.id,
    defenderId: target.id,
    attackerItemId: itemId || null,
    defenderItemId: null,             /* DM 裁决时填入 */
    state: 'pending',                 /* pending → judged */
    winnerId: null,
    loserId: null,
    takenItemId: null,
    at: now()
  };
  DB.game.combats = DB.game.combats || [];
  DB.game.combats.push(combat);
  addLog(player.playerName + ' 对 ' + target.playerName + ' 发起了打斗（待裁决）');
  saveDB();
  return { ok: true, combat };
}
function dmJudgeCombat(dm, body) {
  if (!body || !body.combatId) return { ok: false, error: '缺少 combatId。' };
  const c = (DB.game.combats || []).find(x => x.id === body.combatId);
  if (!c) return { ok: false, error: '打斗请求不存在。' };
  if (c.state !== 'pending') return { ok: false, error: '已裁决，不可重复。' };
  const winnerId = body.winnerId;
  const loserId = (winnerId === c.attackerId) ? c.defenderId : c.attackerId;
  c.state = 'judged';
  c.winnerId = winnerId;
  c.loserId = loserId;
  /* 失败方：消耗发起者物品（若有）+ 进入受伤状态 */
  const attacker = getPlayer(c.attackerId);
  const defender = getPlayer(c.defenderId);
  if (c.attackerItemId) {
    const it = findItemOnPlayer(attacker, c.attackerItemId);
    if (it && (it.usesLeft || 0) > 0) it.usesLeft--;
  }
  /* 被夺物品 */
  if (body.takenItemId && loserId) {
    const loser = getPlayer(loserId);
    if (loser && Array.isArray(loser.items)) {
      const idx = loser.items.findIndex(it => it.id === body.takenItemId);
      if (idx >= 0) {
        const taken = loser.items.splice(idx, 1)[0];
        /* 转移到胜利方 */
        const win = getPlayer(winnerId);
        if (win) {
          win.items = win.items || [];
          win.items.push(taken);
        }
        c.takenItemId = body.takenItemId;
      }
    }
  }
  /* 失败方进入受伤状态（范式 3） */
  const loser = getPlayer(loserId);
  if (loser) {
    loser.state = 'injured';
    loser.stateChangedAt = now();
  }
  addLog('打斗裁决：' + (attacker ? attacker.playerName : '?') + ' vs ' + (defender ? defender.playerName : '?') + ' → 胜方 ' + (winnerId || '?'));
  saveDB();
  return { ok: true, combat: c };
}

/* ======================== 玩家私聊（references/14） ========================
 * 设计：复用现有 sessions + 轮询通道；DM 默认可看私信；不绑剧本题材。
 * 状态：DB.game.messages[] + DB.game.messageSeq（每次新增递增）。
 */
let messageSeq = 0;

function ensureMessages() {
  if (!Array.isArray(DB.game.messages)) DB.game.messages = [];
}

function doPlayerMessage(player, body) {
  ensureMessages();
  const s = DB.settings || {};
  if (s.allowPrivateMessages === false) return { ok: false, error: '本剧本已关闭私聊。' };
  const text = String((body && body.text) || '').trim();
  if (!text) return { ok: false, error: '消息不能为空。' };
  const maxLen = s.maxMessageLength || 280;
  if (text.length > maxLen) return { ok: false, error: '消息超过 ' + maxLen + ' 字限制。' };
  const maxPerRound = s.maxMessagesPerRound || 20;
  const myRound = (typeof DB.game.round === 'number' && DB.game.round > 0) ? DB.game.round : 1;
  const sentThisRound = DB.game.messages.filter(m => m.from === player.id && m.round === myRound).length;
  if (sentThisRound >= maxPerRound) return { ok: false, error: '本回合发送数已达上限。' };
  const to = String((body && body.to) || '');
  let kind = 'player-to-player';
  if (to === 'dm') kind = 'player-to-dm';
  else {
    const target = DB.players.find(p => p.id === to);
    if (!target) return { ok: false, error: '收件人不存在。' };
    if (target.id === player.id) return { ok: false, error: '不能给自己发消息。' };
  }
  const msg = {
    id: 'msg_' + randStr(8).toLowerCase(),
    from: player.id,
    to,
    kind,
    text,
    at: now(),
    round: myRound,
    seq: ++messageSeq,
    readBy: kind === 'player-to-dm' ? ['dm'] : []
  };
  DB.game.messages.push(msg);
  if (DB.game.messages.length > 1000) DB.game.messages = DB.game.messages.slice(-1000);
  DB.game.messageSeq = ++messageSeq;
  const targetName = to === 'dm' ? '主持人' : ((getPlayer(to) || {}).playerName || to);
  addLog(player.playerName + ' → ' + targetName + '：' + text.slice(0, 30));
  saveDB();
  return { ok: true, message: msg, messageSeq: DB.game.messageSeq };
}

function doPlayerMessagesRead(player, body) {
  ensureMessages();
  const ids = Array.isArray((body && body.ids)) ? body.ids : [];
  for (const m of DB.game.messages) {
    if (ids.indexOf(m.id) >= 0 && m.readBy.indexOf(player.id) < 0) m.readBy.push(player.id);
  }
  saveDB();
  return { ok: true };
}

/* 玩家拉自 since 之后的私聊（仅返回与当前玩家相关 + dm-to-all + 自己发出的）。
 * 隐私硬约束：他人发给 DM 的私信（player-to-dm）绝不可见——只有发送方自己可见
 * （由 m.from === player.id 覆盖）；其余 player-to-dm 一律过滤。 */
function getPlayerMessages(player, since) {
  ensureMessages();
  const s = parseInt(since, 10) || 0;
  const visible = DB.game.messages.filter(m => {
    if ((m.seq || 0) <= s) return false;
    if (m.to === player.id) return true;             /* 收到 */
    if (m.from === player.id) return true;            /* 发出（含自己发给 DM） */
    if (m.kind === 'dm-to-all') return true;          /* DM 广播 */
    if (m.kind === 'dm-to-player' && m.to === player.id) return true; /* DM 定向 */
    return false;
  });
  /* 按 retention 过滤 */
  const retention = (DB.settings && DB.settings.messageRetention) || 'round';
  const filtered = (retention === 'round')
    ? visible.filter(m => m.round === (DB.game.round || 1) || m.kind === 'dm-to-all')
    : visible;
  return { ok: true, messages: filtered, messageSeq: DB.game.messageSeq || 0 };
}

function doDmMessage(dm, body) {
  ensureMessages();
  const text = String((body && body.text) || '').trim();
  if (!text) return { ok: false, error: '消息不能为空。' };
  const maxLen = (DB.settings && DB.settings.maxMessageLength) || 280;
  if (text.length > maxLen) return { ok: false, error: '消息超过 ' + maxLen + ' 字限制。' };
  const to = String((body && body.to) || '');
  let kind;
  if (to === 'all') kind = 'dm-to-all';
  else {
    const target = DB.players.find(p => p.id === to);
    if (!target) return { ok: false, error: '收件人不存在。' };
    kind = 'dm-to-player';
  }
  const msg = {
    id: 'msg_' + randStr(8).toLowerCase(),
    from: 'dm',
    to, kind,
    text, at: now(),
    round: (typeof DB.game.round === 'number' && DB.game.round > 0) ? DB.game.round : 1,
    seq: ++messageSeq,
    readBy: []
  };
  DB.game.messages.push(msg);
  if (DB.game.messages.length > 1000) DB.game.messages = DB.game.messages.slice(-1000);
  DB.game.messageSeq = ++messageSeq;
  saveDB();
  addLog('主持人 → ' + (to === 'all' ? '全员' : ((getPlayer(to) || {}).playerName || to)) + '：' + text.slice(0, 30));
  return { ok: true, message: msg };
}

function getDmMessages(dm, since, kind) {
  ensureMessages();
  /* DM 是否可看私信 */
  const monitor = (DB.settings && DB.settings.dmMonitorPrivateMessages === false) ? false : true;
  const s = parseInt(since, 10) || 0;
  const visible = DB.game.messages.filter(m => {
    if ((m.seq || 0) <= s) return false;
    if (!monitor && m.kind === 'player-to-player') return false;
    if (kind && m.kind !== kind) return false;
    return true;
  });
  return { ok: true, messages: visible, messageSeq: DB.game.messageSeq || 0, monitor };
}

/* 加载 DB 时补 messageSeq */
function loadMessageSeq() {
  ensureMessages();
  let max = 0;
  for (const m of DB.game.messages) {
    if ((m.seq || 0) > max) max = m.seq;
    if (m.seq == null) { m.seq = ++messageSeq; }
  }
  if (max > messageSeq) messageSeq = max;
  DB.game.messageSeq = messageSeq;
}

function dmSetMvp(body) {
  if (!body.playerId) {
    DB.game.mvp = null;
    saveDB();
    return { ok: true, mvp: null };
  }
  const p = getPlayer(body.playerId);
  if (!p) return { ok: false, error: '玩家不存在。' };
  DB.game.mvp = p.id;
  saveDB();
  addLog('MVP 已设置为：' + (p.playerName || '') + ' (' + (getCharacter(p.characterId) || { name: '?' }).name + ')');
  return { ok: true, mvp: p.id };
}

/* ======================== DM 逻辑 ======================== */
function dmCreatePlayer(body) {
  const char = getCharacter(body.characterId);
  if (!char) return { ok: false, error: '角色不存在。' };
  /* §26 反哺：角色唯一性检查（一个角色只能分给一个玩家；除非显式 force=true 重用） */
  if (!body.force) {
    const occupied = DB.players.find(p => p.characterId === body.characterId);
    if (occupied) {
      return { ok: false, error: `角色「${char.name}」已被玩家「${occupied.playerName || occupied.id}」认领。一个角色只能分配给一位玩家；如需复用请在请求中加 "force":true。` };
    }
  }
  const code = claimCode();
  /* 初始 AP：创建请求显式指定 > settings.apDefault（data.json 按剧本设定） > 10 */
  const apDefault = (DB.settings && typeof DB.settings.apDefault === 'number' && DB.settings.apDefault > 0) ? DB.settings.apDefault : 10;
  const apInit = body.ap || apDefault;
  const p = {
    id: 'p' + (DB.players.length + 1) + '_' + randStr(3).toLowerCase(),
    playerName: body.playerName || ('玩家 ' + (DB.players.length + 1)),
    characterId: body.characterId,
    claimCode: code,
    ap: apInit,
    apTotal: apInit,
    searches: {},
    vote: null,
    notifications: [],
    /* 玩家物品（references/12 范式 5：data.json 角色表的 items 模板；DM 也可在创建时覆盖） */
    items: Array.isArray(body.items) ? body.items.map(it => ({
      id: it.id || randStr(6),
      name: it.name || '物品',
      type: it.type || 'normal',
      usesLeft: typeof it.usesLeft === 'number' ? it.usesLeft : 1,
      tradeable: it.tradeable !== false
    })) : [],
    /* 玩家状态（范式 3） */
    state: 'healthy',
    stateChangedAt: 0,
    lastSeen: 0,
    createdAt: now()
  };
  DB.players.push(p);
  saveDB();
  addLog('DM 创建玩家：' + p.playerName + '（' + char.name + '）兑换码=' + code);
  return { ok: true, player: p };
}

function dmUpdatePlayer(body) {
  const p = getPlayer(body.playerId);
  if (!p) return { ok: false, error: '玩家不存在。' };
  if (body.playerName) p.playerName = body.playerName;
  if (body.characterId && body.characterId !== p.characterId) {
    const char = getCharacter(body.characterId);
    if (!char) return { ok: false, error: '角色不存在。' };
    /* §39 反哺：改角色号同样校验唯一性（一个角色只能分配给一位玩家） */
    const occupied = DB.players.find(o => o.id !== p.id && o.characterId === body.characterId);
    if (occupied) return { ok: false, error: `角色「${char.name}」已被玩家「${occupied.playerName || occupied.id}」认领，请选择其他角色。` };
    p.characterId = body.characterId;
  }
  saveDB();
  return { ok: true };
}

function dmSetAp(body) {
  const p = getPlayer(body.playerId);
  if (!p) return { ok: false, error: '玩家不存在。' };
  const delta = parseInt(body.delta, 10) || 0;
  if (delta < 0) {
    p.ap = Math.max(0, p.ap + delta);
  } else {
    p.ap = Math.min(p.apTotal, p.ap + delta);
  }
  saveDB();
  return { ok: true, ap: p.ap };
}

function dmRevokePlayer(body) {
  const idx = DB.players.findIndex(p => p.id === body.playerId);
  if (idx < 0) return { ok: false, error: '玩家不存在。' };
  for (const [t, s] of sessions.entries()) {
    if (s.type === 'player' && s.playerId === body.playerId) sessions.delete(t);
  }
  DB.players.splice(idx, 1);
  saveDB();
  return { ok: true };
}

function dmSetPhase(body) {
  const allowed = ['setup', 'prologue', 'started', 'reveal'];
  if (!allowed.includes(body.phase)) return { ok: false, error: '无效的阶段。' };
  if (DB.game.phase !== body.phase) {
    const t = now();
    DB.game.phaseHistory.push({ phase: body.phase, at: t });
    if (DB.game.startedAt === 0 && body.phase !== 'setup') DB.game.startedAt = t;
    DB.game.phase = body.phase;
    DB.game.phaseUpdatedAt = t;
  }
  /* 单一事实源：phase 由 currentStep 派生（dmSetStep），兼容接口必须同步 currentStep，
     否则 unlockStep 搜证判据与 phase 脱钩（表现为 started 阶段搜不到 unlockStep>=0 的线索） */
  if (body.phase === 'setup') DB.game.currentStep = -1;
  else if (body.phase === 'reveal') DB.game.currentStep = Math.max(DB.game.currentStep, DB.timeline.length - 1);
  else if (body.phase === 'started') DB.game.currentStep = Math.max(DB.game.currentStep, 0);
  announce('阶段已切换：' + body.phase, 'alert');
  saveDB();
  return { ok: true };
}

function dmSetStep(body) {
  const n = parseInt(body.step, 10);
  if (isNaN(n) || n < -1 || n >= DB.timeline.length) return { ok: false, error: '无效的步骤。' };
  DB.game.currentStep = n;
  /* 时间线整合：phase 由 currentStep 派生（-1=setup、0..N-2=started、N-1=reveal） */
  const derived = currentPhaseFromStep(n);
  if (derived !== DB.game.phase) {
    const t = now();
    DB.game.phase = derived;
    DB.game.phaseUpdatedAt = t;
    DB.game.phaseHistory.push({ phase: derived, at: t });
    /* 计时基准：首次离开 setup 时记录 startedAt（此前只有遗留 dmSetPhase 写它，纯 UI 流程会永久为 0） */
    if (DB.game.startedAt === 0 && derived !== 'setup') DB.game.startedAt = t;
    addLog('阶段变化：' + derived);
  }
  /* 推进到末节点（reveal）即真相揭晓：单一控制源，DM 无需再点"揭晓真相"双控件 */
  if (derived === 'reveal' && !DB.game.truthUnlocked) {
    DB.game.truthUnlocked = true;
    addLog('真相自动揭晓（进入复盘阶段）');
  }
  addLog('时间线步骤：' + n);
  saveDB();
  return { ok: true };
}

/* 由 currentStep 派生 phase（统一游戏节奏与剧情推进） */
function currentPhaseFromStep(step) {
  if (step < 0) return 'setup';
  if (step >= DB.timeline.length - 1) return 'reveal';
  return 'started';
}

function dmAnnounce(body) {
  if (!body.text) return { ok: false, error: '广播内容为空。' };
  announce(body.text, body.type || 'info');
  saveDB();
  return { ok: true };
}

function dmSetClueState(body) {
  for (const a of DB.areas) {
    const c = a.clues.find(x => x.id === body.clueId);
    if (c) {
      if (body.state) c.state = body.state;
      if (body.holder !== undefined) c.holder = body.holder;
      if (body.visible) c.visible = body.visible;
      if (c.state === 'unlocked' && !c.code) {
        c.code = nextClueCode();
      }
      saveDB();
      return { ok: true };
    }
  }
  for (const m of DB.medicalFiles) {
    if (m.id === body.clueId) {
      if (body.state) m.state = body.state;
      if (body.holder !== undefined) m.holder = body.holder;
      if (body.visible) m.visible = body.visible;
      if (m.state === 'unlocked' && !m.code) {
        m.code = nextClueCode();
      }
      saveDB();
      return { ok: true };
    }
  }
  return { ok: false, error: '线索/档案不存在。' };
}

function dmResetArea(body) {
  const a = getArea(body.areaId);
  if (!a) return { ok: false, error: '区域不存在。' };
  for (const c of a.clues) {
    c.state = 'locked';
    c.holder = null;
    c.visible = 'private';
    c.code = null;
  }
  saveDB();
  return { ok: true };
}

function dmLockArea(body) {
  const a = getArea(body.areaId);
  if (!a) return { ok: false, error: '区域不存在。' };
  a.locked = !!body.locked;
  saveDB();
  return { ok: true };
}

function dmSetTruth(body) {
  DB.game.truthUnlocked = !!body.unlock;
  announce(DB.game.truthUnlocked ? '真相已揭晓' : '真相已收回', 'reveal');
  saveDB();
  return { ok: true };
}

function dmSetSettings(body) {
  if (body.maxSearchesPerArea !== undefined) DB.settings.maxSearchesPerArea = parseInt(body.maxSearchesPerArea, 10) || DB.settings.maxSearchesPerArea;
  if (body.searchIntervalMinutes !== undefined) DB.settings.searchIntervalMinutes = parseInt(body.searchIntervalMinutes, 10) || 0;
  /* 范式 9 · 角色专长档案开关 */
  if (body.enableMedicalFiles !== undefined) DB.settings.enableMedicalFiles = !!body.enableMedicalFiles;
  saveDB();
  return { ok: true, settings: DB.settings };
}

function dmReset() {
  /* 重置本局运行态，保留打包的剧本（角色/区域/线索/真相/规则/DM 资料）。 */
  const newDB = buildDefaultData();
  const hasScenario = (newDB.characters && newDB.characters.length) && (newDB.areas && newDB.areas.length);
  const scenario = hasScenario ? newDB : {
    characters: DB.characters, areas: DB.areas, medicalFiles: DB.medicalFiles || [],
    timeline: DB.timeline, truth: DB.truth, rules: DB.rules, dmRefs: DB.dmRefs || []
  };
  DB = {
    version: DB.version || 1,
    /* 优先保留当前 DB.settings（允许 data.json 热修改，如 combatEnabled 开关）；
       fall back 到 scenario 默认值。 */
    settings: JSON.parse(JSON.stringify(DB.settings || scenario.settings)),
    game: { phase: 'setup', phaseUpdatedAt: 0, currentStep: -1, truthUnlocked: false, announcements: [], mvp: null, startedAt: 0, phaseHistory: [] },
    characters: scenario.characters,
    players: [],
    areas: scenario.areas,
    medicalFiles: scenario.medicalFiles,
    timeline: scenario.timeline,
    truth: scenario.truth,
    rules: scenario.rules,
    log: [],
    dmRefs: scenario.dmRefs || []
  };
  // 重置线索运行态
  for (const a of DB.areas) for (const c of a.clues) {
    c.state = 'locked'; c.holder = null; c.visible = 'private'; c.code = null;
  }
  for (const m of DB.medicalFiles || []) {
    m.state = 'locked'; m.holder = null; m.visible = 'private'; m.code = null;
  }
  /* 重置线索 code 池：新一局 code 重新洗牌，玩家无法跨局反推 */
  usedClueCodes = new Set();
  recentCodes = [];
  /* 清空私信：新一局私聊重洗 */
  DB.game.messages = [];
  DB.game.messageSeq = 0;
  messageSeq = 0;
  /* 清空打斗队列 */
  DB.game.combats = [];
  reloadDMRefs();
  /* 仅吊销玩家会话，保留 DM 会话，避免主持人重置后被登出 */
  for (const [token, sess] of sessions) {
    if (sess.type !== 'dm') sessions.delete(token);
  }
  initClueSeq();
  saveDB();
  return { ok: true };
}

/* ======================== 状态组装 ======================== */
const PHASE_LABEL = {
  setup: '筹备',
  prologue: '序幕',
  started: '进行中',
  reveal: '已揭晓'
};

/* areas 的两端视图：playerState 不含线索正文（防剧透），dmState 含正文。
   字段变更只需改这一处（§37 review 反哺：此前两份手写映射已漂移过一次） */
function areasOut(withText) {
  return DB.areas.map(a => ({
    id: a.id, name: a.name, apCost: a.apCost, type: a.type, owner: a.owner,
    allowOwner: a.allowOwner, locked: a.locked || false, note: a.note,
    requireUnlocked: a.requireUnlocked || null,
    mapImage: a.mapImage || null,
    clues: a.clues.map(c => Object.assign({
      id: c.id, title: c.title, card: c.card,
      images: c.images, state: c.state, holder: c.holder,
      visible: c.visible, code: c.code,
      /* unlockStep 非剧透：仅用于前端展示"下一轮开放"，不暴露线索文本 */
      unlockStep: c.unlockStep
    }, withText ? { text: c.text } : {}))
  }));
}

function playerState(p) {
  const char = getCharacter(p.characterId);
  const myClues = [];
  const publicClues = [];
  const fetchedSet = new Set(Array.isArray(p.fetched) ? p.fetched : []);
  for (const a of DB.areas) {
    for (const c of a.clues) {
      if (c.state !== 'unlocked') continue;
      const item = {
        id: c.id, areaId: a.id, areaName: a.name, title: c.title,
        text: c.text, card: c.card, images: c.images,
        code: c.code, holder: c.holder, visible: c.visible,
        fetched: c.holder !== p.id && fetchedSet.has(c.id)
      };
      if (c.holder === p.id || item.fetched) myClues.push(item);
      if (c.visible === 'public') publicClues.push(item);
    }
  }
  const medicalMine = [];
  const medicalPublic = [];
  for (const m of DB.medicalFiles) {
    if (m.state !== 'unlocked') continue;
    const item = { ...m, fetched: m.holder !== p.id && fetchedSet.has(m.id) };
    if (m.holder === p.id || item.fetched) medicalMine.push(item);
    if (m.visible === 'public') medicalPublic.push(item);
  }
  return {
    characters: DB.characters.map(c => ({
      id: c.id, name: c.name, short: c.short, title: c.title, color: c.color, desc: c.desc
    })),
    me: {
      id: p.id, playerName: p.playerName,
      characterId: p.characterId,
      characterName: char ? char.name : '?',
      color: char ? char.color : '#888',
      ap: p.ap, apTotal: p.apTotal,
      vote: p.vote ? p.vote.suspectId : null,
      /* 状态与物品（范式 3/5）：打斗发起、状态展示用 */
      state: p.state || 'healthy',
      stateChangedAt: p.stateChangedAt || 0,
      items: Array.isArray(p.items) ? p.items : []
    },
    startClue: char ? char.startClue : null,
    script: char ? char.script : null,
    scriptPages: char ? (char.scriptPages || [char.script]) : [],
    myClues: [...myClues, ...medicalMine],
    publicClues: [...publicClues, ...medicalPublic],
    areas: areasOut(false),
    timeline: DB.timeline.map((t, i) => ({
      id: t.id, code: t.code, time: t.time,
      title: i <= DB.game.currentStep ? t.title : '? ? ?',
      text:  i <= DB.game.currentStep ? t.text  : '',
      unlocked: i <= DB.game.currentStep
    })),
    truth: DB.game.truthUnlocked ? DB.truth : null,
    rules: DB.rules,
    roster: DB.players.map(pl => {
      const rc = getCharacter(pl.characterId);
      return { id: pl.id, playerName: pl.playerName, characterId: pl.characterId, characterName: rc ? rc.name : '?', color: rc ? rc.color : '#888' };
    }),
    game: {
      phase: DB.game.phase,
      currentStep: DB.game.currentStep,
      mvp: DB.game.mvp || null,
      truthUnlocked: DB.game.truthUnlocked === true,
      // 真相揭晓后才展示投凶统计，避免游戏中被剧透
      voteResult: DB.game.truthUnlocked ? computeVoteSummary() : null,
      // 计时（非剧透）：玩家端也显示游戏时长/阶段耗时
      startedAt: DB.game.startedAt || 0,
      phaseUpdatedAt: DB.game.phaseUpdatedAt || 0,
      phaseHistory: DB.game.phaseHistory || []
    },
    announcements: DB.game.announcements.slice(-20),
    notifications: (p.notifications || []).slice(-20),
    /* 私聊摘要（references/14）——同样遵守隐私：只看收到/发出/广播/定向 */
    messageSummary: (() => {
      ensureMessages();
      const visible = DB.game.messages.filter(m =>
        m.to === p.id || m.from === p.id ||
        m.kind === 'dm-to-all' ||
        (m.kind === 'dm-to-player' && m.to === p.id)
      );
      const retention = (DB.settings && DB.settings.messageRetention) || 'round';
      const cur = retention === 'round' ? (DB.game.round || 1) : null;
      const filtered = cur != null ? visible.filter(m => m.round === cur || m.kind === 'dm-to-all') : visible;
      const unread = filtered.filter(m => m.to === p.id && m.readBy.indexOf(p.id) < 0);
      return {
        unread: unread.length,
        messageSeq: DB.game.messageSeq || 0,
        last: filtered.length ? filtered[filtered.length - 1] : null
      };
    })(),
    settings: DB.settings
  };
}

function computeVoteSummary() {
  const tally = {};   // suspectId -> { count, voters:[playerName] }
  for (const pl of DB.players) {
    if (!pl.vote || !pl.vote.suspectId) continue;
    if (!getCharacter(pl.vote.suspectId)) continue;
    const s = tally[pl.vote.suspectId] || (tally[pl.vote.suspectId] = { count: 0, voters: [] });
    s.count++;
    s.voters.push((pl.playerName || '?') + '（' + (getCharacter(pl.characterId) || { short: pl.characterId }).short + '）');
  }
  const rows = Object.keys(tally).map(sid => {
    const c = getCharacter(sid);
    return { suspectId: sid, name: c ? c.name : sid, short: c ? c.short : sid, color: c ? c.color : '#888', count: tally[sid].count, voters: tally[sid].voters };
  }).sort((a, b) => b.count - a.count);
  return rows;
}

function dmState() {
  return {
    settings: DB.settings,
    game: DB.game,
    characters: DB.characters,
    players: DB.players.map(p => {
      const c = getCharacter(p.characterId);
      return {
        id: p.id, playerName: p.playerName,
        characterId: p.characterId,
        characterName: c ? c.name : '?',
        color: c ? c.color : '#888',
        claimCode: p.claimCode, ap: p.ap, apTotal: p.apTotal,
        searches: p.searches, lastSeen: p.lastSeen || 0,
        vote: p.vote ? p.vote.suspectId : null,
        /* 状态与物品（范式 3/5）：打斗裁决时让 DM 看到失败方可夺的列表 */
        state: p.state || 'healthy',
        stateChangedAt: p.stateChangedAt || 0,
        items: Array.isArray(p.items) ? p.items : []
      };
    }),
    voteSummary: computeVoteSummary(),
    areas: areasOut(true),
    medicalFiles: DB.medicalFiles.map(m => ({
      id: m.id, title: m.title, card: m.card,
      state: m.state, holder: m.holder, visible: m.visible,
      code: m.code, text: m.text, image: m.image || null, note: m.note
    })),
    timeline: DB.timeline,
    truth: DB.truth,
    rules: DB.rules,
    log: (DB.log || []).slice(-200),
    dmRefs: DB.dmRefs || []
  };
}

/* ======================== HTTP 工具 ======================== */
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}
function readBody(req, cb) {
  let size = 0;
  const chunks = [];
  req.on('data', d => {
    size += d.length;
    if (size > 2 * 1024 * 1024) { req.destroy(); return; }
    chunks.push(d);
  });
  req.on('end', () => {
    try { cb(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
    catch (e) { cb(null); }
  });
  req.on('error', () => cb(null));
}
function resolveSafe(rootDir, relPath) {
  const full = path.normalize(path.join(rootDir, relPath || ''));
  if (full !== rootDir && !full.startsWith(rootDir + path.sep)) return null;
  return full;
}
function serveFile(req, res, filePath, mime) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found'); return;
    }
    const range = req.headers.range;
    const total = st.size;
    let start = 0, end = total - 1, status = 200;
    if (range && /^bytes=(\d*)-(\d*)$/.test(range)) {
      const m = range.match(/^bytes=(\d*)-(\d*)$/);
      if (m[1]) start = parseInt(m[1], 10);
      if (m[2]) end = Math.min(parseInt(m[2], 10), total - 1);
      else end = Math.min(start + 1024 * 1024, total - 1);
      if (start >= total || start > end) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + total }); res.end(); return;
      }
      status = 206;
    }
    const head = {
      'Content-Type': mime || 'application/octet-stream',
      'Content-Length': end - start + 1,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    };
    if (status === 206) head['Content-Range'] = 'bytes ' + start + '-' + end + '/' + total;
    res.writeHead(status, head);
    fs.createReadStream(filePath, { start, end }).pipe(res);
  });
}

/* ======================== 资源访问检查 ======================== */
function checkResAccess(viewer, code, ref) {
  if (!ref) return false;
  if (viewer && viewer.dm) return true;
  switch (ref.kind) {
    case 'rule':       return true;
    case 'truth':      return DB.game.truthUnlocked && !!viewer;
    case 'script':
    case 'startClue':  return !!viewer && viewer.player.characterId === ref.charId;
    case 'clue': {
      const c = (function() {
        for (const a of DB.areas) for (const x of a.clues)
          if (x.id === ref.clueId) return x;
        return null;
      })();
      if (!c || c.state !== 'unlocked') return false;
      if (viewer && clueAccessibleByPlayer(c, viewer.player)) return true;
      if (code) {
        const t = findClueByCode(code);
        return !!t && t.kind === 'clue' && t.ref.id === c.id;
      }
      return false;
    }
    case 'medical': {
      const m = getMedicalFile(ref.fileId);
      if (!m || m.state !== 'unlocked') return false;
      if (viewer && medicalAccessibleByPlayer(m, viewer.player)) return true;
      if (code) {
        const t = findClueByCode(code);
        return !!t && t.kind === 'medical' && t.ref.id === m.id;
      }
      return false;
    }
    case 'dmref':     return !!(viewer && (viewer.dm || (DB.game && DB.game.truthUnlocked)));
    default:          return false;
  }
}

/* ======================== API 路由表 ======================== */
const routes = {
  /* player */
  'POST /api/claim': (req, res, body) => {
    const r = doClaim(body && body.code);
    if (!r.ok) return sendJSON(res, 200, r);
    return sendJSON(res, 200, { ok: true, token: r.token, state: playerState(r.player) });
  },

  'POST /api/fetch': (req, res, body) => {
    const viewer = viewerFromReq(req, body);
    const code = String(body && body.code || '').trim().toUpperCase();
    if (!viewer) return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    const t = findClueByCode(code);
    if (!t) return sendJSON(res, 200, { ok: false, error: '无效的兑换码。' });
    if (t.kind === 'clue') {
      const c = t.ref;
      /* 拉码留痕：玩家用码换取的线索进入"我的线索"（标记 fetched，公开开关仍归持有者），
         否则拉到的信息只留在兑换码页的临时区域，导航即丢 */
      if (viewer.player) {
        if (!Array.isArray(viewer.player.fetched)) viewer.player.fetched = [];
        if (!viewer.player.fetched.includes(c.id)) viewer.player.fetched.push(c.id);
        saveDB();
      }
      return sendJSON(res, 200, {
        ok: true,
        kind: 'clue',
        id: c.id, title: c.title, text: c.text, card: c.card,
        images: c.images, code: c.code,
        areaName: t.area ? t.area.name : ''
      });
    }
    if (t.kind === 'medical') {
      const m = t.ref;
      if (viewer.player) {
        if (!Array.isArray(viewer.player.fetched)) viewer.player.fetched = [];
        if (!viewer.player.fetched.includes(m.id)) viewer.player.fetched.push(m.id);
        saveDB();
      }
      return sendJSON(res, 200, {
        ok: true, kind: 'medical',
        id: m.id, title: m.title, text: m.text, card: m.card,
        image: m.image, code: m.code, note: m.note
      });
    }
    return sendJSON(res, 200, { ok: false, error: '未知资源。' });
  },

  'GET /api/player/state': (req, res) => {
    const viewer = viewerFromReq(req, {});
    if (!viewer || viewer.type !== 'player') {
      // viewerFromReq returns {player}|{dm}|null, not type.
    }
    // Fallback: use token directly
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'player') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    const p = getPlayer(sess.playerId);
    if (!p) return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    p.lastSeen = now();
    return sendJSON(res, 200, { ok: true, state: playerState(p) });
  },

  'POST /api/player/search': (req, res, body) => {
    const viewer = viewerFromReq(req, body);
    if (!viewer || !viewer.player) return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    const r = doSearch(viewer.player, body && body.areaId);
    return sendJSON(res, 200, r);
  },

  'POST /api/player/medical': (req, res, body) => {
    const viewer = viewerFromReq(req, body);
    if (!viewer || !viewer.player) return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    const r = doMedical(viewer.player, body && body.fileId, body && body.interpreterId);
    return sendJSON(res, 200, r);
  },

  'POST /api/player/visible': (req, res, body) => {
    const viewer = viewerFromReq(req, body);
    if (!viewer || !viewer.player) return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    const r = doVisible(viewer.player, body && body.clueId, body && body.visible);
    return sendJSON(res, 200, r);
  },

  'POST /api/player/ack': (req, res, body) => {
    const viewer = viewerFromReq(req, body);
    if (!viewer || !viewer.player) return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    const p = viewer.player;
    for (const n of (p.notifications || [])) n.read = true;
    saveDB();
    return sendJSON(res, 200, { ok: true });
  },

  'POST /api/player/vote': (req, res, body) => {
    const viewer = viewerFromReq(req, body);
    if (!viewer || !viewer.player) return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    const r = doVote(viewer.player, body && body.suspectId);
    if (!r.ok) return sendJSON(res, 200, r);
    return sendJSON(res, 200, { ok: true, suspectId: r.suspectId, state: playerState(viewer.player) });
  },

  /* 打斗/裁决（references/12 范式 6）：玩家发起 */
  'POST /api/player/combat': (req, res, body) => {
    const viewer = viewerFromReq(req, body);
    if (!viewer || !viewer.player) return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, doCombatRequest(viewer.player, body));
  },
  /* 打斗/裁决：玩家查看自己参与的记录（含 DM 裁决结果） */
  'GET /api/player/combats': (req, res) => {
    const viewer = viewerFromReq(req, {});
    if (!viewer || !viewer.player) return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    const mine = (DB.game.combats || []).filter(c => c.attackerId === viewer.player.id || c.defenderId === viewer.player.id);
    return sendJSON(res, 200, { ok: true, combats: mine.slice(-50) });
  },

  /* 玩家私聊（references/14） */
  'POST /api/player/message': (req, res, body) => {
    const viewer = viewerFromReq(req, body);
    if (!viewer || !viewer.player) return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    const r = doPlayerMessage(viewer.player, body);
    if (!r.ok) return sendJSON(res, 200, r);
    return sendJSON(res, 200, { ok: true, message: r.message, messageSeq: r.messageSeq, state: playerState(viewer.player) });
  },
  'GET /api/player/messages': (req, res, body, query) => {
    const viewer = viewerFromReq(req, body);
    if (!viewer || !viewer.player) return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    const since = query && query.get ? (query.get('since') || '0') : '0';
    return sendJSON(res, 200, getPlayerMessages(viewer.player, since));
  },
  'POST /api/player/messages/read': (req, res, body) => {
    const viewer = viewerFromReq(req, body);
    if (!viewer || !viewer.player) return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, doPlayerMessagesRead(viewer.player, body));
  },

  /* DM 私聊（references/14） */
  'POST /api/dm/message': (req, res, body) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, doDmMessage(sess, body));
  },
  'GET /api/dm/messages': (req, res, body, query) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    const since = query && query.get ? (query.get('since') || '0') : '0';
    const kind = query && query.get ? (query.get('kind') || '') : '';
    return sendJSON(res, 200, getDmMessages(sess, since, kind || null));
  },

  /* 打斗/裁决 DM 端（references/12 范式 6） */
  'GET /api/dm/combats': (req, res) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, { ok: true, combats: (DB.game.combats || []).slice(-50) });
  },
  'POST /api/dm/combat/judge': (req, res, body) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, dmJudgeCombat(sess, body));
  },

  /* DM */
  'POST /api/dm/login': (req, res) => {
    const token = newToken();
    sessions.set(token, { type: 'dm' });
    return sendJSON(res, 200, { ok: true, token, state: dmState() });
  },

  'GET /api/dm/state': (req, res) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, { ok: true, state: dmState() });
  },

  'POST /api/dm/players/create': (req, res, body) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, dmCreatePlayer(body));
  },

  'POST /api/dm/players/update': (req, res, body) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, dmUpdatePlayer(body));
  },

  'POST /api/dm/players/ap': (req, res, body) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, dmSetAp(body));
  },

  'POST /api/dm/players/revoke': (req, res, body) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, dmRevokePlayer(body));
  },

  'POST /api/dm/searchAs': (req, res, body) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    const p = getPlayer(body.playerId);
    if (!p) return sendJSON(res, 200, { ok: false, error: '玩家不存在。' });
    const r = doSearch(p, body.areaId);
    if (r.ok) r.tag = 'proxy';
    return sendJSON(res, 200, r);
  },

  'POST /api/dm/medicalAs': (req, res, body) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    const p = getPlayer(body.playerId);
    if (!p) return sendJSON(res, 200, { ok: false, error: '玩家不存在。' });
    const r = doMedical(p, body.fileId, body.interpreterId);
    if (r.ok) r.tag = 'proxy';
    return sendJSON(res, 200, r);
  },

  'POST /api/dm/clue/state': (req, res, body) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, dmSetClueState(body));
  },

  'POST /api/dm/area/reset': (req, res, body) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, dmResetArea(body));
  },

  'POST /api/dm/area/lock': (req, res, body) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, dmLockArea(body));
  },

  'POST /api/dm/phase': (req, res, body) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, dmSetPhase(body));
  },

  'POST /api/dm/step': (req, res, body) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, dmSetStep(body));
  },

  'POST /api/dm/announce': (req, res, body) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, dmAnnounce(body));
  },

  'POST /api/dm/truth': (req, res, body) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, dmSetTruth(body));
  },

  'POST /api/dm/mvp': (req, res, body) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, dmSetMvp(body));
  },

  'POST /api/dm/settings': (req, res, body) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, dmSetSettings(body));
  },

  'POST /api/dm/reset': (req, res) => {
    const token = (req.headers['x-token'] || '').trim();
    const sess = token ? sessions.get(token) : null;
    if (!sess || sess.type !== 'dm') return sendJSON(res, 200, { ok: false, error: 'Not authenticated.' });
    return sendJSON(res, 200, dmReset());
  }
};

/* ======================== HTTP 服务器 ======================== */
function createServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const query = url.searchParams;

    if (p.startsWith('/api/')) {
      const key = req.method + ' ' + p;
      const handler = routes[key];
      if (!handler) return sendJSON(res, 404, { ok: false, error: '接口不存在。' });
      if (req.method === 'POST' || req.method === 'GET') {
        readBody(req, body => {
          try { handler(req, res, body, query); }
          catch (e) { console.error(e); sendJSON(res, 500, { ok: false, error: '服务器错误：' + e.message }); }
        });
      } else {
        sendJSON(res, 405, { ok: false, error: '不支持的请求方法。' });
      }
      return;
    }

    if (p === '/res') {
      const rel = (query.get('p') || '').split('\\').join('/');
      const safe = resolveSafe(RES_DIR, rel);
      if (!safe) return sendJSON(res, 400, { ok: false, error: '无效的路径。' });
      const body = { token: query.get('t') || undefined };
      const viewer = viewerFromReq(req, body);
      const code = (query.get('c') || '').toUpperCase();
      const ref = findRefByPath(rel);
      if (!ref) return sendJSON(res, 403, { ok: false, error: '未注册的资源。' });
      if (!checkResAccess(viewer, code, ref)) return sendJSON(res, 403, { ok: false, error: '资源未解锁或无权访问。' });
      const mime = MIME[path.extname(safe).toLowerCase()] || 'application/octet-stream';
      serveFile(req, res, safe, mime);
      return;
    }

    let file = null;
    if (p === '/' || p === '/index.html')        file = path.join(PUBLIC_DIR, 'player.html');
    else if (p === '/host' || p === '/host.html') file = path.join(PUBLIC_DIR, 'dm.html');
    else if (p.startsWith('/css/theme-') && p.endsWith('.css')) {
      /* Theme stylesheets — accessible to anyone (cosmetic only) */
      const themeFile = path.join(PUBLIC_DIR, 'css', path.basename(p));
      if (fs.existsSync(themeFile) && fs.statSync(themeFile).isFile()) {
        const mime = MIME[path.extname(themeFile).toLowerCase()] || 'text/css';
        serveFile(req, res, themeFile, mime);
      } else {
        res.writeHead(404); res.end('Not Found');
      }
      return;
    }
    else if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    else {
      /* 禁止以 /res/... 路径直接静态获取资源（必须经 /res?p= 鉴权） */
      if (p.startsWith('/res/') || p === '/res') { res.writeHead(404); res.end('Not Found'); return; }
      const safe = resolveSafe(PUBLIC_DIR, p);
      if (safe && fs.existsSync(safe) && fs.statSync(safe).isFile()) file = safe;
    }
    if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 Not Found'); return; }
    const mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    serveFile(req, res, file, mime);
  });
  return server;
}

function lanIPs() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const k of Object.keys(ifs)) for (const i of ifs[k] || []) {
    if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}

/* ======================== 启动 ======================== */
function main() {
  const args = process.argv.slice(2);
  if (args.includes('--init')) {
    if (fs.existsSync(DATA_FILE) && !args.includes('--force')) {
      console.log('data.json exists. Use --force to rebuild.');
      return;
    }
    DB = buildDefaultData();
    reloadDMRefs();
    saveDB();
    console.log('data.json initialized.');
    return;
  }
  loadDB();
  reloadDMRefs();
  const port = parseInt(process.env.PORT || '', 10) || DB.settings.port || PORT_DEFAULT;
  const server = createServer();
  server.on('error', e => {
    if (e.code === 'EADDRINUSE') console.error('[ERROR] Port ' + port + ' in use. Change settings.port in data.json.');
    else console.error('[ERROR] ' + e.message);
    process.exit(1);
  });
  server.listen(port, '0.0.0.0', () => {
    console.log('==================================================');
    console.log('  %PROJECT_TITLE_ASCII% · DM Server Started');
    console.log('  Player Entry:  http://localhost:' + port + '/');
    console.log('  DM Console:    http://localhost:' + port + '/host');
    for (const ip of lanIPs()) {
      console.log('  LAN Player:    http://' + ip + ':' + port + '/');
      console.log('  LAN DM:        http://' + ip + ':' + port + '/host');
    }
    console.log('==================================================');
  });
}

main();