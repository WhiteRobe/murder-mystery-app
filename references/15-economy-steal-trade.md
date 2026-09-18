> ⚠ **状态：设计稿（未实现）**——下列 schema / API / SOP 均未在 server.template.js 落地，
> 完成清单未勾选。编号 M9/M10/M11 接续 `references/12` 的机制范式 M1..M8；落地前不要据此承诺功能。
> 落地时需同步：server 路由、validate-data schema、api-flow-test 用例、SKILL.md 约束表与 references/02。

# 15 · Economy / Steal / Trade — 经济、抢夺、玩家间交易（社交/资源机制扩展层）

> 本章是 `references/12-mechanics-paradigms.md` 之外的"社交/资源"机制扩展层。
> 12 章聚焦"回合/状态/技能/物品/打斗/死亡"——单人/单人裁决的机制；
> 15 章聚焦"经济 + 抢夺 + 交易"——玩家与玩家之间、玩家与 NPC 之间的资源流转。
> 设计目标：**复用 12 章的 schema + 6 章打斗的状态机**，尽量少改 server.js 即可落地。

---

## 为什么需要这一章

某民国谍战题材剧本样例的组织者手册反复出现 3 类动作：

1. **花钱**："角色甲向帮派付货款 200 银元"、"角色乙买货物 300 银元"、"掌柜收保护费"。
2. **抢物**："角色丙以武力逼迫角色甲交出保险柜钥匙"、"角色乙抢走角色丁的货物"。
3. **交易**："角色甲卖货物给角色乙"、"角色戊卖情报换钱"。

但当前 server.js 只支持：
- 玩家搜证得线索（范式 1 默认）
- 玩家持有物品（范式 5 部分实现）
- 打斗猜拳 + 夺物（范式 6）

**完全缺失**：银元流转、玩家间交易、AP 消耗型抢夺。本章补这 3 块。

---

## 范式 9 · 经济系统（money + log + DM 调整）

### 动机

剧本中"买货、付保护费、收买 NPC"等动作必须落到银元流转；当前 `player` 对象只有 `ap`，没有 `money`。

### data.json schema

```jsonc
{
  "settings": {
    "economyEnabled": true,           // 总开关（默认 false → 旧剧本不受影响）
    "initialMoney":   1000,           // 玩家开局银元
    "maxMoney":       99999,          // 防止溢出
    "shopItems": [                    // NPC 商品表（DM 可在 DM 端修改）
      { "id": "antidote", "name": "医疗包", "price": 200, "usesLeft": 1, "type": "normal" },
      { "id": "gun-ammo", "name": "手枪子弹", "price": 150, "usesLeft": 3, "type": "gun" }
    ]
  }
}

{
  "players": [
    {
      "id": "p1",
      "money": 1000,                  // 默认 = settings.initialMoney
      "moneyLog": [                   // 流水（最近 50 条）
        { "delta": +200, "reason": "搜证奖励", "at": 1789... }
      ]
    }
  ]
}
```

### HTTP API

| Method | Path | Body | 鉴权 | 说明 |
|--------|------|------|------|------|
| `GET`  | `/api/player/economy` | - | player token | 返回 `{ money, log, shop }` |
| `POST` | `/api/dm/economy/adjust` | `{ playerId, delta, reason }` | dm token | DM 调整；不允许玩家自助 spend（防作弊） |

### 服务端实现要点

- `normalizeGameState()` 兜底：`if (typeof p.money !== 'number') p.money = (DB.settings && DB.settings.economyEnabled) ? (DB.settings.initialMoney || 0) : 0;`
- 触发点：搜证奖励 +50、打斗胜 +30、NPC 购买扣款、DM 手动调整
- 不允许 `money < 0`（前置校验 + 提交前置校验）
- `moneyLog` 上限 50 条（FIFO）

### 前端 UI 草图

```
顶部 chip：[角色] [状态] [AP: 6/10] [💰 1000]
新 tab "经济"：余额 + 流水列表
DM 端"💰 经济监控"tab：每个玩家 + [调整金额/理由] 按钮
```

---

