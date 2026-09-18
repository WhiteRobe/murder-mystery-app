---
name: murder-mystery-app
description: |
 Build a LAN-deployable murder-mystery (剧本杀) Web APP. Zero-dependency Node.js + Windows bat launcher +
 resource-code sharing + server-side authorization + per-page PDF screenshots + themed UI.
 TRIGGERS: 用户说"做个剧本杀"、"生成剧本杀 APP"、"build murder mystery app"、
 "做一个剧本杀系统"、"剧本杀 DM 服务端"、"我想做一个 N人的剧本杀"、
 "帮我搭一个剧本杀局"、"把剧本做成可开局的形式"、用户上传剧本目录（含 PDF/docx +
 线索图 + 真相文档）并要求"搭个 DM 服务端"或"做成可玩的 APP"。
 USE WHEN: 任务涉及 剧本杀 / 杀人游戏 / 桌面推理 / DM 控制台 / 玩家认领码 / 资源 code /
 资源码分享 / AP 行动点 / PDF 按页截图剧本 / 真相揭晓 / 时间线推进 / 局域网 bat 启动。
 DO NOT USE FOR: 普通 Web CRUD / 在线聊天 / 论坛 / 答题小程序 / 任何无"组织者-玩家"双端鉴权结构的应用 / 移动 App（RN/Flutter）。
---

# murder-mystery-app Skill

把任意剧本样例变成一个可本地局域网开局的 Web APP。零依赖 Node.js，双击 bat 即开。

## 0. 硬约束（来自用户，逐条不可违反）

