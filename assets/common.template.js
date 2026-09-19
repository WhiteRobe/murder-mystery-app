/* %PROJECT_TITLE% · Common frontend layer (zero-dependency) */
'use strict';

/* SVG icon factory */
const ICON = (p, v = '0 0 24 24') =>
  `<svg viewBox="${v}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

const I = {
  search:    ICON('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>'),
  book:      ICON('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  clue:      ICON('<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M8 13h8M8 16h5"/>'),
  clock:     ICON('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>'),
  lock:      ICON('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  unlock:    ICON('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.7-1.6"/><circle cx="12" cy="16" r="1.2"/>'),
  user:      ICON('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>'),
  shield:    ICON('<path d="M12 3l7 3v5c0 5-3.2 8.5-7 10-3.8-1.5-7-5-7-10V6z"/>'),
  share:     ICON('<circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.7 10.7l6.6-3.4M8.7 13.3l6.6 3.4"/>'),
  eye:       ICON('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff:    ICON('<path d="M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3 3.9M6.6 6.6A16 16 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  check:     ICON('<path d="M20 6L9 17l-5-5"/>'),
  x:         ICON('<path d="M18 6L6 18M6 6l12 12"/>'),
  plus:      ICON('<path d="M12 5v14M5 12h14"/>'),
  minus:     ICON('<path d="M5 12h14"/>'),
  refresh:   ICON('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>'),
  play:      ICON('<path d="M6 4l14 8-14 8z"/>'),
  send:      ICON('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>'),
  file:      ICON('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'),
  key:       ICON('<circle cx="8" cy="15" r="4"/><path d="M10.9 12.1L21 2M16 7l3 3M13 10l2 2"/>'),
  alert:     ICON('<path d="M12 3L2 20h20z"/><path d="M12 10v5M12 18h.01"/>'),
  info:      ICON('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  heart:     ICON('<path d="M12 21s-7.5-4.6-9.6-9A5.4 5.4 0 0 1 12 6.2 5.4 5.4 0 0 1 21.6 12c-2.1 4.4-9.6 9-9.6 9z"/>'),
  chevD:     ICON('<path d="M6 9l6 6 6-6"/>'),
  chevR:     ICON('<path d="M9 6l6 6-6 6"/>'),
  chevL:     ICON('<path d="M15 6l-6 6 6 6"/>'),
  menu:      ICON('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  copy:      ICON('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  scan:      ICON('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/><path d="M8.5 13.5l2-2-2-2M13 13.5l-2-2 2-2"/>'),
  home:      ICON('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
  history:   ICON('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 3"/>'),
  gift:      ICON('<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M2 10h20M12 10v10"/><path d="M12 10S10 4 7.5 5.5 12 10 12 10zM12 10s2-6 4.5-4.5S12 10 12 10z"/>'),
  doc:       ICON('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>'),
  dice:      ICON('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1"/><circle cx="15.5" cy="8.5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="8.5" cy="15.5" r="1"/><circle cx="15.5" cy="15.5" r="1"/>'),
  tag:       ICON('<path d="M20.6 13.4L11 3H4v7l10.4 10.6a2 2 0 0 0 2.8 0l3.4-3.4a2 2 0 0 0 0-2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>'),
  userCheck: ICON('<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3.1-6.5 7-6.5M17 15l2.5 2.5L23 14"/>'),
  skull:     ICON('<path d="M12 2a8 8 0 0 0-8 8c0 2.6 1.2 4.8 3 6.2V19a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2.8c1.8-1.4 3-3.6 3-6.2a8 8 0 0 0-8-8z"/><circle cx="9" cy="11" r="1.2"/><circle cx="15" cy="11" r="1.2"/>'),
  chat:      ICON('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/>'),
  sword:     ICON('<path d="M12 2l3 6-3 14-3-14z"/><path d="M8.5 9h7M9 22h6"/>'),
  mail:      ICON('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
};

/* DOM helpers */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtTime(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function fmtClock(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function copyText(t) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
  const ta = document.createElement('textarea');
  ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
  return Promise.resolve();
}

/* Character name highlight */
const CHAR_NAMES = [];
const CHAR_COLORS = {};
function registerCharacter(id, name, color, short) {
  /* 全名优先注册，避免短名抢占长名子串 */
  CHAR_NAMES.push([name, id]);
  if (short) CHAR_NAMES.push([short, id]);
  CHAR_COLORS[id] = color;
}
function highlight(text) {
  let s = esc(text);
  if (!CHAR_NAMES.length) return s;
  /* 单趟最长优先匹配：长名先于短名，避免短名抢占长名子串；整段只替换一次，避免已生成的 span 被二次扫描产生嵌套 */
  const order = CHAR_NAMES
    .map(([name, key]) => [esc(name), key])
    .filter(([n]) => n)
    .sort((a, b) => b[0].length - a[0].length);
  const re = new RegExp(order.map(([n]) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  return s.replace(re, (m) => {
    const hit = order.find(([n]) => n === m);
    const c = CHAR_COLORS[hit[1]] || '#888';
    return `<span class="cname" data-color="${hit[1]}" style="--c:${c}">${m}</span>`;
  });
}

/* API */
function api(path, body, token) {
  const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  if (token) opts.headers['x-token'] = token;
  return fetch(path, opts).then(r => r.json()).catch(() => ({ ok: false, error: '网络错误' }));
}
function apiGet(path, token) {
  const opts = { method: 'GET', headers: {} };
  if (token) opts.headers['x-token'] = token;
  return fetch(path, opts).then(r => r.json()).catch(() => ({ ok: false, error: '网络错误' }));
}
function dmApi(path, body, token) { return api(path, body, token); }
function resUrl(p, token, code) {
  let u = '/res?p=' + encodeURIComponent(p);
  if (token) u += '&t=' + encodeURIComponent(token);
  if (code)  u += '&c=' + encodeURIComponent(code);
  return u;
}

/* Toast */
function toast(text, type) {
  type = type || 'info';
  const icons = { info: 'info', alert: 'alert', police: 'shield', reveal: 'gift', delivery: 'key', error: 'alert', ok: 'check' };
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `${I[icons[type]] || I.info}<div class="t-text">${esc(text)}</div>`;
  $('#toasts').appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 320);
  }, (type === 'alert' || type === 'reveal') ? 6500 : 4200);
}

/* 顶部通知 pop（新私信/广播等）：固定屏幕上方居中，与底部 toast 队列分离 */
function pop(text, type) {
  type = type || 'info';
  const icons = { info: 'info', alert: 'alert', reveal: 'gift', ok: 'check' };
  let box = $('#pops');
  if (!box) { box = document.createElement('div'); box.id = 'pops'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'toast pop ' + type;
  el.innerHTML = `${I[icons[type]] || I.info}<div class="t-text">${esc(text)}</div>`;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 320); }, 5200);
}

/* Modal */
function modal(html, opts = {}) {
  return new Promise(resolve => {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.innerHTML = `<div class="modal"><div class="m-head"><div class="m-title">${opts.title || ''}</div>
      <button class="x">${I.x}</button></div><div class="m-body">${html}</div>
      ${opts.foot ? `<div class="m-foot">${opts.foot}</div>` : ''}</div>`;
    $('#modalRoot').appendChild(mask);
    const close = val => { mask.remove(); resolve(val); };
    mask.querySelector('.x').onclick = () => close(null);
    mask.addEventListener('mousedown', e => { if (e.target === mask) close(null); });
    mask.querySelectorAll('[data-close]').forEach(b => b.onclick = () => close(true));
    mask.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => close(null));
    mask.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => {
      close(opts.okValue ? opts.okValue(mask) : true);
    });
    if (opts.onMount) opts.onMount(mask, close);
  });
}
function modalError(title, msg) {
  return modal(`<div class="muted" style="font-size:14px">${esc(msg)}</div>`,
    { title, foot: `<button class="btn primary" data-close>确定</button>` });
}
function confirmModal(title, html, okText) {
  return modal(html, {
    title,
    foot: `<button class="btn ghost" data-cancel>取消</button><button class="btn primary" data-ok>${esc(okText || '确定')}</button>`,
  }).then(v => v);
}

/* Common components */
function codeChip(code) {
  const el = document.createElement('span');
  el.className = 'code-chip';
  el.innerHTML = `${esc(code)} <button class="copy" title="复制兑换码">${I.copy}</button>`;
  el.querySelector('.copy').onclick = e => {
    e.stopPropagation();
    copyText(code).then(() => toast('已复制兑换码：' + code, 'ok'));
  };
  return el;
}
function clueCard(c, opts = {}) {
  const el = document.createElement('div');
  el.className = 'card clue-card';
  const tags = [];
  if (opts.areaName) tags.push(`<span class="badge">${esc(opts.areaName)}</span>`);
  if (c.card) tags.push(`<span class="badge gold">No.${c.card}</span>`);
  if (opts.medical) tags.push(`<span class="badge info">医疗档案</span>`);
  if (c.fetched) tags.push(`<span class="badge info">来自兑换码</span>`);
  if (opts.holderName) tags.push(`<span class="badge">分享者：${esc(opts.holderName)}</span>`);
  const imgs = (c.images || []).map(p =>
    `<img loading="lazy" src="${resUrl(p, opts.token, c.code)}" alt="clue image">`).join('');
  el.innerHTML = `
    <div class="head">
      <div class="card-title">${I.clue}${esc(c.title)}</div>
      <div class="tags">${tags.join('')}</div>
    </div>
    <div class="clue-text">${highlight(c.text)}</div>
    ${imgs ? `<div class="clue-imgs">${imgs}</div>` : ''}
    <div class="code-row">${codeChip(c.code).outerHTML}
      ${opts.visibility !== false && c.holder === (opts.holderId || '') ? `<label class="switch vis-toggle">
        <input type="checkbox" ${c.visible === 'public' ? 'checked' : ''}>
        <span class="track"></span><span>公开</span></label>` : ''}
    </div>`;
  return el;
}
function lockMask(tip, icon) {
  const el = document.createElement('div');
  el.className = 'lock-mask';
  el.innerHTML = `<div class="mask-overlay">${I[icon || 'lock']}<span>${esc(tip || '已锁定')}</span></div>`;
  return el;
}
function emptyState(text, icon) {
  return `<div class="empty">${I[icon || 'search']}<div>${esc(text)}</div></div>`;
}

/* Polling with visibilitychange */
function startPolling(fn, ms, slowMs) {
  slowMs = slowMs || ms * 6;
  let timer = null;
  const tick = () => {
    fn().finally(() => {
      timer = setTimeout(tick, document.hidden ? slowMs : ms);
    });
  };
  const start = () => { tick(); };
  const stop  = () => { if (timer) clearTimeout(timer); timer = null; };
  document.addEventListener('visibilitychange', () => {
    if (timer) clearTimeout(timer);
    if (!document.hidden) tick();
  });
  start();
  return stop;
}