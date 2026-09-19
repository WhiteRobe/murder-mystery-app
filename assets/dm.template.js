/* %PROJECT_TITLE% · DM Console Logic */
'use strict';

const LS_SIDE = 'mystery_dm_side';
let DM_TOKEN = null;
let ST = null;
let activeTab = 'overview';
const seenNotifs = new Set();
let sideOpenMobile = false;
let dmSeq = 0;        /* 私聊：已拉取最大消息序号 */
let dmMsgTab = 'all';   /* 当前会话 tab（'all'=全员广播，否则为玩家 id）——tab 化会话（R60） */
let dmMsgDrafts = {};   /* 每个会话独立的草稿，跨轮询重渲染保持 */
let dmMessages = [];   /* 私聊：DM 可见消息 */
let dmCombats = [];    /* 打斗：全部打斗记录 */

const TABS = [
  { id: 'overview', label: '总览',     icon: 'home' },
  { id: 'players',  label: '玩家',     icon: 'user' },
  { id: 'clues',    label: '区域线索', icon: 'search' },
  /* 医疗档案是范式 9·角色专长档案（可选）；仅当 settings.enableMedicalFiles && medicalFiles.length > 0 时显示 */
  { id: 'medical',  label: '医疗档案', icon: 'shield', cond: s => s.settings && s.settings.enableMedicalFiles && (s.medicalFiles || []).length > 0 },
  { id: 'docs',     label: 'DM 资料',  icon: 'doc' },
  /* 真相复盘：常驻 tab；未揭晓时模糊遮蔽（防误看剧透），揭晓后自动明文（R63） */
  { id: 'truth',    label: '真相复盘', icon: 'skull', cond: () => true },
  { id: 'msg',      label: '私聊',     icon: 'chat', cond: s => s.allowPrivateMessages !== false, dot: 'dmMsgDot' },
  { id: 'fight',    label: '打斗',     icon: 'sword', cond: s => s.combatEnabled === true },
];

const PHASE_LABEL = {
  setup:    { label: '筹备',   icon: 'home',  chip: '' },
  prologue: { label: '序幕',   icon: 'book',  chip: 'info' },
  started:  { label: '进行中', icon: 'play',  chip: 'gold' },
  reveal:   { label: '已揭晓', icon: 'gift',  chip: 'blood' }
};

function isMobile() { return window.innerWidth <= 820; }

function applySidebar() {
  const hidden = localStorage.getItem(LS_SIDE) === '1';
  document.body.classList.toggle('side-hidden', hidden && !isMobile());
  document.body.classList.toggle('side-mobile', isMobile());
  document.body.classList.toggle('side-open', isMobile() && sideOpenMobile);
}
function hideSide() {
  if (isMobile()) sideOpenMobile = false;
  else localStorage.setItem(LS_SIDE, '1');
  applySidebar();
}
function showSide() {
  if (isMobile()) sideOpenMobile = true;
  else localStorage.removeItem(LS_SIDE);
  applySidebar();
}

function initTabs() {
  $('#sideNav').innerHTML = TABS.filter(t => !t.cond || t.cond(ST)).map(t =>
    `<div class="side-item ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">${I[t.icon]}<span>${t.label}</span></div>`
  ).join('');
  $$('#sideNav .side-item').forEach(el => el.onclick = () => switchTab(el.dataset.tab));
  $('#sideClose').innerHTML = I.chevL;
  $('#sideOpen').innerHTML = I.menu;
  $('#sideClose').onclick = hideSide;
  $('#sideOpen').onclick = showSide;
  $('#sideMask').onclick = hideSide;
  window.addEventListener('resize', applySidebar);
}

function switchTab(id) {
  activeTab = id;
  $$('#sideNav .side-item').forEach(el => el.classList.toggle('active', el.dataset.tab === id));
  $$('.view').forEach(el => el.classList.remove('active'));
  $('#view-' + id).classList.add('active');
  $('#pageTitle').textContent = (TABS.find(t => t.id === id) || {}).label || '';
  document.title = '主持人端 · ' + (TABS.find(t => t.id === id) || {}).label;
  if (isMobile()) hideSide();
  if (id === 'msg') loadDmMessages();
  if (id === 'fight') loadDmCombats();
  renderActive();
}

function renderActive() {
  if (!ST) return;
  const renderers = {
    overview: renderOverview,
    players: renderPlayers,
    clues: renderClues,
    medical: renderMedical,
    docs: renderDocs,
    truth: renderDmTruth,
    msg: renderDmMsg,
    fight: renderDmFight
  };
  (renderers[activeTab] || renderOverview)();
}

function renderHeader() {
  const phase = PHASE_LABEL[ST.game.phase] || PHASE_LABEL.setup;
  const icon = I[phase.icon] || I.home;
  const chip = $('#phaseChip'); if (chip) {
    chip.className = 'chip ' + phase.chip;
    const ix = chip.querySelector('span:first-child');
    const tx = chip.querySelector('span:last-child');
    if (ix) ix.innerHTML = icon;
    if (tx) tx.textContent = phase.label;
  }
  updateTimer();
}

/* ===== 计时器 ===== */
let timerTick = null;
function fmtDur(ms) {
  if (!ms || ms < 0) return '--:--';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = n => String(n).padStart(2, '0');
  return h > 0 ? h + ':' + p(m) + ':' + p(ss) : m + ':' + p(ss);
}
function timerData() {
  const g = (ST && ST.game) || {};
  const nowMs = Date.now();
  const hist = (g.phaseHistory || []).slice();
  const startedAt = g.startedAt || 0;
  const total = startedAt ? nowMs - startedAt : 0;
  const phaseLabel = (PHASE_LABEL[g.phase] || {}).label || '--';
  let cur = 0;
  if (hist.length) cur = nowMs - hist[hist.length - 1].at;
  else if (g.phaseUpdatedAt) cur = nowMs - g.phaseUpdatedAt;
  const phases = hist.map((h, i) => {
    const dur = i < hist.length - 1 ? hist[i + 1].at - h.at : (h.phase === g.phase ? cur : nowMs - h.at);
    return { label: (PHASE_LABEL[h.phase] || {}).label || h.phase, dur };
  });
  return { total, cur, phaseLabel, phases, startedAt };
}
function timerDetailHTML(d) {
  const rows = d.phases.map(p => `
    <div class="trow">
      <span class="tlabel">${esc(p.label)}</span>
      <span class="tbar"><i></i></span>
      <span class="tdur">${fmtDur(p.dur)}</span>
    </div>`).join('');
  return `
    <div class="timer-head">
      <div class="tmain"><span>当前阶段</span><b>${esc(d.phaseLabel)}</b><em>${fmtDur(d.cur)}</em></div>
      <div class="tmain"><span>游戏总时长</span><b>${fmtDur(d.total)}</b><em>${d.startedAt ? '' : '未开始'}</em></div>
    </div>
    ${rows ? `<div class="tlist">${rows}</div>` : '<div class="muted small">尚无阶段记录（进入序幕/进行中后开始计时）。</div>'}`;
}
function updateTimer() {
  const chip = $('#timerChip');
  const d = timerData();
  if (chip) {
    chip.className = 'chip timer-chip' + (d.startedAt ? ' gold' : '');
    const tx = chip.querySelector('#timerChipText');
    if (tx) tx.textContent = '总时长 ' + fmtDur(d.total);
  }
  const el = $('#timerDetail');
  if (el) el.innerHTML = timerDetailHTML(d);
}