| # | 约束 | 落点 |
|---|------|------|
| 1 | C/S 双端架构：`/` = 玩家端，`/host` = DM 端，同一 Node.js 进程 | `assets/server.template.js` |
| 2 | 零依赖 Node.js：仅 `http/fs/path/crypto/os/url`；不引入 express/ws/任何 npm 包 | `assets/server.template.js` 顶部 require |
| 3 | bat 启动三件套（install/start/stop）：ASCII 编码、无中文 echo、无绝对路径；start 窗口必须打印 `http://<ip>:<port>/` 与 `http://<ip>:<port>/host` | `assets/*.template.bat` |
| 4 | 资源 code 机制：线索码与认领码统一为 **4 位数字**（`1000-9999` 随机，不可预测），方便玩家输入；DM 给 4 位数字认领码，玩家输入认领获得个人剧本；线索解锁后服务端生成 code，玩家可私享/公开；其他人用对方公开的 code 拉取；**所有资源访问必须在服务端鉴权**（不是前端隐藏）；旧格式 `C01-ZQAV` 由 `migrateCodes()` 自动迁移；**code 必须随机化**——禁止用全局递增序号生成（会让玩家看出"这是我连续搜的第 N 条"），实现见 `nextClueCode()`（防近邻 NEAR_GAP=50 + 防反推 INFER_GAP=5 + 唯一性去重 + reset 时清池） | `assets/server.template.js` + `references/09-spoiler-isolation.md` + `references/13-code-randomization.md` |
| 5 | PDF 按页截图：剧本 PDF 必须用 `pdf-to-png.template.cjs` 截成 PNG 分页，**禁止**把 PDF 整体塞进网页 | `assets/pdf-to-png.template.cjs` + `references/06-pdf-to-png.md` |
| 6 | 移动端自适应：宽屏 + 手机竖屏；断点 `window.innerWidth <= 820`；侧边栏移动端变抽屉 | `references/07-mobile-responsive.md` + `assets/style.template.css` |
| 7 | 玩家端轮询拉数据：`setInterval` 拉 `/api/player/state`；visibilitychange 降频（活跃 5s → 后台 30s） | `assets/common.template.js` 的 `startPolling` |
| 8 | DM 端基础能力（必须全部实现）：推进剧情步（上一步/下一步）/ 重启游戏 / 揭晓/收回真相 / 广播公告 / 调整玩家 AP（直接 +/-，无奖励池机制）/ 替玩家代搜（searchAs/medicalAs）；**「阶段」由剧情步自动派生**（currentStep -1=setup、0..N-2=started、N-1=reveal），DM 端只暴露剧情控制卡，不再有独立阶段控件 | `assets/dm.template.js` 的 `renderOverview` + `references/04-server-api.md` |
| 9 | 剧本杀核心机制：AP 行动点、可搜索区域、可搜次数上限、可搜冷却、起始线索、组织者独占资源、按需触发的医疗档案式解读、时间线推进、投凶 | `references/03-state-machine.md` + `references/02-data-schema.md` |
| 10 | 剧透隔离：未推进到的 timeline + 未解锁的 clue + 未被玩家持有的 private clue → 服务端一律 401；前端列表以加锁加码 chip 呈现 | `references/09-spoiler-isolation.md` |
| 11 | 真相复盘：玩家端展示 `truth.title + truth.text` + timeline 节点 + dmRefs 资料 + 角色主题色高亮人物名；**DM 端独立「真相复盘」面板**展示案件真相 + 时间线梳理 + 人物关系与动机 + 作案手法分析 + 投票/MVP + 关联 DM 资料；panel 仅 `truthUnlocked=true` 后可见 | `assets/player.template.js` + `assets/dm.template.js` 的 `renderDmTruth` + `references/02-data-schema.md` §truth 字段 |
| 12 | 主题美术感：深色面板 + 衬线字体 + 金/血红强调色 + 角色主题色 chip，**不是**默认 HTML 外观 | `references/08-ui-themes.md` + `assets/style.template.css` |
| 13 | 界面全量汉化：玩家端/主持人端/通用组件/服务端错误消息与日志，所有**用户可见文本一律中文**（标签页、按钮、弹窗、toast、占位符、错误提示）；`'Not authenticated.'` 等被前端硬编码匹配的标识除外；元素 id/class/API 路由/MIME/HTTP 状态行等技术文本不属界面文案 | 全部 js/html 模板 + `IMPROVEMENTS.md` #18 |
| 14 | 角色主题色体系：每个角色有 `color`（data.json）；`common.js` 的 `highlight()` 给角色名输出 `<span class="cname" data-color style="--c:...">`；玩家认领后用 `--me-color` 变量让侧栏/标题/胶囊随角色变色；DM 选角用**一次性 8 张角色卡片网格**（`.char-grid`/`.char-card`）而非下拉框 | `assets/{common,player,dm}.template.js` + `assets/style.template.css` |
| 15 | 多页剧本资源鉴权：`scriptPages[]` 里的每一页都必须在服务端 `findRefByPath` 注册（`kind:'script'`），否则第二页起 403；`api-flow-test` 必须逐页断言 `/res?p=...` 返回 200 | `assets/server.template.js` + `assets/api-flow-test.template.cjs` |
| 16 | DM 计时器：服务端记录 `game.startedAt`（首次离开 setup）与 `phaseHistory[]`（每次阶段切换），DM 端顶部 chip 显示总时长、总览页显示当前阶段/各阶段耗时列表；公共线索对自己同样可见（`visible==='public'` 时同时进入 myClues 与 publicClues） | `assets/server.template.js` + `assets/dm.template.js` |
| 17 | 认领页主题化：玩家端认领页按剧本标题定制（`%PROJECT_TITLE%` 大标题 + `%CLAIM_SUB%` 副标题 + 装饰分隔线 + 4 位大输入框），不做通用"输入认领码"字样 | `assets/player.template.html` + `assets/style.template.css` |
| 18 | UI 细节规范：滚动条美化（thin + 主题色 thumb）、无重复顶栏元素（phaseChip/apPill 唯一）、轮询用 `stateSig` 签名避免无谓重渲染、时间段禁用内联 `tabular-nums` | `assets/style.template.css` + `assets/{player,dm}.template.js` |
| 19 | 视觉主题贴合剧本题材：模板只是参考，**实际以剧本主题为准**创造独特视觉；主题必须**同时适配移动端竖屏与宽屏**；用 `gen-theme.cjs` 从题材候选池生成（seed 可复现、对比度自校验、随机只在池内），或 `palette.py` 从封面图/色相定制；HTML 以 `data-theme` 切换、`?theme=` 运行时切换；build 把全部预置主题拷入 `css/` 形成切换库，目标 CSS 未 link 时动态加载、失败回退默认（切换无 404） | `references/11-visual-design.md` + `assets/gen-theme.template.cjs` + `assets/theme-presets.template.json` + `assets/palette.py` |
| 20 | 脚本化构建：用 `build.cjs` 一键组装（资源拷贝 + 模板填充 + 主题接入 + 质检关卡）；`validate-data.cjs` 校验 data.json schema；`check-res.cjs` 核对所有 `res/` 引用真实存在；Node 主 + Python 辅（`extract-docx.py` 抽 docx 文本、`palette.py` 出定制色板） | `assets/build.template.cjs` + `assets/validate-data.template.cjs` + `assets/check-res.template.cjs` + `assets/extract-docx.py` + `assets/palette.py` |
| 21 | 脚本与工具参数化：脚本里**禁止硬编码剧本专属值**——`api-flow-test` 的 BASE 端口用 `%PORT_DEFAULT%`、测试角色/嫌疑 id 用 `A_CHAR_ID/B_CHAR_ID/A_VOTE_ID/B_VOTE_ID` 占位符，build.cjs 自动从 data.json 头两位角色填入并暴露 `--player-a-id/--player-b-id/--player-a-vote/--player-b-vote` 覆盖；`pdf-to-png` 的 `--in` 支持单文件或目录 | `assets/api-flow-test.template.cjs` + `assets/pdf-to-png.template.cjs` + `assets/build.template.cjs` |
| 22 | 剧本杀机制范式（机制范式 M1..M8 见 `references/12-mechanics-paradigms.md`；另有 M9/M10/M11 经济/抢夺/交易**设计稿未实现**见 `references/15`）：已实现 = M1（5阶段线性，默认）、M6（打斗/裁决，`combatEnabled`）、M8（玩家私聊，`allowPrivateMessages`，详见 references/14）+ **角色专长档案/医疗档案**（可选开关 `enableMedicalFiles`，schema 在 `references/02-data-schema.md`，状态机在 `references/03`）；M2/3/4/5/7 为"待实现"设计。实现状态以 references/12 总览表为准，勿在其他文件复述以免漂移 | `references/12-mechanics-paradigms.md` + `references/14-private-messaging.md` + `references/02-data-schema.md` |
| 23 | 玩家私聊 + 打斗/裁决 通用机制：①私聊走 `game.messages[]` 服务端落盘 + 玩家端 HTTP 轮询（`/api/player/messages?since=<seq>`），不引 WebSocket；未读数走 chip 红点；DM 默认可见全部私聊（`settings.dmMonitorPrivateMessages` 可关），DM 可定向/全员广播；开关 `settings.allowPrivateMessages`；**隐私硬约束**：列表/摘要只返回 `from===me \|\| to===me \|\| dm-to-all \|\| dm-to-player(给自己)`，其他玩家致 DM 的私信绝不可见。②打斗走 `玩家发起(/api/player/combat) → DM 裁决(/api/dm/combat/judge) → 状态+物品转移`，败方状态→`injured`、可选夺物、攻击物 `usesLeft-1`、已裁决不可再审；开关 `settings.combatEnabled`；`dmCreatePlayer` 支持 `items` 注入。③`game.messages[]` 与打斗记录在 reset 时清空；测试用 `tools/test-mechanics-e2e.cjs` | `assets/server.template.js` + `assets/{player,dm}.template.js` + `references/14-private-messaging.md` |
| 24 | **phase 与 timeline 整合**：DM 端只暴露剧情控制卡（上一步/下一步），`DB.game.phase` 由 `currentStep` 派生（-1=setup、0..N-2=started、N-1=reveal）；`dmSetStep()` 自动维护 phase 字段、记录 `phaseHistory`、**首次离开 setup 写 `startedAt`**、**推进到末节点自动 `truthUnlocked=true`**（单一控制源，DM 无需再点揭晓）；`dmSetPhase()` 仅兼容保留，且必须反向同步 `currentStep`（`setup→-1`、`started→max(0,cur)`、`reveal→max(cur,N-1)`），否则 `unlockStep` 搜证判据与 phase 脱钩 | `assets/server.template.js` `dmSetStep/dmSetPhase/currentPhaseFromStep` |
| 25 | **空搜不扣 AP**：`doSearch()` 在「区域无线索 / 阶段未到」时**不扣 AP、不计搜证次数**，玩家可自由尝试或等下一轮 | `assets/server.template.js` `doSearch()` |
| 26 | **真相 schema 扩展**：`truth` 段除 `title/text/image` 外支持 `characters[]`（关键人物 id 列表）、`relations[]`（from/to/type/label/note）、`method`（作案手法分析）、`motive`（动机分析）；DM 端真相复盘面板按这四块区渲染 | `references/02-data-schema.md` + `assets/dm.template.js` `renderDmTruth` |
| 27 | **UI 样式规范**：① toast 紧凑（font-size 12.5px、单行省略、最大宽 360px、左 border 区分色） ② select 用 `appearance:none` + 自定义金色 chevron-down 箭头 + 主题色边框包裹 ③ DM 资料 txt/pdf 走**站内内联展示**（fetch + highlight），禁止 `target="_blank"` 跳新窗口 ④ 剧本文本走**内联 fetch + highlight**（不能 iframe，iframe 内无法做主题色高亮） ⑤ 所有角色名一律走 `highlight()` / `highlightText()` 主题色高亮 | `assets/style.template.css` + `assets/{player,dm}.template.js` |
| 28 | **指认投票分轮门控**：`settings.voteFromStep`（默认 0=一进 started 即可投）指定投票开放的剧情步（timeline 索引）；服务端 `doVote()` 校验 `currentStep >= voteFromStep`，玩家端投票面板同判据锁定并提示「指认投票未开放（推进到剧情步 N 后开启）」；timeline 里有「指认投票」节点时 data.json 必设该节点索引 | `assets/server.template.js` `doVote` + `assets/player.template.js` 投票面板 + `references/02-data-schema.md` |
| 29 | **拉码留痕**：`/api/fetch` 成功即把资源 id 记入 `player.fetched[]`（去重），`playerState.myClues` 合并返回并标 `fetched:true`——前端显示「来自兑换码」徽标、公开开关仍归持有者（`holder===me` 判据天然不渲染）；前端拉取成功 toast 后立即 `poll()` 免等轮询 | `assets/server.template.js` `/api/fetch`+`playerState` + `assets/common.template.js` `clueCard` |
| 30 | **轮询重渲染的表单态保持**：凡「轮询驱动的整段 innerHTML 重渲染」内含 select/textarea，表单态必须提升为模块状态并在渲染后恢复（选项失效才回退默认；仅发送成功才清草稿）——私聊收件人/草稿、投票面板、MVP 下拉均按此处理；新增视图含表单时照此办理 | `assets/{player,dm}.template.js` 私聊 composer |
| 31 | **搜证页区域三分态**：`playerState.areas[].clues[]` 暴露 `unlockStep`（轮次门控信息，非剧透，不暴露 text）；前端把区域渲染成 🔒未开放（剧情推进后可搜）/ 本人相关区域不可自搜（`owner` 含自己且 `allowOwner:false`）/ 可搜 三态，禁用态替代可点击的空搜按钮；文案「余 N 条线索」 | `assets/server.template.js` `playerState` + `assets/player.template.js` `renderSearch` |