## 范式 10 · 玩家间抢夺（attackType='steal'）

### 动机

剧本中"以武力逼迫交出钥匙"、"抢走对方货物"等动作，需要独立于"打斗猜拳"的"直接抢物品"机制。

### 设计：复用 `game.combats[]`

不新建 `stealRequests[]`，**复用现有打斗状态机**，加 `attackType` 字段：

```jsonc
{
  "settings": {
    "stealEnabled":    true,
    "stealApCost":     1,             // 发起者消耗 AP
    "stealRequiresDm": true           // 必须 DM 裁决（默认 true）
  }
}

// game.combats[] 中每条 combat：
{
  "id": "cbt_xxxxxxxx",
  "attackerId": "p1_char_a",
  "defenderId":  "p2_char_b",
  "attackType":  "steal",             // 'combat'（默认）| 'steal'
  "attackerItemId": "knife",          // 攻击物（可选）
  "targetItemId":   "key",            // 抢夺目标物品（attackType=='steal' 时必填）
  "state": "pending",
  ...
}
```

### HTTP API（复用范式 6 路由）

| Method | Path | Body | 说明 |
|--------|------|------|------|
| `POST` | `/api/player/combat` | `{ targetId, attackType:'steal', targetItemId }` | 发起抢夺，扣 AP |
| `POST` | `/api/dm/combat/judge` | `{ combatId, winnerId, takenItemId }` | 裁决；attackType='steal' 时强制按 `takenItemId` 转物 |

### 服务端实现要点

- `doCombatRequest()`：依据 `attackType` 走不同分支
  - `combat` 分支与原版相同（猜拳 + 物品优势）
  - `steal` 分支：扣 `stealApCost` AP，校验 `target.items` 中存在 `targetItemId`；不需要猜拳
- `dmJudgeCombat()`：attackType='steal' 时直接把 `takenItemId` 从 defender.items 转移到 attacker.items，attackerItem usesLeft-1，loser.state='injured'

### 前端 UI 草图

```
玩家"打斗"tab 增加切换：[💥 打斗 / 🫳 抢夺]
抢夺模式：选目标 + 选对方一件物品 → 提交
DM 端"打斗裁决"tab 与打斗共用 UI，多一行标注「type=steal」
```

---

## 范式 11 · 玩家间交易（双方 confirm → 原子交换）

### 动机

自由讨论阶段玩家私下交换物品 / 线索 / 银元。范式 8（私聊）解决了"对话"，范式 11 解决"原子交换"。

### data.json schema

```jsonc
{
  "settings": {
    "tradeEnabled":   true,
    "tradeTimeoutMs": 120000           // 双方 confirm 超时（默认 2 分钟）
  }
}

{
  "game": {
    "trades": [
      {
        "id": "trd_xxxxxxxx",
        "seq": 42,                          // 单调递增序号（增量拉取）
        "fromPlayerId": "p1_char_a",
        "toPlayerId":   "p2_char_b",
        "offer":  { "money": 100, "items": ["medkit"] },
        "request":{ "money":  50, "items": ["knife"] },
        "state":  "pending",                 // pending → accepted → completed | rejected | cancelled
        "fromConfirmed": true,
        "toConfirmed":   false,
        "createdAt":  1789...,
        "completedAt": null
      }
    ]
  }
}
```

### HTTP API

| Method | Path | Body | 鉴权 | 说明 |
|--------|------|------|------|------|
| `POST` | `/api/player/trade` | `{ toPlayerId, offer, request }` | player | 创建 `pending` |
| `POST` | `/api/player/trade/confirm` | `{ tradeId, accept }` | player | confirm / reject；双方都 accept → 自动执行 |
| `GET`  | `/api/player/trades?since=<seq>` | - | player | 拉取自己参与的 |
| `GET`  | `/api/dm/trades` | - | dm | 看全部 |
| `POST` | `/api/dm/trade/judge` | `{ tradeId, accept, note }` | dm | 强制裁决（兜底） |

### 服务端实现要点（原子性）

