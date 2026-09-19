/* %PROJECT_TITLE% · Player Logic */
'use strict';

const LS_TOKEN = 'mystery_player_token';
let TOKEN = localStorage.getItem(LS_TOKEN) || null;
let ST = null;
let activeTab = 'home';
const seenNotifs = new Set();
let sideOpenMobile = false;
let msgSeq = 0;        /* 私聊：已拉取到的最大消息序号 */
let messages = [];     /* 私聊：当前可见消息 */
let msgTab = 'dm';     /* 当前会话 tab（'dm'=主持人，否则为玩家 id）——tab 化会话（R60） */
let msgDrafts = {};    /* 每个会话独立的草稿，跨轮询重渲染保持 */
let myCombats = [];    /* 打斗：与我相关的记录 */

const TABS = [
  { id: 'home',   label: '主页',     icon: 'home' },
  { id: 'search', label: '搜证',     icon: 'search' },
  { id: 'mine',   label: '我的线索', icon: 'clue' },
  { id: 'pub',    label: '公共线索', icon: 'share' },
  { id: 'time',   label: '时间线',   icon: 'history' },
  { id: 'docs',   label: '资料',     icon: 'doc' },
  { id: 'truth',  label: '真相',     icon: 'skull' },
  { id: 'code',   label: '兑换码',   icon: 'key' },
  { id: 'msg',    label: '私聊',     icon: 'chat', cond: s => s.allowPrivateMessages !== false, dot: 'msgDot' },
  { id: 'fight',  label: '打斗',     icon: 'sword', cond: s => s.combatEnabled === true },
];

const PHASE_LABEL = {
  setup:    { label: '筹备',   icon: 'home',  chip: '' },
  prologue: { label: '序幕',   icon: 'book',  chip: 'info' },
  started:  { label: '进行中', icon: 'play',  chip: 'gold' },
  reveal:   { label: '已揭晓', icon: 'gift',  chip: 'blood' }
};

function isMobile() { return window.innerWidth <= 820; }

/* ===== 计时器（玩家端与 DM 端同源数据：game.startedAt / phaseHistory）===== */
let timerTick = null;
function fmtDur(ms) {
  if (!ms || ms < 0) return '--:--';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = n => String(n).padStart(2, '0');
  return h > 0 ? h + ':' + p(m) + ':' + p(ss) : m + ':' + p(ss);
}
function updateTimer() {
  const chip = $('#timerChip');
  if (!chip || !ST || !ST.game) return;
  const g = ST.game, nowMs = Date.now();
  const total = g.startedAt ? nowMs - g.startedAt : 0;
  let cur = 0;
  if (g.phaseHistory && g.phaseHistory.length) cur = nowMs - g.phaseHistory[g.phaseHistory.length - 1].at;
  else if (g.phaseUpdatedAt) cur = nowMs - g.phaseUpdatedAt;
  chip.title = '当前阶段 ' + fmtDur(cur) + ' · 总时长 ' + fmtDur(total);
  chip.className = 'chip timer-chip' + (g.startedAt ? ' gold' : '');
  const tx = chip.querySelector('#timerChipText');
  if (tx) tx.textContent = g.startedAt ? '🕐 ' + fmtDur(total) : '🕐 --:--';
  if (!timerTick) timerTick = setInterval(() => { if (TOKEN && ST) updateTimer(); }, 1000);
}

function applySidebar() {
  const hidden = localStorage.getItem('mystery_player_side') === '1';
  document.body.classList.toggle('side-hidden', hidden && !isMobile());
  document.body.classList.toggle('side-mobile', isMobile());
  document.body.classList.toggle('side-open', isMobile() && sideOpenMobile);
}
function hideSide() {
  if (isMobile()) sideOpenMobile = false;
  else localStorage.setItem('mystery_player_side', '1');
  applySidebar();
}
function showSide() {
  if (isMobile()) sideOpenMobile = true;
  else localStorage.removeItem('mystery_player_side');
  applySidebar();
}

function msgsEnabled() { return !(ST && ST.settings && ST.settings.allowPrivateMessages === false); }
function fightEnabled() { return !!(ST && ST.settings && ST.settings.combatEnabled); }

