# 02 · data.json Schema 范式

## 顶层字段

```jsonc
{
  "version": 1,                 // 必填，schema 版本号
  "settings": { ... },          // 全局设置（端口/AP 规则）
  "game": { ... },              // 当前游戏阶段与状态机
  "characters": [ ... ],        // 角色清单（不参与游戏的也算，如 NPC）
  "players": [ ... ],           // 已认领的玩家（运行时生成，初始为空）
  "areas": [ ... ],             // 可搜索的区域/容器/场景
  "medicalFiles": [ ... ],      // 医疗档案式独立资源（可空）
  "timeline": [ ... ],          // 时间线 step（DM 推进用）
  "truth": { ... },             // 真相
  "rules": [ ... ],             // 公共规则（手册/邀请函/调查问卷）
  "log": [ ... ]                // 服务端日志（最近 500 条）
}
```

## settings

```jsonc
{
  "port": 3000,                  // 服务端口（start.bat 也读取这个）
  "maxSearchesPerArea": 2,       // 同一区域最多搜索次数（防剧透）
  "searchIntervalMinutes": 0,    // 同区域搜索冷却（分钟，0=无冷却）
  "voteFromStep": 0,             // §37 R57：指认投票开放的剧情步（timeline 索引，默认 0=一进 started 即可投）。
                                 // 剧本有"指认投票"专属节点时设为该节点索引，未推进到前玩家端锁定+服务端拒绝
  "apDefault": 7,                // 创建玩家时的初始 AP 默认值（可选，缺省 10；玩家创建请求显式传 ap 时优先）
  "enableMedicalFiles": false    // 角色专长档案/医疗档案（可选机制），data.json 有 medicalFiles 且设 true 才启用
}
```

## game（状态机）

```jsonc
{
  "phase": "setup",              // setup / prologue / started / reveal（由 currentStep 派生，见 references/03；prologue 仅遗留接口可达）
  "phaseUpdatedAt": 1700000000000,
  "currentStep": -1,             // timeline 索引；-1=未开始；可手动回到 -1
  "truthUnlocked": false,        // 真相是否揭晓
  "announcements": [             // 全局广播（最多保留 80 条）
    { "id": "a1", "text": "...", "type": "info|alert|reveal|police", "time": 1700000000000 }
  ]
}
```

## characters[]

```jsonc
{
  "id": "drake",                          // 必填，唯一英文/拼音 id
  "name": "德雷克·里莫瑞特",              // 玩家端显示全名
  "short": "德雷克",                      // 短名（聊天/搜索时高亮）
  "title": "研究员医生",                  // 职业/身份
  "medical": true,                        // 是否医疗人员（影响 medicalFiles 解读权限）
  "color": "#7fb3d5",                     // 角色主题色（chip / 头像 / 代码前缀）
  "gender": "男",
  "desc": "汉斯医生的双胞胎弟弟...",      // 简介（≤80 字）
  "hint": "重要：告诉这位玩家——...",     // DM 提示（仅 DM 端可见）
  "secret": "德雷克实为汉斯顶替...",      // 真相（仅 DM 端可见）
  "script": "res/scripts/drake/p1.png",   // 相对路径：剧本首页（PDF 截屏）
  "scriptPages": [                        // 可选：所有页码路径（翻页用）
    "res/scripts/drake/p1.png",
    "res/scripts/drake/p2.png"
  ],
  "startClue": {                          // 起始线索（认领后立即可见）
    "image": "res/clues/drake_start.jpg",
    "text": "你正在餐厅与同事交谈，突然..."
  }
}
```

## players[]（运行时生成）

```jsonc
{
  "id": "p1",                             // 服务端生成
  "playerName": "张三",                    // DM 输入的展示名
  "characterId": "drake",                  // 认领的角色 id
  "claimCode": "1234",                     // 4 位数字认领码（DM 发放给玩家）
  "token": "abc123...",                   // 玩家 token（不在 JSON 持久化，运行时 sessions）
  "ap": 10,                                // 当前 AP
  "apTotal": 10,                           // 总 AP 上限
  "searches": {                            // 各区域已搜次数（防作弊）
    "locker_drake": { "count": 1, "last": 1700000000000 }
  },
  "notifications": [ ... ],                // 玩家私有通知
  "lastSeen": 1700000000000,              // 最后心跳
  "createdAt": 1700000000000
}
```

## areas[]

```jsonc
{
  "id": "locker_drake",                    // 唯一 id
  "name": "德雷克·里莫瑞特的衣帽柜",      // 玩家端显示
  "apCost": 1,                             // 搜索消耗 AP
  "owner": ["drake"],                      // 拥有者（"不能搜自己的东西"用）
  "allowOwner": true,                      // 例外：drake 可搜自己的衣帽柜
  "type": "area",                          // area / body / special / bullets
  "note": "出入急诊病房的唯一通道",         // 提示
  "locked": false,                         // DM 可临时封闭
  "requireUnlocked": ["c38", "c02"],       // 前置线索（解锁后才能搜）
  "mapImage": "res/maps/hospital.png",    // 可选：地图配图
  "clues": [ ... ]                         // 见下
}
```

