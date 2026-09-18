# 10 · Script Paradigms — 6 种剧本范式 → 字段映射
> **编号说明**：本文「范式 N」= **抽取范式**（源材料 → data.json 建模），与 `references/12-mechanics-paradigms.md`
> 的机制范式、`references/15` 的经济设计稿相互独立；跨文件引用请带文件名。


## 范式总览

| # | 范式 | 代表样例 | 关键字段 |
|---|------|---------|---------|
| 1 | 3 幕推进 | 3 幕剧本样例 | `timeline[]` 3 个 step |
| 2 | 两段剧本（背景/细节） | 两段式剧本样例 | `phase:prologue → started` |
| 3 | 房间号线索 | 房间号剧本样例 | `areas[]` 用房间号作 id |
| 4 | 地图资源（xlsx 平面图） | 地图剧本样例 | `areas[].mapImage` |
| 5 | 按角色分组线索 | 角色分组剧本样例 | `areas[].owner` + `allowOwner:false` |
| 6 | 时间线 + 真相 | 时间线剧本样例 | `timeline[]` + `truth.text` |

---

## 范式 1 · 3 幕推进（Round 1/2/3）

**代表样例**：`样例剧本目录/3幕剧本`
- `Inspector Script/Inspector.pdf`：包含 Round 1, 2, 3 + Summary
- `Inspector Script/Solution.pdf`：真相
- `The Inspector Audio/Imperial-round-1.mp3` 等

**特征**：游戏按幕推进，每幕公布新线索，最后 Summary 收尾。

**data.json 字段映射**：

```jsonc
{
  "timeline": [
    { "id": "t1", "code": "T01", "time": "20:00", "title": "Round 1",
      "text": "Inspector enters. First set of questions.",
      "dmNote": "Round 1 公开线索：-A1, -B2" },
    { "id": "t2", "code": "T02", "time": "21:00", "title": "Round 2",
      "text": "More information released.",
      "dmNote": "Round 2 公开线索：-C3, -D4" },
    { "id": "t3", "code": "T03", "time": "22:00", "title": "Round 3",
      "text": "Final questions.",
      "dmNote": "Round 3 公开线索：-E5, -F6" },
    { "id": "t4", "code": "T04", "time": "23:00", "title": "Summary",
      "text": "Inspector reveals summary.",
      "dmNote": "发放 Solution.pdf" }
  ],
  "dmRefs": [
    { "id": "round1", "title": "Round 1 Audio", "kind": "audio", "file": "res/dmrefs/round1.mp3" },
    { "id": "solution", "title": "Solution", "kind": "image", "file": "res/dmrefs/solution_p1.png" }
  ]
}
```

**DM 端 UI 提示**：在 timeline tab 加 `audio` 按钮，点击播放对应 Round 的 mp3。

---

## 范式 2 · 两段剧本（背景/细节）

**代表样例**：`样例剧本目录/两段式剧本`
- `人物剧本/人物背景（提前发给玩家）/*.pdf`：开赛前发的背景
- `人物剧本/当晚具体细节（阅读完开始游戏后发）/*.pdf`：游戏开始后发的细节
- `真相/真相.pdf`：最终揭晓

**特征**：玩家在 `setup/prologue` 阶段收到"背景"，游戏开始后（`started`）才解锁"细节"。

**data.json 字段映射**：

```jsonc
{
  "characters": [
    {
      "id": "ted",
      "name": "泰德",
      "script": "res/scripts/ted/p1.png",        // 背景 PDF
      "scriptPages": ["res/scripts/ted/p1.png", "res/scripts/ted/p2.png"],
      "detailScript": "res/scripts/ted/detail/p1.png",  // 细节 PDF（phase:started 解锁）
      "detailPages": ["res/scripts/ted/detail/p1.png", "res/scripts/ted/detail/p2.png"],
      "scriptPhase": "prologue"                   // 标记阶段
    }
  ]
}
```

