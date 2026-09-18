# 14 · Private Messaging — 玩家私聊机制（通用范式）

> 本章讲的是"玩家间 1:1 私信"机制的通用设计。
> 适用：自由讨论阶段玩家私下交易/交换线索/确认身份的剧本；亦适用于阵营交换。
> 不绑具体剧本——schema/API/前端均可直接用于任何剧本杀应用。

## 为什么需要这个机制

剧本杀"自由讨论阶段"（范式 2 的 free phase）里，玩家需要：
- 私下交换物品（卖医疗包、卖毒品）
- 私下交换线索（"我有你的情报，我有你的情报，公平交换"）
- 确认彼此身份（"你是我方的人吗？"）
- 约定联合行动（"我先搜 A 区，你搜 B 区"）

但**所有玩家围坐大厅**的环境下，**公开讨论阶段不允许私聊**（影响公开推理），**自由讨论阶段虽然人走开了但没有 IM 工具**。

现实剧本杀用"耳语/凑过去讲"实现——数字化时必须给出等价方案：
- WebSocket（违反硬约束：禁止 WebSocket）
- **轮询式服务端暂存**（✅ 与现有架构一致）

## 设计原则

1. **服务端落盘暂存**：消息存 `game.messages[]`（不是 WebSocket 推送），玩家通过现有 `/api/player/state` 轮询拉取。
2. **复用现有鉴权**：发件人/收件人 token 校验，不绕过 sessions。
3. **DM 审查**：所有私聊对 DM **默认可见**（剧本杀的核心是 DM 知道一切）；DM 端有"消息监控" tab 列出最近 N 条。
4. **零依赖**：不引入 ws/im 库，仅扩展现有 `http`。
5. **可降级**：data.json `settings.allowPrivateMessages=false` 可关闭此机制（旧剧本）。
6. **不绑剧本**：消息正文是任意字符串（≤ N 字符）；DM 可配置上限。

## data.json schema

```jsonc
{
  "settings": {
    "allowPrivateMessages": true,            // 总开关（默认 true；旧剧本可 false）
    "maxMessageLength": 280,                 // 单条上限（默认 280）
    "maxMessagesPerRound": 20,               // 每回合上限（默认 20）
    "dmMonitorPrivateMessages": true,        // DM 是否可看私信（默认 true；true 时玩家有"DM 看得见"心理负担）
    "messageRetention": "round"              // 保留策略："round"=本回合可见 / "game"=整局可见 / "forever"=永远
  }
}
```

```jsonc
{
  "game": {
    "messages": [                              // 全局消息流（按时间倒序追加；上限 1000 自动滚动）
      {
        "id": "msg_abc123",                    // 唯一 id（防止客户端误把同条渲染两次）
        "from": "p1_char_a",                   // 发件人 player.id（player 类型）
        "to":   "p2_char_b",                   // 收件人 player.id（DM id 为 'dm'）
        "kind": "player-to-player",            // player-to-player | player-to-dm | dm-to-player
        "text": "我有你的证据，要不要交换？",
        "at": 1789619669000,                   // 时间戳
        "round": 3,                            // 所在回合（用于 retention=round 时过滤）
        "readBy": ["p2_char_b"]                 // 已读玩家列表
      }
    ],
    "messageSeq": 42                            // 单调递增序号，用于客户端 "since=42" 增量拉取
  }
}
```

**泛化要点**：

- `messages` 是**通用 channel**，**不仅用于私聊**——也可承载 DM-to-player 通知（替代 `announcements`）、system 提示（"X 玩家使用了技能 Y"）、public 广播（DM 广播给所有玩家）。
- `kind` 枚举可扩展：`player-to-player` / `player-to-dm` / `dm-to-player` / `dm-to-all` / `system`。
- DM 看私信开关由 `settings.dmMonitorPrivateMessages` 控制；关闭时 DM 端不显示 `kind=player-to-player` 的消息（但服务端仍落盘，仅用于玩家离开后回看）。

## HTTP 路由设计

### 玩家端

| Method | Path | Body | 鉴权 | 说明 |
|--------|------|------|------|------|
| `POST` | `/api/player/message` | `{ to: 'p2_xxx' \| 'dm', text: '...' }` | player token | 发私信 |
| `GET`  | `/api/player/messages?since=<seq>` | - | player token | 增量拉取（仅自己发出/收到 + dm-to-all + dm-to-player(给自己)，见"隐私硬约束"） |
| `POST` | `/api/player/messages/read` | `{ ids: [...] }` | player token | 标记已读（更新 readBy） |

> 复用现有轮询：`/api/player/state` 也返回 `unreadMessages` 摘要（数字 + 最新一条预览），客户端可决策是否立刻 GET `/api/player/messages`。

### DM 端

| Method | Path | Body | 鉴权 | 说明 |
|--------|------|------|------|------|
| `GET`  | `/api/dm/messages?since=<seq>&kind=...` | - | dm token | 看所有私信（受 `dmMonitorPrivateMessages` 控制） |
| `POST` | `/api/dm/message` | `{ to: 'p1_xxx' \| 'all', text: '...' }` | dm token | DM 发私信/广播 |
| `POST` | `/api/dm/messages/clear` | `{ beforeSeq }` | dm token | 清空旧消息（用于 retention=round 的"切换回合时清理"） |

