# 12 · Mechanics Paradigms — 剧本杀"机制"范式（回合/状态/技能/物品）

> 上一份 10-script-paradigms.md 讲的是"线索结构如何落到 data.json"。
> 本章讲的是剧本杀游戏机制（mechanics）的常见模式——这是把任何剧本真正"玩起来"的关键。

## 为什么需要这一章

某回合制谍战题材剧本样例揭示出当前 Skill 的**机制空白**：

- 现有 state-machine（references/03-state-machine.md）只有 5 个阶段（setup/prologue/started/reveal），本质上是个"线性剧本播放器"；
- 现实剧本杀有 **回合制**（每回合 公开讨论 + 自由讨论 各 20 分钟）、**玩家状态**（健康/受伤/中毒/昏迷/死亡）、**技能牌**（每回合对同一人只能 1 次）、**物品使用次数**、**打斗猜拳** 等；
- 该剧本的组织者手册《游戏要素》一节明确写出了 5 种状态 + 公开/自由 2 段 + 5 回合循环 + 物品使用次数规则；
- 用现有 5 阶段模型套它**只能做"搜证 → 投凶"，玩不出真实的谍战 5 回合**。

## 范式总览

> **编号说明**：本文「范式 N」= **机制范式**（运行时玩法，M1..M8），与 `references/10-script-paradigms.md`
> 的**抽取范式**（源材料 → data.json 建模）相互独立；`references/15-economy-steal-trade.md` 的
> M9/M10/M11 为设计稿。跨文件引用范式时请带文件名，避免撞号。

| # | 机制范式 | 代表样例 | 关键 schema |
|---|---------|---------|------------|
| 1 | 5 阶段线性（默认） | 线性推进类剧本 | `game.phase` ∈ setup/prologue/started/reveal |
| 2 | **N 回合循环** | 回合机制剧本样例 | `settings.maxRounds` + `settings.roundMinutes{}` + `game.round` |
| 3 | **玩家状态机** | 状态机制剧本样例 | `players[].state` ∈ healthy/injured/poisoned/coma/dead + 状态计时 |
| 4 | **技能牌** | 技能机制剧本样例 | `characters[].skills[]`（useLimit/perRoundLimit/target/effect） |
| 5 | **物品牌** | 物品机制剧本样例 | `characters[].items[]`（useLimit/tradeable）+ `players[].items[]`（运行时实例） |
| 6 | **打斗/裁决**| 打斗机制剧本样例 | 玩家 `POST /api/player/combat` → DM `POST /api/dm/combat/judge`（开关 `settings.combatEnabled`） |
| 7 | **死亡机制** | 含死亡规则的剧本（最后 2 回合） | `settings.deathAllowRounds`（从哪个回合起允许玩家死亡） |
| 8 | **玩家私聊** | 任意强调自由讨论/阵营交换的剧本 | `game.messages[]` + `POST /api/player/message` / `GET /api/player/messages?since=`（开关 `settings.allowPrivateMessages`) |

这些范式**叠加使用**：回合机制剧本样例 = 机制范式 2+3+4+5+6+7+8 叠加使用。

> 范式 8 详见 `references/14-private-messaging.md`（通用轮询式私聊，与剧本题材无关）。

---

## 范式 2 · N 回合循环

**代表样例**：`样例剧本目录/回合机制剧本`

**特征**：游戏按"回合"循环推进，每回合有公开讨论 + 自由讨论两段时间。DM 控制回合切换（不必等系统时间）。

**data.json 字段**：

```jsonc
{
  "settings": {
    "maxRounds": 5,
    "roundMinutes": { "public": 20, "free": 20 },
    "currentRound": 1,
    "deathAllowRounds": [4, 5]      // 最后 2 回合允许玩家死亡（昏迷 10 分钟后）
  },
  "game": {
    "phase": "started",
    "round": 1,
    "roundPhase": "public",        // public | free | end
    "roundStartedAt": 1789619669000
  }
}
```

**DM 端 API**：
- `POST /api/dm/round` `{round, roundPhase}` 切换回合/阶段
- 玩家端轮询 state 时拿到 round + roundPhase，顶部 chip 显示「第 3 回合 · 公开讨论 · 剩余 12 分钟」

**前端**：玩家端 timer chip 显示当前回合+阶段+剩余时间；时间到给 toast 提醒。

---

## 范式 3 · 玩家状态机

**代表样例**：回合机制剧本样例

