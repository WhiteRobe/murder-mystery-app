# 04 · HTTP API 全表

## 鉴权约定

| Header | 必填 | 用途 |
|--------|------|------|
| `x-token` | 玩家端 | 32 hex 字符，由 `/api/claim` 或 `/api/dm/login` 返回 |
| `Content-Type: application/json` | POST 必填 | body 格式 |

失败统一返回 `{ok: false, error: 'msg'}`，HTTP 状态码 200（避免前端 try/catch 复杂度）。

## 玩家端 API

### POST /api/claim
玩家用 4 位认领码认领角色。

| 项 | 内容 |
|----|------|
| 入参 | `{code: '1234'}` |
| 出参 | `{ok: true, token: 'abc...', state: {...}}` 或 `{ok: false, error: '认领码无效'}` |
| 鉴权 | 无（公开） |
| 副作用 | 生成 token，写 sessions Map，扣减未认领玩家 |

### POST /api/fetch
用 4 位数字 code 跨玩家拉线索。

| 项 | 内容 |
|----|------|
| 入参 | `{token: '...', code: '4382'}` |
| 出参 | `{ok: true, kind: 'clue', id, title, text, card, images[], code, areaName}` |
| 鉴权 | 玩家 token + code 必须存在于某个 unlocked clue/medical |
| 副作用 | **拉码留痕（§37 反哺）**：把资源 id 记入 `player.fetched[]`，之后 `playerState.myClues` 合并返回并标 `fetched:true`（前端显示"来自兑换码"徽标，公开开关仍归持有者）。否则拉到的内容只留在兑换码页临时区域，导航即丢 |
| 错误 | `{ok: false, error: '无效的兑换码。'}` |

> **剧情推进的规范路径是 `/api/dm/step`**（phase 由 currentStep 派生），`/api/dm/phase` 仅为兼容保留。combat / messages / mvp 等扩展端点见文末「扩展端点索引」。

### GET /api/player/state
玩家端轮询主入口，返回完整玩家视角 state。

| 项 | 内容 |
|----|------|
| 入参 | header `x-token` |
| 出参 | `{ok: true, state: {me, myClues, publicClues, areas, medicalFiles, timeline, truth, rules, announcements, notifications, game}}` |
| 鉴权 | 玩家 token |
| 频率 | 5s 活跃 / 30s 后台 |

state 字段说明：
- `me`: 当前玩家 `{id, playerName, characterId, characterName, color, ap, apTotal}`
- `myClues`: 该玩家持有的 private clues
- `publicClues`: 所有 public clues（其他玩家公开的）
- `areas`: 所有 areas（clues 不显示 text/images，只显示 state）
- `timeline`: 全部 timeline（按 stepVisible 过滤）
- `truth`: 仅当 `truthUnlocked` 时返回
- `notifications`: 玩家私有通知

### POST /api/player/search
玩家搜索某区域，消耗 AP 解锁下一条线索。

| 项 | 内容 |
|----|------|
| 入参 | `{token: '...', areaId: 'locker_drake'}` |
| 出参 | `{ok: true, ap: 9, clue: {id, title, text, code, images}, areaName}` |
| 错误 | `'AP 不足'` / `'你最多只能搜索 N 次'` / `'距上次搜索不足 N 分钟'` / `'不能搜自己的物品'` |
| 副作用 | 扣 AP，clue state → unlocked，holder = player.id，生成 code |

### POST /api/player/medical
玩家查阅医疗档案。

| 项 | 内容 |
|----|------|
| 入参 | `{token: '...', fileId: 'm01', interpreterId?: 'p3'}` |
| 出参 | `{ok: true, ap: 9, file: {...}, via: 'self'|'interpreter'}` |
| 鉴权 | 自己查阅需 `char.medical`；委托需 interpreter 也是医疗人员 |
| 副作用 | 自己：扣 1 AP；委托：双方各扣 1 AP |

### POST /api/player/visible
玩家切换自己持有线索的 public/private。

| 项 | 内容 |
|----|------|
| 入参 | `{token: '...', clueId: 'c04', visible: 'public'|'private'}` |
| 出参 | `{ok: true, state: {...}}` |
| 鉴权 | 只能改自己持有的线索（`clue.holder === player.id`） |

### POST /api/player/ack
玩家标记通知为已读（前端轮询时调用）。

| 项 | 内容 |
|----|------|
| 入参 | `{token: '...'}` |
| 出参 | `{ok: true}` |

## DM 端 API

### POST /api/dm/login
DM 进入控制台。

| 项 | 内容 |
|----|------|
| 入参 | `{}` |
| 出参 | `{ok: true, token: 'abc...', state: {...}}` |
| 备注 | 当前实现为"无密码 DM"（单机局域网），需要密码可在 body 加 `{password: '...'}` |