function initTabs() {
  const s = (ST && ST.settings) || {};
  const tabs = TABS.filter(t => !t.cond || t.cond(s));
  if (!tabs.some(t => t.id === activeTab)) activeTab = tabs[0] ? tabs[0].id : 'home';
  $('#sideNav').innerHTML = tabs.map(t =>
    `<div class="side-item ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">${I[t.icon]}<span>${t.label}</span>${t.dot ? '<span class="dot hidden" id="' + t.dot + '"></span>' : ''}${t.id === 'mine' ? '<span class="dot hidden" id="mineDot"></span>' : ''}</div>`
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
  document.title = '玩家 · ' + (TABS.find(t => t.id === id) || {}).label;
  if (isMobile()) hideSide();
  if (id === 'msg') loadMessages();
  if (id === 'fight') loadCombats();
  renderActive();
}

function renderActive() {
  if (!ST) return;
  const renderers = {
    home: renderHome, search: renderSearch, mine: renderMine,
    pub: renderPub, time: renderTimeline, docs: renderDocs,
    truth: renderTruth, code: renderCode,
    msg: renderMsg, fight: renderFight
  };
  (renderers[activeTab] || renderHome)();
}

function renderHeader() {
  const phase = PHASE_LABEL[ST.game.phase] || PHASE_LABEL.setup;
  const chip = $('#phaseChip'); if (chip) {
    chip.className = 'chip ' + phase.chip;
    chip.querySelector('span:first-child').innerHTML = I[phase.icon] || I.home;
    chip.querySelector('span:last-child').textContent = phase.label;
  }
  const p = $('#apPill'); if (p) p.textContent = 'AP ' + ST.me.ap + '/' + ST.me.apTotal;
  const me = $('#meName'); if (me) me.textContent = ST.me.playerName + ' · ' + ST.me.characterName;
  /* §26 反哺：银两 chip（仅当玩家有 money 字段时显示） */
  const mc = $('#moneyChip'); if (mc) {
    const money = (ST.me && typeof ST.me.money === 'number') ? ST.me.money : null;
    if (money !== null) {
      mc.style.display = '';
      const mt = $('#moneyChipText'); if (mt) mt.textContent = money;
    } else {
      mc.style.display = 'none';
    }
  }
}

/* §26 反哺：主题三态轮转（默认剧本主题 → light → dark → 默认）
 *   - 从 <body data-theme> 读取 DEFAULT_THEME（剧本原主题）
 *   - 顺序：DEFAULT → 'light' → 'dark' → 回到 DEFAULT
 *   - 写入 documentElement.dataset.theme 与 localStorage.mystery_theme（与现有 HTML inline 脚本兼容）
 *   - 若目标 theme CSS 还没载入则动态加载（保持与原 inline 脚本一致） */
const THEME_CYCLE = ['light', 'dark'];
function applyTheme(theme) {
  let link = document.querySelector('link[data-theme-css="' + theme + '"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/theme-' + theme + '.css';
    link.dataset.themeCss = theme;
    link.onerror = () => { link.remove(); };
    document.head.appendChild(link);
  }
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('mystery_theme', theme); } catch (e) {}
  refreshThemeChip(theme);
}
function defaultTheme() { return document.body.dataset.theme || 'default'; }
function refreshThemeChip(theme) {
  const chip = $('#themeChip');
  if (!chip) return;
  const def = defaultTheme();
  const labels = { [def]: '主题', light: '浅色', dark: '深色' };
  const icons  = { [def]: '☉', light: '☀', dark: '☾' };
  const t = $('#themeChipText'); if (t) t.textContent = labels[theme] || '主题';
  const i = $('#themeChipIcon'); if (i) i.textContent = icons[theme] || '☉';
}
function cycleTheme() {
  const cur = document.documentElement.dataset.theme || '';
  const def = defaultTheme();
  const seq = [def, ...THEME_CYCLE].filter(Boolean);
  const idx = seq.indexOf(cur);
  const next = seq[(idx + 1) % seq.length] || def;
  const chip = $('#themeChip');
  if (chip) {
    chip.classList.remove('flipping');
    void chip.offsetWidth;
    chip.classList.add('flipping');
  }
  applyTheme(next);
}

function pulseAp() {
  const p = $('#apPill'); if (p) {
    p.classList.remove('pulse');
    void p.offsetWidth;
    p.classList.add('pulse');
  }
}

/* ===== Claim ===== */
async function claim() {
  const code = $('#claimInput').value.trim();
  if (!code) { toast('请输入认领码', 'error'); return; }
  const r = await api('/api/claim', { code });
  if (!r.ok) { toast(r.error || '认领失败', 'error'); return; }
  TOKEN = r.token;
  localStorage.setItem(LS_TOKEN, TOKEN);
  ST = r.state;
  ST.characters.forEach(c => registerCharacter(c.id, c.name, c.color, c.short));
  toast('欢迎，' + ST.me.characterName, 'ok');
  enterApp();
}

function enterApp() {
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  initTabs();
  applySidebar();
  /* 认领后应用角色主题色 */
  document.documentElement.style.setProperty('--me-color', ST.me.color || '#888');
  const me = $('#meName'); if (me) me.style.color = ST.me.color || 'var(--gold)';
  renderHeader();
  /* §26 反哺：主题切换按钮（无论是否登录都可点） */
  const tBtn = $('#themeChip'); if (tBtn) tBtn.onclick = cycleTheme;
  refreshThemeChip(document.documentElement.dataset.theme || document.body.dataset.theme || '');
  renderActive();
  startPolling(poll, 5000, 30000);
}

async function logout() {
  localStorage.removeItem(LS_TOKEN);
  TOKEN = null; ST = null;
  location.reload();
}

/* ===== Polling ===== */
let prevAp = null;
let lastSig = '';
function stateSig(st) {
  return JSON.stringify([
    st.game.phase, st.game.currentStep, st.game.truthUnlocked, st.game.mvp,
    st.me.ap, st.me.vote,
    st.myClues.map(c => c.id + ':' + c.visible).join(','),
    st.publicClues.map(c => c.id + ':' + c.visible).join(','),
    st.areas.map(a => (a.locked ? 'L' : '') + a.clues.map(c => c.state[0]).join('')).join(','),
    st.timeline.map(t => t.unlocked ? 1 : 0).join(''),
    (st.announcements || []).length, (st.notifications || []).length
  ]);
}
async function poll() {
  if (!TOKEN) return;
  const r = await apiGet('/api/player/state', TOKEN);
  if (!r.ok) {
    if (r.error === 'Not authenticated.') {
      localStorage.removeItem(LS_TOKEN); TOKEN = null; location.reload();
    }
    return;
  }
  const st = r.state;
  for (const a of (st.announcements || [])) {
    if (!seenNotifs.has(a.id)) { seenNotifs.add(a.id); toast(a.text, a.type || 'info'); }
  }
  for (const n of (st.notifications || [])) {
    if (!seenNotifs.has(n.id)) { seenNotifs.add(n.id); toast(n.text, n.type || 'delivery'); }
  }
  if ((st.notifications || []).length) api('/api/player/ack', { token: TOKEN }).catch(() => {});
  ST = st;
  prevAp = ST.me.ap;
  updateMsgBadge();
  const sig = stateSig(st);
  if (sig !== lastSig) { lastSig = sig; renderHeader(); renderActive(); }
  /* 私聊消息始终增量拉取：驱动顶部 pop 通知（不只在私聊 tab） */
  loadMessages();
  if (activeTab === 'fight') loadCombats();
  updateTimer();
}