/* ===== Login ===== */
async function login() {
  const r = await api('/api/dm/login', {});
  if (!r.ok) { toast('登录失败', 'error'); return; }
  DM_TOKEN = r.token;
  ST = r.state;
  ST.characters.forEach(c => registerCharacter(c.id, c.name, c.color, c.short));
  enterApp();
}

function enterApp() {
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  initTabs();
  applySidebar();
  renderHeader();
  renderActive();
  if (timerTick) clearInterval(timerTick);
  timerTick = setInterval(updateTimer, 1000);
}

/* ===== Polling ===== */
let lastSig = '';
function stateSig(st) {
  return JSON.stringify([
    st.game.phase, st.game.currentStep, st.game.truthUnlocked, st.game.mvp,
    (st.game.phaseHistory || []).map(h => h.phase + ':' + h.at).join(','),
    st.game.startedAt,
    st.players.map(p => [p.id, p.ap, p.claimCode, p.characterId, p.vote]).join('|'),
    st.areas.map(a => a.locked + a.clues.map(c => c.state[0] + c.visible[0] + c.holder + (c.code || '')).join('')).join('|'),
    st.medicalFiles.map(m => m.state[0] + m.visible[0] + m.holder + (m.code || '')).join('|'),
    (st.game.announcements || []).length, (st.log || []).length,
    st.settings.maxSearchesPerArea
  ]);
}
async function poll() {
  if (!DM_TOKEN) return;
  const r = await apiGet('/api/dm/state', DM_TOKEN);
  if (!r.ok) {
    if (r.error === 'Not authenticated.') { DM_TOKEN = null; location.reload(); }
    return;
  }
  ST = r.state;
  const sig = stateSig(ST);
  if (sig !== lastSig) { lastSig = sig; renderHeader(); renderActive(); }
  else updateTimer();
  /* 当前所在 tab 的增量数据单独轮询 */
  if (activeTab === 'msg') loadDmMessages();
  else if (activeTab === 'fight') loadDmCombats();
}

/* ===== Overview ===== */
function renderOverview() {
  const totalClues = ST.areas.reduce((s, a) => s + a.clues.length, 0) + ST.medicalFiles.length;
  const unlockedClues = ST.areas.reduce((s, a) => s + a.clues.filter(c => c.state === 'unlocked').length, 0)
    + ST.medicalFiles.filter(m => m.state === 'unlocked').length;
  const claimed = ST.players.length;
  const totalChars = ST.characters.length;
  const phase = ST.game.phase;
  const stepNo = ST.game.currentStep + 1;
  const stepLabel = ST.game.currentStep < 0 ? '未开始' : `${stepNo}/${ST.timeline.length}`;
  const totalSteps = ST.timeline.length;

  $('#view-overview').innerHTML = `
    <div class="start-line"></div>
    <h1>总览</h1>
    <div class="stat-row">
      <div class="stat-cell"><div class="v">${claimed}/${totalChars}</div><div class="l">已认领角色</div></div>
      <div class="stat-cell"><div class="v">${unlockedClues}/${totalClues}</div><div class="l">已解锁线索</div></div>
      <div class="stat-cell"><div class="v">${stepLabel}</div><div class="l">剧情阶段</div></div>
    </div>

    <div class="card">
      <div class="card-title">${I.clock}游戏计时</div>
      <div id="timerDetail">${timerDetailHTML(timerData())}</div>
    </div>

    <div class="card">
      <div class="card-title">${I.history}剧情控制</div>
      <div class="muted small mt">阶段：<b style="color:var(--gold)">${PHASE_LABEL[phase]?.label || phase}</b>　·　剧情阶段：<b style="color:var(--gold)">${stepLabel}</b></div>
      <div class="stepper" style="margin-top:8px">
        ${ST.timeline.map((t, i) => {
          const state = i < ST.game.currentStep ? 'past' : (i === ST.game.currentStep ? 'current' : '');
          return `<div class="step ${state}">
            <div class="step-time">${esc(t.time)} · ${esc(t.code)}</div>
            <div class="step-title">${esc(t.title)}</div>
            <div class="step-text">${esc(t.text)}</div>
            ${t.dmNote ? `<div class="muted small mt">主持人备注：${esc(t.dmNote)}</div>` : ''}
          </div>`;
        }).join('')}
      </div>
      <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn sm" id="stepPrev" title="回到上一步">${I.minus} 上一步</button>
        <button class="btn sm primary" id="stepNext" title="推进到下一步">下一步 ${I.plus}</button>
        <button class="btn sm gold" id="truthBtn">${I.gift} ${ST.game.truthUnlocked ? '收回真相' : '揭晓真相'}</button>
        <button class="btn sm danger" id="resetBtn">${I.refresh} 重置游戏</button>
      </div>
    </div>

    ${renderVotePanel()}

    <div class="card">
      <div class="card-title">${I.share}广播</div>
      <div style="margin-top:8px">
        ${(ST.game.announcements || []).slice(-5).reverse().map(a => `
          <div class="muted small" style="padding:4px 0; border-bottom:1px solid var(--line)">
            [${fmtClock(a.time)}] ${esc(a.text)}
          </div>
        `).join('') || '<div class="muted small">暂无广播。</div>'}
      </div>
      <div style="margin-top:12px">
        <textarea id="newAnnounce" placeholder="向所有玩家广播..."></textarea>
        <button class="btn primary" id="sendAnnounce" style="margin-top:6px">${I.send} 发送</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">${I.share}操作日志</div>
      <div style="max-height:200px; overflow-y:auto; font-family:var(--font-mono); font-size:12px; color:var(--muted)">
        ${(ST.log || []).slice(-20).reverse().map(l =>
          `<div>[${fmtTime(l.time)}] ${esc(l.text)}</div>`).join('')}
      </div>
    </div>
  `;

  $('#stepPrev').onclick = () => dmApi('/api/dm/step', { step: Math.max(-1, ST.game.currentStep - 1) }, DM_TOKEN).then(() => poll());
  $('#stepNext').onclick = () => dmApi('/api/dm/step', { step: Math.min(ST.timeline.length - 1, ST.game.currentStep + 1) }, DM_TOKEN).then(() => poll());

  $('#truthBtn').onclick = async () => {
    const unlock = !ST.game.truthUnlocked;
    if (unlock) {
      const ok = await confirmModal('揭晓真相',
        '<div class="clue-text">向所有玩家揭晓真相？这将公布完整答案。</div>',
        '揭晓');
      if (!ok) return;
    }
    dmApi('/api/dm/truth', { unlock }, DM_TOKEN).then(() => poll());
  };

  $('#resetBtn').onclick = async () => {
    const ok = await confirmModal('重置游戏',
      '<div class="clue-text">重置整局游戏？所有玩家将被移除、线索重新锁定、兑换码重新生成。</div>',
      '重置');
    if (!ok) return;
    dmApi('/api/dm/reset', {}, DM_TOKEN).then(() => poll());
  };

  $('#sendAnnounce').onclick = async () => {
    const text = $('#newAnnounce').value.trim();
    if (!text) { toast('广播内容不能为空', 'alert'); return; }
    await dmApi('/api/dm/announce', { text, type: 'info' }, DM_TOKEN);
    $('#newAnnounce').value = '';
    toast('已广播', 'ok');
    poll();
  };
}