### GET /api/dm/state
DM 端轮询主入口。

| 项 | 内容 |
|----|------|
| 入参 | header `x-token` |
| 出参 | `{ok: true, state: {settings, game, characters, players, areas, medicalFiles, timeline, truth, rules, log, dmRefs, announcements}}` |
| 频率 | 3s 活跃 / 10s 后台 |

### POST /api/dm/players/create
创建新玩家（生成认领码）。

| 项 | 内容 |
|----|------|
| 入参 | `{characterId: 'drake', playerName: '张三', ap?: 10}` |
| 出参 | `{ok: true, player: {id, playerName, characterId, claimCode: '1234', ap, apTotal, ...}}` |
| 副作用 | 生成 4 位唯一 claimCode，写 players[] |

### POST /api/dm/players/update
更新玩家信息（改名/换角色）。

| 项 | 内容 |
|----|------|
| 入参 | `{playerId, playerName?, characterId?}` |
| 出参 | `{ok: true}` |

### POST /api/dm/players/ap
调整玩家 AP（直接 +/-，无奖励池机制）。

| 项 | 内容 |
|----|------|
| 入参 | `{playerId, delta: -2\|+2}` |
| 出参 | `{ok: true, ap: 8}` |
| 副作用 | delta<0 时扣 AP（不能 <0）；delta>0 时加 AP（不超过 apTotal） |

### POST /api/dm/players/revoke
移除玩家（重置认领码）。

| 项 | 内容 |
|----|------|
| 入参 | `{playerId}` |
| 出参 | `{ok: true}` |
| 副作用 | 从 players[] 移除，清 token session |

### POST /api/dm/searchAs
DM 替玩家代搜（用于玩家不熟悉 UI 的场景）。

| 项 | 内容 |
|----|------|
| 入参 | `{playerId, areaId}` |
| 出参 | `{ok: true, clue, ap, tag: '代搜'}` |
| 副作用 | 同 `/api/player/search`，但由 DM token 触发 |

### POST /api/dm/medicalAs
DM 替玩家代查医疗档案。

| 项 | 内容 |
|----|------|
| 入参 | `{playerId, fileId, interpreterId?}` |
| 出参 | `{ok: true, file, tag: '代查'}` |

### POST /api/dm/clue/state
DM 直接修改某条线索状态（手动解锁/锁定）。

| 项 | 内容 |
|----|------|
| 入参 | `{clueId, state: 'unlocked'|'locked', holder?: 'p1', visible?: 'public'}` |
| 出参 | `{ok: true}` |

### POST /api/dm/area/reset
重置某区域（所有线索回 locked）。

| 项 | 内容 |
|----|------|
| 入参 | `{areaId}` |
| 出参 | `{ok: true}` |

### POST /api/dm/area/lock
临时封闭/开放某区域。

| 项 | 内容 |
|----|------|
| 入参 | `{areaId, locked: true\|false}` |
| 出参 | `{ok: true}` |

### POST /api/dm/phase
切换游戏阶段（**仅兼容保留，剧情推进请用 `/api/dm/step`**）。

| 项 | 内容 |
|----|------|
| 入参 | `{phase: 'setup'|'prologue'|'started'|'reveal'}` |
| 出参 | `{ok: true}` |
| 副作用 | announce 广播；**同步 currentStep**（`setup→-1`、`started→max(0,cur)`、`reveal→max(cur,N-1)`），防止与 unlockStep 搜证判据脱钩 |

### POST /api/dm/step
推进/回退 timeline（**剧情推进的规范路径**）。

| 项 | 内容 |
|----|------|
| 入参 | `{step: -1\|0\|1\|...\|N}` |
| 出参 | `{ok: true}` |
| 副作用 | phase 由 currentStep 派生；首次离开 setup 写 `startedAt`；**推进到末节点自动 `truthUnlocked=true`** |

### POST /api/dm/announce
全局广播（推送到所有玩家）。

| 项 | 内容 |
|----|------|
| 入参 | `{text: '...', type: 'info'\|'alert'\|'reveal'\|'police'}` |
| 出参 | `{ok: true}` |
| 副作用 | 写入 game.announcements[]，下次玩家轮询时 toast |

### POST /api/dm/truth
揭晓/收回真相（用于**提前**揭晓或收回重查；推进到末剧情步会自动揭晓，无需调它）。

| 项 | 内容 |
|----|------|
| 入参 | `{unlock: true\|false}` |
| 出参 | `{ok: true}` |
| 副作用 | `game.truthUnlocked = unlock`，announce 广播 |

### POST /api/player/vote
指认投票。