## 1. 何时使用本 Skill

触发条件（任意命中即用）：
- 用户明确说"做个剧本杀 APP"、"做一个剧本杀系统"、"build murder mystery app"。
- 用户上传一个剧本样例目录（PDF/docx + 线索图 + 真相文档）并要求"做成可玩的 APP"、"搭个 DM 服务端"。
- 用户要求"局域网 Windows 双击 bat 启动"。

不触发本 Skill 的场景：
- 普通博客/商城/后台/聊天。
- 无组织者-玩家双端鉴权的应用。
- 需要 WebSocket 实时双向通信（轮询即可满足需求）。
- 移动 App（RN/Flutter）—— 本 Skill 只产出 Web。

## 2. 工作流（按顺序执行，不要跳步）

### Step 1 · 解析剧本样例

读取用户上传/指定的剧本目录（例如一个剧本样例目录）。识别以下内容并写入 `data.json`：

| 剧本资料 | 落到 data.json 哪个字段 |
|---------|------------------------|
| 角色 PDF / 角色卡 docx | `characters[].script`（先 PDF→PNG，文件名用相对路径 `res/scripts/<id>/pN.png`） |
| 起始线索图 | `characters[].startClue.image` |
| 角色信息卡（姓名/职业/性别/简介/秘密/提示） | `characters[].{id,name,short,title,color,gender,desc,hint,secret}` |
| 区域/场景（地点/容器） | `areas[].{id,name,apCost,owner,type,note}` |
| 线索条目（标题/正文/配图） | `areas[].clues[]` 或 `medicalFiles[]` |
| 真相/动机/关系 | `truth`段 |
| 时间线/阶段/组织者动作 | `timeline[]` |
| 公共规则 PDF | `rules[]` |
| 组织者独占资料（真相/组织手册/线索手册） | `dmRefs`（在 dm.html 渲染） |