**特征**：玩家有 5 种状态，会因技能/物品/打斗改变。状态有持续时间和自动转移。

```jsonc
{
  "players": [
    {
      "id": "p1",
      "characterId": "char_a",
      "state": "healthy",           // healthy | injured | poisoned | coma | dead
      "stateChangedAt": 1789619669000,
      "stateTimerMs": 0,            // 该状态还剩多少 ms 转移
      "items": [
        { "itemId": "antidote", "usesLeft": 2 },
        { "itemId": "knife", "usesLeft": 1 }
      ],
      "cooldowns": {}               // 技能冷却表
    }
  ]
}
```

**状态转移规则**：

```
healthy → injured    （打斗输 / 受伤技能）
healthy → poisoned   （被下毒）
healthy → coma       （中毒/受伤 5 分钟未治）
injured → healthy    （医疗包 1 次）
injured → coma       （5 分钟未治）
poisoned → healthy   （医疗包 1 次）
poisoned → coma      （5 分钟未治）
coma → healthy       （医疗包 2 次）
coma → dead          （settings.deathAllowRounds 含当前回合 && 昏迷 10 分钟）
```

**服务端实现要点**：
- 状态转移在 `searchAs/medicalAs/useItem` 等 DM 路由触发，或由 `dm_set_state` 显式设置
- 每次 state 变化记录日志 + 自动计算 stateTimerMs
- 玩家端轮询看到自己状态变化时给 toast
- DM 端有"全选状态"快捷按钮（用于回放/补救）

**新增 DM 路由**：`POST /api/dm/player/state` `{playerId, state, timerMs?}` → 设置玩家状态。

---

## 范式 4 · 技能牌

**特征**：每个角色有 2-3 个技能，每个技能有使用次数、目标、效果。

```jsonc
{
  "characters": [
    {
      "id": "char_a",
      "skills": [
        {
          "id": "interrogate",
          "name": "讯问技巧",
          "desc": "可要求 NPC 协助对目标进行讯问，可能获得全部/部分/零条线索",
          "useLimit": 4,           // 总次数
          "perRoundLimit": 1,      // 每回合最多用 1 次（对同一玩家）
          "target": "player",      // player | area | self
          "effect": "dm-judge",    // dm-judge（猜拳）/ steal / reveal-clues / etc
          "judge": "rock-paper-scissors:reveal_clues_count"
        },
        {
          "id": "forceful",
          "name": "强力讯问",
          "desc": "讯问成功后使目标立即受伤",
          "useLimit": 2,
          "perRoundLimit": 1,
          "target": "player",
          "effect": "set-state:injured",
          "precondition": "skill:interrogate:last_round_success"
        }
      ]
    }
  ]
}
```

**规则引擎**（服务端）：
- 玩家端不直接执行技能，调用 `POST /api/dm/skill` `{playerId, skillId, targetId}` → 服务端记录 → 通知 DM 裁决
- DM 在 DM 端看到"玩家请求使用技能 X 对 Y"，决定裁决结果（猜拳 / 成功 / 失败）后回写
- 玩家端轮询 state 时收到裁决结果 toast

**前端**：技能条按 `useLimit` 显示剩余次数（划线次数）；点击技能 → 弹"选择目标" → 提交 DM 裁决。

---

## 范式 5 · 物品牌

**特征**：物品有使用次数、可交易、可消耗。物品可卖给剧本 NPC（如掌柜/帮派接头人等）。

```jsonc
{
  "characters": [
    {
      "id": "char_a",
      "items": [
        { "id": "medkit",   "name": "医疗包",   "usesLeft": 1, "tradeable": false, "effect": "heal" },
        { "id": "knife",    "name": "匕首",     "usesLeft": 1, "tradeable": true,  "effect": "weapon" },
        { "id": "poison",   "name": "毒药",     "usesLeft": 2, "tradeable": false, "effect": "poison-target" },
        { "id": "contraband","name": "禁药",    "usesLeft": 1, "tradeable": true,  "effect": "trade-with-npc" },
        { "id": "key",      "name": "保险柜钥匙","usesLeft": 99,"tradeable": true, "effect": "unlock" }
      ]
    }
  ]
}
```

**交易机制**：
- 玩家之间：玩家端有"交易"按钮 → 选目标玩家 → 选物品 → 双方确认 → 服务端原子交换（先验证双方都用次数）
- 与 NPC（老板）：固定价格表 → 玩家提交 buy/sell → 服务端自动增减银元与物品