/* ===== Players ===== */
let selectedCharId = null;
function renderPlayers() {
  const charCards = ST.characters.map(c => {
    const taken = ST.players.some(p => p.characterId === c.id);
    return `<div class="char-card ${selectedCharId === c.id ? 'sel' : ''} ${taken ? 'taken' : ''}" data-char="${esc(c.id)}">
      <span class="char-dot" style="background:${esc(c.color)}"></span>
      <div class="char-name">${esc(c.name)}</div>
      <div class="char-title">${esc(c.title)}</div>
      ${taken ? '<span class="chip blood">已认领角色</span>' : '<span class="chip ok">可选</span>'}
    </div>`;
  }).join('');
  $('#view-players').innerHTML = `
    <h1>玩家</h1>
    <div class="card">
      <div class="card-title">${I.user}角色认领</div>
      <div class="muted small mt">点击角色卡片选中，输入昵称后创建玩家。兑换码为 4 位数字。</div>
      <div class="char-grid">${charCards}</div>
      <div style="display:flex; gap:8px; align-items:center; margin-top:12px; flex-wrap:wrap">
        <input type="text" id="newPlayerName" placeholder="玩家昵称" style="width:auto; min-width:160px">
        <button class="btn primary" id="newPlayerBtn">${I.plus} 创建玩家</button>
        <button class="btn ghost" id="announceBtn">${I.share} 广播</button>
      </div>
      <table class="player-table">
        <thead>
          <tr><th>昵称</th><th>角色</th><th>兑换码</th><th>AP</th><th>操作</th></tr>
        </thead>
        <tbody id="playersBody"></tbody>
      </table>
    </div>
  `;

  $$('.char-card').forEach(el => el.onclick = () => {
    selectedCharId = el.dataset.char;
    $$('.char-card').forEach(x => x.classList.toggle('sel', x.dataset.char === selectedCharId));
  });

  $('#newPlayerBtn').onclick = async () => {
    if (!selectedCharId) { toast('请先点击选择一张角色卡片', 'alert'); return; }
    const playerName = $('#newPlayerName').value.trim() || ('玩家 ' + (ST.players.length + 1));
    const r = await dmApi('/api/dm/players/create', { characterId: selectedCharId, playerName }, DM_TOKEN);
    if (!r.ok) { toast(r.error, 'error'); return; }
    toast('已创建：兑换码=' + r.player.claimCode, 'ok');
    poll();
  };

  $('#announceBtn').onclick = async () => {
    const html1 = `<textarea id="announceText" placeholder="广播内容..."></textarea>`;
    const text = await modal(html1, {
      title: '广播',
      okValue: mask => $('#announceText', mask).value.trim(),
      foot: `<button class="btn ghost" data-cancel>取消</button><button class="btn primary" data-ok>发送</button>`
    });
    if (!text) return;
    dmApi('/api/dm/announce', { text, type: 'info' }, DM_TOKEN).then(() => { toast('已发送', 'ok'); poll(); });
  };

  const tbody = $('#playersBody');
  tbody.innerHTML = ST.players.map(p => `
    <tr data-id="${esc(p.id)}">
      <td data-label="昵称"><b>${esc(p.playerName)}</b></td>
      <td data-label="角色">
        <span style="color:${esc(p.color)}">●</span>
        ${esc(p.characterName)}
      </td>
      <td data-label="兑换码"><span class="code-chip"><span class="cell-codes">${esc(p.claimCode)}</span><button class="copy" data-copy="${esc(p.claimCode)}" title="复制兑换码">${I.copy}</button></span></td>
      <td data-label="AP"><b style="color:var(--gold)">${p.ap}</b>/${p.apTotal}</td>
      <td data-label="操作">
        <div style="display:flex; gap:4px; flex-wrap:wrap">
          <button class="btn sm" data-ap="1" data-player="${esc(p.id)}" title="给该玩家 +1 AP（主持人直接调整）">+1 AP</button>
          <button class="btn sm" data-ap="-1" data-player="${esc(p.id)}" title="给该玩家 -1 AP（主持人直接调整）">-1 AP</button>
          <button class="btn sm danger" data-revoke="${esc(p.id)}">${I.x}</button>
        </div>
      </td>
    </tr>
  `).join('');

  $$('#playersBody [data-copy]').forEach(b => b.onclick = () => {
    copyText(b.dataset.copy).then(() => toast('已复制兑换码：' + b.dataset.copy, 'ok'));
  });
  $$('#playersBody [data-ap]').forEach(b => b.onclick = () => {
    const delta = parseInt(b.dataset.ap, 10);
    dmApi('/api/dm/players/ap', { playerId: b.dataset.player, delta }, DM_TOKEN).then(() => poll());
  });
  $$('#playersBody [data-revoke]').forEach(b => b.onclick = async () => {
    const ok = await confirmModal('移除玩家', '<div>移除该玩家并重新生成兑换码？</div>', '移除');
    if (!ok) return;
    dmApi('/api/dm/players/revoke', { playerId: b.dataset.revoke }, DM_TOKEN).then(() => poll());
  });
}