docx 剧本可用 `assets/extract-docx.py`（零依赖）抽取文本：`python assets/extract-docx.py 剧本.docx -o out.txt`。

10 种抽取范式（源材料 → data.json 建模，详见 `references/10-script-paradigms.md`）：
- **3 幕推进** → `timeline[]` 每幕一个 step。
- **两段剧本**（背景/细节） → `phase:prologue → started` 切换解锁。
- **房间号线索** → `areas[]` 用房间号作 `id`。
- **地图资源**（xlsx 平面图） → 转 PNG 放进 `public/res/maps/`。
- **按角色分组线索** → `areas[].owner = ['charId']` + `allowOwner = false`。
- **时间线 + 真相** → `timeline[]` 全开 + `truth.text` 富文本。

> **资源混合与真相多源提示**（§25 反哺）：
> - 剧本文档若含 `.doc`（旧二进制 OLE 格式），`assets/extract-docx.py` 已支持**自动 antiword/strings 兜底**——抽取失败会写入 `[EMPTY]` 占位标记，需人工补全
> - 若剧本**无独立真相文件**，真相散落在 `组织者手册.pdf` / `调查线索.pdf` / `结局真相.pdf` 等多份文档里：把所有来源放进 `dmRefs[]`（DM 端可查），`truth.text` 由人工精读多源后综合撰写（详见 `references/10-script-paradigms.md` 范式 7）
> - 图片线索用 `clues[].images[]` 数组（旧 `card` 字段保留兼容）——server.js `findRefByPath` 第 285 行已遍历 `images[]`
> - 资源混合预检见 `loop.md` §0.5