| 项 | 内容 |
|----|------|
| 入参 | `{token, suspectId}` |
| 出参 | `{ok: true, suspectId, ap}` |
| 鉴权 | 玩家 token；仅 started 且真相未揭晓；`currentStep >= settings.voteFromStep`（默认 0） |
| 错误 | 自投拒绝：「不能指认自己。」；未到节点：「尚未到指认阶段，投票未开放。」；揭晓后：「投票已结束（真相已揭晓）。」 |

### POST /api/dm/settings
修改全局设置。

| 项 | 内容 |
|----|------|
| 入参 | `{maxSearchesPerArea?, searchIntervalMinutes?, enableMedicalFiles?}` |
| 出参 | `{ok: true, settings}` |

### POST /api/dm/reset
重置整局游戏（回到 `setup`，清空 players，clues 全 locked，code 重新生成）。

| 项 | 内容 |
|----|------|
| 入参 | `{}` |
| 出参 | `{ok: true}` |
| 副作用 | `DB = buildDefaultData(); saveDB(); sessions.clear();` |

## 资源 API

### GET /res
**所有静态资源的唯一出口**。

| 项 | 内容 |
|----|------|
| 入参 | query `?p=<相对路径>&t=<token>&c=<code>` |
| 出参 | 二进制文件 |
| 鉴权 | `checkResAccess(viewer, code, ref)` |
| 错误 | `403 / 404 / 401` |

**路径安全**：`/res` 用 `resolveSafe(rootDir, relPath)` 归一化并拦截 `../` 逃逸（非法返回 `null` → 400）。完整实现见 `references/09-spoiler-isolation.md` §路径安全。

## 静态页面路由

| Method+Path | 渲染 | 说明 |
|-------------|------|------|
| `GET /` | `public/player.html` | 玩家端首页 |
| `GET /host` 或 `/host.html` | `public/dm.html` | DM 控制台 |
| `GET /css/style.css` | 静态 | 全局样式 |
| `GET /js/{common,dm,player}.js` | 静态 | 前端逻辑 |
| `GET /favicon.ico` | 204 No Content | 避免 404 |

## 错误码约定

| 场景 | HTTP | ok | error 示例 |
|------|------|-----|-----------|
| 认领码无效 | 200 | false | `'认领码无效，请核对后重试。'` |
| token 无效 | 200 | false | `'未认证'` |
| 资源未登记 | 403 | false | `'未登记的资源'` |
| 资源未解锁 | 403 | false | `'该资源未解锁或无权访问'` |
| 路径逃逸 | 400 | false | `'非法路径'` |
| 阶段不允许 | 200 | false | `'游戏尚未开始'` |
| AP 不足 | 200 | false | `'行动点不足，需要 N AP'` |
| 自搜禁止 | 200 | false | `'不能搜索自己的物品'` |
| 路由不存在 | 404 | false | `'接口不存在'` |

## API 实现代码骨架（伪代码）

```js
const routes = {
  'POST /api/claim': (req, res, body) => {
    const r = doClaim(body && body.code);
    if (!r.ok) return sendJSON(res, 200, r);
    return sendJSON(res, 200, { ok: true, token: r.token, state: playerState(r.player) });
  },
  'GET /api/player/state': (req, res) => {
    const viewer = viewerFromReq(req, {});
    if (!viewer || viewer.type !== 'player') return sendJSON(res, 200, { ok: false, error: '未认证' });
    return sendJSON(res, 200, { ok: true, state: playerState(viewer.player) });
  },
  // ... 其余 23 个
};
```

## 反例（绝对禁止）

- 禁止在 API 返回明文 `claimCode` 给玩家端（玩家只能从 DM 端获取）。
- 禁止把 `data.json` 路径暴露给前端（始终通过 `/api/*`）。
- 禁止在 API 中包含 `DB` 全量（只返回 playerState / dmState 的过滤版）。
- 禁止 GET 请求带 body（除 `/api/fetch` 外全部用 POST）。
- 禁止 token 在 URL 中明文传输（必须 `x-token` header）。

## 扩展端点索引（正文未展开的部分）

| 端点 | 详情 |
|------|------|
| `POST /api/player/combat`、`POST /api/dm/combat/judge`、`GET /api/dm/combats` 等 | `references/12-mechanics-paradigms.md` 范式 6（开关 `settings.combatEnabled`） |
| `POST /api/player/message`、`GET /api/player/messages?since=`、`POST /api/player/messages/read`、`POST /api/dm/message`、`GET /api/dm/messages?since=` | `references/14-private-messaging.md`（开关 `settings.allowPrivateMessages` / `dmMonitorPrivateMessages`） |
| `POST /api/dm/mvp` | 设置/清除本场 MVP（`{playerId}` 或 `{clear:true}`），写入 `game.mvp`，揭晓后随玩家 state 下发 |
| `POST /api/player/ack` | 通知已读（清 `player.notifications[]`） |