/* ===== Clues / Areas ===== */
function renderClues() {
  $('#view-clues').innerHTML = `
    <h1>区域与线索</h1>
    ${ST.areas.map(a => {
      const unlocked = a.clues.filter(c => c.state === 'unlocked').length;
      return `
        <div class="card">
          <div class="head">
            <div class="card-title">${I.search}${esc(a.name)}</div>
            <div class="muted small">${a.apCost} AP · 已解锁 ${unlocked}/${a.clues.length}</div>
          </div>
          ${a.locked ? '<div class="chip blood" style="margin-bottom:8px">已锁定</div>' : ''}
          ${a.note ? `<div class="muted small mt">${esc(a.note)}</div>` : ''}
          <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap">
            ${a.clues.map(c => {
              const stateBadge = c.state === 'unlocked'
                ? '<span class="badge ok">已解锁</span>'
                : '<span class="badge">已锁定</span>';
              const vis = c.state === 'unlocked'
                ? (c.visible === 'public' ? '<span class="badge gold">公开</span>' : '<span class="badge">私密</span>')
                : '';
              return `<div class="card" style="margin-bottom:6px; padding:8px 10px; flex:1 1 240px; display:flex; flex-direction:column">
                <div class="card-title" style="font-size:14px">${esc(c.title)} ${stateBadge} ${vis}</div>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; margin-top:12px">
                  ${c.state === 'unlocked' ? `<span class="code-chip">${esc(c.code || '?')}
                    <button class="copy" data-copy="${esc(c.code || '')}">${I.copy}</button>
                  </span>` : '<span></span>'}
                  <button class="btn sm ${c.state === 'unlocked' ? 'danger' : 'primary'}" style="margin-left:auto"
                          data-clueunlock="${esc(c.id)}" data-to="${c.state === 'unlocked' ? 'lock' : 'unlock'}">
                    ${c.state === 'unlocked' ? '锁定' : '解锁'}
                  </button>
                </div>
              </div>`;
            }).join('')}
          </div>
          <div style="margin-top:8px; display:flex; gap:6px">
            <button class="btn sm ghost" data-areareset="${esc(a.id)}">${I.refresh} 重置区域</button>
            <button class="btn sm" data-arealock="${esc(a.id)}" data-to="${a.locked ? 'unlock' : 'lock'}">
              ${a.locked ? '开放' : '关闭'}区域
            </button>
          </div>
        </div>
      `;
    }).join('')}
  `;

  $$('[data-areareset]').forEach(b => b.onclick = async () => {
    const ok = await confirmModal('重置区域', '<div>锁定全部线索并清除兑换码？</div>', '重置');
    if (!ok) return;
    dmApi('/api/dm/area/reset', { areaId: b.dataset.areareset }, DM_TOKEN).then(() => poll());
  });
  $$('[data-arealock]').forEach(b => b.onclick = () => {
    dmApi('/api/dm/area/lock', { areaId: b.dataset.arealock, locked: b.dataset.to === 'lock' }, DM_TOKEN).then(() => poll());
  });
  $$('[data-clueunlock]').forEach(b => b.onclick = () => {
    dmApi('/api/dm/clue/state', {
      clueId: b.dataset.clueunlock,
      state: b.dataset.to === 'unlock' ? 'unlocked' : 'locked'
    }, DM_TOKEN).then(() => poll());
  });
  $$('[data-copy]').forEach(b => b.onclick = () => {
    copyText(b.dataset.copy).then(() => toast('已复制：' + b.dataset.copy, 'ok'));
  });
}

/* ===== Medical ===== */
function renderMedical() {
  $('#view-medical').innerHTML = `
    <h1>医疗档案</h1>
    ${ST.medicalFiles.length === 0 ? emptyState('暂无医疗档案', 'shield') : ''}
    ${ST.medicalFiles.map(m => {
      const stateBadge = m.state === 'unlocked'
        ? '<span class="badge ok">已解锁档案</span>'
        : '<span class="badge">已锁定</span>';
      return `<div class="card">
        <div class="head">
          <div class="card-title">${I.shield}${esc(m.title)} ${stateBadge}</div>
        </div>
        ${m.note ? `<div class="muted small mt">${esc(m.note)}</div>` : ''}
        ${m.state === 'unlocked' ? `<div class="code-row">
          <span class="code-chip">${esc(m.code || '?')}
            <button class="copy" data-copy="${esc(m.code || '')}">${I.copy}</button>
          </span>
          <button class="btn sm danger" data-medicallock="${esc(m.id)}">锁定</button>
        </div>` : `<button class="btn sm primary" data-medicalunlock="${esc(m.id)}">解锁</button>`}
      </div>`;
    }).join('')}
  `;

  $$('[data-medicalunlock]').forEach(b => b.onclick = () => {
    dmApi('/api/dm/clue/state', { clueId: b.dataset.medicalunlock, state: 'unlocked' }, DM_TOKEN).then(() => poll());
  });
  $$('[data-medicallock]').forEach(b => b.onclick = () => {
    dmApi('/api/dm/clue/state', { clueId: b.dataset.medicallock, state: 'locked' }, DM_TOKEN).then(() => poll());
  });
  $$('[data-copy]').forEach(b => b.onclick = () => {
    copyText(b.dataset.copy).then(() => toast('已复制：' + b.dataset.copy, 'ok'));
  });
}

/* ===== DM 真相复盘面板（仅 truthUnlocked 后可见） ===== */
let dmTruthPeek = false;      /* 手动查看标记（会话内有效） */
let dmTruthPeekStep = -99;    /* 在哪个剧情阶段查看的：回退剧情后重新遮蔽 */
function renderDmTruth() {
  if (ST.game.currentStep < dmTruthPeekStep) { dmTruthPeek = false; dmTruthPeekStep = -99; }
  if (ST.game.truthUnlocked || dmTruthPeek) { $('#view-truth').innerHTML = truthPanelHTML(); return; }
  $('#view-truth').innerHTML = `
    <h1>真相复盘</h1>
    <div class="card truth-guard">
      <div class="card-title">${I.gift} 剧透保护</div>
      <div class="muted small mt">真相内容已模糊遮蔽，避免主持过程中误看。真相揭晓后自动明文展示；也可以现在手动查看（主持人本人会被剧透）。</div>
      <button class="btn danger" id="truthPeekBtn" style="margin-top:10px">显示真相</button>
    </div>
    <div class="truth-blurred" aria-hidden="true">${truthPanelHTML()}</div>`;
  const b = $('#truthPeekBtn');
  if (b) b.onclick = () => { dmTruthPeek = true; dmTruthPeekStep = ST.game.currentStep; renderDmTruth(); };
}