### Step 2 · PDF→PNG 截页

执行 `assets/pdf-to-png.template.cjs`（用 pdfjs-dist + canvas，零系统依赖）：

```bash
node assets/pdf-to-png.template.cjs --in "剧本目录/角色剧本" --out "public/res/scripts"
```

输出 `public/res/scripts/<角色名>/p1.png p2.png ...`。**严禁**把 PDF 直接 `<embed>` 进 HTML。

### Step 3 · 一键构建（推荐）或手工拷贝

**推荐：一键构建** —— 只要源剧本目录含 `data.json` + `res/`，一条命令产出完整应用：

```bash
# 用预设主题
node assets/build.template.cjs --script "剧本目录" --out "my-app" \
     --title "<剧本标题>" --title-ascii "<Title Ascii>" --port 3031 \
     --logo "<logo>" --theme <theme> --claim-sub "<claim-sub>" --claim-btn "<claim-btn>"

# 现场生成贴合题材的新主题（seed 可复现）
node assets/build.template.cjs --script "剧本目录" --out "my-app" \
     --title "<剧本标题>" --genre <genre> --seed 42 --name <theme-name> --port 3031
```

build 内部自动完成：资源拷贝 → 数据落盘（data.json + data.preset.json）→ 模板填充（server/前端/bat，`%X%` 占位符全换）→ 主题接入（`data-theme` + `<link>`）→ **质检关卡**（validate-data + check-res，不过关即失败）。

**手工拷贝**（等价的模板布局，供细调时参考）：

```
project/
├── data.json
├── server.js          ← assets/server.template.js（替换 % 占位符）
├── start.bat          ← assets/start.template.bat（替换标题）
├── install.bat        ← assets/install.template.bat
├── stop.bat           ← assets/stop.template.bat
├── public/
│   ├── dm.html        ← assets/dm.template.html
│   ├── player.html    ← assets/player.template.html
│   ├── css/style.css  ← assets/style.template.css
│   ├── js/
│   │   ├── common.js  ← assets/common.template.js
│   │   ├── dm.js      ← assets/dm.template.js
│   │   └── player.js  ← assets/player.template.js
│   └── res/scripts/<角色名>/pN.png
```

模板中所有 `%PROJECT_TITLE%` / `%PORT_DEFAULT%` / `%DEFAULT_THEME%` / `%THEME_CSS%` / `%CLAIM_SUB%` / `%CLAIM_BTN%` / `%PROJECT_LOGO%` 等占位符必须替换成真实值（bat 中的 `%PORT%`/`%errorlevel%` 是运行时变量，**不要碰**）。

### Step 4 · 视觉主题（贴合剧本，模板只是参考）

方法论文档：`references/11-visual-design.md`（题材→氛围→视觉要素推导表 + 移动端双形态强制项 + 视觉验收清单）。

三条路径（按贴合度从高到低）：

1. **现场生成**（推荐）：`node assets/gen-theme.template.cjs --genre <题材key> --seed <n> --name <主题名> --out public/css`。题材候选池见 `theme-presets.template.json`（gothic/victorian/western/steam/noir/science/desert/theatre/cyber/qingci/hospital/maritime/fantasy）。随机只在池内发生，对比度不达标自动回退，seed 固定即可复现。
2. **定制色板**：`python assets/palette.py --image 封面.jpg -o palette.json`（从海报取色）或 `--hue 210`（按色相推导），再 `gen-theme.cjs --palette-file palette.json` 接入。
3. **预置主题**：`assets/theme-*.css`（castle/victorian/western/steam/noir/science/desert/theatre）直接 `--theme` 引用。