/* ===== Views ===== */
function renderHome() {
  const char = ST.characters.find(c => c.id === ST.me.characterId);
  const meColor = ST.me.color || '#888';
  const meShort = (char && char.short) || (ST.me.characterName || '?').slice(0, 1);
  $('#view-home').innerHTML = `
    <div class="start-line"></div>
    <h1>${esc(ST.me.characterName)}</h1>
    <div class="player-card" style="--me-color: ${esc(meColor)}">
      <div class="avatar">${esc(meShort)}</div>
      <div class="info">
        <div class="name">${esc(ST.me.characterName)}</div>
        <div class="muted small">${esc(ST.me.playerName)} · ${char ? esc(char.title) : ''}</div>
      </div>
      <div class="stat-mini">
        <div class="stat-cell"><div class="v">${ST.me.ap}</div><div class="l">AP</div></div>
        <div class="stat-cell"><div class="v">${ST.game.currentStep + 1}/${ST.timeline.length}</div><div class="l">剧情阶段</div></div>
      </div>
    </div>
    ${ST.startClue ? `<div class="card clue-card">
      <div class="card-title">${I.clue}起始线索</div>
      ${ST.startClue.image ? `<img src="${resUrl(ST.startClue.image, TOKEN)}" style="max-width:100%; margin:8px 0; border-radius:6px">` : ''}
      <div class="clue-text">${highlight(ST.startClue.text || '')}</div>
    </div>` : ''}
    ${ST.script ? `<div class="card">
      <button class="btn primary" id="openScript">${I.book} 阅读剧本（${(ST.scriptPages || [ST.script]).length} 页）</button>
    </div>` : ''}
    <div class="card">
      <div class="card-title">${I.tag}资源</div>
      <div class="muted small mt">AP: <b style="color:var(--gold)">${ST.me.ap}/${ST.me.apTotal}</b></div>
    </div>
    ${(() => {
      /* §26 反哺：投票面板始终展示，按 phase + truthUnlocked 控制可用性 */
      const phase = ST.game.phase;
      const truthOpen = !!ST.game.truthUnlocked;
      /* R57：与服务端 doVote 同判据——未推进到 settings.voteFromStep 指定的剧情阶段前不可投 */
      const voteFrom = (ST.settings && typeof ST.settings.voteFromStep === 'number') ? ST.settings.voteFromStep : 0;
      const voteLocked = phase === 'started' && !truthOpen && ST.game.currentStep < voteFrom;
      const canVote = phase === 'started' && !truthOpen && !voteLocked;
      const reason = !canVote
        ? (truthOpen
            ? '真相已揭晓，投票关闭'
            : voteLocked ? `指认投票未开放（推进到剧情阶段 ${voteFrom + 1} 后开启）`
            : (phase === 'setup' ? '等待游戏开始（当前：筹备）'
              : phase === 'prologue' ? '序幕阶段，投票尚未开放'
              : phase === 'reveal' ? '真相阶段，投票已关闭'
              : '当前阶段不能投票'))
        : null;
      return `<div class="card vote-panel">
        <div class="card-title">${I.skull} 投凶指认${canVote ? '' : `<span class="chip" style="margin-left:8px">已锁定</span>`}</div>
        <div class="muted small mt">选出你心中最可能的凶手。真相揭晓后停止计票，被多数人怀疑者将成为「众矢之的」。</div>
        ${reason ? `<div class="muted small" style="margin-top:6px; color:var(--blood)">⚠ ${esc(reason)}</div>` : ''}
        <div style="margin-top:10px; display:flex; align-items:center; gap:10px; flex-wrap:wrap">
          <button class="btn primary" id="voteBtn" ${canVote ? '' : 'disabled style="opacity:.4; cursor:not-allowed"'} title="${esc(reason || '点击指认凶手')}">${ST.me.vote ? I.refresh + ' 修改指认' : I.skull + ' 提交指认'}</button>
          ${ST.me.vote ? `<span class="muted small">已指认：<b class="cname" style="color:var(--blood)">${esc((charById(ST.me.vote)||{name:ST.me.vote}).name)}</b></span>` : ''}
        </div>
      </div>`;
    })()}
    <div class="card">
      <button class="btn ghost" id="logoutBtn">${I.x} 退出登录</button>
    </div>
  `;

  if ($('#openScript')) $('#openScript').onclick = () => openScript(ST.scriptPages || [ST.script], ST.me.characterName);
  if ($('#voteBtn')) $('#voteBtn').onclick = openVote;
  $('#logoutBtn').onclick = async () => {
    const ok = await confirmModal('退出登录', '<div>退出并清除登录令牌？</div>', '退出登录');
    if (ok) logout();
  };
}

function charById(id) {
  return (ST && ST.characters || []).find(c => c.id === id) || null;
}

function openVote() {
  if (!ST) return;
  const opts = ST.characters.filter(c => c.id !== ST.me.characterId);
  const rows = opts.map(c =>
    `<div class="vote-row" data-id="${c.id}">
       <span class="dot" style="background:${c.color}"></span>
       <div class="v-name"><b>${esc(c.name)}</b><div class="muted small">${esc(c.title || '')}</div></div>
       <span class="v-check ${ST.me.vote === c.id ? 'on' : ''}">${ST.me.vote === c.id ? I.check : ''}</span>
     </div>`).join('');
  modal(`<div class="muted small" style="margin-bottom:10px">选择你怀疑的对象（可再次打开修改）。指认将在真相揭晓后计票。</div>
    <div class="vote-list">${rows}</div>`, {
    title: '投凶指认',
    onMount: (mask, close) => {
      mask.querySelectorAll('.vote-row').forEach(row => row.onclick = async () => {
        const id = row.dataset.id;
        const r = await api('/api/player/vote', { token: TOKEN, suspectId: id });
        if (!r.ok) { toast(r.error || '投票失败', 'error'); return; }
        ST = r.state;
        renderHeader(); renderActive();
        toast('已指认 ' + charById(id).name, 'ok');
        close();
      });
    }
  });
}