**服务端逻辑**：`/api/fetch` 对 `kind: 'detail'` 类型检查 `game.phase === 'started' || 'reveal'`，否则 403。

```js
case 'detailScript':
  if (DB.game.phase === 'setup') return false;   // 未开始不能看细节
  return !!viewer && viewer.player.characterId === ref.charId;
```

**前端**：玩家端 home tab 在 `phase === 'prologue'` 时显示"剧本"按钮（背景），`phase === 'started'` 后多一个"细节"按钮。

---

## 范式 3 · 房间号线索

**代表样例**：`样例剧本目录/房间号剧本`
- `线索/线索图片/101.jpg`, `104.jpg`, `201A.jpg`, `201B.png`, `202.png`, ...
- `组织者手册.pdf`：组织者独占

**特征**：每个房间号（101/201A/302）作为一个可搜索区域，房间内有 N 张线索图。

**data.json 字段映射**：

```jsonc
{
  "areas": [
    {
      "id": "room_101",
      "name": "101 室",
      "apCost": 1,
      "owner": [],
      "allowOwner": false,
      "type": "area",
      "note": "病房 101",
      "mapImage": "res/maps/hospital.png",      // 可选：地图高亮
      "clues": [
        { "id": "c101a", "title": "血迹", "text": "...", "card": 1,
          "images": ["res/clues/101.jpg"] },
        { "id": "c101b", "title": "处方单", "text": "...", "card": 2,
          "images": ["res/clues/104.jpg"] }
      ]
    },
    {
      "id": "room_201",
      "name": "201 室",
      "apCost": 1,
      "clues": [
        { "id": "c201a", "title": "床底", "card": 3, "images": ["res/clues/201A.jpg"] },
        { "id": "c201b", "title": "墙缝", "card": 4, "images": ["res/clues/201B.png"] }
      ]
    }
    // ... 202, 302, 303, 401, 402, 403, 404, 502, 503, 504, 601, 603, 604, 703, 704
  ]
}
```

**DM 端 UI 提示**：areas 列表按房间号排序（数字部分排序，不是字符串）。

---

## 范式 4 · 地图资源（xlsx 平面图）

**代表样例**：`样例剧本目录/地图剧本`
- `列车平面图.xlsx`：列车车厢布局

**特征**：剧本有关键平面图，需要在 UI 上展示（不只是线索列表）。

**处理步骤**：
1. 把 xlsx 转 PNG（用 `xlsx2png` 工具，或先 xlsx → svg → png）。
2. 存到 `public/res/maps/<name>.png`。
3. 在 `areas[].mapImage` 引用。

**data.json 字段映射**：

```jsonc
{
  "areas": [
    {
      "id": "train_car_3",
      "name": "3 号车厢",
      "mapImage": "res/maps/train.png",        // 全局地图
      "highlightRegion": {                      // 可选：高亮区域
        "x": 100, "y": 200, "w": 150, "h": 80
      },
      "clues": [...]
    }
  ]
}
```

**前端渲染**：每个 area 顶部显示完整地图，叠一层 SVG 高亮当前区域。

```html
<div class="area-card">
  <div class="map-wrap">
    <img src="/res?p=res/maps/train.png&t=...">
    <svg class="map-highlight" viewBox="0 0 1000 600">
      <rect x="100" y="200" width="150" height="80"
            fill="rgba(211, 169, 80, 0.3)"
            stroke="#d3a950" stroke-width="2"/>
    </svg>
  </div>
  <h3>3 号车厢</h3>
</div>
```

---

## 范式 5 · 按角色分组线索

**代表样例**：`样例剧本目录/角色分组剧本`
- `线索/图片/角色甲の线索/*.png`：仅角色甲可搜
- `线索/图片/角色乙の线索/*.png`：仅角色乙可搜
- `线索/图片/组织丙の线索/*.png`：组织丙公共
- 等等