主题接入：HTML `<html data-theme="<名>">` + `<link rel="stylesheet" href="/css/theme-<名>.css">`；玩家/DM 端支持 `?theme=<名>` 运行时切换。生成的主题**自带移动端适配段**（820px 断点），但必须在浏览器里实际验收两种形态（详见 `loop.md` 视觉验收步骤）。

### Step 5 · 启动与自验证

```bash
node server.js
```

然后调用 `loop.md` 的自验证流程（详见 `loop.md`）。完整跑通检查清单 = Skill 落地完成。

## 3. 输出物清单（落盘验收）

完成后必须产出：
- `project/data.json`（非空，至少 1 个角色 + 1 个区域 + 1 条 timeline）
- `project/server.js`（零依赖）
- `project/start.bat`、`install.bat`、`stop.bat`（ASCII）
- `project/public/dm.html`、`player.html`、`css/style.css`、`js/{common,dm,player}.js`
- `project/public/res/scripts/<角色名>/p*.png`（每个角色至少 1 页）
- `project/public/res/clues/*.png|jpg`（每条 clue 的配图，如有）
- `project/public/res/maps/*.png`（如有平面图）
- `project/data.json` 中 `truth` 段、`timeline` 段、`dmRefs` 段均不为空

## 4. 完成清单（Verification Checklist）

完成全部步骤后，逐条核对：

- [ ] **架构**：浏览器访问 `/` 是玩家端、`/host` 是 DM 端，根进程只有一个 Node.js。
- [ ] **零依赖**：`node -e "require('./server.js')"` 无 npm 包报错。`server.js` 顶部 `require` 仅 `http/fs/path/crypto/os/url`。
- [ ] **bat 启动**：双击 `start.bat` 后窗口打印两个 URL（`http://<ip>:<port>/` 与 `http://<ip>:<port>/host`），无中文、无绝对路径。
- [ ] **认领码**：DM 端创建玩家 → 玩家端输入 4 位码 → 认领成功 → 玩家端出现角色剧本起始页。
- [ ] **资源 code**：玩家搜索区域 → 服务端返回新生成的 4 位数字 code（随机 1000-9999，不可预测）→ 玩家可手动切换 public/private；连续搜证不会出现连续序号。
- [ ] **跨玩家拉码**：A 玩家把线索设为 public → B 玩家在 `codeInput` 框输入该 code → 成功拉到线索正文，**且该线索进入 B 的「我的线索」（带「来自兑换码」徽标，无需等下一轮询）**。
- [ ] **服务端鉴权**：直接在浏览器 URL 输 `public/res/clues/某图.jpg` → **应 403/404**，**不能**直接拿到文件。所有资源走 `/res?p=...&t=...&c=...`。
- [ ] **移动端**：浏览器宽度 ≤ 820px 时，侧边栏变抽屉，主区单列，AP chip 自动收缩。
- [ ] **轮询降频**：切到其他 tab 不看页面时，控制台 Network 里 `/api/player/state` 间隔从 ~5s 变 ~30s；切回来恢复。
- [ ] **PDF 分页**：玩家"我的剧本"弹窗内显示 PNG 翻页，**不是** PDF 整体。
- [ ] **时间线推进**：DM 在 DM 端 step+1 → 玩家端 timeline 当前点变 current、未来点仍 lock。
- [ ] **投票门控**：设了 `voteFromStep` 的剧本，未到该剧情步时玩家端投票按钮锁定（含提示文案）、API 拒绝；推进到该步后自动解锁可投。
- [ ] **计时基准**：全程只用剧情控制卡主持（不碰遗留 phase 接口）→ DM 端总时长正常走表（`startedAt` 已记录）。
- [ ] **真相揭晓**：DM 推进到末剧情步**自动揭晓**（顶栏与真相面板状态一致，不出现「已揭晓但面板未开」），DM 仍可提前手动揭晓 → 玩家端 truth tab 解锁 → 显示 `truth.title + text + image + code`。
- [ ] **AP 调整**：DM 给玩家 +2 AP → 玩家 AP 数字 + pulse 动画。
- [ ] **代搜**：DM 在 DM 端替玩家搜索某区域 → 玩家端该区域减少 1 条线索，DM 日志记录"代搜"。
- [ ] **重启游戏**：DM 端点重置 → 所有玩家下线、`data.json` 恢复初始、认领码重新生成。
- [ ] **主题美术感**：默认外观 ≠ 浏览器默认。深色面板、serif 标题、金/血红强调、role 主题色 chip。
- [ ] **零剧透 UI**：玩家端看到的线索列表，已解锁的显示正文 + code chip，未解锁的显示 lockMask（不显示标题文字）。
- [ ] **dmRefs 渲染**：DM 端"组织者手册"/"线索手册"/"调查清单" 三个 tab 显示 PDF 截屏图。
- [ ] **界面全量汉化**：玩家端/主持人端标签、按钮、弹窗、toast、服务端错误消息与日志均为中文；无残留用户可见英文（`'Not authenticated.'` 等前端依赖标识除外）。
- [ ] **4 位数字 code**：认领码与线索码均为 `/^\d{4}$/`；`/res?p=` 逐页（含 scriptPages 第 2+ 页）返回 200 而非 403。
- [ ] **角色卡片选角**：DM「玩家」tab 一次性展示全部角色卡片（`.char-card`），选中高亮、已认领置灰，非下拉框。
- [ ] **角色主题色**：玩家认领后侧栏/标题随角色 `color` 变色；线索/真相/时间线文本中的角色名以主题色高亮（`.cname[data-color]`）。
- [ ] **DM 计时器**：切换阶段后顶部 chip 变金色显示总时长，总览页「游戏计时」卡片显示当前阶段与各阶段耗时。
- [ ] **认领页主题化**：玩家端认领页显示剧本标题 + 定制副标题 + 装饰元素，非通用"输入认领码"字样。
- [ ] **视觉贴合题材**：UI 视觉与剧本主题强相关（色调/字体/装饰 motif/动画），**不是**通用模板外观；`?theme=` 切换后整站配色随动。
- [ ] **双形态适配**：桌面宽屏与手机竖屏（≤820px）分别截图验收——侧栏抽屉、卡片单列、表格转卡片、按钮可点；两种形态都无溢出/错位。
- [ ] **主题质检**：用到的主题 CSS 由 `gen-theme.cjs` 生成（seed 可复现）或经 `validatePalette` 校验；`validate-data.cjs` + `check-res.cjs` 全绿。
- [ ] **脚本化构建**：最终应用可用 `build.template.cjs --script <源> --out <应用>` 复现构建（记录用到的 --genre/--seed/--theme 参数）。