function openScript(pages, title) {
  if (!pages || pages.length === 0) return;
  let idx = 0;
  const ext = (p) => (p.split('.').pop() || '').toLowerCase();
  const isImage = (p) => ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext(p));
  const isText  = (p) => ['txt', 'md'].includes(ext(p));
  /* 文本页（txt/md）改为内联展示 + highlight 主题色高亮，避免 iframe 内无法高亮 */
  const textCache = {};
  async function loadText(page) {
    if (textCache[page] !== undefined) return textCache[page];
    const r = await fetch(resUrl(page, TOKEN));
    const t = await r.text();
    textCache[page] = t;
    return t;
  }
  const renderPage = () => {
    const page = pages[idx] || '';
    const body = isImage(page)
      ? `<img class="script-page-img" src="${resUrl(page, TOKEN)}" alt="page ${idx + 1}">`
      : (isText(page)
          ? `<div class="script-page-text" data-src="${esc(page)}"><div class="loading">加载中…</div></div>`
          : `<object class="script-page-obj" data="${resUrl(page, TOKEN)}" type="application/octet-stream"><a href="${resUrl(page, TOKEN)}" target="_blank">在新窗口打开第 ${idx + 1} 页</a></object>`);
    return `${body}
    <div class="nav">
      <button class="btn sm" data-prev ${idx === 0 ? 'disabled' : ''}>${I.chevL} 上一页</button>
      <span class="page-info">${idx + 1} / ${pages.length}</span>
      <button class="btn sm" data-next ${idx === pages.length - 1 ? 'disabled' : ''}>下一页 ${I.chevR}</button>
    </div>`;
  };
  modal(`<div class="script-viewer">${renderPage()}</div>`, {
    title: title || '剧本',
    onMount: (mask, close) => {
      const refresh = () => { mask.querySelector('.script-viewer').innerHTML = renderPage(); bind(); loadTextIfNeeded(); };
      const bind = () => {
        const p = mask.querySelector('[data-prev]');
        const n = mask.querySelector('[data-next]');
        if (p) p.onclick = () => { idx = Math.max(0, idx - 1); refresh(); };
        if (n) n.onclick = () => { idx = Math.min(pages.length - 1, idx + 1); refresh(); };
      };
      /* 文本页：拉内容并高亮角色主题色 */
      async function loadTextIfNeeded() {
        const holder = mask.querySelector('.script-page-text[data-src]');
        if (!holder) return;
        const src = holder.getAttribute('data-src');
        if (!src || !isText(src)) return;
        try {
          const txt = await loadText(src);
          holder.innerHTML = '<div class="script-text-content">' + highlight(txt) + '</div>';
        } catch (e) {
          holder.innerHTML = '<div class="muted small">加载失败</div>';
        }
      }
      bind();
      loadTextIfNeeded();
    }
  });
}

function renderSearch() {
  $('#view-search').innerHTML = `
    <h1>搜证</h1>
    ${ST.game.phase === 'setup' ? emptyState('游戏尚未开始', 'lock') :
      ST.areas.map(a => {
        const remaining = a.clues.filter(c => c.state === 'locked').length;
        /* 分轮提示：区域里还有线索，但最小 unlockStep 尚未推进到 → 显示"未开放"而非可点的空搜按钮 */
        const gatedSteps = a.clues.filter(c => c.state === 'locked' && c.unlockStep !== undefined).map(c => c.unlockStep);
        const gated = remaining > 0 && gatedSteps.length > 0 && Math.min(...gatedSteps) > ST.game.currentStep;
        const mine = (a.owner || []).includes(ST.me.characterId) && a.allowOwner === false;
        return `<div class="card">
          <div class="head">
            <div class="card-title">${I.search}${esc(a.name)}</div>
            <div class="muted small">${a.apCost} AP · 余 ${remaining} 条线索</div>
          </div>
          ${a.locked ? '<div class="chip blood">主持人已锁定</div>' :
            a.note ? `<div class="muted small mt">${esc(a.note)}</div>` : ''}
          <div style="margin-top:8px">
            ${gated ? '<div class="chip">🔒 未开放（剧情推进后可搜）</div>' :
              mine ? '<div class="chip">本人相关区域，不可自搜</div>' :
              `<button class="btn primary" data-search="${esc(a.id)}" ${a.locked || remaining === 0 ? 'disabled' : ''}>
                ${I.search} 搜证（-${a.apCost} AP）
              </button>`}
          </div>
        </div>`;
      }).join('')}
  `;

  $$('[data-search]').forEach(b => b.onclick = async () => {
    const r = await api('/api/player/search', { token: TOKEN, areaId: b.dataset.search });
    if (!r.ok) { toast(r.error || '搜证失败', 'error'); return; }
    if (r.empty) { toast(r.error, 'alert'); }
    else { toast('获得线索：' + r.clue.title, 'ok'); pulseAp(); }
    poll();
  });
}