function truthPanelHTML() {
  const truth = ST.truth || {};
  const charById = id => (ST.characters || []).find(c => c.id === id);
  const truthChars = (truth.characters || []).map(id => charById(id)).filter(Boolean);

  return `
    <h1>真相复盘</h1>
    <div class="muted small">${ST.game.truthUnlocked ? '剧情已揭晓（最后一步自动解锁）。' : '⚠ 手动查看模式（未正式揭晓）'}下方按四个维度梳理，供主持人复盘主持参考。</div>

    <div class="card">
      <div class="card-title">${I.gift} 案件真相</div>
      <div class="truth-text">${esc(truth.title || '案件真相')}</div>
      <div class="truth-body">${highlightText(truth.text || '')}</div>
    </div>

    <div class="card">
      <div class="card-title">${I.history} 作案时间线</div>
      <div class="muted small" style="margin-bottom:8px">案发当晚各角色真实行踪（数据源 truth.timeline，非游戏流程）。</div>
      ${(truth.timeline || []).length ? `
      <div class="stepper">
        ${truth.timeline.map(t => `
          <div class="step past">
            <div class="step-time">${esc(t.time)}</div>
            <div class="step-title">${esc(t.title)}</div>
            <div class="step-text">${highlightText(t.text || '')}</div>
          </div>
        `).join('')}
      </div>` : `<div class="muted small">data.json 未在 truth.timeline 中给出作案时间线，此处沿用游戏流程时间线。</div>`}
    </div>

    <div class="card">
      <div class="card-title">${I.user} 人物关系与动机</div>
      ${(truth.relations || []).length ? (() => {
        /* 人物关系图（与玩家端同款：环形布局 SVG，R70） */
        const chars = ST.characters || [];
        const rels = truth.relations || [];
        const nodes = chars.map((c, i) => {
          const ang = (i / chars.length) * 2 * Math.PI - Math.PI / 2;
          const r = 140;
          return { ...c, x: 200 + r * Math.cos(ang), y: 180 + r * Math.sin(ang) };
        });
        const edges = rels.map(rel => {
          const a = nodes.find(n => n.id === rel.from);
          const b = nodes.find(n => n.id === rel.to);
          if (!a || !b) return '';
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--gold,#c9a86a)" stroke-width="1.5" opacity="0.7"/>
                  <text x="${mx}" y="${my - 3}" fill="var(--gold,#c9a86a)" font-size="10" text-anchor="middle">${esc(rel.label || '')}</text>`;
        }).join('');
        const dots = nodes.map(n =>
          `<g><circle cx="${n.x}" cy="${n.y}" r="22" fill="${n.color || '#888'}" opacity="0.3"/>
             <circle cx="${n.x}" cy="${n.y}" r="14" fill="${n.color || '#888'}"/>
             <text x="${n.x}" y="${n.y + 30}" fill="var(--text)" font-size="11" text-anchor="middle">${esc(n.short || n.name)}</text></g>`
        ).join('');
        return `<div style="overflow-x:auto; margin-top:10px">
          <svg viewBox="0 0 400 360" style="width:100%; max-width:500px; height:auto; background:rgba(0,0,0,.2); border-radius:8px">
            ${edges}${dots}
          </svg>
        </div>`;
      })() : ''}
      <div class="muted small mt" style="margin-top:8px">各角色关系明细：</div>
      ${truthChars.length ? `
        <div class="grid2">
          ${truthChars.map(c => `
            <div class="card-mini">
              <div class="char-row">
                <span class="char-dot" style="background:${esc(c.color)}"></span>
                <b class="cname" style="color:${esc(c.color)}">${esc(c.name)}</b>
                <span class="muted small">${esc(c.title || '')}</span>
              </div>
              ${truth.relations && truth.relations.filter(r => r.from === c.id || r.to === c.id).length ? `
                <ul class="rel-list">
                  ${truth.relations.filter(r => r.from === c.id || r.to === c.id).map(r => {
                    const otherId = r.from === c.id ? r.to : r.from;
                    const other = charById(otherId);
                    return `<li><span class="cname" style="color:${esc(other?.color || '#888')}">${esc(other?.name || otherId)}</span> · ${esc(r.note || r.type || '')}</li>`;
                  }).join('')}
                </ul>
              ` : '<div class="muted small">无显式关系记录</div>'}
            </div>
          `).join('')}
        </div>
      ` : '<div class="muted small">data.json 未在 truth.characters 中列出关键人物</div>'}
    </div>

    <div class="card">
      <div class="card-title">${I.skull} 作案手法分析</div>
      ${truth.method ? `<div class="truth-body">${highlightText(truth.method)}</div>` : '<div class="muted small">data.json 未在 truth.method 中给出作案手法分析</div>'}
    </div>

    <div class="card">
      <div class="card-title">${I.skull} 投票与 MVP</div>
      ${ST.voteSummary && ST.voteSummary.length ? `
        <div class="vr-list">
          ${ST.voteSummary.map(v => `
            <div class="vr-row">
              <span class="dot" style="background:${esc(v.color)}"></span>
              <b class="cname" style="color:${esc(v.color)}">${esc(v.name)}</b>
              <span class="vr-count">${v.count} 票</span>
            </div>
          `).join('')}
        </div>
        ${ST.game.mvp ? `<div class="mt">本场 MVP：<b class="cname" style="color:${esc(charById(ST.players.find(p=>p.id===ST.game.mvp)?.characterId)?.color || '#888')}">${esc(ST.players.find(p=>p.id===ST.game.mvp)?.playerName || '?')}</b></div>` : ''}
      ` : '<div class="muted small">本场无人投票</div>'}
    </div>

    <div class="card">
      <div class="card-title">${I.doc} 关联剧本 / DM 资料</div>
      ${(ST.dmRefs || []).length ? `
        <ul>
          ${ST.dmRefs.map(d => `<li><b>${esc(d.title)}</b> · ${esc(d.kind || '')}</li>`).join('')}
        </ul>
      ` : '<div class="muted small">未配置 DM 资料</div>'}
    </div>
  `;
}

/* highlight(): 文本中匹配角色名 → 输出主题色高亮 <span class="cname">（详情见 references/11-visual-design.md） */
function highlightText(text) {
  if (!text || !ST.characters) return esc(text || '');
  const names = (ST.characters || []).map(c => ({ name: c.name, short: c.short, color: c.color, id: c.id }));
  let out = esc(text);
  /* 按 name 长度倒序避免「小青」被「青」先匹配 */
  const sorted = names.filter(n => n.name).sort((a, b) => b.name.length - a.name.length);
  for (const n of sorted) {
    if (!n.name) continue;
    const re = new RegExp(escRe(n.name), 'g');
    out = out.replace(re, `<span class="cname" data-color="${esc(n.id)}" style="--c:${esc(n.color)}">${esc(n.name)}</span>`);
  }
  return out;
}
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* ===== Vote & MVP (投凶与MVP) ===== */
function renderVotePanel() {
  const charById = id => (ST.characters || []).find(c => c.id === id);
  const tally = (ST.voteSummary || []).slice();
  const voted = ST.players.filter(p => p.vote);
  let html = `<div class="card vote-panel">
    <div class="card-title">${I.skull} 投凶与 MVP（真相揭晓前展示）</div>`;

  // 每名玩家的指认
  const rows = ST.players.map(p => {
    const target = p.vote ? charById(p.vote) : null;
    return `<div class="vr-row">
      <span class="dot" style="background:${esc(p.color)}"></span>
      <b>${esc(p.playerName)}</b><span class="muted small">· ${esc(p.characterName)}</span>
      ${target
        ? `<span style="margin-left:auto">指认 <b class="cname" style="color:${esc(target.color)}">${esc(target.name)}</b></span>`
        : `<span class="muted small" style="margin-left:auto">未指认</span>`}
    </div>`;
  }).join('');
  html += `<div class="vr-list" style="${rows.length ? '' : 'display:none'}">${rows}</div>
    ${rows ? '' : '<div class="muted small">暂无投凶。</div>'}`;

  // 计票汇总
  html += `<div class="card-title" style="margin-top:14px; font-size:13px">计票汇总</div>`;
  if (tally.length) {
    html += `<div class="vr-list">` + tally.map(v => `
      <div class="vr-row">
        <span class="dot" style="background:${esc(v.color)}"></span>
        <b class="cname" style="color:${esc(v.color)}">${esc(v.name)}</b>
        <span class="vr-count">${v.count} 票</span>
      </div>`).join('') + `</div>`;
  } else {
    html += `<div class="muted small">暂无可统计的投票。</div>`;
  }

  // MVP 评选
  html += `<div class="card-title" style="margin-top:14px; font-size:13px">评选 MVP（参考第三阶段答案与侦破正确性）</div>
    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px">
      <select id="mvpSelect" style="width:auto; min-width:200px">
        <option value="">— 未设置 —</option>
        ${ST.players.map(p => `<option value="${esc(p.id)}" ${ST.game.mvp === p.id ? 'selected' : ''}>${esc(p.playerName)} (${esc(p.characterName)})</option>`).join('')}
      </select>
      <button class="btn primary" id="mvpSetBtn">${I.gift} 设为本场 MVP</button>
      <button class="btn ghost" id="mvpClearBtn">${I.x} 取消</button>
    </div>`;
  html += `</div>`;
  return html;
}
function wireVotePanel() {
  const setBtn = $('#mvpSetBtn'); if (setBtn) setBtn.onclick = () => {
    const pid = $('#mvpSelect').value; if (!pid) { toast('请先选择玩家', 'alert'); return; }
    dmApi('/api/dm/mvp', { playerId: pid }, DM_TOKEN).then(() => { toast('MVP 已设置', 'ok'); poll(); });
  };
  const clearBtn = $('#mvpClearBtn'); if (clearBtn) clearBtn.onclick = () => {
    dmApi('/api/dm/mvp', { playerId: '' }, DM_TOKEN).then(() => { toast('MVP 已取消', 'ok'); poll(); });
  };
}
function renderDocs() {
  const pagesOf = d => (d.pages && d.pages.length ? d.pages : (d.file ? [d.file] : []));
  const ext = (p) => (p.split('.').pop() || '').toLowerCase();
  const isImage = (p) => ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext(p));
  const isAudio = (p) => ['mp3', 'wav', 'ogg', 'm4a'].includes(ext(p));
  const isText  = (p) => ['txt', 'md'].includes(ext(p));
  const dtextCache = {};
  async function loadDText(page) {
    if (dtextCache[page] !== undefined) return dtextCache[page];
    try {
      const r = await fetch(resUrl(page, DM_TOKEN));
      const t = await r.text();
      dtextCache[page] = t;
      return t;
    } catch (e) { return ''; }
  }
  $('#view-docs').innerHTML = `
    <h1>DM 资料</h1>
    ${(ST.dmRefs || []).length === 0 ? emptyState('未配置 DM 资料', 'doc') : ''}
    <div class="grid2">
      ${(ST.dmRefs || []).map(d => {
        const pages = pagesOf(d);
        const first = pages[0] || '';
        const kind = d.kind || (isImage(first) ? 'image' : (isAudio(first) ? 'audio' : (isText(first) ? 'text' : 'other')));
        const KIND_LABEL = { text: '文本', image: '图片', audio: '音频', other: '文档' };
        let preview;
        if (kind === 'image') {
          preview = `<img src="${resUrl(first, DM_TOKEN)}" style="max-width:100%; margin-top:8px; border-radius:6px">`;
        } else if (kind === 'audio') {
          preview = `<audio controls src="${resUrl(first, DM_TOKEN)}" style="margin-top:8px; width:100%"></audio>`;
        } else if (kind === 'text') {
          preview = `<div class="dmref-text" data-doc-id="${esc(d.id)}" data-page-idx="0"><div class="muted small" style="padding:12px">加载中…</div></div>`;
        } else {
          preview = `<object data="${resUrl(first, DM_TOKEN)}" type="application/octet-stream" style="margin-top:8px; width:100%; min-height:200px"><a href="${resUrl(first, DM_TOKEN)}" target="_blank">在新窗口打开</a></object>`;
        }
        return `<div class="card">
          <div class="card-title">${I.doc}${esc(d.title)}</div>
          <div class="muted small mt">${KIND_LABEL[kind] || kind}${pages.length > 1 ? ' · ' + pages.length + ' 页' : ''}</div>
          ${preview}
          ${pages.length > 1 ? `<div style="margin-top:8px"><button class="btn primary sm" data-docpages="${esc(d.id)}">${I.book} 翻阅 ${pages.length} 页</button></div>` : ''}
        </div>`;
      }).join('')}
    </div>
  `;
  /* 拉文本内容并 highlight 主题色 */
  $$('.dmref-text').forEach(async (holder) => {
    const docId = holder.getAttribute('data-doc-id');
    const pageIdx = parseInt(holder.getAttribute('data-page-idx') || '0', 10);
    const d = (ST.dmRefs || []).find(x => x.id === docId);
    if (!d) return;
    const pages = pagesOf(d);
    const page = pages[pageIdx];
    if (!page) return;
    const txt = await loadDText(page);
    holder.innerHTML = '<div class="dmref-text-content">' + (txt ? highlightText(txt) : '<div class="muted small">内容为空</div>') + '</div>';
  });
  $$('[data-docpages]').forEach(b => b.onclick = async () => {
    const d = (ST.dmRefs || []).find(x => x.id === b.dataset.docpages);
    if (!d) return;
    const pages = pagesOf(d);
    let idx = 0;
    const renderPage = async () => {
      const p = pages[idx] || '';
      const k = isImage(p) ? 'image' : (isAudio(p) ? 'audio' : (isText(p) ? 'text' : 'other'));
      let body;
      if (k === 'image') body = `<img src="${resUrl(p, DM_TOKEN)}" alt="page ${idx + 1}" style="max-width:100%">`;
      else if (k === 'audio') body = `<audio controls src="${resUrl(p, DM_TOKEN)}" style="width:100%"></audio>`;
      else if (k === 'text') body = `<div class="dmref-text-content modal-script">${highlightText(await loadDText(p))}</div>`;
      else body = `<object data="${resUrl(p, DM_TOKEN)}" type="application/octet-stream" style="width:100%; min-height:200px"><a href="${resUrl(p, DM_TOKEN)}" target="_blank">在新窗口打开</a></object>`;
      return `${body}
      <div class="nav">
        <button class="btn sm" data-prev ${idx === 0 ? 'disabled' : ''}>${I.chevL} 上一页</button>
        <span class="page-info">${idx + 1} / ${pages.length}</span>
        <button class="btn sm" data-next ${idx === pages.length - 1 ? 'disabled' : ''}>下一页 ${I.chevR}</button>
      </div>`;
    };
    modal(`<div class="script-viewer">${await renderPage()}</div>`, {
      title: d.title, onMount: (mask, close) => {
        const refresh = async () => { mask.querySelector('.script-viewer').innerHTML = await renderPage(); bind(); };
        const bind = () => {
          const p = mask.querySelector('[data-prev]');
          const n = mask.querySelector('[data-next]');
          if (p) p.onclick = () => { idx = Math.max(0, idx - 1); refresh(); };
          if (n) n.onclick = () => { idx = Math.min(pages.length - 1, idx + 1); refresh(); };
        };
        bind();
      }
    });
  });
}

/* ===== DM 私聊监控（references/14） ===== */
let dmMsgBooted = false; /* 首拉只补历史，不弹 pop */
async function loadDmMessages() {
  if (!DM_TOKEN) return;
  const prevSeq = dmSeq;
  const r = await apiGet('/api/dm/messages?since=' + dmSeq, DM_TOKEN);
  if (!r.ok) return;
  if (r.messageSeq && r.messageSeq > dmSeq && r.messages) {
    dmMessages = dmMessages.concat(r.messages.filter(m => (m.seq || 0) > dmSeq));
    dmSeq = r.messageSeq;
  }
  /* 新消息 → 顶部 pop：玩家私信/致DM/玩家间（监控开启时）；自己发出的由发送确认覆盖 */
  if (dmMsgBooted) {
    dmMessages.filter(m => (m.seq || 0) > prevSeq && m.from !== 'dm').forEach(m => {
      const from = pj(m.from);
      const fromName = from ? from.characterName : (m.from === 'dm' ? 'DM' : m.from);
      let prefix;
      if (m.kind === 'player-to-dm') prefix = '来自 ' + fromName + '（致DM）：';
      else if (m.to === 'all') prefix = null;
      else {
        const toP = pj(m.to);
        prefix = fromName + ' → ' + (toP ? toP.characterName : 'DM') + '：';
      }
      if (prefix) pop(prefix + (m.text || ''), 'info');
    });
  }
  dmMsgBooted = true;
  if (activeTab === 'msg') renderDmMsg();
}
function dmName(id) {
  if (!id) return '?';
  if (id === 'dm') return '主持人';
  const p = (ST.players || []).find(x => x.id === id);
  return p ? (p.characterName || p.playerName) : id;
}
function renderDmMsg() {
  const monitor = (ST.settings && ST.settings.dmMonitorPrivateMessages === false) ? false : true;
  /* 会话 tab：全员广播 + 各玩家（R60）；监控列表始终展示全部消息 */
  const partners = [{ id: 'all', label: '全员广播' }]
    .concat((ST.players || []).map(p => ({ id: p.id, label: p.characterName + '（' + p.playerName + '）' })));
  if (!partners.some(p => p.id === dmMsgTab)) dmMsgTab = 'all';
  const partner = partners.find(p => p.id === dmMsgTab);
  const rows = dmMessages.slice().reverse().map(m => {
    const kindBadge = m.kind === 'dm-to-all' ? '<span class="chip gold">广播</span>'
      : m.kind === 'player-to-dm' ? '<span class="chip gold">致DM</span>'
      : m.kind === 'dm-to-player' ? '<span class="chip">DM直发</span>'
      : '<span class="chip">玩家间</span>';
    return `<div class="dm-msg-row">
      <div class="dm-msg-head"><span><b>${esc(dmName(m.from))}</b> → <b>${esc(m.to === 'all' ? '全员' : dmName(m.to))}</b> ${kindBadge}</span>
        <span class="muted small">${m.at ? fmtClock(m.at) : ''}${(m.readBy && m.readBy.length) ? ' · 已读' : ''}</span></div>
      <div class="dm-msg-body">${esc(m.text)}</div>
    </div>`;
  }).join('');
  $('#view-msg').innerHTML = `
    <h1>私聊</h1>
    ${monitor ? '' : '<div class="chip blood" style="margin-bottom:8px">私信监控已关闭：仅展示 DM 相关消息</div>'}
    <div class="chat-tabs" id="chatTabs">
      ${partners.map(p => `<button class="chat-tab ${p.id === dmMsgTab ? 'active' : ''}" data-chat="${esc(p.id)}">${esc(p.label)}</button>`).join('')}
    </div>
    <div class="card composer">
      <div class="card-title">${I.send}发给：${esc(partner.label)}</div>
      <textarea id="dmMsgText" placeholder="输入消息…（Ctrl+Enter 发送）" rows="2" style="margin-top:8px"></textarea>
      <button class="btn primary" id="dmMsgSendBtn" style="margin-top:8px">${I.send} 发送</button>
    </div>
    <div class="card">
      <div class="card-title">${I.chat}消息记录 <span class="muted small">（${dmMessages.length} 条）</span></div>
      ${dmMessages.length === 0 ? '<div class="muted small mt">暂无消息。</div>' : `<div class="msg-list" style="max-height:50vh; overflow-y:auto">${rows}</div>`}
    </div>
  `;
  $$('#chatTabs .chat-tab').forEach(b => b.onclick = () => {
    const ta = $('#dmMsgText'); if (ta) dmMsgDrafts[dmMsgTab] = ta.value;
    dmMsgTab = b.dataset.chat; renderDmMsg();
  });
  const ta = $('#dmMsgText');
  if (dmMsgDrafts[dmMsgTab]) ta.value = dmMsgDrafts[dmMsgTab];
  ta.addEventListener('input', () => { dmMsgDrafts[dmMsgTab] = ta.value; });
  $('#dmMsgSendBtn').onclick = sendDmMsg;
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendDmMsg(); });
}
async function sendDmMsg() {
  const to = dmMsgTab;
  const text = $('#dmMsgText').value.trim();
  if (!text) { toast('请输入消息', 'error'); return; }
  const r = await dmApi('/api/dm/message', { to, text }, DM_TOKEN);
  if (!r.ok) { toast(r.error || '发送失败', 'error'); return; }
  dmMsgDrafts[to] = '';
  if (r.message && (r.message.seq || 0) > dmSeq) dmMessages.push(r.message);
  dmSeq = Math.max(dmSeq, r.message ? (r.message.seq || 0) : dmSeq);
  /* 发送确认也在顶部 pop（广播/直发都给反馈） */
  const toName = to === 'all' ? '全员' : (pj(to) ? pj(to).characterName : to);
  pop((to === 'all' ? '已向全员广播：' : '已发送给 ' + toName + '：') + text, 'ok');
  renderDmMsg();
}

/* ===== DM 打斗裁决（references/12 范式 6） ===== */
async function loadDmCombats() {
  if (!DM_TOKEN) return;
  const r = await apiGet('/api/dm/combats', DM_TOKEN);
  if (r.ok && r.combats) dmCombats = r.combats;
  if (activeTab === 'fight') renderDmFight();
}
function pj(id) { return (ST.players || []).find(p => p.id === id) || null; }
function renderDmFight() {
  if (!(ST.settings && ST.settings.combatEnabled)) {
    $('#view-fight').innerHTML = `<h1>打斗</h1>` + emptyState('本剧本未开启打斗，此页暂时收起。若要启用，请在 data.json 设置 combatEnabled:true。', 'sword');
    return;
  }
  const pending = dmCombats.filter(c => c.state === 'pending');
  const done = dmCombats.filter(c => c.state === 'judged');
  const vsHTML = c => {
    const a = pj(c.attackerId), d = pj(c.defenderId);
    const alive = it => (it.usesLeft || 0) > 0;
    const losable = pid => (pj(pid) && pj(pid).items || []).filter(alive) || [];
    if (c.state === 'pending') {
      return `
      <div class="card combat-card" data-combat="${esc(c.id)}">
        <div class="combat-vs">
          <div class="vs-side"><span class="dot" style="background:${esc(a ? a.color : '#888')}"></span><b>${esc(a ? a.characterName + '（' + a.playerName + '）' : c.attackerId)}</b><em class="muted small">发起者</em></div>
          <div class="vs-sym">VS</div>
          <div class="vs-side"><span class="dot" style="background:${esc(d ? d.color : '#888')}"></span><b>${esc(d ? d.characterName + '（' + d.playerName + '）' : c.defenderId)}</b><em class="muted small">应战者</em></div>
        </div>
        <div class="muted small mt">发起者武器：${esc(c.attackerItemId || '徒手')}${c.attackerItemId ? '（优势级由剧本题材自定）' : ''}</div>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px">
          <select class="v-win"><option value="${esc(c.attackerId)}">胜方 = 发起者</option><option value="${esc(c.defenderId)}">胜方 = 应战者</option></select>
          <select class="v-take"><option value="">不夺物品</option>${losable(c.defenderId).map(it => `<option value="${esc(it.id)}">夺取 ${esc(it.name)}（剩${it.usesLeft}）</option>`).join('')}</select>
          <button class="btn primary sm v-judge">${I.check} 裁决</button>
        </div>
      </div>`;
    }
    const win = pj(c.winnerId);
    return `
    <div class="card combat-card">
      <div class="combat-vs">
        <div class="vs-side"><span class="dot" style="background:${esc(a ? a.color : '#888')}"></span><b>${esc(a ? a.characterName : c.attackerId)}</b></div>
        <div class="vs-sym">VS</div>
        <div class="vs-side"><span class="dot" style="background:${esc(d ? d.color : '#888')}"></span><b>${esc(d ? d.characterName : c.defenderId)}</b></div>
      </div>
      <div class="muted small mt">${win ? '胜方：' + esc(win.characterName) + '（' + esc(win.playerName) + '）' : '胜方：?'}${c.takenItemId ? ' · 夺走战利品' : ''} · ${fmtClock(c.at)}</div>
    </div>`;
  };
  $('#view-fight').innerHTML = `
    <h1>打斗</h1>
    <div class="card">
      <div class="card-title">${I.sword}待裁决 <span class="muted small">（${pending.length} 项）</span></div>
      ${pending.length === 0 ? '<div class="muted small mt">当前无待裁决的打斗请求。</div>' : `<div class="combat-list" style="max-height:55vh; overflow-y:auto">${pending.map(vsHTML).join('')}</div>`}
    </div>
    <div class="card">
      <div class="card-title">${I.history}已裁决 <span class="muted small">（${done.length} 项）</span></div>
      ${done.length === 0 ? '<div class="muted small mt">暂无已裁决记录。</div>' : `<div class="combat-list">${done.slice(-20).reverse().map(vsHTML).join('')}</div>`}
    </div>
  `;
  /* 切胜负时，把「可夺物品」下拉换成对应失败方的物品 */
  $$('.v-win').forEach(sel => sel.addEventListener('change', function () {
    const card = this.closest('.combat-card');
    const c = dmCombats.find(x => x.id === card.dataset.combat);
    if (!c) return;
    const loserId = this.value === c.attackerId ? c.defenderId : c.attackerId;
    const loser = pj(loserId);
    const alive = it => (it.usesLeft || 0) > 0;
    const opts = (loser && loser.items || []).filter(alive);
    const take = card.querySelector('.v-take');
    take.innerHTML = '<option value="">不夺物品</option>' + opts.map(it => `<option value="${esc(it.id)}">夺取 ${esc(it.name)}（剩${it.usesLeft}）</option>`).join('');
  }));
  $$('.v-judge').forEach(btn => btn.onclick = async () => {
    const card = btn.closest('.combat-card');
    const combatId = card.dataset.combat;
    const winnerId = card.querySelector('.v-win').value;
    const takenItemId = card.querySelector('.v-take').value || null;
    btn.disabled = true;
    const r = await dmApi('/api/dm/combat/judge', { combatId, winnerId, takenItemId }, DM_TOKEN);
    if (!r.ok) { toast(r.error || '裁决失败', 'error'); btn.disabled = false; return; }
    toast('裁决完成', 'ok');
    loadDmCombats();
    poll();
  });
}

/* ===== Init ===== */
login().then(() => {
  startPolling(poll, 3000, 10000);
});