**特征**：每个角色有自己的"领地"（衣帽柜/手提袋/房间），其他人能搜但角色主人搜自己的会有限制（防销毁证据）。

**data.json 字段映射**：

```jsonc
{
  "areas": [
    {
      "id": "room_char_a",
      "name": "角色甲的房间",
      "apCost": 1,
      "owner": ["char_a"],
      "allowOwner": false,                 // 禁止角色甲搜自己的房间
      "type": "area",
      "note": "其他玩家可搜，角色甲不可搜（防销毁证据）",
      "clues": [
        { "id": "c01", "title": "影碟", "card": 1, "images": ["res/clues/影碟.png"] },
        { "id": "c02", "title": "来信", "card": 2, "images": ["res/clues/来信.png"] },
        { "id": "c03", "title": "照片", "card": 3, "images": ["res/clues/照片.jpg"] }
      ]
    },
    {
      "id": "room_org_c",
      "name": "组织丙公共区",
      "apCost": 2,
      "owner": [],
      "allowOwner": false,
      "type": "area",
      "note": "公共线索，所有人可搜",
      "clues": [
        { "id": "c20", "title": "监控", "card": 8, "images": ["res/clues/监控.jpg"] },
        { "id": "c21", "title": "法医报告", "card": 9, "images": ["res/clues/法医报告.png"] }
      ]
    }
  ]
}
```

**例外（`allowOwner:true`）**：某些剧本角色可搜自己（如某角色分组剧本中，角色甲可搜自己的衣帽柜）。

**服务端逻辑**：

```js
if (area.owner.includes(player.characterId) && !area.allowOwner) {
  return { ok: false, error: '不能搜索自己的物品（防止销毁证据）。' };
}
```

---

## 范式 6 · 时间线 + 真相

**代表样例**：`样例剧本目录/时间线剧本`
- `真相.docx`：完整真相
- `背景人物介绍.docx`：人物背景
- `线索/第一轮.docx`、`第二轮.docx`：分段线索
- `人物剧本/*.docx`：角色剧本

**特征**：游戏按时间线推进，最终揭晓完整真相（含凶手、动机、人物关系）。

**data.json 字段映射**：

```jsonc
{
  "timeline": [
    { "id": "t1", "code": "T01", "time": "19:00", "title": "开场",
      "text": "6 位玩家聚集在案发现场...",
      "dmNote": "介绍各自背景" },
    { "id": "t2", "code": "T02", "time": "20:00", "title": "第一轮搜证",
      "text": "玩家开始搜索第一轮线索" },
    { "id": "t3", "code": "T03", "time": "21:00", "title": "第二轮搜证",
      "text": "玩家搜索第二轮线索" },
    { "id": "t4", "code": "T04", "time": "22:00", "title": "讨论与推理",
      "text": "玩家讨论并推理" },
    { "id": "t5", "code": "T05", "time": "23:00", "title": "揭晓真相",
      "text": "DM 揭晓完整真相...",
      "dmNote": "发放真相文档，公布凶手" }
  ],
  "truth": {
    "code": "TRUTH",
    "title": "真相 · 案发之夜",
    "text": "凶手是角色 X，动机是..."
  }
}
```

**前端真相 tab 渲染**：

```js
function renderTruth(st) {
  if (!st.truth) return emptyState('尚未揭晓', 'lock');
  const t = st.truth;
  return `
    <div class="truth-card">
      <div class="truth-title">${esc(t.title)}</div>
      ${t.image ? `<img src="${resUrl(t.image, TOKEN, t.code)}">` : ''}
      <div class="truth-text">${highlight(t.text).split('\n').map(p => `<p>${p}</p>`).join('')}</div>
      <div class="code-row">${codeChip(t.code).outerHTML}</div>
    </div>
  `;
}
```

---

## 范式混合（最常见）

实际剧本往往**多种范式混合**：