```js
function dmJudgeTrade(dm, body) {
  const t = DB.game.trades.find(x => x.id === body.tradeId);
  if (!t) return { ok:false, error:'交易不存在。' };
  if (t.state === 'completed' || t.state === 'rejected') return { ok:false, error:'交易已结束。' };
  const A = getPlayer(t.fromPlayerId), B = getPlayer(t.toPlayerId);
  /* 前置校验：A 与 B 当前资源 ≥ offer/request */
  if ((A.money||0) < (t.offer.money||0))   return { ok:false, error:'发起方银元不足。' };
  if ((B.money||0) < (t.request.money||0)) return { ok:false, error:'接收方银元不足。' };
  for (const iid of (t.offer.items||[]))   if (!A.items.find(it=>it.id===iid)) return { ok:false, error:'A 物品缺失：'+iid };
  for (const iid of (t.request.items||[])) if (!B.items.find(it=>it.id===iid)) return { ok:false, error:'B 物品缺失：'+iid };
  /* 转移（事务性：先扣后加，异常回滚） */
  const A_before = A.money, B_before = B.money;
  A.money -= (t.offer.money||0);
  B.money -= (t.request.money||0);
  A.money += (t.request.money||0);
  B.money += (t.offer.money||0);
  const moveItems = (from,to,ids) => {
    for (const iid of ids) {
      const idx = from.items.findIndex(it=>it.id===iid);
      if (idx < 0) throw new Error('物品已被转移：'+iid);
      to.items.push(from.items.splice(idx,1)[0]);
    }
  };
  try {
    moveItems(A, B, t.offer.items||[]);
    moveItems(B, A, t.request.items||[]);
  } catch (e) {
    A.money = A_before; B.money = B_before;
    return { ok:false, error:e.message };
  }
  t.state = body.accept === false ? 'rejected' : 'completed';
  t.completedAt = now();
  saveDB();
  return { ok:true, trade: t };
}
```

### 前端 UI 草图

```
玩家"🤝 交易"tab：
  - 上方"发起交易"按钮 → 弹窗：选目标 + offer/request 输入
  - 已发起/收到的交易列表：每条带 [确认] [拒绝] 按钮
  - 双方都 confirm → 服务端自动执行
DM 端"🤝 交易监管"tab：列出全部交易 + [强制裁决] 按钮
```

---

## 与现有范式关系

| 新范式 | 依赖 | 复用 |
|--------|------|------|
| 9 经济 | 范式 5（物品牌）| 与 AP 系统并行；新增 `money` 字段 |
| 10 抢夺 | 范式 6（combat）| `attackType` 字段区分；`game.combats[]` 共用 |
| 11 交易 | 范式 5 + 8 + 9 | 新增 `game.trades[]`；服务端原子交换；DM 可介入 |

---

## 资源 code 所有权矩阵（修正版）

### 当前实现的 code 三种语义

| 资源类型 | 生成者 | 谁可用 | 复用 | DM 能否重置 |
|---------|--------|--------|------|------------|
| **搜证线索 code**（area.clues[].code）| `doSearch()` 自动生成 4 位数字 | `holder` 本人 + 任何玩家（凭 code 拉取）| 无限次（每次 fetch 返回完整线索）| `dmSetClueState` 改 state / holder / visible |
| **角色起始线索**（character.startClue）| 不生成 code | 仅本人（`characterId` 匹配）| N/A | N/A |
| **物品牌**（player.items[].id，`randStr(6)`）| `dmCreatePlayer` 注入 / 抢物 / 交易转入 | 仅拥有者 | 不复用——整实例转移 | `dmUpdatePlayer.items` 重写 |

### 范式 10/11 落地后的修正

| 资源 | 转移时 | DM 介入 |
|------|--------|---------|
| 搜证线索 code | **不转移**——线索留在 `areas[]`；只是 `holder` 换人或 `visible` 变 public | `dmSetClueState` 强制改 |
| 物品牌 `item.id` | **整实例转移**（splice + push）；id 不变（不是复制/新建） | `dmUpdatePlayer.items` |
| 交易记录 `trd_xxx` | 一次性；completed/rejected 后只读 | `dmJudgeTrade` 强制裁决 |

