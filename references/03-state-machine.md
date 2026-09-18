# 03 · State Machine — phase 派生 + timeline 推进 + AP + 冷却

## 阶段定义（phase 由 currentStep 派生，非独立状态）

| 阶段 | 含义 | 玩家端限制 | DM 端能力 |
|------|------|------------|----------|
| `setup` | 玩家准备（currentStep=-1） | 可输入认领码认领角色；不可搜索 | 创建玩家、调整 AP、改设置 |
| `prologue` | 序幕/规则（可选，仅遗留 `/api/dm/phase` 可达） | 可阅读剧本与公共规则；不可搜索 | 推进到 `started` |
| `started` | 调查进行中（currentStep 0..N-2） | 可搜索、可拉码、可翻剧本、可看 timeline 当前位置 | 推进 timeline step、提前揭晓真相 |
| `reveal` | 真相揭晓（currentStep=N-1，自动 `truthUnlocked=true`） | 可看真相；仍可搜 | 收回真相（重新调查） |

**阶段切换路径**（step 推进派生，DM 端只有「上一步/下一步」）：
```
currentStep -1 --> 0 --> ... --> N-1
   phase:  setup ├──── started ────┤ reveal（自动 truthUnlocked=true）
                               （DM 可 /api/dm/truth 提前揭晓或收回）
```

**强制约束**：
- `setup` 阶段不能搜索（API 返回"游戏尚未开始"）。
- `reveal` 阶段 `truthUnlocked=true` 后才能看真相。
- 阶段切换由 DM 在 `/host` 端触发；玩家端不能自行切换。

## timeline 推进

`game.currentStep` 是 `timeline[]` 数组的索引（`-1` ~ `length-1`）：

```
currentStep == -1           →  序幕未开始（玩家端 timeline 全部 ? ? ?）
currentStep == 0             →  T01 已发生
currentStep == timeline.length-1 →  全 timeline 已推进（自动进入 reveal + truthUnlocked=true）
```

**phase 单一事实源（§37 反哺）**：phase 由 `currentPhaseFromStep(currentStep)` 派生
（`-1→setup`、`0..N-2→started`、`N-1→reveal`），DM 端只操作"上一步/下一步"（`/api/dm/step`）。
由此推出两条硬约束：
- `dmSetStep` 推进到末节点时**自动 `truthUnlocked=true` 并记录 `startedAt`**——不要让 DM 再单独点
  "揭晓真相"（双控件漂移：会出现顶栏"已揭晓"而真相面板仍锁着的矛盾状态）。
- 遗留接口 `/api/dm/phase` 仅作兼容保留，必须同步 `currentStep`（`setup→-1`、`started→max(0,cur)`、
  `reveal→max(cur,N-1)`），否则 `unlockStep` 搜证判据与 phase 脱钩（表现为 started 阶段搜不到任何线索）。
`prologue` 无法由 step 派生，如需该阶段仍走 `/api/dm/phase`。

**玩家端 timeline 渲染规则**：
- `idx <= currentStep` → 完整显示（time + title + text）
- `idx > currentStep` → 显示 `? ? ?`（无剧透）

**分轮线索（unlockStep）与前端展示（§37 反哺）**：`playerState.areas[].clues[]` 会暴露
`unlockStep`（仅轮次门控信息，非剧透，不暴露 text）。前端据此把"当前轮搜不到"的区域渲染成
"🔒 未开放（剧情推进后可搜）"的禁用态，而不是可点击的空搜按钮；本人相关区域
（`owner` 含自己且 `allowOwner:false`）显示"本人相关区域，不可自搜"。

**API 鉴权**：
```js
function stepVisible(stepIdx) {
  return stepIdx <= DB.game.currentStep;
}
```

`/api/fetch` 路由对 timeline 资源的额外检查：
```js
if (ref.kind === 'timeline') {
  if (ref.stepIdx > DB.game.currentStep) return { ok: false, error: '该时间节点尚未解锁。' };
}
```

## AP 行动点机制

每个玩家初始 AP（如 10），由 DM 在创建玩家时设定。

**AP 消耗场景**：
| 行为 | AP 消耗 | 说明 |
|------|--------|------|
| 搜索普通区域 | `area.apCost` | 默认 1 |
| 搜索高 AP 区域 | `area.apCost` | 默认 2（公文包类） |
| 查阅自己医疗档案 | 1 | `char.medical === true` |
| 非医疗人员委托解读档案 | 1 + 1（双方） | 解读人也消耗 1 |
| 投凶 | 0 | 投凶独立，不消耗 AP |

**AP 上限**：默认 10（`player.apTotal`）。DM 可手动调整（直接 +/-，无奖励池机制）。

**AP 显示**：
- 玩家端右上角 AP pill（如 `AP 8 / 10`）。
- 变化时 pulse 动画（`pulseAp()`）。
- DM 端"玩家"tab 实时显示所有玩家 AP。

## 搜索次数上限与冷却

| 设置 | 字段 | 默认 | 作用 |
|------|------|------|------|
| 同区域搜索上限 | `settings.maxSearchesPerArea` | 2 | 同一区域最多搜 2 次（防剧透 + 强引导） |
| 同区域搜索冷却 | `settings.searchIntervalMinutes` | 0（无冷却） | 上次搜索后 N 分钟内不能搜 |