```
角色分组混合样例 = 范式 5（按角色分组衣帽柜） + 范式 3（公共区域 + 案发现场） +
         范式 2（部分角色有起始线索 + 后续剧情） + 范式 6（时间线 + 真相）

3 幕剧本样例 = 范式 1（3 幕）+ 范式 6（真相）
两段式剧本样例 = 范式 2（两段剧本） + 范式 6（真相）
地图剧本样例 = 范式 4（列车平面图） + 范式 6（时间线 + 真相）
时间线剧本样例 = 范式 6（纯时间线 + 真相）
角色分组剧本样例 = 范式 5（按角色分组） + 范式 4（地图）
房间号剧本样例 = 范式 3（房间号） + 范式 5（按角色）
```

**Skill 的能力**：data.json schema 同时支持以上所有范式，按需组合。

---

## 范式抽取决策表

| 剧本资料特征 | 应采用的范式 |
|-------------|-------------|
| 多个 docx/pdf 按"角色名"分组 | 范式 5 |
| `Inspector Round 1/2/3` | 范式 1 |
| 角色剧本分"背景.pdf"+"细节.pdf" | 范式 2 |
| 线索按"101/201A/302"房间号分组 | 范式 3 |
| 有 xlsx/png 平面图 | 范式 4 |
| 仅有"人物.docx + 真相.docx + 时间线.docx" | 范式 6 |

---

## 实战：用示例剧本抽取范式

`样例剧本目录/` 含：
- 8 个角色 PDF（角色甲/角色乙/…共 8 个）→ 范式 5（每个角色独立）
- `主持人手册.pdf` → dmRef
- `线索.pdf` → 全部线索（可能按角色分组或按区域分组）
- `邀请函.pdf`、`调查问卷.pdf`、`故事背景及人物简介.pdf` → rules

**Skill 应做的事**：
1. 读 `主持人手册.pdf` → 抽取真相（凶手 + 动机 + 关系）+ 时间线
2. 8 个角色 PDF → `characters[].script`（每个角色独立）
3. `线索.pdf` → 按页提取后，看是否有分组标记（"角色甲的线索" vs "公共区域线索"）
4. 写入 `data.json`，对应 areas[] 结构

详见 SKILL.md 工作流 Step 1。

## 范式 7 · 真相多源汇聚（新增，§25 反哺）

**场景**：剧本资源里**没有独立的真相文件**——真相散落在 `组织者手册.pdf` / `调查线索.pdf` / `结局真相.pdf` 等多份文档里，或要从 `时间轴.pdf` + 人物 docx 综合推断。这是当前最常见的剧本形态之一。

**data.json 处理**：
- 把所有相关真相来源 PDF/docx **全部放进 `dmRefs[]`**（DM 端 docs tab 可见所有原始资料，便于回溯）
- `truth.text` 由**人工精读多源后综合撰写**——多段叙述 `\n\n` 分段，建议在第一段或末尾用 `> 来源：综合自 dmRefs[org].file 与 [investigation]` 注明出处
- 必要时用 `truth.image` 指向关键证据图（指代某个 dmRefs 的第一页或专门一张证据大图）
- `truth.relations` 仍可填（人物关系从组织者手册里抓）

**Skill 工作流检查清单**：
- [ ] Step 1 解析剧本时，识别"无独立真相文件"剧本（看 PDF 列表里有没有 `真相.pdf` / `结局.pdf` / `真相.docx` 等）
- [ ] 把所有真相来源文档加入 `dmRefs[]`，page 顺序排列
- [ ] 人工精读 3 遍（首读骨架，二读细节，三读交叉验证）后写 `truth.text`
- [ ] 验证：DM 端 docs tab 能看到所有真相来源；玩家端 truth tab 显示综合后的最终结论

**实战案例**：某 8 人开放剧本（doc+docx 混合、无独立真相文件）：从组织者手册抽凶手与动机、从时间轴文档抽关键节点、从技能表文档抽人物关系，综合写入 `truth.text`。
## 范式 8 · 时间线推凶（§37 反哺）