function renderMine() {
  /* 注意：clueCard 先构建 DOM 再取 outerHTML 会丢掉事件监听（R61 实测公开开关失灵）——
     因此这里只放 data-clue 标记，事件统一在 innerHTML 落地后 wireVisibility() 绑定 */
  $('#view-mine').innerHTML = `
    <h1>我的线索</h1>
    ${ST.myClues.length === 0 ? emptyState('还没有线索，去搜证试试。', 'search') : `<div class="grid2">
      ${ST.myClues.map(c => {
        const isMed = c.kind === 'medical';
        const card = clueCard(c, { token: TOKEN, areaName: c.areaName || (isMed ? '医疗档案' : ''), medical: isMed, visibility: true, holderId: ST.me.id });
        card.dataset.clue = c.id;
        return card.outerHTML;
      }).join('')}
    </div>`}
  `;
  wireVisibility();
}
function wireVisibility() {
  $$('#view-mine .vis-toggle input').forEach(sw => {
    const box = sw.closest('[data-clue]');
    const c = ST.myClues.find(x => x.id === (box && box.dataset.clue));
    if (!c) return;
    /* §34 反哺：已公开的线索开关设为只读，无法收回 */
    if (c.visible === 'public') {
      sw.disabled = true;
      sw.checked = true;
      sw.title = '已公开：公开后不可收回';
    }
    sw.onchange = async e => {
      const r = await api('/api/player/visible', { token: TOKEN, clueId: c.id, visible: e.target.checked ? 'public' : 'private' });
      if (!r.ok) { toast(r.error || '操作失败', 'error'); e.target.checked = !e.target.checked; return; }
      toast(e.target.checked ? '已设为公开（不可收回）' : '已设为私密', 'ok');
      poll(); /* 立即同步「公共线索」与开关状态 */
    };
  });
}

function renderPub() {
  $('#view-pub').innerHTML = `
    <h1>公共线索</h1>
    ${ST.publicClues.length === 0 ? emptyState('暂无公开线索。', 'share') : ''}
    <div class="grid2">
      ${ST.publicClues.map(c => {
        const isMed = c.kind === 'medical';
        return clueCard(c, { token: TOKEN, areaName: c.areaName || (isMed ? '医疗档案' : ''), medical: isMed, visibility: false, holderName: '?' }).outerHTML;
      }).join('')}
    </div>
  `;
}