**实现**（在 `doSearch` 中）：
```js
const st = player.searches[areaId] || { count: 0, last: 0 };
if (st.count >= DB.settings.maxSearchesPerArea) {
  return { ok: false, error: '你最多只能搜索同一区域 ' + DB.settings.maxSearchesPerArea + ' 次。' };
}
const intervalMin = DB.settings.searchIntervalMinutes;
if (intervalMin > 0) {
  const waitMs = st.last + intervalMin * 60000 - now();
  if (waitMs > 0) {
    return { ok: false, error: '距上次搜索不足 ' + intervalMin + ' 分钟，请稍后。' };
  }
}
```

## 医疗档案（medicalFiles）解读机制

**两类角色**：
- 医护人员（`char.medical === true`）：可直接读任何 medicalFile，消耗自身 1 AP。
- 非医护人员：必须指定 `interpreterId`（一名已认领的医疗玩家）代为解读，**双方各消耗 1 AP**。

**服务端逻辑**：
```js
function doMedical(player, fileId, interpreterId) {
  const m = getMedicalFile(fileId);
  if (!m) return { ok: false, error: '档案不存在' };
  if (m.state === 'unlocked') return { ok: false, error: '已解读' };
  if (player.ap < 1) return { ok: false, error: 'AP 不足' };
  const char = getCharacter(player.characterId);
  if (char.medical) {
    // 自己解读
    player.ap -= 1;
    m.state = 'unlocked'; m.holder = player.id; m.code = m.code || clueCode(m.card);
    return { ok: true, file: m, via: 'self' };
  }
  if (!interpreterId) return { ok: false, error: '请选择一名医疗人员为你解读' };
  const interp = DB.players.find(p => p.id === interpreterId);
  if (!interp || !getCharacter(interp.characterId).medical) {
    return { ok: false, error: '所选玩家不是医疗人员' };
  }
  player.ap -= 1;
  interp.ap -= 1;
  m.state = 'unlocked'; m.holder = player.id; m.code = m.code || clueCode(m.card);
  return { ok: true, file: m, via: 'interpreter' };
}
```

## 投凶（DM 触发）

不在 5 阶段之内，是 DM 在 `reveal` 阶段前的可触发事件：

- DM 端"投凶"tab 列出所有玩家，DM 宣布"请投凶"。
- 玩家端 truth tab 出现投票入口（"你认为谁是凶手"）。
- 玩家投票后写入 `players[].vote`，DM 端汇总。

**简化版**（MVP）：DM 端直接宣布结果，不做玩家投票 UI。

## 起步奖励 / 起始线索

每个角色在认领时立即可见 `startClue`（无需 AP）。`startClue.text` 是该角色"开局那一刻"的内心独白或场景信息。

**实现**：在 `playerState` 中返回 `myStartClue`，前端在 home tab 顶部展示。

## 完整阶段流转示例（早期实现简化版）

```
[setup]
  DM 创建 8 个玩家（每个角色一个）
  玩家 8 人输入认领码
  ↓
[prologue]
  玩家阅读剧本 + 公共规则（玩家手册、游戏指南、序幕）
  起始线索自动可见
  ↓
[started] currentStep = 0 (T01: 发现尸体)
  玩家搜证 → 消耗 AP → 解锁线索 → 获得 code
  玩家公开 code → 其他人拉码
  DM 推进 step = 1 (T02: 劫持者闯入)
  ...
  ↓
[reveal]
  DM 点揭晓真相
  玩家端 truth tab 显示完整真相
  timeline 冻结（仍可查看）
  ↓
[重置]
  DM 点重置 → data.json 恢复初始
```

## 阶段切换的 API（伪代码，与 server.template.js 对齐）

```js
// 规范路径：phase 由 currentStep 派生
function currentPhaseFromStep(step) {
  if (step < 0) return 'setup';
  if (step >= DB.timeline.length - 1) return 'reveal';
  return 'started';
}
'POST /api/dm/step': (req, res, body) => {
  const n = parseInt(body.step, 10);
  if (isNaN(n) || n < -1 || n >= DB.timeline.length) return { ok: false, error: '无效的步骤。' };
  DB.game.currentStep = n;
  const derived = currentPhaseFromStep(n);
  if (derived !== DB.game.phase) {
    DB.game.phase = derived;
    DB.game.phaseHistory.push({ phase: derived, at: now() });
    if (DB.game.startedAt === 0 && derived !== 'setup') DB.game.startedAt = now(); // 计时基准
    addLog('阶段变化：' + derived);
  }
  if (derived === 'reveal' && !DB.game.truthUnlocked) { DB.game.truthUnlocked = true; } // 末节点自动揭晓
  addLog('时间线推进到 step=' + n);
  saveDB();
  return { ok: true };
},
// 遗留兼容：/api/dm/phase 必须反向同步 currentStep（setup→-1、started→max(0,cur)、reveal→max(cur,N-1)），
// 否则 unlockStep 搜证判据与 phase 脱钩。prologue 仅此接口可达。
```

## 反例（绝对禁止）

- 禁止让玩家端自行切阶段（无 API 暴露给玩家切）。
- 禁止在 `setup` 阶段放任何线索可搜（玩家一旦能搜就立刻剧透）。
- 禁止 timeline 推进后回退（除非 DM 显式回退；这会剧透）。
- 禁止 AP 允许负数（`player.ap` 必须始终 `>= 0`）。
- 禁止跳过冷却直接搜（API 必须做时间戳校验）。