**场景**：剧本的核心玩法是"对分钟表"——多条第一视角时间线在案发时段互相交叠，玩家靠
"谁在几点几分出现在哪里、谁能看见谁"交叉验证找出说谎者/凶手。常伴"全场只有一人说谎"式的
约束，以及被害人/关系人不入局的设定。

**抽取要点**：
- 每个角色剧本里的编年体条目（日期 + 精确到分钟）是第一手材料，**逐字保留时间点**，不要改写
- 案发时段（如某日下午 3:30-4:10）各视角的进出/目击关系，整理进 `truth.text`（含排除逻辑）
- 案情通报（警方视角的公共事实：死因、凶器、出入口、在场人员）放进 `timeline[0]` 作为开场节点，
  也可以同时抽成 `rules[]` 文件；`dmNote` 写给 DM 的主持提示（建议时长、何时开放下一轮）
- 未来节点玩家端显示 `? ? ?`，因此把"指认投票""真相揭晓"也排进 `timeline[]`，
  用剧情推进本身承载流程节奏（见 references/03 phase 派生规则）

**data.json 检查清单**：
- [ ] 各角色时间线中的时间点互相可对表（同一个人在同一分钟不出现在两处）
- [ ] `truth.text` 含完整闭环 + 逐人排除逻辑
- [ ] `truth.relations[]` 把"顶罪/胁迫/卧底/供需"等恩怨链补全（真相页有关系图渲染）

## 范式 9 · 分轮线索包（§37 反哺）

**场景**：剧本把线索分成多轮（一轮案情通报纯讨论 → 二轮按房间/人物发放线索包）。docx 文本型
剧本常见"【某角色的房间】：①②③…"的编号条目结构。

**抽取要点**：
- 每个线索包 → 一个 `areas[]`（type personal，`owner` 指向该角色、`allowOwner:false` 防 self-搜）
- 每条编号条目 → 一条 `clue`（长条目可拆：如"笔记本"与"夹在笔记本里的纸条"拆成两条，
  让纸条这类关键证据可以独立流通）
- 全部 clue 设 `unlockStep: 1`（首轮讨论期间不可搜，DM 推进到第二轮节点后开放）；
  若剧本有三轮，则第二轮包 `unlockStep:1`、第三轮包 `unlockStep:2`，`timeline[]` 对应增加节点
- 抽取工具：`extract-docx.py` 出文本后**逐条人读过**再入库，条目序号（①-⑥）转为 clue 顺序即可；
  纯文本剧本用 `res/scripts/<id>/p1.txt`（UTF-8）作 `script`/`scriptPages`，玩家端内联渲染

**前置展示（§37 反哺模板）**：`playerState` 暴露 `unlockStep`，玩家端把未到轮次的区域渲染成
"未开放（剧情推进后可搜）"禁用态——避免第一轮玩家面对一堆点了没结果的搜证按钮。

## 范式 10 · 支线任务计分（§37 反哺）

**场景**：每个角色剧本末尾附『支线任务』（完成 +N 分），隐藏类（不暴露某秘密）与查明类
（挖出某真相）混合，作为胜负/奖励机制。常见于 docx 文本型剧本与计分表剧本。

**当前实现方式**（数据层，无需改服务端）：
- 任务文本保留在角色 `script` 末尾（玩家自己可见）
- 汇总一份 `res/dmrefs/支线任务一览.txt`（每角色一行 + 判分提示），注册进 `dmRefs[]`，
  DM 复盘时对照裁定并口头计分；`rules[]` 里写明计分规则
- `settings.maxRounds/roundMinutes` 记录轮次与建议时长，供 DM 端计时参考

**未来可演进**：`character.tasks[]`（标题+分数，仅 DM 可见）+ DM 端勾选计分 + 汇入 MVP 面板。
落地前不要把任务分数硬编码进投票/MVP 逻辑。