未全部勾选 = 未完成。

## 5. 关键参考（遇到具体问题时查阅）

| 问题 | 看哪个 reference |
|-----|-----------------|
| 双端 token 怎么分发 | `references/01-architecture.md` |
| data.json 字段含义 | `references/02-data-schema.md` |
| 5 阶段状态机 | `references/03-state-machine.md` |
| HTTP 路由完整表 | `references/04-server-api.md` |
| bat 不能中文不能绝对路径的具体写法 | `references/05-bat-conventions.md` |
| PDF 截页用哪个工具 | `references/06-pdf-to-png.md` |
| 移动端 CSS 类名约定 | `references/07-mobile-responsive.md` |
| 主题颜色怎么改 | `references/08-ui-themes.md` |
| 服务端怎么拒绝剧透访问 | `references/09-spoiler-isolation.md` |
| 剧本样例怎么抽 schema | `references/10-script-paradigms.md` |
| 视觉主题怎么设计/验收 | `references/11-visual-design.md` |
| 剧本杀机制范式（回合/状态/技能/物品/打斗/死亡） | `references/12-mechanics-paradigms.md` |
| 私聊/消息设计 + 打斗端到端验证（server template + 隐私规则） | `references/14-private-messaging.md` |
| 经济/抢夺/交易（**设计稿，服务端未实现**） | `references/15-economy-steal-trade.md` |
| 线索/认领 code 随机化（防连续/防反推） | `references/13-code-randomization.md` |
| 一键构建/校验/资源检查 | `assets/build.template.cjs` + `assets/validate-data.template.cjs` + `assets/check-res.template.cjs` |
| 主题生成/定制色板 | `assets/gen-theme.template.cjs` + `assets/theme-presets.template.json` + `assets/palette.py` |
| docx 剧本文本抽取 | `assets/extract-docx.py` |

## 6. 禁止做的事