### clues[]

```jsonc
{
  "id": "c04",
  "title": "雄性激素订单",                 // 玩家端可见标题
  "text": "你发现了一张雄性激素的订单...",  // 正文（多行 / 富文本）
  "card": 4,                                // 配图编号（0=无图）；对应 res/clues/4号线索.jpg
  "state": "locked",                        // locked / unlocked
  "holder": null,                           // 解锁者 playerId（unlocked 时必有）
  "visible": "private",                     // private / public
  "code": null,                             // 服务端首次解锁时生成：'4382'（4 位数字，1000-9999）
  "images": [                               // 相对路径数组（可多图）
    "res/clues/4号线索.jpg"
  ]
}
```

**code 命名规范**（认领码与线索码统一）：
- 格式：**4 位数字** `1000-9999`（`/^\d{4}$/`），由服务端在解锁/创建时随机生成
- 不可预测 + 防近邻（NEAR_GAP=50）+ 防反推（INFER_GAP=5）+ 唯一性 + 跨局独立，实现见 `references/13-code-randomization.md`
- 旧格式 `C04-KG9A`（2 字母序 + 4 字母数字）由 `migrateCodes()` 自动迁移，不再新生成

**线索配图字段（images[] vs card）**：
- 新项目**优先用 `images[]`**：支持多图、文件名自由（中文/英文均可）、`findRefByPath` 在 `server.js:285` 已遍历
- 旧字段 `card`（单图编号）保留兼容：单图场景下可继续用，新数据建议**两者都给**（服务端做兜底）
- 同理 `truth.image` 与 `medicalFiles[].image` 是**单图字段**（对应 findRefByPath 的 `kind:'truth'`/`kind:'medical'`），多图用 `dmRefs[].pages[]`
- 资源路径全部用 `res/` 前缀相对路径（绝对路径会被 `validate-data` 拒绝）

**线索配图取舍（重要约定）**：
- **纯文字线索一律不配图**：线索本身已有 `text` 字段，前端 `clueCard` 用纯文本渲染。若图片只是"黑底白字的标题+正文卡片"（无手绘图形 / 无实物照片 / 无示意图），则它复制 `text` 内容、徒增体积 — **严禁把纯文字排版做成 PNG**。
- 只有真的携带"文字无法表达"的视觉信息时才配图：手绘示意图、场景/证物照片、地图、Q 版人物立绘等。
- 未配图时 `images` 保持 `[]` 空数组即可，前端会自动省略图片区。
- 判断一句话：**图里有没有 text 字段带不出来的内容？没有就不配图。**

## medicalFiles[]

```jsonc
{
  "id": "m01",
  "title": "斯科特·帕洛斯基的档案",
  "card": 23,                               // 配图编号
  "state": "locked",
  "holder": null,
  "visible": "private",
  "code": null,
  "text": "这份档案的内容属于医疗保密...",
  "note": "查询这份档案的意图需要被重点备注",
  "image": "res/clues/23号线索.jpg"
}
```

**特殊规则**：非医疗人员（`char.medical === false`）必须指定 `interpreterId` 让一名医疗人员代为解读，消耗双方各 1 AP（详见 `references/03-state-machine.md`）。

## timeline[]

```jsonc
{
  "id": "t1",
  "code": "T01",
  "time": "18:50",                          // 时间戳（玩家端显示）
  "title": "发现尸体",
  "text": "下午 6:50，护士长冲进餐厅...",  // 玩家端可见描述
  "dmNote": "DM 在此时机应...",            // 仅 DM 端可见的指引
  "images": [ "res/timeline/t1.png" ]      // 可选配图
}
```

**推进规则**：`game.currentStep` 是 timeline 数组的索引（-1 ~ length-1）。DM 用 `step +1/-1` 调整。**未来 timeline 节点的资源（如 `dmRefs` 内的某些条目）默认不开放，需 DM 主动全解锁。**

## truth

```jsonc
{
  "code": "TRUTH",                          // 固定 "TRUTH"
  "title": "真相 · 今晚发生的真实事件",
  "image": "res/truth/cover.png",
  "text": "许多人都有谋杀汉斯·里莫瑞特的动机，但真凶只有一个——他的妻子，盖尔·里莫瑞特。\n\n迫使盖尔行凶的原因有以下几点：\n一、她不爱汉斯了...",
  "relations": [                             // 可选：人物关系图谱
    { "from": "gail", "to": "drake", "type": "lover", "note": "情人，孩子父亲是德雷克" },
    { "from": "tom", "to": "frank_father", "type": "killer", "note": "车祸撞死拜尔杰利夫妇" }
  ],
  "method": "盖尔事先取得枪支，在灯熄灭的瞬间……",   // 可选：作案手法分析（DM 复盘「作案手法分析」卡展示）
  "motive": "多年婚姻积累的怨恨与财产纠葛……",      // 可选：作案动机（可并入 text，也可单独给出）
  "timeline": [                               // 可选：案发当晚会发生什么（作案时间线）
    { "time": "19:00", "title": "德雷克拜访死者", "text": "案发当晚 19:00 德雷克实际到了汉斯家中……" },
    { "time": "22:10", "title": "行凶", "text": "盖尔在灯灭的一刻扣动扳机……" }
  ]
}
```