**新增 DM 路由**：`POST /api/dm/trade` `{type: 'player-player' | 'player-boss', ...}` → 服务端执行。

---

## 范式 6 · 打斗 / 裁决（✅ 已实现）

**特征**：DM 作为"法官"裁决玩家间的打斗/技能请求。猜拳 + 物品优势表。

**裁决表**（服务端/剧本约定）：

```
物品优势: 枪 > 匕首/折扇/眼镜（锋利物） > 其他
打斗流程:
  1. A 用 X 攻击 B  →  POST /api/player/combat {targetId, itemId}（进入 pending）
  2. B 选择 妥协（直接判输）或 应战
  3. 应战：若 B 也有 X 类型物品 → 各消耗 1 次 → 猜拳
           若 B 没有攻击物 → A 消耗 1 次 → 猜拳（猜拳败算 A 平）
           若 B 有不同攻击物 → 按物品优势表 → 猜拳
  4. 裁决：胜方抢走败方一件物品，败方进入【受伤】
```

**已实现接口（`server.template.js`，开关 `settings.combatEnabled`）**：
- 玩家发起 `POST /api/player/combat {targetId, itemId}` → 进入 `pending`，双方历史可见，判决前不可重复
- DM 裁决 `POST /api/dm/combat/judge {combatId, winnerId, takenItemId}` → 服务端自动应用：败方状态→`injured` + 夺走 `takenItemId`，胜方夺得该物、攻击物 `usesLeft-1`
- 已 `judged` 不可再审；玩家端打斗 tab + DM 打斗裁决 tab；`dmCreatePlayer` 可注入 `items`

**DM 端 UI**：DM `打斗 tab` 列出待裁决/已裁决打斗，选择胜方 + 可选夺物 → 一键裁决。

**实战备注**：若组织者手册明确写了完整的打斗规则 → 直接落表。

---

## 范式 7 · 死亡机制

**特征**：游戏后期才允许玩家死亡，防止开局就崩盘。

```jsonc
{
  "settings": {
    "deathAllowRounds": [4, 5]      // 第 4、5 回合昏迷 10 分钟 → 死亡
  }
}
```

**服务端**：
- 玩家进入 coma 时记录 `stateChangedAt`
- 每分钟检查：若当前回合 ∈ deathAllowRounds && coma 持续 ≥ 10min → 转移 dead
- 死亡时丢光所有 items（其他人可抢走）

---

## 实战：如何把回合机制剧本套上机制范式

按本章节的范式组合，对应到 data.json：

```
范式 2 (5 回合) + 范式 3 (5 种状态) + 范式 4 (技能牌) +
范式 5 (物品牌) + 范式 6 (打斗猜拳) + 范式 7 (死亡机制) +
上一份范式 5 (按角色分组随身物) + 范式 6 (时间线 + 真相)
```

**当前 Skill 落地（验证用构建产物）**：
- 范式 2：settings.maxRounds=5 + roundMinutes 在 data.json 已写，但 server 尚未支持 round 切换 API
- 范式 3 / 4 / 5 / 7：schema 设计中，未实现服务端状态机 + DM 端 UI
- **范式 6（打斗/裁决）与范式 8（玩家私聊）已完整实现**：见上方"已实现接口"与 `references/14-private-messaging.md`，端到端验证见构建产物内 `tools/test-mechanics-e2e.cjs`（22/22）
- 当前 Skill 只能玩出"开场 → 搜证 → 投凶 + 打斗/私聊"的版本

**Skill 下一步**：参考该实战，把范式 2/3/4/5/7 加进 `references/03-state-machine.md` + `server.template.js` + dm/player 前端。
范式 6 与范式 8 已实现，见 `IMPROVEMENTS.md` §24；范式 2-5/7 规划见 `IMPROVEMENTS.md` §22。

---

## 设计原则

1. **DM 是法官**：所有"裁决"类操作（猜拳/技能生效/状态转移）由 DM 在 DM 端按钮触发；玩家端不直接修改游戏状态。
2. **服务端是唯一真理**：状态机、回合、计时都在 server.js 维护，前端只读。
3. **日志全留痕**：每次状态变化、技能使用、物品交易都写 `game.log[]`，玩家可在 DM 端复盘。
4. **可降级**：回退到范式 1（5 阶段线性）时，范式 2-7 全部可选——本 Skill 不强求每剧本实现全部机制。