- 禁止用 npm / yarn / pnpm 安装任何依赖（PDF 工具链除外）。
- 禁止把 PDF 直接放进 HTML 或用 `<iframe src="*.pdf">`。
- 禁止前端用 `display:none` 或 `visibility:hidden` 藏线索来"实现剧透隔离"。
- 禁止 bat 写中文标题、中文 echo、绝对路径。
- 禁止把 `claimCode` / `data.json` 路径写死在 bat 里。
- 禁止用 WebSocket —— 本 Skill 全程 HTTP 轮询。
- 禁止省略"我的剧本"PNG 翻页弹窗 —— 玩家必须能翻 PDF 截图。
- 禁止把 server.js 拆成多文件 —— 单文件 0 依赖是硬约束。
- 禁止跳过 `loop.md` 验证 —— 不跑完检查清单不算交付。
- 禁止在生成的 APP 注释里写中文（bat 不含中文是硬约束；JS/HTML 内允许中文文案，但路径/常量/键名用 ASCII）。**界面文案（按钮/标签/提示/错误消息/日志）必须中文**，仅 `'Not authenticated.'` 等前端依赖的标识保留英文。

## 7. 自验证（loop）

完整自验证检查清单见 `loop.md`。**任何 Skill 落地都必须跑完 loop 才能视为完成。**

简要 loop：
1. 启动检查（双 URL）
2. 路由可达性
3. DM 端流程（创建玩家、推进、揭晓）
4. 玩家端流程（认领、搜证、拉码）
5. 移动端（≤820 抽屉）
6. 轮询降频（visibilitychange）
7. 剧透隔离（地址栏直输应 401）
8. 真相复盘（truth + timeline + dmRefs）
9. 重启检查（全清）
10. bat 验收（ASCII 无中文）

## 8. 用示例剧本验证 Skill 能力

在 Skill 上级目录准备一个剧本样例目录（含角色剧本/线索/真相，PDF、docx、doc、图片格式均可），执行：

```bash
node assets/pdf-to-png.template.cjs --in "样例目录/人物剧本" --out "test-output/public/res/scripts"
# 然后按 loop.md 跑检查清单
```

详见 plan 文件"用示例剧本验证 Skill 能力"章节。

## 9. 一页式 Prompt 摘要（可贴到下游系统提示词）

```
你是剧本杀 APP 工程师。按 murder-mystery-app Skill 规范工作。

硬约束（任一违反即返工）：
1. C/S 双端：浏览器 /host = DM 端，/ = 玩家端，同一 Node.js 进程
2. 零依赖 Node.js：仅 require http/fs/path/crypto/os/url
3. bat 启动：ASCII、无中文、无绝对路径、启动打印双 URL
4. 资源 code：认领码/线索码统一 4 位数字（1000-9999 随机，旧 C01-ZQAV 自动迁移），所有资源走 /res 服务端鉴权；code 必须随机化（防近邻 NEAR_GAP=50 + 防反推 INFER_GAP=5）
5. PDF 按页截 PNG，不嵌入网页
6. 移动端 ≤820px 抽屉侧边栏
7. 轮询 + visibilitychange 降频 + stateSig 签名避免无谓重渲染
8. DM 端：时间线/重启/全解锁/全锁/真相/广播/AP/代搜 + 计时器（总时长/阶段耗时）
9. 剧透隔离：服务端 401 + 前端 lockMask；公开线索含自己
10. 真相复盘：truth + timeline + dmRefs
11. 主题美术感：深色 + 衬线 + 金/血红；滚动条美化、无重复顶栏元素
12. 界面全量汉化：用户可见文本一律中文（前端依赖的英文标识除外）
13. 角色主题色：data.json color + highlight() 输出 data-color + --me-color 全局变量
14. DM 选角：一次性全部角色卡片网格（.char-grid/.char-card），非下拉框
15. 多页剧本：scriptPages[] 全部注册进 findRefByPath，逐页 200 不断 403
16. 认领页主题化：剧本标题 + 定制副标题 + 装饰，非通用"输入认领码"字样
17. 视觉贴合题材：模板只是参考，主题从题材候选池生成或封面图取色（gen-theme.cjs / palette.py），seed 可复现、对比度自校验
18. 双形态适配：宽屏 + 手机竖屏（≤820px）都验收，无溢出错位
19. 脚本化构建：build.cjs 一键组装 + validate-data + check-res 质检关卡
20. 玩家私聊（轮询 + 服务端落盘，开关 allowPrivateMessages）：列表只返回自己发出/收到/dm-to-all/dm-to-player(给自己)，其他玩家致 DM 私信绝不可见
21. 打斗/裁决（开关 combatEnabled）：玩家发起 → DM 裁决 → 状态+物品转移

工作流：解析剧本（docx 用 extract-docx.py）→ PDF 截页 → build.cjs 一键构建（或手工拷模板）→ 生成/选择主题 → loop 自验证。
落盘清单：SKILL.md §4 完成清单全部勾选才完成。
详细 reference 见 references/01..15（15 为经济/抢夺/交易设计稿，服务端未实现），模板与脚本见 assets/。
```