## 服务端实现要点（与现有架构集成）

```js
/* messages 单调递增序号 */
let messageSeq = 0;

/* 玩家发私信 */
function playerMessage(token, body) {
  const sess = sessions.get(token);
  if (!sess || sess.type !== 'player') return { ok: false, error: 'Not authenticated.' };
  const me = DB.players.find(p => p.id === sess.playerId);
  if (!me) return { ok: false, error: '玩家不存在。' };
  if (!DB.settings.allowPrivateMessages) return { ok: false, error: '本剧本已关闭私聊。' };
  const text = String(body.text || '').trim();
  if (!text) return { ok: false, error: '消息不能为空。' };
  const maxLen = DB.settings.maxMessageLength || 280;
  if (text.length > maxLen) return { ok: false, error: '消息超过 ' + maxLen + ' 字限制。' };
  const maxPerRound = DB.settings.maxMessagesPerRound || 20;
  const myRound = DB.game.round || 1;
  const sentThisRound = DB.game.messages.filter(m => m.from === me.id && m.round === myRound).length;
  if (sentThisRound >= maxPerRound) return { ok: false, error: '本回合发送数已达上限。' };
  /* 收件人校验 */
  const to = String(body.to || '');
  let kind = 'player-to-player';
  if (to === 'dm') kind = 'player-to-dm';
  else {
    const target = DB.players.find(p => p.id === to);
    if (!target) return { ok: false, error: '收件人不存在。' };
    if (target.id === me.id) return { ok: false, error: '不能给自己发消息。' };
  }
  const msg = {
    id: 'msg_' + crypto.randomBytes(6).toString('hex'),
    from: me.id,
    to,
    kind,
    text,
    at: Date.now(),
    round: myRound,
    readBy: kind === 'player-to-dm' ? ['dm'] : []
  };
  DB.game.messages.push(msg);
  if (DB.game.messages.length > 1000) DB.game.messages = DB.game.messages.slice(-1000);
  DB.game.messageSeq = ++messageSeq;
  addLog(me.playerName + ' → ' + (to === 'dm' ? '主持人' : '玩家 ' + to) + '：' + text.slice(0, 20));
  saveDB();
  return { ok: true, message: msg };
}
```

```js
/* 玩家拉自 since 之后的私聊。
 * ⚠️ 隐私硬约束：只返回"自己发出、自己收到、DM 广播、DM 定向给自己"。
 *    其他玩家发给 DM 的私信（player-to-dm）绝不可见——只由 from===me 覆盖发送方自己；
 *    绝不能再加 m.to==='dm' 通配（那会泄露所有致 DM 私信）。 */
function playerMessages(token, since) {
  const sess = sessions.get(token);
  if (!sess || sess.type !== 'player') return { ok: false, error: 'Not authenticated.' };
  const me = DB.players.find(p => p.id === sess.playerId);
  if (!me) return { ok: false, error: '玩家不存在。' };
  const s = parseInt(since, 10) || 0;
  const filtered = DB.game.messages.filter(m =>
    messageSeqOf(m) > s &&
    (m.to === me.id || m.from === me.id ||
     m.kind === 'dm-to-all' || (m.kind === 'dm-to-player' && m.to === me.id))
  );
  return { ok: true, messages: filtered, messageSeq: DB.game.messageSeq || 0 };
}
```

> `messageSeqOf(m)` 用 `at` 时间戳或额外存 `seq` 字段（推荐存 seq，稳定性更好）。

### 集成到 player state

```js
/* 在 buildPlayerState 返回值里加 */
return {
  state,
  unreadMessages: filtered.filter(m => !m.readBy.includes(me.id)).length,
  lastMessage: filtered.length ? filtered[filtered.length - 1] : null
};
```

## 前端集成（player.template.js）

新增 tab 或整合到顶部 chip：

```js
/* 顶部 chip 显示未读消息数 */
function renderMessageChip() {
  const n = (state.unreadMessages || 0);
  const el = $('#msgChip');
  el.style.display = n > 0 ? 'inline-flex' : 'none';
  el.querySelector('.count').textContent = n;
}

/* 新 tab：messages */
function viewMessages() {
  const list = $('#messageList');
  list.innerHTML = '';
  for (const m of state.recentMessages || []) {
    const item = document.createElement('div');
    item.className = 'msg-item' + (m.readBy.includes(me.id) ? '' : ' unread');
    item.innerHTML = `
      <div class="msg-head">
        <span class="msg-from ${m.from === 'dm' ? 'is-dm' : ''}">${esc(playerNameById(m.from))}</span>
        <span class="msg-time">${formatTime(m.at)}</span>
      </div>
      <div class="msg-text">${esc(m.text)}</div>
    `;
    list.appendChild(item);
  }
}

/* 发消息 UI */
function openMessageDialog(targetId) {
  const dlg = $('#messageDialog');
  dlg.querySelector('.to').textContent = targetId === 'dm' ? '主持人' : playerNameById(targetId);
  dlg.querySelector('input[name=to]').value = targetId;
  dlg.style.display = 'flex';
  setTimeout(() => dlg.querySelector('textarea').focus(), 50);
}
async function sendMessage() {
  const to = $('#messageDialog input[name=to]').value;
  const text = $('#messageDialog textarea').value.trim();
  if (!text) return;
  const r = await j('/api/player/message', 'POST', { to, text });
  if (r.ok) {
    $('#messageDialog textarea').value = '';
    $('#messageDialog').style.display = 'none';
    showToast('消息已发送。');
    /* 立刻 fetch 一次更新（不等下次轮询） */
    refreshMessages();
  } else {
    showToast(r.error);
  }
}
```