function renderTimeline() {
  $('#view-time').innerHTML = `
    <h1>时间线</h1>
    <div class="stepper">
      ${ST.timeline.map(t => `
        <div class="step ${t.unlocked ? 'current' : 'locked'}">
          <div class="step-time">${esc(t.time)} · ${esc(t.code)}</div>
          <div class="step-title">${t.unlocked ? esc(t.title) : '? ? ?'}</div>
          <div class="step-text">${t.unlocked ? highlight(t.text) : ''}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderDocs() {
  $('#view-docs').innerHTML = `
    <h1>资料</h1>
    ${ST.rules.length === 0 ? emptyState('暂无资料', 'doc') : ''}
    <div class="grid2">
      ${ST.rules.map(r => `
        <div class="card">
          <div class="card-title">${I.doc}${esc(r.title)}</div>
          <div class="muted small mt">${esc(r.desc || '')}</div>
          <div style="margin-top:8px">
            <button class="btn sm primary" data-ruleopen="${esc(r.file)}" data-ruletitle="${esc(r.title)}">${I.doc} 阅读</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  /* 资料站内闭环：弹窗内联阅读（txt 走 fetch+highlight），不再跳外部窗口 */
  $$('[data-ruleopen]').forEach(b => b.onclick = () => openScript([b.dataset.ruleopen], b.dataset.ruletitle || '资料'));
}

function renderTruth() {
  if (!ST.truth) {
    $('#view-truth').innerHTML = `<h1>真相</h1>${lockMask('真相尚未揭晓', 'gift').outerHTML}`;
    return;
  }
  const t = ST.truth;
  const rels = t.relations || [];
  let relGraph = '';
  if (rels.length > 0) {
    /* Simple SVG force-like layout: place nodes on a circle */
    const chars = ST.characters || [];
    const byId = {}; chars.forEach(c => byId[c.id] = c);
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
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${rel.color || '#888'}" stroke-width="1.5" opacity="0.7"/>
              <text x="${mx}" y="${my - 3}" fill="${rel.color || '#888'}" font-size="10" text-anchor="middle">${esc(rel.label || '')}</text>`;
    }).join('');
    const dots = nodes.map(n =>
      `<g><circle cx="${n.x}" cy="${n.y}" r="22" fill="${n.color || '#888'}" opacity="0.3"/>
         <circle cx="${n.x}" cy="${n.y}" r="14" fill="${n.color || '#888'}"/>
         <text x="${n.x}" y="${n.y + 30}" fill="var(--text)" font-size="11" text-anchor="middle">${esc(n.short || n.name)}</text></g>`
    ).join('');
    relGraph = `<div class="card" style="margin-top:12px">
      <div class="card-title">${I.share}人物关系</div>
      <div style="overflow-x:auto">
        <svg viewBox="0 0 400 360" style="width:100%; max-width:500px; height:auto; background:rgba(0,0,0,.2); border-radius:8px">
          ${edges}${dots}
        </svg>
      </div>
      <div class="muted small mt" style="margin-top:8px">悬停在边线上查看具体关系；点击节点查看角色详情</div>
      ${rels.map(r => `<div class="muted small" style="margin-top:4px">
        <span style="color:${esc(r.color || '#888')}">●</span>
        <b style="color:var(--text)">${esc((byId[r.from]||{short:r.from}).short || r.from)}</b>
        → <b style="color:var(--text)">${esc((byId[r.to]||{short:r.to}).short || r.to)}</b>: ${esc(r.label || '')}
        ${r.note ? `<div style="margin-left:18px">${esc(r.note)}</div>` : ''}
      </div>`).join('')}
    </div>`;
  }
  $('#view-truth').innerHTML = `
    <div class="start-line"></div>
    <h1>真相</h1>
    ${ST.game && ST.game.voteResult ? renderVoteResult(ST.game.voteResult, ST.game.mvp) : ''}
    <div class="card clue-card truth-card">
      <div class="card-title">${I.skull}${esc(t.title)}</div>
      ${t.image ? `<img src="${resUrl(t.image, TOKEN, t.code)}" style="max-width:100%; margin:8px 0; border-radius:6px">` : ''}
      <div class="clue-text" id="truthBody">${highlight(t.text || '').split('\n').map(p => `<p>${p}</p>`).join('')}</div>
      ${t.code ? `<div class="code-row">${codeChip(t.code).outerHTML}</div>` : ''}
    </div>
    ${(t.timeline || []).length ? `
    <div class="card" style="margin-top:12px">
      <div class="card-title">${I.history} 作案时间线</div>
      <div class="muted small" style="margin-bottom:8px">案发当晚各角色真实行踪。</div>
      <div class="stepper">
        ${t.timeline.map(x => `
          <div class="step past">
            <div class="step-time">${esc(x.time)}</div>
            <div class="step-title">${esc(x.title)}</div>
            <div class="step-text">${highlight(x.text || '')}</div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
    ${relGraph}
  `;
  /* §37 p5 demo 反哺：truth 揭晓时整个 .truth-card 做 fade-in 动画（保留 highlight 主题色，不破坏 cname span） */
  setTimeout(() => truthCardFade(), 50);
}

/* §37 p5 demo 反哺：truth 揭晓时整个 .truth-card 做 fade-in 动画（保留 highlight 主题色，不破坏 cname span） */
function typeWriter(_sel, _segments, _speed) {
  /* 已改为 fade-in 方式（见 .truth-card 样式 + truthCardFade()）；保留函数签名避免改 renderTruth 调用 */
}
function truthCardFade() {
  const card = document.querySelector('.truth-card');
  if (!card) return;
  card.classList.add('truth-reveal');
  setTimeout(() => card.classList.remove('truth-reveal'), 1500);
}

/* 真相揭晓后的计票结果 + MVP */
function renderVoteResult(voteResult, mvpId) {
  const mvp = mvpId ? (ST.roster || []).find(p => p.id === mvpId) || charById(mvpId) : null;
  let vhtml = '<div class="card" style="margin-top:0"><div class="card-title">' + I.skull + ' 投凶计票</div>';
  if (!voteResult || voteResult.length === 0) {
    vhtml += '<div class="muted small">无人投凶，或尚未开启计票。</div>';
  } else {
    vhtml += '<div class="vr-list">' + voteResult.map(v => `
      <div class="vr-row">
        <span class="dot" style="background:${esc(v.color)}"></span>
        <b class="cname" style="color:${esc(v.color)}">${esc(v.name)}</b>
        <span class="vr-count">${v.count} 票</span>
        ${v.count >= (Math.max(1, Math.floor(voteResult.length / 2) + 1)) ? '<span class="chip blood">众矢之的</span>' : ''}
        <div class="muted small vr-voters">${esc((v.voters || []).join('、') || '—')}</div>
      </div>`).join('') + '</div>';
  }
  vhtml += '</div>';
  if (mvpId && mvp) {
    vhtml += `<div class="card vote-panel">
      <div class="card-title">${I.gift} 本场 MVP</div>
      <div class="mvp-badge"><span class="dot" style="background:${esc(mvp.color || 'var(--gold)')}"></span>
        <b>${esc(mvp.playerName ? mvp.playerName + ' · ' + mvp.characterName : mvp.name)}</b></div>
    </div>`;
  }
  return vhtml;
}

function renderCode() {
  $('#view-code').innerHTML = `
    <h1>输入兑换码</h1>
    <div class="card">
      <div class="muted small">粘贴其他玩家分享的兑换码，即可获取对应的线索。</div>
      <div style="display:flex; gap:6px; margin-top:12px">
        <input type="text" id="codeInput" placeholder="C04-ZQAV" style="font-family:var(--font-mono); text-transform:uppercase">
        <button class="btn primary" id="codeFetchBtn">${I.key} 获取</button>
      </div>
    </div>
    <div id="codeResult"></div>
  `;

  const doFetch = async () => {
    const code = $('#codeInput').value.trim().toUpperCase();
    if (!code) { toast('请输入兑换码', 'error'); return; }
    const r = await api('/api/fetch', { token: TOKEN, code });
    if (!r.ok) { toast(r.error || '获取失败', 'error'); return; }
    if (r.kind === 'rule') {
      window.open(resUrl(r.file, TOKEN), '_blank');
      $('#codeInput').value = '';
      return;
    }
    $('#codeResult').innerHTML = `<div class="mt">
      ${clueCard(r, { token: TOKEN, areaName: r.areaName || (r.kind === 'medical' ? '医疗档案' : ''), medical: r.kind === 'medical', visibility: false }).outerHTML}
    </div>`;
    $('#codeInput').value = '';
    toast('资源获取成功，已加入「我的线索」', 'ok');
    poll(); /* 立即刷新，拉到的线索马上出现在「我的线索」 */
  };

  $('#codeFetchBtn').onclick = doFetch;
  $('#codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') doFetch(); });
}

/* ===== 私聊（references/14） ===== */
function updateMsgBadge() {
  const dot = $('#msgDot'); if (!dot) return;
  const n = (ST && ST.messageSummary) ? (ST.messageSummary.unread || 0) : 0;
  if (n > 0) { dot.classList.remove('hidden'); dot.textContent = n > 9 ? '9+' : String(n); }
  else dot.classList.add('hidden');
}
function rosterById(id) { return (ST.roster || []).find(p => p.id === id) || null; }
function msgName(id) {
  if (!id) return '?';
  if (id === 'dm') return '主持人';
  const r = rosterById(id);
  return r ? (r.characterName || r.playerName) : id;
}
let msgBooted = false; /* 首拉只补历史，不弹 pop */
async function loadMessages() {
  if (!TOKEN || !msgsEnabled() || !ST) return;
  const prevSeq = msgSeq;
  const r = await apiGet('/api/player/messages?since=' + msgSeq, TOKEN);
  if (!r.ok) return;
  if (r.messageSeq && r.messageSeq > msgSeq && r.messages) {
    messages = messages.concat(r.messages.filter(m => (m.seq || 0) > msgSeq));
    msgSeq = r.messageSeq;
  }
  const me = ST.me ? ST.me.id : null;
  /* 新消息 → 顶部 pop（DM 消息前缀「DM」，玩家消息前缀「来自<角色>」）；首拉历史不弹 */
  if (me && msgBooted) {
    messages.filter(m => (m.seq || 0) > prevSeq && m.from !== me).forEach(m => {
      const who = (m.from === 'dm' || (m.kind || '').indexOf('dm-') === 0) ? 'DM' : '来自 ' + msgName(m.from);
      pop(who + '：' + (m.text || ''), (m.kind === 'dm-to-all' || m.kind === 'reveal') ? 'reveal' : 'info');
    });
  }
  msgBooted = true;
  if (me) {
    const unread = messages.filter(m => m.to === me && (m.readBy || []).indexOf(me) < 0).map(m => m.id);
    /* 仅当正在看私聊页才标已读，其他 tab 保留未读（tab 红点可见） */
    if (unread.length && activeTab === 'msg') api('/api/player/messages/read', { token: TOKEN, ids: unread }).then(updateMsgBadge).catch(() => {});
  }
  if (activeTab === 'msg') renderMsg();
}
function chatPartners() {
  return [{ id: 'dm', label: '主持人' }].concat(
    (ST.roster || []).filter(p => p.id !== ST.me.id)
      .map(p => ({ id: p.id, label: p.characterName || p.playerName })));
}
function convMessages(pid) {
  /* 主持人 tab：DM 直发/广播 + 我与 DM 的私聊；玩家 tab：与该玩家的双向消息 */
  if (pid === 'dm') return messages.filter(m => m.from === 'dm' || m.to === 'dm');
  return messages.filter(m => (m.from === pid && m.to === ST.me.id) || (m.from === ST.me.id && m.to === pid));
}
function renderMsg() {
  if (!msgsEnabled()) { $('#view-msg').innerHTML = `<h1>私聊</h1>` + emptyState('本剧本已关闭私聊。', 'chat'); return; }
  const partners = chatPartners();
  if (!partners.some(p => p.id === msgTab)) msgTab = 'dm';
  const partner = partners.find(p => p.id === msgTab);
  const cur = convMessages(msgTab);
  const unreadOf = pid => messages.filter(m => m.to === ST.me.id && m.from === pid && (m.readBy || []).indexOf(ST.me.id) < 0).length;
  const bubbles = cur.map(m => {
    const mine = m.from === ST.me.id;
    const fromOther = m.from !== 'dm' && !mine;
    const other = fromOther ? rosterById(m.from) : null;
    const name = m.kind === 'dm-to-all' ? '主持人 · 广播'
      : (m.kind === 'dm-to-player' && !mine) ? '主持人'
      : m.from === 'dm' ? '主持人'
      : msgName(m.from);
    const color = fromOther && other ? other.color : (m.from === 'dm' ? 'var(--gold)' : 'var(--me-color)');
    const meta = m.kind === 'dm-to-all' ? (m.at ? fmtClock(m.at) : '') + ' · 广播'
      : (m.from === ST.me.id ? ((m.readBy || []).indexOf(ST.me.id) >= 0 ? '已读 · ' : '') : '')
        + (m.at ? fmtClock(m.at) : '');
    return `<div class="bubble-row ${mine ? 'mine' : ''} ${m.kind && m.kind.indexOf('dm-') === 0 ? 'sys' : ''}">
      <div class="bubble-name" style="color:${esc(color)}">${esc(name)}</div>
      <div class="bubble">${esc(m.text)}</div>
      <div class="bubble-meta">${esc(meta)}</div>
    </div>`;
  }).join('');
  $('#view-msg').innerHTML = `
    <h1>私聊</h1>
    ${messages.length === 0 ? emptyState('暂无消息，选一个会话开始私聊。', 'chat') : ''}
    <div class="chat-tabs" id="chatTabs">
      ${partners.map(p => { const u = unreadOf(p.id);
        return `<button class="chat-tab ${p.id === msgTab ? 'active' : ''}" data-chat="${esc(p.id)}">${esc(p.label)}${u ? `<i class="chat-dot">${u > 9 ? '9+' : u}</i>` : ''}</button>`;
      }).join('')}
    </div>
    ${cur.length ? `<div class="chat-list">${bubbles}</div>`
      : `<div class="muted small mt">与「${esc(partner.label)}」暂无消息</div>`}
    <div class="card composer">
      <div class="card-title">${I.send}发给：${esc(partner.label)}${msgTab === 'dm' ? '<span class="muted small">（主持人可查看）</span>' : ''}</div>
      <textarea id="msgText" placeholder="输入消息…（Ctrl+Enter 发送）" rows="2" style="margin-top:8px"></textarea>
      <button class="btn primary" id="msgSendBtn" style="margin-top:8px">${I.send} 发送</button>
    </div>
  `;
  /* 会话 tab 切换：保存当前草稿 → 恢复目标会话草稿（R60，跨轮询重渲染保持） */
  $$('#chatTabs .chat-tab').forEach(b => b.onclick = () => {
    const ta = $('#msgText'); if (ta) msgDrafts[msgTab] = ta.value;
    msgTab = b.dataset.chat; renderMsg();
    const list = $('#view-msg .chat-list'); if (list) list.scrollTop = list.scrollHeight;
  });
  const ta = $('#msgText');
  if (msgDrafts[msgTab]) ta.value = msgDrafts[msgTab];
  ta.addEventListener('input', () => { msgDrafts[msgTab] = ta.value; });
  $('#msgSendBtn').onclick = sendMsg;
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendMsg(); });
  const list = $('#view-msg .chat-list');
  if (list) list.scrollTop = list.scrollHeight;
}
async function sendMsg() {
  const to = msgTab;
  const text = $('#msgText').value.trim();
  if (!text) { toast('请输入消息', 'error'); return; }
  const r = await api('/api/player/message', { token: TOKEN, to, text });
  if (!r.ok) { toast(r.error || '发送失败', 'error'); return; }
  msgDrafts[to] = '';
  if (r.message && (r.message.seq || 0) > msgSeq) messages.push(r.message);
  msgSeq = r.messageSeq || msgSeq;
  renderMsg();
  toast('已发送', 'ok');
}

/* ===== 打斗 / 裁决（references/12 范式 6） ===== */
const STATE_META = {
  healthy: { label: '健康', cls: '', color: 'var(--ok)' },
  injured: { label: '受伤', cls: 'danger', color: 'var(--blood)' },
  poisoned: { label: '中毒', cls: 'danger', color: 'var(--blood)' },
  coma: { label: '昏迷', cls: 'danger', color: 'var(--muted)' },
  dead: { label: '死亡', cls: 'danger', color: '#777' }
};
function stateInfo(s) { return STATE_META[s] || { label: s || '健康', cls: '', color: 'var(--muted)' }; }
async function loadCombats() {
  if (!TOKEN || !fightEnabled() || !ST) return;
  const r = await apiGet('/api/player/combats', TOKEN);
  if (r.ok && r.combats) myCombats = r.combats;
  if (activeTab === 'fight') renderFight();
}
function combatItemName(id) {
  if (!id) return '徒手';
  const mine = (ST.me && ST.me.items || []).find(it => it.id === id);
  return mine ? mine.name : id;
}
function renderFight() {
  if (!fightEnabled()) { $('#view-fight').innerHTML = `<h1>打斗</h1>` + emptyState('本剧本未开启打斗。', 'sword'); return; }
  const me = ST.me;
  const items = (me.items || []).filter(it => (it.usesLeft || 0) > 0);
  const targets = (ST.roster || []).filter(p => p.id !== me.id);
  const rows = myCombats.slice().reverse().map(c => {
    const iAmAttacker = c.attackerId === me.id;
    const other = rosterById(iAmAttacker ? c.defenderId : c.attackerId);
    const judged = c.state === 'judged';
    const iWin = judged && c.winnerId === me.id;
    const title = iAmAttacker
      ? `你对 ${esc((other ? other.characterName : '？'))} 发起打斗`
      : `${esc((other ? other.characterName : '？'))} 对你发起打斗`;
    return `<div class="combat-row ${judged ? (iWin ? 'win' : 'lose') : ''}">
      <span class="dot" style="background:${esc((other || {}).color || '#888')}"></span>
      <div class="c-row-main">
        <b class="cname" style="color:${esc((other || {}).color || '#888')}">${title}</b>
        <span class="muted small">${iAmAttacker ? '你主动' : '你被攻击'} · ${esc(combatItemName(c.attackerItemId))}${(c.takenItemId && iWin) ? ' · 夺得对方物品' : ''}</span>
      </div>
      <span class="chip ${judged ? (iWin ? 'ok' : 'blood') : ''}">${judged ? (iWin ? '胜' : '负') : '待裁决'}</span>
    </div>`;
  }).join('');
  $('#view-fight').innerHTML = `
    <h1>打斗</h1>
    <div class="card">
      <div class="card-title">${I.shield}我的状态
        <span class="chip ${stateInfo(me.state).cls}" style="color:${stateInfo(me.state).color}">${esc(stateInfo(me.state).label)}</span>
      </div>
      ${items.length
        ? `<div class="muted small mt">可用物品：${items.map(it => `${esc(it.name)}（剩 ${it.usesLeft}）`).join('、')}</div>`
        : '<div class="muted small mt">身上暂无可用物品，可徒手打斗。</div>'}
    </div>
    <div class="card">
      <div class="card-title">${I.sword}发起打斗</div>
      <div class="muted small mt">选择目标与（可选）武器后提交打斗请求，由主持人裁决胜负。</div>
      <div style="display:flex; gap:8px; align-items:center; margin-top:10px; flex-wrap:wrap">
        <select id="combatTarget">
          <option value="">— 选择目标 —</option>
          ${targets.map(p => `<option value="${esc(p.id)}">${esc(p.characterName)}（${esc(p.playerName)}）</option>`).join('')}
        </select>
        <select id="combatItem">
          <option value="">徒手</option>
          ${items.map(it => `<option value="${esc(it.id)}">${esc(it.name)}（剩 ${it.usesLeft}）</option>`).join('')}
        </select>
        <button class="btn primary" id="combatBtn">${I.sword} 发起打斗</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title">${I.history}打斗记录</div>
      ${myCombats.length === 0 ? '<div class="muted small mt">暂无打斗记录。</div>' : `<div class="combat-list">${rows}</div>`}
    </div>
  `;
  $('#combatBtn').onclick = sendCombat;
}
async function sendCombat() {
  const targetId = $('#combatTarget').value;
  const itemId = $('#combatItem').value || null;
  if (!targetId) { toast('请先选择目标', 'error'); return; }
  const r = await api('/api/player/combat', { token: TOKEN, targetId, itemId });
  if (!r.ok) { toast(r.error || '发起失败', 'error'); return; }
  toast('打斗请求已提交，等待主持人裁决。', 'ok');
  loadCombats();
}

/* ===== Init ===== */
if (TOKEN) {
  apiGet('/api/player/state', TOKEN).then(r => {
    if (r.ok) {
      ST = r.state;
      ST.characters.forEach(c => registerCharacter(c.id, c.name, c.color, c.short));
      enterApp();
    } else {
      localStorage.removeItem(LS_TOKEN);
      TOKEN = null;
    }
  });
}
$('#claimBtn').onclick = claim;
/* §26 反哺：登录页也允许切主题 */
{ const tBtn = $('#themeChip'); if (tBtn) tBtn.onclick = cycleTheme; }
/* 页面加载即初始化主题按钮 label */
refreshThemeChip(document.documentElement.dataset.theme || document.body.dataset.theme || '');
$('#claimInput').addEventListener('keydown', e => { if (e.key === 'Enter') claim(); });