**truth 字段说明**：
- `text`（必填）：真相正文，DM「案件真相」卡与玩家真相页展示。
- `relations`（可选）：人物关系图谱（环形 SVG 展示）；`type` 取值见人物关系约定。
- `characters`（可选）：参与真相的关键角色 id 数组，用于 DM 复盘「人物关系与动机」卡。
- `method` / `motive`（可选）：分别对应 DM 复盘「作案手法分析」卡与动机说明。
- **`timeline`（可选，作案时间线）**：描述**案发当晚会实际发生的每件事**（各在什么时间、发生的真实行为），
  由各角色剧本中的【行踪】与真凶作案手法交叉汇总而成。
  每条结构 `{ time, title, text }`，其中 `text` 支持角色名主题色高亮。
  **注意与顶层 `timeline[]`（游戏流程时间线 T01–T08，由 `Server` 自动注入 9 个阶段步骤）区分**——
  `truth.timeline` 是剧本层面的作案事件，顶层的 `timeline` 是游戏进程的阶段。
  玩家搜索/游戏流程走顶层 `timeline`；DM 真相复盘「作案时间线」卡与玩家真相页只读 `truth.timeline`。
  若未配置，DM 复盘会自动回退显示游戏流程时间线。

## rules[]

```jsonc
{
  "id": "r1",
  "code": "PUB-01",
  "title": "玩家手册",
  "file": "res/rules/玩家手册.pdf",
  "desc": "游戏规则与扮演指南"
}
```

**访问规则**：所有已认领的玩家均可访问（无需 code）。

## log[]

服务端自动维护，最近 500 条：

```jsonc
{ "time": 1700000000000, "text": "[公告] ..." }
```

## dmRefs（在 dmState 中返回，不在顶层）

```jsonc
{
  "dmRefs": [
    { "id": "org",     "title": "组织者手册",   "kind": "text",  "file": "res/dmrefs/组织手册.txt" },
    { "id": "cluebook","title": "线索手册",     "kind": "text",  "file": "res/dmrefs/线索手册.txt" },
    { "id": "checklist","title": "调查清单",    "kind": "image", "file": "res/dmrefs/调查清单.jpg" },
    { "id": "roomorg", "title": "房间分布（组织者）", "kind": "image", "file": "res/dmrefs/房间分布.jpg" }
  ]
}
```

## 完整最小示例（精简自早期实现）

```jsonc
{
  "version": 1,
  "settings": { "port": 3000, "maxSearchesPerArea": 2, "searchIntervalMinutes": 0, "enableMedicalFiles": false },
  "game": { "phase": "setup", "phaseUpdatedAt": 1700000000000, "currentStep": -1, "truthUnlocked": false, "announcements": [] },
  "characters": [
    {
      "id": "drake", "name": "德雷克", "short": "德雷克", "title": "医生",
      "medical": true, "color": "#7fb3d5", "gender": "男",
      "desc": "汉斯的弟弟，研究者。",
      "hint": "告诉他：你是汉斯。",
      "secret": "实际是汉斯顶替身份。",
      "script": "res/scripts/drake/p1.png",
      "scriptPages": ["res/scripts/drake/p1.png", "res/scripts/drake/p2.png"],
      "startClue": { "image": "res/clues/drake_start.jpg", "text": "你仍在戴结婚戒指..." }
    }
  ],
  "players": [],
  "areas": [
    {
      "id": "corridor", "name": "走廊", "apCost": 1, "owner": [], "allowOwner": false,
      "type": "area", "note": "唯一通道",
      "clues": [
        { "id": "c01", "title": "弹壳", "text": "你找到了一颗子弹...", "card": 3,
          "state": "locked", "holder": null, "visible": "private", "code": null,
          "images": ["res/clues/3号线索.jpg"] }
      ]
    }
  ],
  "medicalFiles": [],
  "timeline": [
    { "id": "t1", "code": "T01", "time": "18:50", "title": "发现尸体", "text": "...", "dmNote": "DM 应宣布死讯" }
  ],
  "truth": {
    "code": "TRUTH", "title": "真相",
    "image": null,
    "text": "真凶是盖尔..."
  },
  "rules": [
    { "id": "r1", "code": "PUB-01", "title": "玩家手册", "file": "res/rules/玩家手册.pdf", "desc": "..." }
  ],
  "log": []
}
```

## 字段填写禁忌

- **不要在 `id` / `code` / `characterId` 里用中文**：用 ASCII（拼音/英文）。中文进 `name` / `title` / `desc`。
- **不要在路径里用绝对路径**：所有路径相对 `public/`（如 `res/scripts/...`）。
- **不要忘记 `code` 在首次解锁时由服务端生成**：`buildDefaultData()` 里只填 `card`，不填 `code`。
- **不要把 PDF 路径放进 `script`**：必须先截 PNG，存 `res/scripts/<id>/pN.png`，`script` 字段是 PNG 路径。