### 关键决策（原因）

1. **物品 code 是实例 ID，不是副本**：A→B 的物品仍是同一个实例（`usesLeft` 继承），不是"复制"或"新建"。`nextClueCode()` 不适用于物品（物品 ID 由 `randStr(6)` 生成）。
2. **交易后物品牌 code 不失效**：item.id 是实例身份证；交接只换 `playerId`，不换 id；DM / 玩家追溯"这把枪最初属于谁"还能查到。
3. **搜证 code 与起始线索分开**：起始线索是角色剧本的一部分，不需要"公开 + code 拉取"流程；强加 code 反而破坏体验。
4. **DM 能否重置**：搜证/医疗 code：DM 可改 state；物品 id：DM 可在 `dmUpdatePlayer` 时重写 items 数组；交易记录：DM 不可删，只可强制裁决。

---

## 范式关系图

```mermaid
flowchart TB
    subgraph 已落地
        P1["范式 1<br/>5阶段线性"]
        P6["范式 6 ✅<br/>打斗/裁决"]
        P8["范式 8 ✅<br/>玩家私聊"]
    end
    subgraph 未落地(12章设计稿)
        P2["范式 2<br/>N回合循环"]
        P3["范式 3<br/>玩家状态机"]
        P4["范式 4<br/>技能牌"]
        P5["范式 5<br/>物品牌"]
        P7["范式 7<br/>死亡机制"]
    end
    subgraph 本章新增(15章)
        P9["范式 9<br/>经济系统"]
        P10["范式 10<br/>玩家间抢夺"]
        P11["范式 11<br/>玩家间交易"]
    end
    BUS(["资源 code 总线<br/>findClueByCode / findItemOnPlayer"])

    P5 --> P9
    P5 --> P10
    P5 --> P11
    P6 --> P10
    P8 --> P11
    P3 --> P10
    P9 --> BUS
    P10 --> BUS
    P11 --> BUS
    P6 --> BUS
```

---

## 落地 SOP（实操验证用）

按本章节的范式组合，落到构建产物 `server.js` 与 `public/js/player.js` / `dm.js`：

1. **data.json settings** 加 `economyEnabled/initialMoney/shopItems/stealEnabled/stealApCost/tradeEnabled/tradeTimeoutMs`
2. **server.js normalizeGameState** 兜底 `money` 字段与 `game.trades[]`
3. **server.js dmCreatePlayer** 注入 `money`（默认 1000）
4. **server.js doCombatRequest** 增加 `attackType` 分支（combat / steal）
5. **server.js** 新增 4 个 helper：
   - `getPlayerEconomy()` / `dmEconomyAdjust()`
   - `doCreateTrade()` / `doConfirmTrade()` / `dmJudgeTrade()`
6. **server.js routes** 注册 6 个 API：
   - `GET /api/player/economy`
   - `POST /api/dm/economy/adjust`
   - `POST /api/player/trade`
   - `POST /api/player/trade/confirm`
   - `GET /api/player/trades?since=`
   - `GET /api/dm/trades`
   - `POST /api/dm/trade/judge`
7. **server.js dmReset** 重置 `money = initialMoney`、`trades = []`
8. **player.js** 顶部 chip 加 💰，新 tab"经济" + 新 tab"交易"
9. **dm.js** 新 tab"💰 经济监控" + 新 tab"🤝 交易监管"
10. **playerState me** 加 `money`；**dmState players** 加 `money/moneyLog`

---

## 完成清单

- [ ] data.json settings 加齐 3 范式开关
- [ ] server.js 改完 + 新增代码通过 syntax check
- [ ] 服务端重启后 6 步 curl 验证全过
- [ ] 浏览器实操（创建 A/B → 交易 → 抢物 → DM 裁决）走通
- [ ] 失败场景（银元不足/物品缺失/AP 不足）返回合理错误
- [ ] code 所有权矩阵文档化（本文件 §"资源 code 所有权矩阵"）
- [ ] 验证报告输出（构建产物内 `_verify/` 目录）