## DM 端集成（dm.template.js）

DM "审查" tab：

```js
function viewMonitor() {
  const list = $('#dmMonitorList');
  list.innerHTML = '';
  const msgs = (state.allMessages || []).slice().reverse();
  for (const m of msgs) {
    const item = document.createElement('div');
    item.className = 'msg-item ' + m.kind;
    item.innerHTML = `
      <div class="msg-head">
        <span class="msg-from">${esc(playerNameById(m.from))}</span>
        <span class="msg-to">→ ${m.to === 'dm' ? '主持人' : esc(playerNameById(m.to))}</span>
        <span class="msg-time">${formatTime(m.at)}</span>
      </div>
      <div class="msg-text">${esc(m.text)}</div>
    `;
    list.appendChild(item);
  }
}
```

## 回合切换时清理消息（retention=round）

```js
function dmRoundChange(nextRound) {
  DB.game.round = nextRound;
  if ((DB.settings.messageRetention || 'round') === 'round') {
    /* 清除非当前回合的消息 */
    DB.game.messages = DB.game.messages.filter(m => m.round === nextRound);
  }
  saveDB();
}
```

## Reset 时清理消息

```js
/* dmReset() 末尾 */
DB.game.messages = [];
DB.game.messageSeq = 0;
messageSeq = 0;
```

## 与现有架构的关系

| 复用点 | 说明 |
|--------|------|
| `sessions`（player/dm token） | 私聊复用同一鉴权 |
| `/api/player/state` 轮询 | 私聊摘要（unread count + last message）走同一通道，无需 WebSocket |
| `game.log[]` | 每条私聊也写 log，便于复盘 |
| `dmReset()` | 顺手清 messages |
| 移动端 ≤820px | 私聊弹窗用底部抽屉，复用 `.modal/.drawer` |

## 验证清单（归口 loop.md §4.6）

私聊机制自验证：
- [ ] **基本发收**：玩家 A 发给 B → B 收到 → B 标已读 → A 看到 B 已读
- [ ] **DM 审查**：DM 在 monitor tab 看到 A↔B 的全部私聊（受开关控制）
- [ ] **DM ↔ 玩家**：玩家发"主持人" → DM 端收到；DM 回信 → 玩家收到
- [ ] **回合清理**：retention=round 时切到下一回合，旧消息不可见
- [ ] **限制生效**：maxMessageLength、maxMessagesPerRound 触发时返回错误
- [ ] **DM 可关闭**：`settings.dmMonitorPrivateMessages=false` → DM 端 monitor tab 为空
- [ ] **Reset 清空**：dmReset 后 game.messages === []
- [ ] **零依赖**：纯 http + JSON，无 npm 包

## 与剧本题材无关的设计选择

| 决策 | 为什么 |
|------|--------|
| 4 位数字 code 改为消息正文 | 消息是结构化 text，不需要数字 code 空间 |
| 走 `/api/player/state` 轮询 | 与现有架构一致；不引入 WebSocket |
| 收件人用 `player.id` 而非 `playerName` | id 唯一稳定；玩家改名不影响 |
| DM 默认可见 | 剧本杀"上帝视角"的核心；若要"秘密私信"则通过 `dmMonitorPrivateMessages=false` 关闭 |
| 消息保留策略默认"round" | 与"自由讨论阶段"对齐——下回合开始时清空旧私信，避免信息堆积 |

## 未来扩展（不破坏硬约束）

- **消息反应（emoji 回应）**：在 msg 上加 `reactions: { [playerId]: emoji }`
- **语音消息**：把 `text` 字段升级为 `payload: { text?, audio? }`
- **撤回**：DM 端 `POST /api/dm/messages/delete` + 加 `deleted: true` 软删除
- **私聊时的状态标记**："正在输入..."（需要服务端推 → 又要 WebSocket）—— **保持轮询**：客户端每 3 秒 POST `/api/player/typing`，DM 端聚合查看
- **消息过滤**：关键词黑名单（剧本杀里常见的"直接说凶手"破坏悬疑）—— DM 端配置 `settings.messageBlocklist` + 服务端正则拦截

---

**总结**：私聊机制 = 复用轮询 + 服务端落盘 + 通用 schema + 可降级开关 + 零依赖 + 泛化（不绑剧本）。