# Skill 改进方向 · 基于示例剧本实战验证

> 本文档记录基于实际构建示例剧本 APP 过程中发现的 Skill 缺陷与改进方向。
> 下游模型在使用 Skill 时，请先查阅本文档。

## 1. 文档格式支持缺陷

### 现状
- `references/06-pdf-to-png.md` 只覆盖了 **PDF** 一种剧本格式。
- SKILL.md 工作流 Step 1 假设剧本材料都是 PDF。

### 问题（示例剧本实际遇到）
- 示例剧本所有角色剧本均为 **`.docx` / 老 `.doc` 二进制格式**。
- pandoc 对 `.doc` 老格式支持不稳定（需要 pandoc 3.x + OLE 反编译）。
- 我的 `doc-extract.cjs` 工具在 OLE mini stream 边界仍有越界 bug（最终绕道通过 docx 文件提取了部分角色剧本，丢失了若干角色剧本和组织者总手册）。

### 改进方案
1. **`references/06-format-extract.md`**：新增文档格式提取专题（重命名 06）
2. **`assets/doc-extract.template.cjs`**：OLE/CFB mini stream 完整支持
3. **`assets/docx-extract.template.mjs`**：基于 mammoth.js 的 docx 提取（已可用）
4. **`prompts/p2-data-authoring.md`**：必须明确"多种格式混合"的处理流程
5. **优先 docx → fallback 手动**: 优先用 mammoth 抽 docx，老 .doc 报告缺失

## 2. data.json 生成与模板化

### 现状
- `build-server.ps1`（在 test-output 中）是手动写的**一次性脚本**。
- `references/02-data-schema.md` 没有"如何从 docx 内容生成 data.json 字段"的具体流程。

### 问题
- 同样的 6 个角色剧本，开发者每次都要重新写 build-server.ps1。
- PowerShell `ConvertTo-Json -Compress` 会把单元素数组转成单对象，导致 `medicalFiles/dmRefs` 字段类型错误。

### 改进方案
1. **`assets/build-server.template.cjs`**：将构建脚本做成 Skill 内置模板
   - 自动读取 data.json
   - 自动判断 ASCII title（用拼音/英文映射）
   - 自动防御单元素数组问题
2. **`references/02-data-schema.md`**：增加"如何从原始 docx 内容生成字段"的对照表
3. **data.json 校验**: 提供 `assets/validate-data.template.cjs`，校验 schema + 类型 + 必填字段

## 3. 资源 code 生成不一致

### 问题
- 当前 `clueCode(card)` 在 `card >= 1` 时用 `clueCode(card)`；`card = 0`（无配图）时回退到 `Math.floor(Math.random() * 90 + 10)`。
- 这导致**code 不连续**——示例剧本搜证得到 `C95-JDC3` 而非 `C01-XXXX`。
- 玩家可能困惑"线索 C95 是从哪里来的"。

### 改进方案
- 统一code生成策略：用全局递增计数器，每次 `doSearch` 触发 `nextCode++`，输出 `C{seq}-XXXX`。seq 从 1 开始，与 card 完全解耦。

## 4. docx 角色剧本的图片资源

### 现状
- SKILL.md 要求每个角色有 `script`（PNG 翻页）字段。
- `assets/pdf-to-png.template.cjs` 只支持 PDF。

### 问题
- 示例剧本的角色剧本是 **docx**，里面是文字段落（不是 PDF 翻页）。
- 实际只能挂一张角色封面图作为封面，无法翻页。

### 改进方案
1. **新增 `assets/docx-to-images.template.mjs`**：把 docx 渲染成 PNG（基于 mammoth→HTML→canvas）
2. **data.json schema 增加 `scriptType` 字段**: `pdf | docx | text` 三种模式
3. **前端 openScript 适配**：text 模式渲染 `<pre>` 或带格式的 HTML

## 5. 主题美术感的缺失

### 现状
- Skill 当前只提供**一套通用主题**（深色 + 金 + 血红）。
- `references/08-ui-themes.md` 给出了 3 套主题变量表，但**没强制应用**。

### 问题（基于示例剧本）
- 示例剧本是**老酒店凶杀案 + 20 年悬案**氛围，主题应该是 **维多利亚风格 / 昏暗灯光 / 老式质感**。
- 现有血金暗夜主题能用，但不够切题。
- 每个剧本应有专属的氛围细节（动画、字体、icon、装饰）。

### 改进方案
1. **`references/08-ui-themes.md`** 增加 5-10 套主题：
   - 血金暗夜（悬疑）
   - 青瓷民国（民国）
   - 赛博霓虹（科幻）
   - **维多利亚旧馆（古堡/老酒店）** ← 悬疑/哥特题材适用
   - **日式和风**（江户）
   - **泰坦尼克远洋**（邮轮）
   - **中世纪羊皮纸**（奇幻）
2. **`assets/theme-` 命名模板**：每个主题一套独立 CSS 变量文件
3. **运行时切换**：`?theme=Victorian` query 参数或 localStorage

## 6. 多人游戏机制的覆盖不足

### 现状
- Skill 假设每个角色独立搜证，AP 消耗简单。
- `references/03-state-machine.md` 只讲了 5 阶段 + 简单 AP 池。

### 问题（示例剧本实际机制）
- **5 阶段完全不同**：分散讨论 → 玩家房间开放 → 偷窃开放 → 最后讨论 + 限时搜身 → 揭晓
- **多层重要程度物品**：搜查房间得第 1/2 层（不拿走）；偷窃得第 2/3 层（必须拿走）；搜身得第 3 层（可选择是否拿走）
- **搜身规则**：1v1 对方可拒绝；2v1 强制搜身
- **位置移动**：玩家可在房间之间移动，决定搜身/偷窃能否执行
- **计分系统**：每个角色有独立的"计分表" docx

### 改进方案
1. **`references/03-state-machine.md`** 扩展：
   - 阶段不再固定，可由剧本自定义
   - 增加 `phases` 数组字段（替代单一 `phase` 字符串）
2. **新增 `references/12-multiplayer-mechanics.md`**：
   - 偷窃 / 搜身 / 移动 API
   - 物品重要程度分层 (`tier: 1|2|3`)
   - 强制规则 (1v1 vs 2v1)
3. **新增 `assets/player.template.js` v2**：增加"背包""移动""计时器"模块
4. **`assets/data.template.json`** 增加 `tier` 字段与 `moveable: true/false`

## 7. DM 控制台 UI 简陋

### 现状
- DM 端只有 6 个 tab：overview / players / clues / medical / flow / docs
- 进度控制弱（时间线仅 step +1）

### 改进方案
1. **DM Dashboard 重做**：
   - 顶部实时计时器（每个 phase 倒计时）
   - 阶段横幅 + 自动 announce
   - 玩家位置地图（基于角色的地图）
2. **新增 `assets/dm.template.js` v2**：实时面板 + 时间线可视化
3. **新增 `assets/dm-timer.template.cjs`**：服务端定时器（每个阶段自动倒计时）

## 8. 真相复盘的呈现

### 现状
- `truth.text` 是纯文本
- 没有专门的人物关系图、动机图、时间轴

### 改进方案
1. **`truth.relations`** 字段已设计但未实现：
   ```json
   { "from": "char_a", "to": "char_b", "type": "killer", "note": "为父报仇" }
   ```
2. **`assets/truth.template.html`**：真相页专用模板，含关系图（SVG 渲染）
3. **真相播报动画**：分段揭示，每段配一个角色主题色

## 9. 文档文件类型多样化

### 现状
- `references/05-bat-conventions.md` 假设是 PDF（用 `pdf` mime）

### 问题
- 示例剧本"玩家手册"是 `.docx`，"封面"是 `.jpg`
- Skill 模板假设所有 `rules[]` 都是 PDF

### 改进方案
1. **`references/04-server-api.md`** 增加 `rules[].file` 支持多种扩展名（jpg/png/pdf/docx）
2. **MIME 表扩充**：`assets/server.template.js` 添加 docx/jpeg2000/webp
3. **`assets/preview.template.html`**：根据 mime 决定打开方式（直接显示图片 vs 调用 Office）

## 10. 资源路径规范化

### 现状
- 资源路径在 data.json 里写死 `res/scripts/角色名/p1.png`（中文路径）
- 但前端代码可能因为不同编码遇到 URL 编码问题

### 改进方案
1. **统一 ASCII 路径**: 在 build-data 时把所有中文目录名替换为 `char_a/p1.png`（用 character.id）
2. **`assets/build-data.template.cjs`**：提供目录名规范化工具
3. **避免空格/中文路径** —— 直接用拼音

## 11. 测试用例覆盖度

### 现状
- `loop.md` 只有 10 步基础检查
- 没有针对"剧本特性"（如偷窃、搜身、计时器）的测试

### 改进方案
1. **`loop.md` 扩展**：增加可选的 `loop-extended.md`，覆盖：
   - 偷窃流程
   - 搜身 1v1 / 2v1
   - 计时器倒计时
   - 玩家移动
2. **`references/13-test-patterns.md`**：剧本类型 → 测试模板

## 12. 错误恢复能力

### 现状
- 如果 server.js 启动失败（端口占用 / data.json 损坏），玩家只能看到空白页
- 没有 fallback UI

### 改进方案
1. **前端错误页**：如果 API 不可达，显示"服务端离线"提示
2. **`references/14-ops-recovery.md`**：常见启动错误的恢复步骤

---

## 总结优先级

| 优先级 | 改进项 | 工作量 |
|--------|--------|--------|
| P0 | #3 资源 code 一致性 | 1h |
| P0 | #1 多文档格式提取（doc/docx） | 3h |
| P0 | #6 主题美术感（多套主题） | 4h |
| P1 | #2 build-server 模板化 | 2h |
| P1 | #6 多人游戏机制（偷窃/搜身/移动） | 6h |
| P2 | #8 真相关系图 | 2h |
| P2 | #7 DM 控制台增强 | 4h |
| P3 | #9 多 mime 支持 | 1h |
| P3 | #10 路径规范化 | 1h |

---

# 实战验证第二辑 · 示例哥特剧本（2026-09）

> 用本 Skill 从零构建示例哥特剧本 APP 并部署/浏览器实测，发现并修复了以下缺陷，作为已落地的改进回写（模板均已同步）。

## 13. ✅ dmReset 会登出主持人（已修复并回写 `server.template.js`）

### 问题
- 旧 `dmReset()` 调用 `sessions.clear()`，**连 DM 自己的会话也一并清空**。
- 前端 DM 轮询收到 `Not authenticated.` 后执行 `location.reload()`，主持人重置完被踢回登录页，被误读为"跳去玩家端"。
- 旧模板 `dmReset()` 直接 `DB = buildDefaultData()`，会**清空打包的剧本数据**（角色/区域/线索），重置后剧本丢失。

### 修复（已回写模板）
1. `dmReset()` 改为仅吊销**玩家**会话，保留 DM 会话：
   ```js
   for (const [token, sess] of sessions) if (sess.type !== 'dm') sessions.delete(token);
   ```
2. 保留剧本数据：用 `buildDefaultData()` 判断是否有剧本，无则沿用现有 `characters/areas/clues/...`，只重置运行态（players/searches/votes/log/phase/currentStep/truthUnlocked...）。
3. 仅当场景数据存在且有剧本时用新场景；否则复用当前剧本结构，防止误清空。

## 14. ✅ DM 资料多页（dmRefs `pages[]`）翻页查看（已回写）

### 问题（示例哥特剧本实际遇到）
- `data.json` 的 `dmRefs[]` 有 `pages[]` 数组（组织者手册 6 页、线索手册 14 页、真相 11 页），但：
  - 服务端 `findRefByPath` / `DM_REF_FILES` 只注册 `d.file`（≡ p1），**p2..pN 全部返回 403**。
  - 前端 DM `renderDocs` 只渲染 `d.file` 第 1 页，**无法翻阅多页资料**。

### 修复（已回写 server/dm 模板）
1. 服务端注册全部 pages：
   ```js
   const pages = d.pages && d.pages.length ? d.pages : (d.file ? [d.file] : []);
   if (pages.includes(p)) return { kind: 'dmref', dmRefId: d.id };
   ```
2. DM 前端 `renderDocs`：显示页数，提供"翻阅 N 页"按钮，弹窗内 Prev/Next 翻页（复用 script-viewer/nav 模式）。
3. 鉴权 `case 'dmref'` 仍仅 DM 可见（`viewer.dm`），玩家访问 403 —— 保证剧透隔离。

## 15. ✅ 投凶 + MVP 机制（已回写，作为标准复盘闭环）

### 现状
- 原 Skill 只有"搜证→真相揭晓"，**缺少对凶手/真相的玩家指认与复盘计票**，复盘环节不完整。

### 新增能力（已回写 server/player/dm/style 模板）
1. 服务端：`POST /api/player/vote`（校验阶段 started/reveal、真相未揭晓、不能投自己）+ `POST /api/dm/mvp`（设/清 MVP）+ `computeVoteSummary()` 汇总。
2. `playerState` 增加 `me.vote`、`game.voteResult`、`game.mvp`、`roster`；`dmState` 增加每玩家 `vote` + `voteSummary`。
3. 前端：玩家首页"投凶指认"弹窗（排除自己、可改投）；真相页显示计票结果+"众矢之的"徽章+MVP；DM Overview 面板显示谁指认谁、计票汇总、MVP 下拉评选。
4. 新增通用测试脚本 `assets/api-flow-test.template.cjs`（建号→认领→搜证→投凶→真相→MVP 全链路断言）。

## 16. ✅ 城堡/克苏鲁主题模板（已回写 `theme-castle.css`）

### 现状
- 只有 `theme-victorian.css` 一套。示例哥特剧本（深渊/克苏鲁/烛光）氛围需要专属主题。

### 新增
- `assets/theme-castle.css`：深岩绿基底 + 烛金 + 海藻红 + 克苏鲁苔绿，含深渊雾潮全屏基底、羊皮纸字体、烛光径向光晕等氛围细节。**纯 CSS 变量定义，无剧本耦合，可直接复用**。
- 回写后与 `theme-victorian.css` 并列，供主题切换机制引用。

## 17. 浏览器端到端验收要点（补充 loop.md）

- 搜证入口在**玩家端 Search 页签**（非首页），首页只有开始线索/剧本/投凶入口。
- `browser_snapshot` 很昂贵，验证长流程时应**优先用 `browser_evaluate` 读 DOM 断言**，关键节点才截图，否则子代理会频繁耗尽预算。
- 验收必查：两端首页渲染、认领、搜证扣 AP、My Clues、投凶弹窗（不含自己）、DM 投凶汇总、真相页计票+MVP、DM Reset 后**仍停留在控制台**、DM Files 多页翻阅、player 访问 dmref 资源 **403**。

## 18. ✅ 界面全量汉化（已回写全部模板）

### 问题（示例哥特剧本实测）
- 玩家端/主持人端/通用组件中仍残留英文标签、按钮、提示（如 `Home`、`Claim`、`Please enter claim code`、`Vote failed`、`OK/Cancel`、`Network error`、`Prerequisite clue not unlocked.`、`API not found.`），服务端错误消息与日志也是英文，中文玩家观感差。

### 汉化规范（后续构建必须遵循）
1. **所有用户可见文本一律中文**：标签页（`Home`→`主页`）、按钮（`Claim`→`认领`）、弹窗（`OK/Cancel`→`确定/取消`）、toast、错误消息、服务端日志均汉化。
2. **保留客户端依赖的关键英文标识**：`'Not authenticated.'` 被前端轮询逻辑硬编码匹配，**不得汉化**；新增鉴权错误文案时需先确认前端无字符串依赖。
3. **技术性文本可保留英文**：元素 id、`class`、CSS/SVG 属性、HTTP 头与 MIME、`404 Not Found` 状态行、API 路由 key、`No.${c.card}` 编号、兑换码示例（`0001`）不属于界面文案。
4. **校验流程**：汉化后对 app 与模板（占位符替换为合法值）分别执行 `node --check`；再用字符串扫描脚本确认无残留界面英文。

### 回写位置
- `player.template.js` / `dm.template.js` / `common.template.js` / `server.template.js` / `player.template.html` / `dm.template.html` 全部同步汉化内容，保留 `%PROJECT_TITLE%` 等占位符。
- 顺带修复：玩家投票成功后 `renderHeader(); renderActive();` 刷新、「Vote failed」→「投票失败」、`common.js` `'Network error'`→`'网络错误'`、`server.js` `'Prerequisite clue not unlocked.'`→`'前置线索未解锁。'`、`'API not found.'`→`'接口不存在。'`。

## 19. ✅ 交互与观感优化（示例哥特剧本第二辑，已回写全部模板）

> 用户逐条提出 11 项优化点，全部落地并回写模板。以下为抽象后的规范（后续构建默认遵循）。

### 19.1 统一 4 位数字 code（认领码 + 线索码）
- **改**：`clueCode(seq) = String(seq).padStart(4,'0')`，线索码从 `C01-ZQAV` 改为 `0001`；认领码本就是 4 位数字。
- 输入归一化：`doClaim` / `findClueByCode` 对 `/^\d{1,4}$/` 自动补零（输入 `1` 等价 `0001`）。
- 旧档迁移：`migrateCodes()` 检测 `C\d{2}-[A-Z0-9]{4}` 旧格式 → 置空重发；`initClueSeq()` 解析新格式续号。
- **原因**：玩家手输带连字符/字母的 code 易错，4 位纯数字最快。

### 19.2 DM 选角界面：角色卡片网格（替代下拉框）
- `.char-grid`（`repeat(auto-fill, minmax(150px,1fr))`）一次性展示全部角色卡片；每张 `.char-card` 含角色名、身份、主题色圆点（`.char-dot`）、`可选/已认领` 徽章。
- 交互：点击选中（`.sel` 金色描边 + 光晕）、已认领（`.taken` 半透明置灰禁点）；选中后再填昵称创建玩家。

### 19.3 角色主题色体系
- `data.json` 每个角色带 `color`；`playerState` 暴露 `me.color`。
- `highlight()` 输出 `<span class="cname" data-color="<id>" style="--c:<color>">`，style.css 用 `--c` 变量渲染（含文字光晕 + 主题色下划线）；主题 CSS（如 castle）可按 `[data-color]` 覆盖微调。
- 玩家认领后 `enterApp()` 设置 `--me-color` 全局变量 → 侧栏/标题/首页标题随角色变色。
- **注册顺序**：`registerCharacter` 先全名后短名，避免短名抢占长名子串。

### 19.4 公开线索对所有人可见（含自己）
- `playerState` 中 public 判定由 `else if` 改为独立 `if`：自己公开的线索**同时**出现在 `myClues` 与 `publicClues`（此前自己反而看不到自己公开的线索）。

### 19.5 多页剧本资源鉴权（翻页 403 修复）
- 根因：`findRefByPath` 未注册 `scriptPages[]` 中 p2..pN，导致第二页起 403。
- 修复：`if (c.scriptPages && c.scriptPages.includes(p)) return {kind:'script', charId:c.id}`；`playerState.scriptPages = char.scriptPages || [char.script]`。
- **验收**：`api-flow-test` 逐页断言 `/res?p=` 返回 200。

### 19.6 DM 计时器（阶段耗时 + 游戏总时长）
- 服务端：`game.startedAt`（首次离开 setup 记录）、`game.phaseHistory[]`（每次切阶段记录 `{phase, at}`）、`normalizeGameState()` 补旧档缺省字段。
- DM 前端：顶部 `timerChip` 每秒刷新显示总时长（开始后变金色）；总览页「游戏计时」卡片显示当前阶段计时、总时长、各阶段耗时条形列表（`.tbar i` 宽度占比）。
- `renderHeader()` 末尾调用 `updateTimer()`，轮询空转时也仅刷新计时。

### 19.7 玩家端认领页主题化（参考早期实现玩家端）
- 结构：`.claim-stage` 卡片（装饰圆徽 + 剧本大标题 + 分隔线 + 定制副标题 + 4 位大字输入框 + 引导文案）。
- 模板占位符：`%PROJECT_TITLE%`（标题）、`%CLAIM_SUB%`（副标题，如"夜色笼罩古堡 · 八位宾客 · 一具尸体 · 满座谎言"）。
- 不做通用"输入认领码"字样，认领页本身就是剧本的第一印象。

### 19.8 UI 细节
- **滚动条美化**：`scrollbar-width: thin` + 主题色 thumb（hover 变金），WebKit 伪元素 + Firefox 属性双写。
- **去重复元素**：删除玩家端 `apPill2`、DM 端 `phaseChip2`（及 theme-castle 中 `#phaseChip2` 样式）、DM 页残留顶部 header。
- **轮询节流**：`stateSig()` 对状态生成签名，仅变化时重渲染，否则只刷计时器，避免无谓 DOM 重绘。
- **时段数字**：所有计时显示加 `font-variant-numeric: tabular-nums`，避免秒数跳动。

### 19.9 验证补强
- `api-flow-test.template.cjs` 新增断言：认领码/线索码 `/^\d{4}$/`、scriptPages 逐页 200、公开线索同时出现在 myClues+publicClues、`startedAt`/`phaseHistory` 记录。
- 浏览器端到端：认领页文案、剧本逐页翻页无 403、DM 卡片网格 8 张、计时器金色 chip + 计时卡片、Console 无错误。

## 20. ✅ 视觉主题系统 + 脚本化构建（已回写）

> 用户要求：模板只是参考，实际以剧本主题为准创造有意思、好看的 UI 视觉，同时适配移动端竖屏与宽屏；除模板外可用脚本（Node 主 + Python 辅）规模化扩展能力。

### 20.1 视觉设计方法论（`references/11-visual-design.md`）
- **推导路径**：题材 → 氛围关键词 → 基调色/强调色/字体气质/装饰 motif/动画语言 → 主题文件。
- **双层结构**：`style.css`（功能骨架）+ `theme-*.css`（氛围覆盖，`:root[data-theme="x"]` 变量 + 组件覆写 + 动画 + 移动端段）。
- **移动端双形态强制项**：820px 断点；侧栏→抽屉、卡片→单列、表格→卡片、AP chip 收缩；生成器输出的主题自带适配段，但仍需浏览器双形态验收。

### 20.2 主题生成器（`assets/gen-theme.template.cjs` + `theme-presets.template.json`）
- **题材候选池**：13 个题材（gothic/victorian/western/steam/noir/science/desert/theatre/cyber/qingci/hospital/maritime/fantasy），每个题材 1-3 组协调色板 + 字体池 + motif + 动画池。
- **随机可控**：mulberry32 确定性伪随机，`--seed` 固定输出可复现；随机只在候选池内发生。
- **对比度自校验**：`validatePalette` 检查 18 个核心变量齐全、text/bg ≥ 4.5、muted/bg ≥ 3、面板亮度梯度递增；不达标自动回退下一候选组，全不达标报错（"经得起考验"）。
- **氛围双上下文**：氛围层（body::before 背景）用低透明 `animCtx`；灯影/霓虹/脉冲等光晕动画用高亮 `glowCtx`（alpha 0.3-0.5），否则 0.05 的光晕不可见。
- **多氛围叠加**：同题材多个 body::before 动画合并为单条多背景 background，互不覆盖。
- **使用**：`node gen-theme.cjs --genre gothic --seed 42 --name abyss --out public/css`；`--palette-file` 接入自定义色板。

### 20.3 定制色板（`assets/palette.py`，Python 辅）
- `--hue <n>` 纯数学生成（零依赖）：主色相推导 bg 阶梯/blood/gold（gold 走琥珀保护区 `warm_hue`，避开绿色死区）。
- `--image <封面>` 需 Pillow：取主导色，最暗为 bg、最饱和为 blood、最亮非白为 gold；低饱和图自动回退为按 bg 色相推导；面板阶梯用 `ladder()` 从实际 bg 提亮重建，保证梯度校验通过。
- 输出 JSON 直接喂 `gen-theme.cjs --palette-file`。

### 20.4 docx 抽取（`assets/extract-docx.py`，Python 辅）
- 零依赖（zipfile + ElementTree）：解析 `word/document.xml`，按样式识别标题（HeadingN/标题 N）输出 Markdown，表格转管道行。
- **坑**：`qn()` 必须剥掉 `w:` 前缀再拼命名空间（`'w:p'` → `'{ns}p'`），否则全部 find 失配。

### 20.5 一键构建 + 质检关卡（`assets/build.template.cjs`）
- `build.cjs --script <源> --out <应用> --title ... --theme|--genre|--palette`：资源拷贝 → 数据落盘（data.json + data.preset.json）→ 模板填充 → 主题接入 → **validate-data + check-res 质检，不过关即失败**。
- `%CLAIM_BTN%` 新增占位符（认领按钮文案，原"踏入城堡"是城堡剧本专属，泛化为可配置）。
- bat 中 `%PORT%`/`%errorlevel%`/`%FOUND%` 是运行时变量，绝不替换。
- `validate-data.cjs`：schema/类型/枚举（phase ∈ setup|prologue|started|reveal；area.type 是剧本自由值不设枚举）/id 唯一/4 位 code/资源路径 `res/` 前缀；阶段枚举与 server 的 `dmSetPhase` 白名单严格一致。
- `check-res.cjs`：收集全部 res/ 引用核对存在 + 剧本分页 p1..pN 连续性软检查。

### 20.6 预置主题
- 6 套精选（western/steam/noir/science/desert/theatre）由生成器按固定 seed 生成并入库，作快速 `--theme` 引用；另有 castle/victorian。

### 20.7 主题切换库 + 动态加载回退（示例哥特剧本验收发现并修复）
- **问题**：`?theme=` 只能切到已 link 的主题（默认那一个），且 build 只拷贝一个主题 CSS → 切换 castle 等主题完全无效果。
- **修复**：
  1. `build.cjs` 在指定 `--theme/--genre/--theme-file` 时，把**全部预置主题**拷入 `public/css/` 形成切换库；
  2. HTML 主 link 带 `data-theme-css="<默认名>"`；运行时脚本目标 ≠ 默认且未 link → 动态 append `<link>`，`onerror` 时移除并回退默认主题、清除 localStorage 记忆。
- **验收**：示例哥特剧本 v2（gloom 生成主题）下 `?theme=castle/noir/western` 切换生效、Network 无 CSS 404；未知主题优雅回退默认。
- **竖屏验收经验**：浏览器自动化窗口最小 ~510px，已满足 ≤820px 断点 → 移动端形态可直接在该宽度验收，无需精确 390px。

## 22. ✅ 示例民国剧本实战（民国谍战 + 复杂机制剧本）

> 用户要求：换【测试剧本/示例民国剧本(8人开放)】剧本继续练习，目的"练习+验证"，并修改、挑战、补充当前 Skill。

### 22.1 应用交付
- **示例构建目录/app/**：完整可运行剧本杀 APP，玩家端 `http://localhost:3032/`、DM 端 `/host`
- **数据**：8 角色（角色甲/角色乙/角色丙/角色丁/角色戊/角色己/角色庚/角色辛）+ 12 区域（4 场景 + 8 人物随身）+ 28 线索 + 4 时间线 + 真相 + 5 dmRefs（共 24 页 PNG）+ 2 规则 txt
- **主题**：`qingci`（青瓷民国/谍战），seed 固定现场生成，对比度 7.84（达标），flicker + smoke 氛围，宋体衬线
- **验证**：loop 10 步 + api-flow-test 30 项断言 + dmRefs 24 页逐页 200 + 剧透隔离（403/404/400）+ 重置（清空）+ bat ASCII 零中文 + 内容/路由断言（玩家/DM 双端含主题/CSS 含 flicker）

### 22.2 脚本化能力扩展（发现的 3 个 bug + 修复）
1. **api-flow-test 硬编码 BASE 端口 3031**（一处 fetch failed 风险）：
   - 改 `BASE = 'http://localhost:%PORT_DEFAULT%'`，build 时按 `--port` 替换
2. **api-flow-test 硬编码角色 id `'char_a'/'char_b'`**（剧本不同时 API 跑不通）：
   - 模板改为 `const A_ID = 'A_CHAR_ID'` 等常量
   - build.cjs 读 data.json 头两位角色自动填入，并暴露 `--player-a-id/--player-b-id/--player-a-vote/--player-b-vote` CLI 参数供覆盖
   - 验证：示例民国剧本 v2 重建后 api-flow-test 30 项断言自动通过（A=角色甲 投 角色乙，B=角色庚 投 角色辛）
3. **pdf-to-png.template.cjs 不支持单文件输入**（必须先建临时目录拷贝）：
   - 增加文件/目录自动判断分支，单文件模式按 basename 输出到 `--out` 子目录
   - 验证：`--in 调查线索.pdf --out _test_single/` 直接出 2 页 PNG

### 22.3 剧本杀机制范式（mechanics-paradigms，重大能力补强）

实战中揭露：现有 state-machine（references/03）只支持 5 阶段线性，**无法表达**：
- **N 回合循环**（公开讨论 20 分钟 + 自由讨论 20 分钟 = 1 回合，循环 5 次）
- **5 种玩家状态**（健康/受伤/中毒/昏迷/死亡 + 状态计时 + 自动转移）
- **技能牌**（每角色 2-3 个技能 + 使用次数 + 每回合对同一人 1 次限制）
- **物品牌**（使用次数 + 可交易 + 与 NPC 买卖 + 玩家间交易）
- **打斗猜拳**（物品优势表 + 妥协/应战 + 裁决）
- **死亡机制**（最后 2 回合昏迷 10 分钟 → 死亡）

→ 新增 `references/12-mechanics-paradigms.md`，7 种机制范式 + data.json 字段定义 + 服务端路由设计 + DM 端 UI 提示。覆盖：
- 范式 1 = 默认 5 阶段（已实现）
- 范式 2 = N 回合循环（schema 设计完成，待实现）
- 范式 3 = 玩家状态机（schema 设计完成，待实现）
- 范式 4 = 技能牌（schema 设计完成，待实现）
- 范式 5 = 物品牌（schema 设计完成，待实现）
- 范式 6 = 打斗/裁决（schema 设计完成，待实现）
- 范式 7 = 死亡机制（schema 设计完成，待实现）

### 22.4 数据驱动的"机制开关"落地策略

示例构建目录/src/data.json 已写好 `settings.maxRounds=5 / roundMinutes / deathAllowRounds` 等机制字段；当前 server 用"开关控制哪些机制启用"——把 7 种范式当 plugin 一样按需打开。后续可在 `server.template.js` 引入 `mechanicsEngine(game, settings)` 模块，按 settings 注册对应状态机/路由。

### 22.5 主题贴合的又一次验证
- 题材 `qingci`（青瓷民国/谍战）正好对应示例民国剧本的时代氛围
- 配色：bg=#1a1f1c（暗墨绿）blood=#b85547（血红）gold=#c9a86a（古铜金）—— 与"煤油灯/暗巷/血色暗杀"完全契合
- 字体：'Songti SC', 'SimSun', serif（宋体衬线）—— 民国味
- motif + flicker（烛火）+ smoke（烟雾）—— 煤油灯氛围
- 🪔 logo（煤油灯）—— 取代通用的 🎭

## 23. ✅ 线索 code 随机化（防近邻 + 防反推 + 唯一性）

> 用户反馈：现在的线索 code 连续分布，玩家反推游戏节奏；要求增加随机性。

### 23.1 旧实现的问题

```js
function clueCode(seq){ return String(seq).padStart(4, '0'); }
let clueSeq = 1;
function nextClueCode() { return clueCode(clueSeq++); }
```

玩家连续搜证得到 `0001, 0002, 0003, 0004...` → 一眼看出"这是我连续搜的第 N 条"，
且其他玩家拿到某个公开 code 后可轻易反推同局其他玩家未公开 code。

### 23.2 新实现（4 位数字 + 真随机 + 多重防御）

| 维度 | 旧 | 新 |
|------|---|---|
| 取值范围 | 0001 递增 | 1000-9999 真随机 |
| 防近邻 | ❌ 严格递增 | ✅ 拒绝与最近 10 条差 < 50 |
| 防反推 | ❌ 公开 code 暴露其他 code | ✅ 拒绝与全局已用差 < 5 |
| 唯一性 | ✅ 隐式（序号无重复） | ✅ 显式 Set 去重 |
| Reset | 序号继续累加 | ✅ 池子清空，新一局独立洗牌 |
| 兜底 | - | 池子极端满时降级为去重生成；9000 槽全满才 throw |

### 23.3 验证（示例构建目录/tools/）

**`test-code-random.cjs`**：4 玩家连搜 34 条，**全部相邻差 ≥ 50 / 任意两差 ≥ 5 / 千位均匀分布**：
```
唯一性: ✅ 34/34
相邻差 < 50: 0/33 ✅
相邻差 < 5:  0/33 ✅
任意两 code 差 < 5: 0 对 ✅
范围: [1048, 9639] 均值 5348 标准差 2570
千位分布: {"1":4,"2":5,"3":3,"4":3,"5":3,"6":5,"7":5,"8":3,"9":3}
```

**`test-code-reset.cjs`**：跨 3 局共 63 条 code，分布完全不同（无跨局继承）。

**`test-code-stress.cjs`**：单玩家连搜 21 条仍全部 ≥50 间隔，证明 NEAR_GAP 在压力下不卡死。

**`api-flow-test.cjs`** 30 项断言全部通过 → 不破坏现有功能。

### 23.4 回写位置

- `assets/server.template.js`：新增 `randomClueCode()`、`initClueSeq()`（含去重集合初始化）、`dmReset()` 末尾清池；5 处 `clueCode(card)` 调用统一改为 `nextClueCode()`
- `references/13-code-randomization.md`：完整设计文档（含参数取舍表、调参指引、未来扩展）
- `SKILL.md`：硬约束 #4 更新为"4 位数字随机 + 防近邻 NEAR_GAP=50 + 防反推 INFER_GAP=5"；验证清单第 5 条更新；"关键参考"表新增 ref 13
- `loop.md`：新增 §4.5「线索 code 随机性检查」
- `示例构建目录/tools/{test-code-random,test-code-reset,test-code-stress}.cjs`：3 个自动化校验脚本（可直接复制到任何应用验证）

## 24. ✅ 玩家私聊 + 打斗/裁决机制落地（从 schema 设计到完整实现）

> 承接 §22.3 的范式设计：私聊（范式 8）与打斗/裁决（范式 6）此前只有 schema，现已在
> `server.template.js` + 玩家端/主持人端 UI 完整实现，并通过端到端断言（22/22）。通用、不绑剧本、开关控制。

### 24.1 玩家私聊（范式 8，通用轮询式）

用户最初的诉求："打斗/裁决机制有真正实现吗？" + "玩家端也可以支持消息私聊（服务端落盘暂存、玩家端轮询拉取）"。

设计上不引 WebSocket，**复用现有 HTTP 轮询通道**，与剧本零耦合（详情见 `references/14-private-messaging.md`）：

- **落盘暂存**：消息存 `game.messages[]`（上限自动滚动），按 `seq` 递增保证有序 + 增量拉取。
- **轮询拉取**：玩家端复用 `/api/player/state` 轮询节奏，另提供 `/api/player/messages?since=<seq>`，未读数走顶部 chip 红点（`msgDot`）。
- **DM 审查**：默认 DM 可见全部私聊（`DM 私聊 tab` 消息监控）；`settings.dmMonitorPrivateMessages:false` 可关。DM 可定向/全员广播。
- **已读状态**：`readBy[]` 记录已读玩家；DM 广播（`dm-to-all`）与 DM 定向（`dm-to-player`）不同于私信。
- **开关控制**：`settings.allowPrivateMessages:false` 时玩家端私聊 tab 收起。

⚠️ **隐私硬约束（关键修复）**：`getPlayerMessages` / `messageSummary` 只应返回"自己发出、自己收到、DM 广播、DM 定向给自己"的消息；**其他玩家发给 DM 的私信绝不可见**。
原始实现把 `m.to==='dm'` 的 `player-to-dm` 全部暴露给所有玩家——已修复为 `m.from === me.id || m.to === me.id`。

### 24.2 打斗/裁决（范式 6，DM 为法官）

通用流程：**玩家发起 → DM 裁决 → 状态转移 + 物品转移**，全部走服务端状态机，玩家端不直接改状态。

| 步骤 | 端点 | 说明 |
|------|------|------|
| 玩家发起 | `POST /api/player/combat {targetId,itemId}` | 进入 `pending`，双方打斗历史可见 |
| 发起禁重复 | 服务端 | 同一目标在判决前不可重复发起 |
| DM 裁决 | `POST /api/dm/combat/judge {combatId,winnerId,takenItemId}` | 选中胜方 + 可选夺物 |
| 结果应用 | 服务端 | 败方 items 被夺走、状态→`injured`；胜方夺得物品、攻击物品 `usesLeft-1` |
| 二次裁决 | 服务端拒绝 | 已 `judged` 的打斗不可再审 |

- **开关控制**：`settings.combatEnabled:true` 才在 player/dm 端显示打斗 tab。
- **物品优势逻辑**：`DM 打斗 tab` 列出双方 items，DM 依 `type`（gun/sharp/…）优势表人工裁定胜方——裁决真正落在 DM，脚本只需配置物品 type，无需硬编码猜拳表（泛化、不绑剧本）。
- **物品注入**：`dmCreatePlayer` 支持 `items` 数组，测试里给角色甲持枪、角色乙持匕首验证夺物与次数消耗。

### 24.3 端到端验证（示例构建目录/tools/test-mechanics-e2e.cjs）

22 项断言全绿：创建玩家+注入物品 / 认领 / 角色甲→DM 与角色甲→角色乙发送 / **角色乙看不到角色甲致 DM 的私信** / 角色甲可见自家私信 / 角色乙初始未读→读后 readBy / DM 监控双可见 / DM 全员广播甲乙均见 / state 暴露 items+state / 发起打斗 pending / DM 裁决甲胜 / 乙 injured+匕首被夺 / 甲夺匕 + gun 次数-1 / 双方打斗记录 / 不可二次裁决。

### 24.4 回写位置

- `assets/server.template.js`：`game.messages[]` + 消息读写/已读/清空 + 打斗请求/裁决/历史 + 物品注入 + reset 清空；隐私过滤
- `assets/player.template.js`：私聊 tab（`msg`）+ 打斗 tab（`fight`）+ 轮询拉取 + 未读红点
- `assets/dm.template.js`：DM 私聊监控 tab + DM 打斗裁决 tab
- `assets/style.template.css`：`#sideOpen` 召回按钮（宽屏收起后可点开，移动端抽屉不变）
- `references/14-private-messaging.md` + `references/12-mechanics-paradigms.md`（范式 6 标记已实现）
- `SKILL.md`：约束 #22 更新 + 新增约束 #23
- `示例构建目录/tools/test-mechanics-e2e.cjs`：端到端测试脚本

## 小结

| 项 | 状态 | 回写位置 |
|----|------|----------|
| #13 dmReset 登出/剧本丢失 | ✅ 已修 | server.template.js |
| #14 dmRefs 多页 403 | ✅ 已修 | server.template.js / dm.template.js |
| #15 投凶 + MVP | ✅ 已加 | server/player/dm/style 模板 |
| #16 城堡主题 | ✅ 已加 | theme-castle.css |
| #17 端到端测试脚本 | ✅ 已加 | api-flow-test.template.cjs |
| #18 界面全量汉化 | ✅ 已回写 | 全部 js/html 模板 |
| #19 交互与观感优化（4位code/卡片选角/主题色/公开含自己/多页剧本/计时器/认领页/滚动条/去重/stateSig） | ✅ 已回写 | server/dm/player/common/style 模板 + theme-castle.css + api-flow-test.template.cjs |
| #20 视觉主题系统 + 脚本化构建（方法论/生成器/定制色板/docx抽取/一键构建/质检关卡/预置主题） | ✅ 已回写 | references/11-visual-design.md + assets/{gen-theme,theme-presets,build,validate-data,check-res}.template.* + assets/{palette,extract-docx}.py + player/dm 模板占位符 + SKILL.md 约束 #19/#20 |
| #21 主题切换库 + 动态加载回退（?theme= 可切任意预置、零 404、失败回退默认） | ✅ 已回写 | assets/build.template.cjs + assets/{player,dm}.template.html + references/11-visual-design.md §3.1 + SKILL.md 约束 #19 |
| #22 示例民国剧本实战：api-flow-test 参数化 + pdf-to-png 单文件 + 剧本杀机制范式（回合/状态/技能/物品/打斗/死亡） | ✅ 已回写 | assets/{api-flow-test,pdf-to-png,build}.template.* + references/12-mechanics-paradigms.md + 示例构建目录/app（验证载体） |
| #23 线索 code 随机化（防近邻 NEAR_GAP=50 + 防反推 INFER_GAP=5 + 唯一性去重 + reset 清池） | ✅ 已回写 | assets/server.template.js（nextClueCode/randomClueCode/initClueSeq/dmReset）+ references/13-code-randomization.md + 示例构建目录/tools/{test-code-random,test-code-reset,test-code-stress}.cjs + SKILL.md 约束#4 + loop.md §4.5 + IMPROVEMENTS §23 |
| #24 玩家私聊 + 打斗/裁决机制落地（含隐私修复/侧栏召回修复） | ✅ 已回写 | assets/server.template.js + assets/{player,dm}.template.js + assets/style.template.css + references/14-private-messaging.md + references/12-mechanics-paradigms.md + SKILL.md 约束#22/#23 + 示例构建目录/tools/test-mechanics-e2e.cjs |
## 25. ✅ 示例敦煌剧本实战（敦煌主题 + doc/docx 混合 + 图片线索 + 真相多源汇聚）

> 用「示例敦煌剧本（8 人开放）」剧本跑通 Skill 完整构建+验证流程，**重点是发现并修复 Skill 当前在 docx/doc 抽取、图片线索、敦煌风格主题、真相多源汇聚等方面的不足**，并把修复沉淀回 Skill 资产。验证产物：`示例构建目录/应用 :3041`（与 :3032 示例民国剧本 + :3040 app-new 多 app 同机并存）。

### 25.1 反哺清单（11 项 P0-P2）

| # | 反哺 | 文件 | 严重度 | 状态 |
|---|------|------|------|------|
| R1 | `extract-docx.py` 支持 .doc（旧 OLE 格式）兜底（antiword → catdoc → UTF-16 LE 解码 → ASCII） | `assets/extract-docx.py` | P0 | ✅ |
| R2 | `theme-presets.template.json` 新增 dunhuang 题材（2 组 palette + 字体 + motifs + anims） | `assets/theme-presets.template.json` | P0 | ✅ |
| R3 | `gen-theme.template.cjs` animCtx/glowCtx 表追加 dunhuang | `assets/gen-theme.template.cjs` | P0 | ✅ |
| R4 | 新建 `theme-dunhuang.template.css`（预设主题，手工微调字体优先级 + halo/flicker 动画） | `assets/theme-dunhuang.template.css`（已 rename 为 `theme-dunhuang.css`） | P0 | ✅ |
| R5 | `build.template.cjs` PRESET_THEMES += dunhuang（14 套） | `assets/build.template.cjs` | P0 | ✅ |
| R6/R7 | `references/02-data-schema.md` 增 clues[].images[] 字段说明 | `references/02-data-schema.md` | P0 | ✅ |
| R8 | `references/10-script-paradigms.md` 新增「范式 7 · 真相多源汇聚」 | `references/10-script-paradigms.md` | P1 | ✅ |
| R9 | `SKILL.md` Step 1 增 doc/docx 混合 + 真相多源提示块 | `SKILL.md` | P1 | ✅ |
| R10 | `loop.md` 新增 §0.5 资源格式混合预检 + 工具选型矩阵 | `loop.md` | P2 | ✅ |
| R11 | `validate-data.template.cjs` 加 `[EMPTY]` 警告（不阻断 build） | `assets/validate-data.template.cjs` | P1 | ✅ |

### 25.2 R1 实测：.doc 中文抽取成功

示例敦煌剧本有 3 个 .doc 旧格式角色剧本（角色甲.doc、角色乙.doc、角色丙.doc）。升级后抽取结果：
- 角色甲.doc → 1910 字节（ASCII 部分 + UTF-16 LE 中文）
- 角色乙.doc → 2961 字节
- 角色丙.doc → 2427 字节

抽出的中文内容示例（角色甲.p1.txt 片段）：
```
（角色甲剧本正文节选：江湖消息、宝藏传闻等）
（角色乙、角色丙剧本正文节选：旅途见闻）
```
**结论**：R1 升级后，3 个 .doc 角色剧本均可读，无需 antiword 系统依赖即可解码 OLE Word 中文段（前提是 UTF-16 LE 编码，符合主流中文 Word 旧版本规范）。

### 25.3 敦煌色板（theme-presets.dunhuang）

**Palette A · 莫高窟盛唐（默认）**：
- bg `#1a0f0a` / bg2 `#221510` / panel `#2c1c14` → `#432b21` 渐层
- text `#f0d9a8`（砂岩米黄）/ muted `#c9a878` / dim `#8b6e4c`
- blood `#c8392e`（朱砂）/ gold `#e8b75a`（金箔）
- celadon `#6b8aa8`（藏青）/ indigo `#3a4a6b`

**Palette B · 楼兰黄昏**：bg `#0f0a0d` 更暗，blood `#b8453a`、gold `#d4a55a`、indigo `#4a3a6b`。

**装饰 motif**：卍 ❀ ✦ ☉ ❋ ✤（藻井同心圆、莲花、星曜、佛日、装饰、星辰）
**动画**：halo（佛光晕 8s）+ flicker（佛灯摇曳 3s）+ sand（沙流 20s）
**字体**：disp `'Cinzel', 'STKaiti', 'KaiTi', 'Noto Serif SC'`, serif` / body `'Noto Serif SC', 'Songti SC', 'KaiTi', serif`

### 25.4 构建产物

```bash
node build.template.cjs --script 示例构建目录/剧本源 --out 示例构建目录/应用 \
  --title "示例敦煌剧本" --title-ascii "Shi Li Dun Huang" --port 3041 \
  --logo "☉" --theme dunhuang \
  --claim-sub "丝绸古道 · 黄沙尽头 · 八位旅人 · 一座客栈 · 一夜亡魂" \
  --claim-btn "踏入古道"

# [1/5] 资源已拷贝  res/ -> public/res/
# [2/5] 剧本数据已写入  data.json + data.preset.json
# [3/5] 模板已填充  server.js / 前端 / bat
# [4/5] 工具脚本已拷贝  tools/pdf-to-png.cjs + api-flow-test.cjs
# [5/5] 质检关卡
#      ✅ validate-data 通过
#      ✅ check-res 通过（29 处资源）
# ✅ 构建完成
```

### 25.5 验证（示例构建目录/应用/_verify-spoiler.log）

| # | 测试 | 期望 | 实际 |
|---|------|------|------|
| 1 | GET / | 200 | 200 ✅ |
| 2 | GET /host | 200 | 200 ✅ |
| 3 | GET /css/theme-dunhuang.css | 200 | 200 ✅ |
| 4 | 14 套主题切换库全部 200 | OK | OK ✅ |
| 5 | /res?p=res/clues/线索01.jpg (no token) | 401/403 | 403 ✅ |
| 6 | POST /api/player/state (no token) | 401 | 401 ✅ |
| 7 | /res?p=../package.json | 400 | 400 ✅ |
| 8 | POST /api/dm/login | ok | ok ✅ |
| 9 | GET /api/dm/state | players >= 2 | players=2 ✅ |
| 10 | claim A + B | success | success ✅ |
| 11 | search $areaId | clue.code 4 位数字 | 3517 ✅ |
| 12 | cross-player fetch code | kind=clue + title | kind=clue title=线索标题 ✅ |
| 13 | 多 app 同机 :3032/:3040/:3041 | 互不污染 | 三应用样例 ✅ |

### 25.6 api-flow-test 自动断言（23/23 PASS）

`node tools/api-flow-test.cjs` 全部通过：
- DM login → 创建 2 玩家 → claim 4 位数字（7088/3519）
- 8 角色 schema 暴露 → 角色 script 200
- 搜证得 4 位 code (9428) → 公开 → 跨玩家可见
- 投票 → phase=started → 真相揭晓 → MVP

### 25.7 与示例民国剧本的差异点

| 维度 | 示例民国剧本（qingci 青瓷民国/谍战） | 示例敦煌剧本（dunhuang 敦煌/楼兰/西域） |
|------|------------------------------------|--------------------------------------|
| 题材 | qingci（青瓷民国）| **dunhuang（新增，敦煌楼兰）** |
| 文档格式 | 全 PDF | **8 角色 doc/docx 混合**（R1 反哺后 100% 可抽） |
| 线索 | 文字为主 | **12 张图片线索（jpgs，2MB/张）** |
| 真相来源 | `真相.txt` 独立 | **多源汇聚**（组织者手册 + 时间轴 + 技能表 3 份 docx） |
| 范式 | 范式 1+6+8+9+10+11（已实现） | **范式 1+6+8** + 范式 4 技能表落库（UI 待实现） |
| 端口 | :3032（老）/ :3040（app-new）| **:3041（本轮新增）** |
| 主题 CSS | theme-qingci.css | **theme-dunhuang.css（新增）** |

### 25.8 限制（本轮未实现，列入 R14 P2）

| 限制 | 影响 | 后续 |
|------|------|------|
| 客栈平面图.xlsx 未转 PNG | 地图资源缺失 | **R14**：xlsx → PNG 转换工具（用 libreoffice 或 PIL） |
| 范式 4（技能牌）schema 已写，UI 未实现 | 技能表数据无法在玩家端 UI 展示，仅 dmRefs 可查 | **R15**：技能牌玩家端触发 + DM 裁决 UI |
| 真相完全靠人工精读组织者手册综合 | 无法全自动化 | **R16**：从多份 docx 抽取真相要点（关键词抽取 + 关联图谱） |

### 25.9 结论

- Skill 已具备处理 doc/docx/PDF/jpg 多格式混合剧本的能力
- 新增 dunhuang 题材让 Skill 主题库扩展到 14 套
- 真相多源汇聚工作流已文档化（`references/10-script-paradigms.md` 范式 7）
- 多 app 同机 :3032/:3040/:3041 资源完全隔离，互不污染

### 25.10 验证产物

- `示例构建目录/应用/`：完整 app（data.json + res/ + server.js + bat + public/）
- `示例构建目录/_compare/敦煌主题-验证报告.html`：综合验证报告
- `示例构建目录/应用/_verify-spoiler.log`：13 项验证日志
- `示例构建目录/应用/server-stdout.log`：服务启动日志（含双 URL）
- `示例构建目录/应用/tools/api-flow-test.cjs`：23 项断言输出

## 26. ✅ 示例敦煌剧本实战反馈 + 五项缺陷修复（用户实时反馈驱动的 Skill 反哺）

> 用户在玩示例敦煌剧本（:3041）时直接反馈 5 个体验问题，反哺到 Skill 资产并落地：
> ① 剧本阅读不了（.txt 被当 img）；② 角色重复创建无校验；③ 非投凶阶段按钮应置灰；
> ④ AP 奖励池术语歧义；⑤ 时间线/阶段 UI 混淆。本次重点是「实操 → 反哺」闭环。

### 26.1 五项缺陷与修复

| # | 现象 | 根因 | 修复 | 验证 |
|---|------|------|------|------|
| ① | 剧本阅读不了（黑屏或裂图） | `player.template.js` 的 `openScript()` 写死 `<img>` 渲染 `pages[idx]`，但示例剧本脚本是 `.txt`（docx/doc 抽取后输出），img 显示破碎 | `openScript()` 按扩展名分支：img → `<img>`、txt/md → `<iframe sandbox>`、其他 → `<object>`（带新窗口打开链接） | `verify-26.js fix1`: PASS |
| ② | DM 可重复创建同一角色 | `server.template.js` 的 `dmCreatePlayer()` 只校验角色是否存在，**不校验是否已被其他玩家认领** | `dmCreatePlayer()` 增加占用检查：`if (occupied) return error`；同时支持 `force:true` 显式复用（避免单角色多玩家的合理场景被一刀切） | `verify-26.js fix2`: PASS（server 返回 "角色「角色甲」已被玩家「testA」认领"） |
| ③ | 非投凶阶段玩家看不到投票入口 | 玩家端 `renderHome()` 用 `if (phase === 'started' || 'reveal' && !truthUnlocked)` 隐藏整个面板；真相揭晓后玩家也看不到自己投了谁 | 投票面板**始终展示**，按钮按 `canVote = phase === 'started' && !truthUnlocked` 灰显（opacity:.4 + cursor:not-allowed + disabled），并显示具体原因 chip（"真相已揭晓，投票关闭"等） | `verify-26.js fix3a + fix3b`: PASS（setup 拒绝、started 允许、truth 拒绝） |
| ④ | "AP 池"含义不明 | 标签仅 2 字，玩家易误解为某种评分 | 总览卡片改为"AP 奖励池"+ title 解释："主持人可发放给玩家的 AP 奖励池（零和：发放后池减，玩家 AP 加）" | `verify-26.js fix4`: PASS（dm.js 含 "AP 奖励池"） |
| ⑤ | "上一步/下一步"既控制阶段又控制时间线，混淆 | 总览卡和 flow 卡的按钮混排（共用 "上一步/下一步" 标签但实际语义不同） | 两块完全分离：① 「阶段控制」块 = `phasePrev/phaseNext`（控制 setup→prologue→started→reveal 循环），按钮 label 明确为"上阶段 / 下阶段"；② 「时间线步进」块 = `stepPrev/stepNext`（控制 `currentStep` ±1），按钮 label 明确为"上一时间 / 下一时间"；③ renderFlow 同步改写，注释明确"阶段为游戏节奏，与时间线步骤独立" | `verify-26.js fix5`: PASS（阶段控制=2、时间线步进=2、上一时间=4、下一时间=4、上阶段=2、下阶段=2） |

### 26.2 反哺沉淀清单

| # | 文件 | 改动 |
|---|------|------|
| R1 | `assets/player.template.js` | `openScript()` 三分支（img/iframe/object）+ iframe 含 sandbox；`renderHeader()` 加 moneyChip 条件显示 |
| R2 | `assets/server.template.js` | `dmCreatePlayer()` 加角色占用检查 + `force:true` 显式复用 |
| R3a | `assets/player.template.js` | 投票面板始终展示；按 `canVote` 灰显 + 原因 chip；`renderHome` 改 IIFE |
| R3b | `assets/server.template.js` | `doVote()` 改为只在 `started` 阶段允许（移除 `reveal`）；错误文案带阶段名 |
| R4 | `assets/dm.template.js` | 总览卡 "AP 池" → "AP 奖励池" + tooltip 解释 |
| R5 | `assets/dm.template.js` | 拆分 renderOverview + renderFlow 的阶段/时间线块；按钮 label 明确；handler 各自独立 |
| R6 | `assets/style.template.css` | `.script-page-img / .script-page-text (iframe) / .script-page-obj` 三套样式 |

### 26.3 验证结果（示例构建目录 :3041 + :3040 都已重建）

```
[fix1] script reading img/iframe/obj: PASS
[fix2] character uniqueness: PASS
[fix3a] canVote gating (player.js): PASS
[fix3b] server vote phase gating: PASS
[fix4] AP reward pool label: PASS
[fix5] UI separation counts:
    phase-control card: 2
    timeline-advance card: 2
    prev-time buttons: 4
    next-time buttons: 4
    prev-phase buttons: 2
    next-phase buttons: 2
```

### 26.4 练习设计：再次跑 23 项自动断言

```
✅ DM login → 建号 → claim → 搜证 → 跨玩家拉码
✅ 投票三态（setup 拒绝 / started 允许 / truth 拒绝）
✅ 重启 / 重置 / 真相互锁 / MVP 设置
```

---

## 27. ✅ 主题三态轮转（玩家端右上角 + light/dark 预设）

> 用户反馈：玩家端右上角应设计主题切换按钮，默认契合剧本题材，然后是 light / dark 模式，三态轮回。
> 这是「系统主题（贴合题材）」与「环境主题（白天/夜间）」的二维分层。

### 27.1 设计决策

| 维度 | 决策 | 原因 |
|---|---|---|
| 触发位置 | 玩家端右上角 `.top-right`（与 phaseChip / apPill / moneyChip 平级） | 玩家随时切换；DM 端不需要（DM 全程用默认主题专注控场） |
| 三态顺序 | **DEFAULT（剧本主题） → light → dark → DEFAULT** | 用户原话："默认契合剧本 → light → dark" |
| 持久化 | `localStorage.mystery_theme` | 与原 inline 脚本兼容；下次打开浏览器记忆上次选择 |
| URL 覆盖 | `?theme=light/dark` 仍然有效（沿用原 inline 脚本） | 兼容分享带主题的链接 |
| 三态 chip label | default=「主题」+☉、light=「浅色」+☀、dark=「深色」+☾ | 一眼区分当前态 |
| 动画反馈 | `themeFlip`（Y 轴 0→90→0deg + opacity 0.35→1）0.35s ease | 切换有视觉反馈，不突兀 |

### 27.2 反哺沉淀清单

| # | 文件 | 改动 |
|---|------|------|
| R7 | `assets/theme-light.css`（新文件） | 浅米白底 + 炭灰文字 + 朱红 + 暖金 + 冷蓝灰；不带任何 motif/装饰 |
| R8 | `assets/theme-dark.css`（新文件） | 纯黑底 + 米白文字 + 朱红 + 暖金 + 冷蓝灰；不带任何 motif/装饰 |
| R9 | `assets/build.template.cjs` | `PRESET_THEMES += 'light', 'dark'` |
| R10 | `assets/theme-presets.template.json` | 加 `light` + `dark` 完整题材（含 fonts/palettes/motifs/anims/radius） |
| R11 | `assets/gen-theme.template.cjs` | animCtx/glowCtx 各加 light + dark 映射（防 `--genre light --seed N` 现场生成可用） |
| R12 | `assets/player.template.html` | `.top-right` 加 `#moneyChip` + `#themeChip` button |
| R13 | `assets/style.template.css` | `.theme-chip` 样式 + `@keyframes themeFlip` 翻转动画 |
| R14 | `assets/player.template.js` | `applyTheme/refreshThemeChip/cycleTheme` 三函数；`enterApp()` 绑定 onclick；页面加载 init label |

### 27.3 实现要点

```javascript
// 玩家端 player.template.js
const THEME_CYCLE = ['light', 'dark'];
function applyTheme(theme) {
  // 动态加载目标 theme CSS（与原 inline 脚本行为一致）
  // 写 documentElement.dataset.theme + localStorage.mystery_theme
  // 调 refreshThemeChip 更新 chip 文字/图标
}
function refreshThemeChip(theme) {
  // 默认剧本主题 → "主题" + ☉
  // light → "浅色" + ☀
  // dark → "深色" + ☾
}
function cycleTheme() {
  const cur = document.documentElement.dataset.theme || '';
  const def = document.body.dataset.theme || '';
  const seq = [def, ...THEME_CYCLE].filter(Boolean);
  const idx = seq.indexOf(cur);
  const next = seq[(idx + 1) % seq.length] || def;
  chip.classList.add('flipping');    // 0.35s 翻转动画
  applyTheme(next);
}
```

### 27.4 验证（13/13 PASS）

```
[fix1] theme-light.css exists: PASS
[fix2] theme-dark.css exists: PASS
[fix3] build PRESET_THEMES has light/dark: PASS
[fix4] presets.light: PASS
[fix4] presets.dark: PASS
[fix6] player.html has themeChip + moneyChip: PASS
[fix7] player.js has cycleTheme/applyTheme/refreshThemeChip: PASS
[fix8] player.js has THEME_CYCLE: PASS
[fix9] style.css has .theme-chip + @keyframes themeFlip: PASS
[fix10] built css/theme-light.css exists: PASS
[fix10] built css/theme-dark.css exists: PASS
[fix11] HTTP GET theme-light.css: 200 PASS
[fix11] HTTP GET theme-dark.css: 200 PASS
```

### 27.5 E2E 练习（practice.js）

```
[1] player created code=4721
[2] claim ok, me: 练习玩家 ap=10 money=undefined state=healthy
[3] GET / has #themeChip: PASS
[3] GET / has #moneyChip: PASS
[3] GET / default data-theme=dunhuang: PASS
[4] player.js has cycleTheme/applyTheme/refreshThemeChip: PASS
[5] GET theme-dunhuang.css: 200 PASS
[5] GET theme-light.css: 200 PASS
[5] GET theme-dark.css: 200 PASS
[6] setup blocks vote / started allows / truth blocks: 3/3 PASS
[7] duplicate charId blocked / force=true reuse allowed: PASS
```

### 27.6 主题生态现状（16 套）

```
题材主题（14 套）：castle / victorian / western / steam / noir / science / desert / theatre
                 / cyber / qingci / hospital / maritime / fantasy / dunhuang
环境主题（2 套）： light / dark    ← 本轮新增（与剧本主题完全独立）
```

共 16 套主题覆盖：14 个剧本题材 + 2 个环境模式（light/dark）。

## 28. ✅ 示例赛车剧本实战（5 人剧本 + 全 docx + 凶手借红色大众 + 复杂动机链）

> 用 5 人小型剧本（角色纯 docx + 一/二轮线索 docx + 案件解析 docx + 背景简介 docx）跑通 Skill，**重点是发现并修复 4 项 P0 通用缺陷**（剧本无关，任何剧本都受影响），并把修复沉淀回 Skill 资产。验证产物：示例赛车剧本 APP（:3050）。

### 28.1 反哺清单（4 项 P0 · 通用）

| # | 反哺 | 文件 | 严重度 | 状态 |
|---|------|------|------|------|
| R28 | `/res/...` 静态路径绕过鉴权（**剧透隔离严重漏洞**） | `assets/server.template.js` | P0 | ✅ |
| R29 | `data.json.log` 字段缺失即崩（DM 登录 TypeError） | `assets/server.template.js` | P0 | ✅ |
| R30 | 公共区域 `area.owner` 缺失即崩（搜证 TypeError） | `assets/server.template.js` | P0 | ✅ |
| R31 | `api-flow-test.template.cjs` 硬编码 `=== 8` + `owner.includes` 不适用 5 人本 | `assets/api-flow-test.template.cjs` | P0 | ✅ |

### 28.2 R28 详解 · `/res/...` 静态路径绕过鉴权

**漏洞**：旧 server.template.js 的 createServer 静态托管分支：
```js
else {
  const safe = resolveSafe(PUBLIC_DIR, p);   // ← 这里把 /res/scripts/<id>/p1.txt 当 PUBLIC_DIR 下的文件
  if (safe && fs.existsSync(safe) ...) file = safe;   // ← 直接返回文件内容，绕过 /res?p= 鉴权
}
```
后果：玩家**无需 token 即可拿到所有脚本 PDF/PNG/TXT**——剧透隔离形同虚设。

**修复**：
```js
else {
  /* 禁止以 /res/... 路径直接静态获取资源（必须经 /res?p= 鉴权） */
  if (p.startsWith('/res/') || p === '/res') { res.writeHead(404); res.end('Not Found'); return; }
  const safe = resolveSafe(PUBLIC_DIR, p);
  ...
}
```

**验收**：`curl /res/scripts/nanyufeng/p1.txt` 修复前 **200**（漏洞），修复后 **404** ✅。

### 28.3 R29 详解 · log 字段缺失即崩

**症状**：data.json 不写 `log` 字段（早期没有此约定）→ DM 登录 `TypeError: Cannot read properties of undefined (reading 'slice')` at dmState。

**修复**：`dmState()` 中 `log: DB.log.slice(-200)` → `log: (DB.log || []).slice(-200)`。

### 28.4 R30 详解 · area.owner 缺失即崩

**症状**：公共区域（如腾云赛道/尸体/私家车）data.json 不写 `owner` 字段 → 搜证时 `area.owner.includes(player.characterId)` 抛 TypeError。

**修复**：`area.owner.includes(...)` → `(area.owner || []).includes(...)`。

### 28.5 R31 详解 · api-flow-test 硬编码

**症状**：模板 `assert(stA.characters.length === 8, ...)` 与 `x.owner.includes(A_ID)` 不适用 5 人本 / 公共区域。

**修复**：
- `=== 8` → `>= 2`（动态、打印实际数量）
- `x.owner.includes(A_ID)` → `!(x.owner || []).includes(A_ID)`
- `x.clues.length` → `(x.clues || []).length`（防御）
- `s.clue.id` 改 `if (s.clue)` 守卫（empty search 时跳过公开断言）

### 28.6 端到端验证（api-flow-test 23/23 全绿）

```
✅ DM login
✅ DM created players
✅ claim codes are 4-digit numbers: 8269 / 7869
✅ Player A claim
✅ player state exposes all characters (got 5)
✅ A is nanyufeng
✅ A has script pages
✅ vote initially null
✅ script page accessible: res/scripts/nanyufeng/p1.txt → 200
✅ A has a searchable area
✅ A searched area and got a clue: 赛道监控录像
✅ clue code is 4-digit number: 4559
✅ A made the clue public
✅ owner sees own public clue in publicClues
✅ owner still sees own public clue in myClues
✅ A votes for xiaoqianshan
✅ self-vote rejected
✅ dm voteSummary shows xiaoqianshan has 1 vote
✅ B votes for nanyufeng
✅ game.startedAt recorded after phase->started
✅ game.phaseHistory recorded phase switches
✅ DM unlock truth
✅ A sees truth after unlock
✅ voteResult exposed after reveal (2 suspects)
✅ MVP set to A
✅ A sees MVP in own state
```

### 28.7 剧透隔离 6 项全过

```
/res?p=res/scripts/nanyufeng/p1.txt            → 403 (无 token)
/res/scripts/nanyufeng/p1.txt (静态绕过)       → 404 ✅ (修复前 200, 修复后 404)
/res?p=../package.json                          → 400 (路径逃逸)
/res?p=res/dmrefs/案件真相.txt                  → 403 (无 token DM 资料)
/api/dm/state (no token)                        → ok=false ✅
/api/dm/state (DM token)                        → ok=true players=2 ✅
```

### 28.8 5 人本特性

- **不依赖 8 人本机制**：N=5 也能用同一套 server/dm 模板，DM 卡片网格 + API 自动适配
- **凶手藏很深**：廖鸿羽借南语风安排的红色大众诱发李齐心触碰挂饰涂药针——南语风的"炸弹机关"与肖元武的"狙击手"都没真动手，多杀意叠加最终由廖鸿羽一击毙命
- **真相多源汇聚**：真相由「凶手剧本 + 案件解析 docx + 背景人物简介 docx」综合而来，验证范式 7（见 references/10-script-paradigms.md）

### 28.9 限制 / 后续

- 剧情节奏依赖 DM 控制；本验证未实现 N 回合循环（范式 2），仍走 5 阶段线性
- 5 个角色均无配图（纯文本剧本），未来若需「剧本配图」需新增 docx→PNG 渲染工具

## 29. ✅ 实战游玩验证 + 3 项 P0 通用缺陷反哺（剧本机制深度验证）

> 用 Node 端到端脚本模拟"DM + 5 玩家"完整一局（11 个阶段 48 项断言），**实际游玩每步都执行**：建号→认领→打开剧本→推进 timeline→逐玩家搜证→跨玩家拉码→投凶→揭晓→拉真相→重启。48/48 全绿。同时发现并修复 3 项 P0 通用缺陷。

### 29.1 反哺清单（3 项 P0 · 通用）

| # | 反哺 | 文件 | 严重度 | 状态 |
|---|------|------|------|------|
| R32 | doSearch 不检查 `unlockStep`，所有线索任何时候都可搜，绕过"分轮"机制 | `assets/server.template.js` | P0 | ✅ |
| R33 | 玩家 state.game 不含 `truthUnlocked`，玩家不知道真相是否揭晓 | `assets/server.template.js` | P1 | ✅ |
| R34 | `checkResAccess` 中 dmref 永远只允许 DM，玩家揭牌后**不能**查看真相复盘资源 | `assets/server.template.js` | P0 | ✅ |

### 29.2 R32 详解 · unlockStep 检查缺失

**症状**：`data.json` 的 `clues[].unlockStep` 字段被 ignore，DM 推进 timeline 后玩家仍能搜到所有 locked 线索，导致"两轮搜证"机制失效——前几个玩家搜完所有线索，后面玩家无东西可玩。

**修复**：`doSearch()` 中线索查找改为：
```js
const nextClue = area.clues.find(c =>
  c.state === 'locked' &&
  (c.unlockStep === undefined || c.unlockStep <= DB.game.currentStep)
);
```

**验收**：测试从「8 区域 × 2 线索 = 16 线索」实测 → 第一轮 step1 搜 7 条，第二轮 step2 搜 9 条，与设计意图一致。

### 29.3 R33 详解 · 玩家 state.game 缺 truthUnlocked

**症状**：playerState 函数输出的 `game` 字段只有 phase/currentStep/mvp/voteResult，**没有** truthUnlocked 布尔位。玩家前端只能从 `state.truth` 是否存在推断揭晓状态，但 truth 在 unlock 前后形态变化（null → 完整对象），前端做 UI 状态机时容易写错。

**修复**：playerState 的 game 加 `truthUnlocked: DB.game.truthUnlocked === true` 字段。

### 29.4 R34 详解 · dmref 揭牌后玩家应可读

**症状**：`checkResAccess` 对 `case 'dmref'` 永远 `return !!(viewer && viewer.dm)`。真相复盘页面给玩家展示真相/时间线/dmRefs 后，玩家想点开「案件真相 txt / 背景人物简介 txt」时永远 403。

**修复**：允许 `truthUnlocked` 后的玩家查看 dmRef：
```js
case 'dmref': return !!(viewer && (viewer.dm || (DB.game && DB.game.truthUnlocked)));
```

### 29.5 端到端实战游玩脚本（11 阶段 48 项断言）

| 阶段 | 验证内容 | 结果 |
|------|----------|------|
| 1 | DM 登录 + reset | ✅ |
| 2 | DM 切 phase=started | ✅ |
| 3 | DM 为 5 角色各建 1 玩家（4 位数字认领码） | ✅ |
| 4 | 5 玩家逐个认领 | ✅ |
| 5 | 5 个剧本页全部可读（鉴权 200 + 内容含中文） | ✅ |
| 6 | DM 推进 step1+step2，5 玩家逐人搜证，共 16 条线索 | ✅ |
| 7 | 16 个 4 位 code 全部无近邻（差 ≥ 50） | ✅ |
| 8 | A 设 public → B 在 public 区可见（拉码机制） | ✅ |
| 9 | 剧透隔离 5 项（无 token=403/路径逃逸=400/静态绕过=404/DM token=200/玩家看不到他人 private） | ✅ |
| 10 | 5 玩家投凶（4 票廖鸿羽、凶手投肖元武）+ DM 设 MVP + 揭晓 + 玩家拉真相 txt 200 | ✅ |
| 11 | DM 重置后 players=0, phase=setup, truthUnlocked=false | ✅ |

### 29.6 真实游玩体验记录

| 维度 | 体验 |
|------|------|
| 内容可读 | ✅ 5 个角色剧本页均含中文 docx 抽取文本，可读性良好 |
| 功能可执行 | ✅ 11 个阶段 48 项断言全部通过 |
| 玩家端不被剧透 | ✅ 无 token 拉 dmRef=403；玩家查不到他人 private 线索；DM-only 真相复盘在 unlock 后才下放 |
| 主题贴合 | ✅ cyber/neon-red 主题（霓虹粉+暗紫+冷蓝）契合剧本赛车/深夜/都市氛围 |
| 双形态 | 移动端（≤820px）抽屉 + 桌面宽屏布局由 style.css 已实现（详见 references/07） |

### 29.7 已沉淀到 Skill 的修复

- `assets/server.template.js` line 372（unlockStep 检查）
- `assets/server.template.js` line 1006（player game.truthUnlocked）
- `assets/server.template.js` line 1186（dmref 玩家解锁可读）

下次任何剧本构建都直接受益，无需额外配置。

## 30. ✅ 医疗档案范式化 + 空搜不扣 AP（模板清理 + 用户体验修复）

> 用户反馈：
> 1. 「医疗档案」是早期剧本（中式餐饮宴会+医生角色读 CT）的强假设遗留，不应默认出现在所有剧本里；
> 2. 「未搜到线索」不应扣 AP（反玩家）；
> 3. **「菜单（功能）」必须显示说明，非通用功能不应当做出来**，不要一味遵从模板。
>
> 据此将「医疗档案」从「强校验内置功能」降级为「范式 9 · 角色专长档案（可选）」，默认关闭；并修复 doSearch 空搜扣 AP 的反玩家 bug。

### 30.1 反哺清单（2 项 P0 + 1 项 P1）

| # | 反哺 | 文件 | 严重度 | 状态 |
|---|------|------|------|------|
| R35 | doSearch 无线索时仍扣 AP + 计搜证次数（反玩家） | `assets/server.template.js` | P0 | ✅ |
| R36 | 「医疗档案」是早期剧本遗留，强制校验、默认 tab、必填 medicalFiles 字段 | `assets/server.template.js` + `assets/dm.template.js` + `assets/validate-data.template.cjs` | P0 | ✅ |
| R37 | loadDB 未给 settings 兜底默认值（data.json 缺字段导致 undefined.xxx 崩） | `assets/server.template.js` | P1 | ✅ |

### 30.2 设计决策

**核心原则**：非通用功能**不应当做出来**。「医疗档案」在早期某剧本（中式餐饮宴会+医生读 CT）是合理设计，但被无意固化为通用机制 — 5 个早期剧本全都按"中式餐饮+医生角色"模板填表，实际上绝大多数剧本杀不需要这个机制。

**新模型**（范式化）：
- 默认关闭：`settings.enableMedicalFiles = false`
- `data.json` 顶层 `medicalFiles` 字段**可选**（缺省 = `[]`）
- `characters[].medical` 字段**可选**（缺省 = false）
- 接口仍然存在（`POST /api/player/medical` + `POST /api/dm/medicalAs`），开关未启用时直接拒绝
- DM 端「医疗档案」tab 默认不显示（`cond: s => s.settings.enableMedicalFiles && medicalFiles.length > 0`）
- 需要此机制的剧本：`data.json` 加 `"settings": { "enableMedicalFiles": true }` + 在 `medicalFiles: [...]` + 至少一名角色 `medical: true`

### 30.3 R35 详解 · 空搜不扣 AP

**症状**：玩家搜证「无线索」（区域已搜完 / 当前 step 不到 unlockStep）时，`doSearch` 仍 `player.ap -= area.apCost` 且 `player.searches[areaId].count++`，玩家 AP 与搜证次数都被消耗。

**修复**：`doSearch()` 的 `!nextClue` 分支改为只记日志、不扣 AP、不计次数：
```js
if (!nextClue) {
  addLog(player.playerName + ' 搜索了"' + area.name + '"：无结果（未扣 AP）');
  return { ok: true, ap: player.ap, empty: true, error: '该区域当前没有可搜的线索（未扣 AP）。' };
}
```

**玩家端 toast 文案更新**：「该区域当前没有可搜的线索（未扣 AP）」明确告知。

**玩家端 AP pill pulse 动画**改为只在获得线索时触发，避免空搜时误以为扣了 AP。

**验收**：
- 第一轮搜得线索 → AP 10→9 ✅
- 第二轮同区域因 unlockStep 不到 → empty + AP 仍 9 ✅
- 推 step=2 后再搜 → AP 9→8 ✅
- 第三轮同区域无更多线索 → empty + AP 仍 8 ✅
- 连续 3 次空搜 → AP 全程不变 ✅

### 30.4 R36 详解 · 医疗档案范式化

**症状**：
- `validate-data` 强校验 `medicalFiles` 顶层键 + `char.medical` 布尔
- DM 端 8 个 tab 永远有「医疗档案」
- `doMedical` 直接执行业务，不检查开关
- 任何剧本都暴露 `state.medicalFiles` 数组

**修复**：
1. `validate-data.template.cjs`：`medicalFiles` 从 `requiredTop` 移除；`char.medical` 改为可选（出现时必须是 boolean）
2. `dm.template.js`：TABS medical 项加 `cond: s => s.settings.enableMedicalFiles && medicalFiles.length > 0`；`initTabs()` 改用 `TABS.filter(t => !t.cond || t.cond(ST))`；同步为 msg/fight 加 cond
3. `server.template.js`：`doMedical()` 入口加开关检查；`dmSetSettings()` 接受 `enableMedicalFiles`；`buildDefaultData()` 默认 `enableMedicalFiles: false`
4. `loadDB()` 加 settings 兜底（任何字段缺省都补齐默认值，避免 `undefined.xxx` 崩）

**验收**：
- 玩家调 `POST /api/player/medical` → `{ok:false, error:'本剧本未启用医疗档案机制。'}` ✅
- DM 调 `POST /api/dm/medicalAs` → 同上 ✅
- `dm/state.settings.enableMedicalFiles = false` ✅
- DM `POST /api/dm/settings {enableMedicalFiles:true}` 后，medical 接口不再用「未启用」拒绝，错误转为「档案不存在」（接口已通） ✅

### 30.5 R37 详解 · settings 兜底

**症状**：`loadDB()` 用 `pickDataFile()` 直接替换 DB，不给 settings 补默认值。`data.json` 省略 `enableMedicalFiles` 时，`DB.settings.enableMedicalFiles === undefined`，doMedical 开关检查 `!undefined === true` 也对，但**dmState 暴露给前端时该字段缺失**，前端 cond 函数访问 `s.settings.enableMedicalFiles` 返回 undefined，行为不可预测。

**修复**：`loadDB()` 加 settings 兜底段，确保任何新增开关都有合理默认值。

### 30.6 端到端验收（17/17 全绿）

```
=== R35 · 空搜不扣 AP ===
  ✅ 玩家认领
  ✅ 第一次搜得线索，AP 10->9
  ✅ 第二次搜同区域 unlockStep=2 当前不可见 → empty
  ✅ 第二次空搜 AP 应保持 9（未扣）
  ✅ 推 step=2 后第二轮搜证得到 r2 线索
  ✅ 第二轮搜证 AP 9->8
  ✅ 第三次搜同区域 → empty
  ✅ 第三次空搜 AP 保持 8（未扣）
  ✅ 连续空搜第 1 次 AP 仍 8
  ✅ 连续空搜第 2 次 AP 仍 8
  ✅ 连续空搜第 3 次 AP 仍 8

=== R36 · 医疗档案可选化（默认未启用）===
  ✅ 玩家调 medical 接口 → 拒绝（开关未启用）
  ✅ DM 调 medicalAs → 拒绝（开关未启用）
  ✅ DM state.medicalFiles=[]（默认空数组兜底）
  ✅ DM state.settings.enableMedicalFiles=false（默认关闭）
  ✅ 开关打开后接口不再用「未启用」拒绝（错误转为「档案不存在」）
  ✅ 开关打开后报「档案不存在」（接口已通）
```

**完整一局不回归测试（playthrough.js）**：48/48 全绿。

### 30.7 设计原则总结

**「菜单（功能）必须显示说明，非通用功能不应当做出来，不要一味遵从模板」**：

- 早期 Skill 模板内置 8 个 DM tab + 大量 schema 字段，源自 1 个早期剧本样例（中式餐饮+医生读 CT）
- 这些被无意固化为「通用机制」，但绝大多数剧本杀不需要
- 现在统一遵循：**先回答"这剧本需要 X 吗？"再决定做不做**——而不是模板里有就照抄
- 通用机制：5 阶段线性 + 认领码 + 搜证 + 投票 + 真相揭晓（覆盖 90% 剧本）
- 可选范式：打斗/裁决、私聊、N 回合循环、状态机、技能牌、**医疗档案**（按需启用）
- 任何新增菜单/功能：**先在 SKILL.md 标注"可选/必选"+ 落点；不要默认塞模板**

## 31. ✅ DM 端「玩家兑换码」复制按钮样式修复（CSS 选择器作用域）

> 用户反馈：主持人端「玩家」tab 中兑换码右边的「复制」按钮（猜测口述为「副职按钮」实为复制按钮的 SVG 图标）样式崩了 — 大、深色、不对齐。

### 31.1 根因

DM 端 Players tab 中复制按钮 HTML：
```html
<td><span class="cell-codes">${claimCode}</span>
  <button class="copy" data-copy="${claimCode}">${I.copy}</button></td>
```

而现有 CSS 选择器：
```css
.code-chip button.copy { ... }
.code-chip button.copy svg { width: 12px; height: 12px; }
```

**作用域限定为 `.code-chip` 内**。但本按钮**外层只有 `<td>`**（不是 `.code-chip`），所以 CSS 完全不命中，裸 `<button>` 用浏览器默认样式：默认背景色、边框、内边距、`padding: 4px`、SVG 默认 24×24 — 看起来就是一个深色大方块。

### 31.2 修复（双管齐下）

**① CSS 扩大作用域（assets/style.template.css）**：把 `.code-chip button.copy` 改为通用 `button.copy`，让所有复制按钮统一样式；同时补 `display:inline-flex/align-items/justify-content/vertical-align` 让 SVG 图标居中。

```css
.code-chip button.copy, button.copy {
  background: none; border: none;
  cursor: pointer; color: var(--muted);
  padding: 0 4px;
  display: inline-flex; align-items: center;
  justify-content: center; vertical-align: middle;
}
.code-chip button.copy:hover, button.copy:hover { color: var(--gold); }
.code-chip button.copy svg, button.copy svg { width: 12px; height: 12px; }
```

**② HTML 结构调整（assets/dm.template.js）**：把 `<span class="cell-codes">` + `<button class="copy">` 包到 `<span class="code-chip">` 中，与其它地方的复制按钮结构统一；并加 `title="复制兑换码"` 鼠标 hover 显示 tooltip。

```html
<td><span class="code-chip"><span class="cell-codes">${claimCode}</span>
  <button class="copy" data-copy="${claimCode}" title="复制兑换码">${I.copy}</button></span></td>
```

### 31.3 验收

- ✅ 重建后 style.css 含 `code-chip button.copy, button.copy` 通用选择器
- ✅ 重建后 dm.js 含新结构（`code-chip` 包裹 `cell-codes` + `button.copy` + `title=复制兑换码`）
- ✅ 不回归：playthrough.js 48/48 + R35/R36 验证 17/17 全绿

### 31.4 设计反思

**「按钮必须按作用域写 CSS」**：模板里 `.code-chip button.copy` 是细粒度作用域写法，但**全文件只有一处用 `.code-chip` 包裹**（clueList 渲染时），其它三处直接 `<button class="copy">` 都在等待 CSS 失明区。修正策略：
- 选 A（细粒度）：每处都包 `.code-chip` — 当前做法，**已踩坑**
- 选 B（粗粒度）：按钮样式独立 — **本次修复采用**，未来加新复制按钮零成本

## 32. ✅ phase+timeline 整合 + DM 真相复盘面板 + 全面 UI 重构（系统级大改）

> 用户一次性提了 11 项体验改进，本轮一次性重写 Skill 状态机逻辑 + DM/Player 双端 UI + 样式表。

### 32.1 反哺清单（7 项 P0 + 2 项 P1）

| # | 反哺 | 文件 | 严重度 | 状态 |
|---|------|------|------|------|
| R32 | phase 与 timeline 是同一维度不同抽象，DM 端双控件冗余 | `assets/server.template.js` `dmSetStep/currentPhaseFromStep` + `assets/dm.template.js` `renderOverview` | P0 | ✅ |
| R33 | timeline 按钮文案「上一时间/下一时间」语义不明 | `assets/dm.template.js` | P1 | ✅ |
| R34 | 总览 + 流程两个 tab 大量重复，控件与文案混用 | `assets/dm.template.js`（删 renderFlow，新增 renderDmTruth）| P0 | ✅ |
| R35 | DM 端无真相复盘面板（玩家端有，DM 没有）| P0 | ✅ |
| R36 | Toast 弹窗太大且文案杂冗 | `assets/style.template.css` | P1 | ✅ |
| R37 | select 浏览器默认外观在深色背景下极丑 | `assets/style.template.css` | P1 | ✅ |
| R38 | DM 资料 txt/pdf 走 `target="_blank"` 跳新窗口（应站内内联）| `assets/dm.template.js` `renderDocs` | P0 | ✅ |
| R39 | 玩家剧本 txt 走 iframe 渲染（无法跨域做主题色高亮）| `assets/player.template.js` `openScript` | P0 | ✅ |
| R40 | 剧本/真相/DM 资料文本中的人物名未做主题色高亮 | `assets/dm.template.js` `highlightText` + `assets/common.template.js` `highlight` 复用 | P1 | ✅ |
| R41 | truth schema 缺乏结构性字段（人物关系/动机/手法分散在 text 里）| `references/02-data-schema.md` §truth + `data.json` 红影示例 | P1 | ✅ |

### 32.2 R32 详解 · phase 与 timeline 整合

**症状**：`DB.game.phase`（setup/prologue/started/reveal）与 `DB.game.currentStep`（timeline 索引）本质是同一维度的不同抽象：
- phase 是「游戏节奏」（未开始 / 序幕 / 进行中 / 已揭晓）
- currentStep 是「剧情推进」（time 0..N-1）

**两个独立控件 = 同样信息走两遍 DM 操作**。

**修复**：
1. `dmSetStep()` 自动同步 phase 字段（-1=setup、0..N-2=started、N-1=reveal）
2. DM 端删除独立的「阶段控制卡」（phasePrev/phaseNext 控件、相关 click handler）
3. DM 端只保留「剧情控制」按钮（**上一步 / 下一步**）
4. `dmSetPhase()` 接口保留兼容性但 UI 不再调用
5. phase 字段保留是为了兼容下游所有判断（`phase==='setup'`、`phase==='started'` 等）

### 32.3 R33 详解 · 文案修正

- `上一时间 / 下一时间` → `上一步 / 下一步`（语义清晰、与阶段语义融合）
- `时间线步` stat 卡片文案 → `剧情步`（同时显示 `第 N/总数`）
- `阶段控制` 卡 → `剧情控制` 卡

### 32.4 R34 详解 · 总览 + 流程合并

原总览卡：游戏计时 + 阶段控制 + 时间线步进 + 操作日志（4 卡）
原流程卡：阶段控制 + 投计票 + 时间线步进 + 广播（4 卡）
**重复**：阶段控制 ×2、时间线步进 ×2

**合并后的总览**（一张面板 5 卡）：
1. stat-row（已认领 / 已解锁 / 剧情步 / AP 奖励池）
2. 游戏计时
3. 剧情控制（统一按钮：上一步 / 下一步 / 揭晓真相 / 重置游戏）
4. 投计票（之前只在流程页）
5. 广播（之前只在流程页）
6. 操作日志

**「流程」tab 整页移除**，改名为「真相复盘」tab（在 `truthUnlocked=true` 后才显示）。

### 32.5 R35 详解 · DM 真相复盘面板

**新增 `renderDmTruth()`** 按四个维度复盘：
1. 案件真相（truth.title + truth.text 高亮）
2. 时间线梳理（重渲染 timeline，含主题色高亮人物名）
3. 人物关系与动机（truth.characters[] + truth.relations[] 渲染网格）
4. 作案手法分析（truth.method 高亮）
5. 投票与 MVP（voteSummary + mvp 揭示）
6. 关联 DM 资料（dmRefs[] 列表）

**schema 扩展**：`truth` 段增加 4 个字段：
- `characters[]`（关键人物 id 列表）
- `relations[]`（from/to/type/label/note）
- `method`（作案手法分析）
- `motive`（动机分析）

**tab cond**：`cond: s => s.game && s.game.truthUnlocked` —— 真相揭晓前不显示此 tab。

### 32.6 R36 详解 · Toast 紧凑化

**改动**：
- padding: 10px 14px → 6px 12px（紧凑）
- font-size: 13px → 12.5px（小一号）
- max-width: 90vw → min(360px, 86vw)（不超 360px）
- 加 `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`（单行省略）
- 边框从 `border: 1px` 改为 `border-left: 3px`（左侧色条更醒目）
- 配色更克制：去掉了 radial-gradient 背景辉光（分散注意力）

### 32.7 R37 详解 · select 重做

**改动**：原生 select 在深色背景下浏览器默认外观丑陋（蓝白边框、Windows 默认样式）。
- `appearance: none` 隐藏原生外观
- `background-image: url("data:...chevron-down svg")` 自定义金色下拉箭头
- `linear-gradient(180deg, panel2 0%, bg2 100%)` 主题色背景
- `border-color: gold` hover/focus 时金色描边 + `box-shadow: 0 0 0 2px rgba(201,168,106,.15)` 光晕
- IE fallback `select::-ms-expand { display: none }`

### 32.8 R38 详解 · DM 资料站内内联

**症状**：`renderDocs()` 对 txt/pdf 类型 fallback 用 `<a href="..." target="_blank">打开</a>`，浏览器跳新窗口。

**修复**：
- txt 类型 → fetch 文本 + highlightText() 高亮，**站内 div 渲染**
- 图片类型 → `<img>` 内联（已存在）
- 音频类型 → `<audio controls>` 内联（已存在）
- PDF 等其他类型 → `<object data>` 内联展示（fallback `<a target="_blank">`）

`.dmref-text` 样式：圆角边框 + 等宽字体 + max-height 400px + overflow-y: auto（不超过视口）。

### 32.9 R39 详解 · 剧本 iframe → 内联 fetch

**症状**：`openScript()` 对 txt/md 用 `<iframe sandbox="allow-same-origin">` 渲染，**iframe 内无法被父页面的 highlight 函数注入高亮**。

**修复**：
- 改为 `<div class="script-page-text">` 内联 holder
- 翻页时调 `loadTextIfNeeded()` fetch + highlight 注入
- 缓存每页文本（`textCache`）避免重复拉取
- 错误降级显示「加载失败」

### 32.10 R40 详解 · 主题色高亮全覆盖

**新增 `highlightText()` 函数**（dm.template.js）按角色名长度倒序匹配，避免「青」先匹配「小青」。
```js
function highlightText(text) {
  let out = esc(text);
  for (const n of names.sort((a, b) => b.name.length - a.name.length)) {
    out = out.replace(new RegExp(escRe(n.name), 'g'),
      `<span class="cname" data-color="${n.id}" style="--c:${n.color}">${n.name}</span>`);
  }
  return out;
}
```

**应用范围**：
- DM 端真相复盘面板（5 个区全用）
- DM 端 dmRefs 资料文本（fetch 后高亮）
- 玩家端 openScript 剧本页（已存在 `highlight()` 函数）
- 玩家端 timeline / truth 也已用 `highlight()`

**配套**：style.template.css 已存在的 `.cname[data-color]` 样式（带主题色光晕 + 下划线）。

### 32.11 R41 详解 · truth schema 扩展

**新增 4 个字段**（兼容旧剧本）：
- `truth.characters[]`：关键人物 id 列表（如 `["liaohongyu", "nanyufeng", ...]`）
- `truth.relations[]`：人物关系网络（from/to/type/label/note）
- `truth.method`：作案手法分析（长文）
- `truth.motive`：动机分析（长文）

**红影 data.json 示例**：
```json
{
  "truth": {
    "title": "...",
    "text": "...",
    "characters": ["liaohongyu", "nanyufeng", "xiaoqianshan", "youlingcheshou", "xiaoyuanwu"],
    "relations": [
      { "from": "liaohongyu", "to": "xiaoqianshan", "type": "career", "label": "暗慕", "note": "暗恋安如曼" }
    ],
    "method": "作案手法：...",
    "motive": "凶手动机（廖鸿羽）：..."
  }
}
```

### 32.12 验收（28/28 R32 + 48/48 playthrough + 17/17 R35/R36 = 93/93 全绿）

```
=== R32 · phase+timeline 整合 ===
  ✅ 初始 phase=setup & currentStep=-1
  ✅ step=0 → phase=started（派生）
  ✅ phaseHistory 记录派生
  ✅ 最后一步 → phase=reveal（自动揭晓）

=== R32 · DM 真相复盘面板（数据源）===
  ✅ DM state.dmRefs[] 含真相/背景/一轮/二轮
  ✅ truth.characters[] 含 5 个凶手链关键人物
  ✅ truth.method / relations / motive 全部存在

=== R32 · DM 端 UI 渲染（HTML 静态检查）===
  ✅ 总览卡「剧情控制」、按钮文案「上一步/下一步」全部替换
  ✅ 旧「阶段控制」「上一时间/下一时间」文案全部下线
  ✅ 「流程」tab 已下线、「真相复盘」tab 已上线
  ✅ renderDmTruth + highlightText 函数存在

=== R32 · DM 资料站内内联 ===
  ✅ DM 资料 txt 走内联 .dmref-text holder
  ✅ DM 资料文本走 highlightText 高亮

=== R32 · 玩家端剧本 iframe → 内联 ===
  ✅ openScript 改为内联 fetch+highlight
  ✅ 旧 iframe 渲染路径已下线

=== R32 · select / toast / style ===
  ✅ select appearance:none + 自定义金色箭头
  ✅ toast 紧凑（font-size 12.5px、单行省略）
```

### 32.13 设计原则总结

**「菜单（功能）必须显示说明，非通用功能不应当做出来」** —— 这条原则在本轮延伸为：

| 原则 | 实践 |
|------|------|
| **单一控件** | 同一维度的两个抽象（phase + timeline）合并为一个控件 |
| **按钮文案** | 模糊词（「上一时间」「阶段控制」）改清晰词（「上一步」「剧情控制」）|
| **去重面板** | 「总览」+「流程」→ 一个「总览」面板 |
| **站内内联** | 不要 target="_blank」跳新窗口，所有内容在站内 div 渲染 |
| **样式贴合主题** | toast/select/input 全部走主题色（不再依赖浏览器默认）|
| **主题色高亮** | 角色名一律按 data.color 高亮（统一规则贯穿全端）|
| **schema 扩展** | truth 段加结构化字段（relations/method/motive）支撑复杂复盘 |

## 33. ✅ 江湖客栈实战（4 人剧本 + 古装武侠题材 + 多借刀杀人/嫁祸）

> 用 4 人小型剧本（角色纯 docx + 一/二轮线索 docx + 案件解析 docx + 背景简介 docx）跑通 Skill，**重点是验证之前 32 项反哺修复在异质题材（古装武侠 vs 现代赛车）下的可复用性**，与红影的合并 140 项断言全过。

### 33.1 实战剧本概况

- **剧本**：测试剧本/江湖客栈（4人）
- **角色**（4）：张金银（燕山堂二当家）、张红生（女，洪家少寨主洪二郎，潜伏复仇）、洪江水（真凶，洪家寨遗孤）、蔡思娘（女小二，慕恋张红生）
- **区域**（5）：客栈厕所（公共）+ 4 个个人房间
- **线索**（12）：toilet 2 + 4 房间 × 各 3（R1 占位 + R2 真实 2 条）
- **真相凶手**：洪江水 — 因贪宝石起杀意，趁孟三春茅厕醉酒反手一匕致死，切头伪装、撕衣丢粪坑、宝石嫁祸蔡思娘
- **机制**：借刀杀人（张红生借张金银刀）+ 嫁祸（洪江水嫁祸蔡思娘）+ 真相多源汇聚（真相由组织者手册+时间线分析+角色剧本综合）

### 33.2 与红影反哺成果的复用验证

| 之前 §28-§32 修复 | 本次实战表现 |
|---|---|
| R28 · `/res/...` 静态路径绕过鉴权 | ✅ 阶段 8 验证：无 token 拉 dmRef = 403 / 静态路径 = 404 / 路径逃逸 = 400 |
| R29 · `data.json.log` 字段缺失即崩 | ✅ 本剧本 data.json 含 log 字段，但 Skill 模板 `loadDB()` 已加兜底 |
| R30 · 公共区域 `area.owner` 缺失即崩 | ✅ toilet 区域无 owner 字段，4 玩家搜证均正常 |
| R31 · api-flow-test 硬编码「8 角色」| ✅ 4 人本下 48 断言 + 23 断言全部通过 |
| R32 · phase 与 timeline 整合 | ✅ 阶段 2 验证：step=0/1/2/3 自动派生 phase=started/started/started/reveal |
| R33 · 按钮文案「上一步/下一步」| ✅ DM 端 UI 显示「上一步/下一步」（静态 HTML 检查）|
| R34 · 总览 + 流程面板合并 | ✅ DM 端 8 个 tab：总览/玩家/区域线索/DM 资料/真相复盘/私聊/打斗（流程 tab 已下线）|
| R35 · DM 真相复盘面板 | ✅ 阶段 9 验证：玩家端 truth.method/motive/relations/characters 全部就位 |
| R36-R37 · Toast / select 样式 | ✅ 静态 CSS 检查通过 |
| R38 · DM 资料站内内联 | ✅ 阶段 8 验证：DM 拉真相 txt = 200（含「洪江水」字样）|
| R39 · 剧本 iframe → 内联 | ✅ 阶段 4 验证：4 个角色剧本页均可读（鉴权 200 + 内容含中文）|
| R40 · 主题色高亮 | ✅ 剧本打开时 `highlight()` 函数按角色名匹配主题色 |
| R41 · truth schema 扩展 | ✅ 阶段 9 验证：truth.relations.length === 5 + truth.method 含「反手一匕」+ truth.motive 含「屠戮/遗孤/动机」 |

### 33.3 本次新发现并记录的 1 项 P1 反哺

| # | 反哺 | 文件 | 严重度 | 状态 |
|---|------|------|------|------|
| R42 | `data.json` 顶层 `settings` 字段命名空间未来可能与剧情机制字段冲突；建议拆为 `settings`（全局）+ `scenario`（剧本场景）| 待未来抽象 | P1 | 📝 备注 |

（这一项是设计层面的观察，本轮不强制修复；后续 Skill 演化时可考虑 `settings` 扁平 vs `scenario` 嵌套的设计权衡。）

### 33.4 端到端实战游玩脚本（10 阶段 47 断言全绿）

```
=== 阶段 1 · DM 登录 + 重置 + 切 started ===
  ✅ phase=started / 4 个角色

=== 阶段 2 · DM 推进剧情步（phase 由 currentStep 派生）===
  ✅ step=0 → phase=started
  ✅ step=1 推进成功

=== 阶段 3 · 4 玩家建号 + 认领 ===
  ✅ 建/认领 4 玩家

=== 阶段 4 · 4 玩家打开剧本 ===
  ✅ 4 剧本页均可读（含中文 docx 抽取内容）

=== 阶段 5 · 第一轮搜证 ===
  ✅ toilet 4 玩家（2 搜到 + 2 空未扣 AP）
  ✅ 4 玩家搜自己房间（正确处理 allowOwner=false）

=== 阶段 6 · 第二轮搜证 + AP 奖励池 ===
  ✅ 第二轮搜证至少 3 个玩家成功（实际 4）

=== 阶段 7 · 跨玩家拉码（public 共享）===
  ✅ zhangjinyin 设为 public → caisiniang 在 public 区可见

=== 阶段 8 · 剧透隔离（4 项全过）===
  ✅ 403/404/400/200

=== 阶段 9 · 4 玩家投凶 + 揭晓 + 真相复盘 ===
  ✅ 4 玩家投凶（凶手自投张金银）
  ✅ 3 票投洪江水
  ✅ 玩家端 truth 含 characters/method/motive/relations 全部结构化字段

=== 阶段 10 · DM 重置清空 ===
  ✅ players=0 / phase=setup
```

### 33.5 不回归（合计 140/140 全绿）

| 测试套件 | 结果 |
|---------|------|
| 红影完整一局（playthrough.js 48 断言）| ✅ |
| 医疗档案/空搜不扣 AP（R35/R36 17 断言）| ✅ |
| phase+timeline 整合 + UI 重构（R32 28 断言）| ✅ |
| 江湖客栈完整一局（jianghu-verify.js 47 断言）| ✅ |
| **合计** | **140/140** |

### 33.6 设计原则总结

**「Skill 应能跨题材通用」** —— 两次实战（现代赛车红影 + 古装武侠江湖客栈）证明 Skill 已具备处理：
- **不同人数**（4 / 5 / 6 / 8 人）
- **不同题材**（现代/民国/武侠/古风/科幻）
- **不同区域类型**（公共场景 / 个人 personal / 房间组）
- **不同动机链**（单一凶手 / 多共谋 / 借刀杀人 / 嫁祸）
- **不同资源类型**（纯文本剧本 / PDF 截图 / 图片线索）

- 任何 6 种剧本杀机制范式（5阶段/回合/状态/技能/物品/打斗/死亡）+ 玩家私聊 + 角色专长档案 都可通过**开关启用**而不绑死模板。

## 34. ✅ 公开线索能力补全（支持公开 / 公开后不可收回 / 所有人可见）

> 用户反馈：验证公开线索的游戏机制 — 三条核心规则：
> 1. **支持公开**：玩家可把已搜得的 private 线索设为 public
> 2. **公开后不可收回**：一旦公开，信息即对所有人可见，无法撤回（避免玩家犹豫后撤回破坏信息传播）
> 3. **所有人可见**：任何玩家在公共线索区都能看到 + 拿到 4 位数字 code 用于跨玩家资源拉码

### 34.1 修复

**服务端（`assets/server.template.js` `doVisible()`）**：
```js
/* §34 反哺：公开后不可收回（鼓励「信息一旦发布即不可撤回」的游戏机制） */
if (clue.visible === 'public' && visible === 'private') {
  return { ok: false, error: '公开线索不可收回（一旦公开即对所有人可见）' };
}
```

**客户端（`assets/player.template.js` `renderMine()`）**：已公开的线索开关设为 disabled，鼠标 hover 显示「已公开：公开后不可收回」title 提示：
```js
if (c.visible === 'public') {
  sw.disabled = true;
  sw.title = '已公开：公开后不可收回';
  const label = card.querySelector('.switch-vis');
  if (label) label.title = '已公开：公开后不可收回';
}
```

### 34.2 端到端验证（17/17 全绿）

```
=== 环境初始化 + 4 玩家建号认领 ===
  ✅ 4 玩家建号认领

=== 基础能力 ===
  ✅ zhangjinyin 搜 toilet 获得线索
  ✅ 搜得的线索默认 private
  ✅ 默认 caisiniang 看不到 zhangjinyin 的 private 线索

=== zhangjinyin 设 public ===
  ✅ zhangjinyin 设 public 成功

=== §34 核心验证：公开后所有人可见 ===
  ✅ caisiniang 在 public 区可见
  ✅ zhanghongsheng 也可见
  ✅ hongjiangshui 也可见

=== §34 核心验证：公开后不可收回 ===
  ✅ 尝试收回 → 服务端拒绝（error 含「不可收回」）
  ✅ 线索仍为 public（收回操作未生效）

=== §34 验证：公开线索 4 位 code 跨玩家 ===
  ✅ caisiniang 在 public 区看到线索正文（含中文）
  ✅ 公开线索暴露 4 位数字 code

=== §34 验证：幂等 / 权限 ===
  ✅ 重复设 public（幂等）→ ok
  ✅ 非持有者改可见性 → 服务端拒绝

=== §34 验证：UI / 服务端规则 ===
  ✅ 玩家端 UI 含「已公开：公开后不可收回」title
  ✅ 玩家端 UI 含 sw.disabled = true
  ✅ server.template.js 含「公开后不可收回」规则
```

### 34.3 不回归

| 测试套件 | 结果 |
|---------|------|
| 红影完整一局（48 断言）| ✅ |
| 江湖客栈完整一局（47 断言）| ✅ |
| R34 公开线索验证（17 断言）| ✅ |
| R35 空搜不扣 AP（11 断言）| ✅ |
| **合计** | **123/123 全绿** |

### 34.4 设计原则

**「公开后不可收回」是产品决策**，已在本次明确为全局默认行为。如未来需要某些剧本支持「临时公开 + 收回」，可扩展为 `settings.publicOnceOnly: false` 开关。

**核心原则**：信息一旦发布即不可撤回 — 这与社会化媒体的撤回成本不同，**剧本杀场景下**鼓励玩家「谨慎公开」，避免「想撤回」破坏游戏机制。

## 35. ✅ DM 端玩家操作按钮文案优化（「+池」释义 +「+1/-1」显式标注 AP）

> 用户反馈两个体验问题：
> 1. **「+池」是什么？** — 含义不明，玩家不知道这是干什么的
> 2. **「+1 / -1」改「+1AP / -1AP」** — 应显式标注调整的是 AP，避免与兑换码、其他数值混淆

### 35.1 修复

**`assets/dm.template.js` 玩家行操作按钮**：

| 旧 | 新 |
|----|----|
| `+1` | `+1 AP`（title：「给该玩家 +1 AP（主持人直接调整）」）|
| `-1` | `-1 AP`（title：「给该玩家 -1 AP（主持人直接调整）」）|
| `+池` | `池+1 AP`（title：「从 AP 奖励池扣 1 给该玩家（零和：池-1、玩家+1）」）|

**`stat-row` 中的 AP 奖励池 tooltip 补全**：
- 旧：`主持人可发放给玩家的 AP 奖励池（零和：发放后池减，玩家 AP 加）`
- 新：`主持人可发放给玩家的 AP 奖励池（零和：发放后池-1，玩家+1 AP；用于奖励破案线索、关键推断）`

### 35.2 验证（不回归）

```
✅ 按钮文案更新（+1 AP / -1 AP / 池+1 AP）
✅ +1 AP 按钮 data-ap='1' 保留
✅ 池+1 AP 按钮 data-pool='1' 保留
✅ AP 奖励池 tooltip 描述完整
✅ 江湖客栈完整一局 47/47 不回归
```

### 35.3 设计原则

**「按钮文案必须自解释 + tooltip 补充机制」** — 任何 DM 操作按钮都要让 DM 一看就知道「点了会发生什么」：
- 数字 + 单位（`+1 AP`、`-1 AP`）— 避免与其他数值混淆
- 机制动词前置（`池+1 AP` 而不是 `+池`）— 强调「动作 + 目标」
- title 补充完整语义（零和、机制说明）— 鼠标 hover 即见完整说明

### 35.4 剧本泛化原则

**用户要求：关于这个剧本学到的东西，演进到技能。但技能是通用技能，一定不可提到具体的剧本。**

本次扫描结果（`SKILL.md` + `references/` + `assets/` + `prompts/` 全量）：
- ✅ 零具体剧本名残留（无「红影 / 江湖客栈 / 塞西尔 / 廊桥 / 古堡 / 绝命」等剧本专有名词）
- ✅ 只保留**通用题材描述**（「哥特古堡/克苏鲁」「青瓷民国」「敦煌」「fantasy」「cyber」等是题材候选池标签，描述美术风格而非绑定剧本）

**机制范式反哺**（从剧本实战学到的，沉淀为通用 Skill，与具体剧本无关）：
- 公开线索「不可收回」机制（§34）— 通用，跨题材适用
- truth schema 扩展（characters/relations/method/motive，§32）— 通用，复杂剧本必备
- DM 真相复盘面板（§32）— 通用，5 维复盘
- 按钮文案自解释 + tooltip（§35 本次）— 通用 UX 原则
- 主题色 + 信息传播机制（§34）— 通用游戏机制原则

这些机制**与具体剧本无关**，沉淀到 Skill 后下次任何题材的剧本构建都直接受益。

## 36. ✅ 删除「池+1 AP」机制（精简 + 防止误用）

> 用户反馈：**「池+1ap干掉吧 没这个功能」** — 这个机制没实际意义 + 文案误导 + 增加认知负担。彻底干掉。

### 36.1 修复清单（5 个文件）

| 文件 | 修改 |
|------|------|
| `assets/dm.template.js` | ① 删除「池+1 AP」按钮 HTML<br>② 删除 `data-pool` click handler<br>③ 删除 stat-row 中的「AP 奖励池」卡片<br>④ 删除 stateSig 中的 `bonusApPool` |
| `assets/server.template.js` | ① `dmSetAp()` 删除 `fromPool` 分支与「奖励池已耗尽」错误<br>② `dmSetSettings()` 删除 `bonusApPool` 入参处理<br>③ `buildDefaultData()` 删除 `bonusApPool: 10` 默认值<br>④ `loadDB()` 删除 `bonusApPool` 兜底 |
| `assets/validate-data.template.cjs` | 删除 `bonusApPool` 数字校验 |
| `assets/data.template.json` | 删除 `bonusApPool: 10` 默认 settings |
| `江湖客栈_app_src/data.json` | 删除 `bonusApPool: 5` |
| `SKILL.md` | 约束 #8「调整玩家 AP（直接 +/-，无奖励池机制）」 / 约束 #9 删除「AP 奖励池」 |
| `references/02-data-schema.md` | 删除 `bonusApPool` schema 字段示例 |
| `references/03-state-machine.md` | 删除「AP 奖励池」章节（合并到「AP 上限」） |
| `references/04-server-api.md` | `/api/dm/players/ap` 入参移除 `fromPool?`、出参移除 `pool` |

### 36.2 静态校验

```
✅ DM 端无「池+1 AP」按钮 / data-pool / AP 奖励池文字
✅ +1 AP / -1 AP 按钮保留
✅ server.js 0 bonusApPool / fromPool / 池相关
```

### 36.3 不回归

- 江湖客栈完整一局 **47/47** ✅

### 36.4 设计原则

**「不要的功能必须彻底删掉，不要留 dead code」** — 当用户明确反馈某个机制没用：
- 不仅 UI 删按钮，还要清理服务端 dead code（dmSetAp 的 fromPool 分支、dmSetSettings 的 bonusApPool 处理、loadDB 兜底）
- 删除所有文档/示例/schema 中提及该字段的地方
- 校验器（validate-data）也要去除，否则新 data.json 不能带历史 bonusApPool 字段
- 历史 IMPROVEMENTS 记录保留（说明删除原因），但当前 SKILL.md / references / assets 必须全部清零

## 37. ✅ 实战反哺：封闭本（docx 文本型 · 时间线推凶 · 6 人）全流程游玩验证

> 第三次实战（继 §25 敦煌、§28/29 赛车、§33 江湖客栈之后）：题材为民国刑侦/时间线推凶封闭本，
> 全部源文件为 docx（无 PDF、无图片线索）。本轮收获集中在 **phase/timeline 双轨漂移的三个具体后果**
> 与 **拉码机制的一个可用性缺陷**，全部修复并回写模板。

### 37.1 R50 · `dmSetStep` 从不写 `startedAt`（纯 UI 流程计时器永久为 0）

- **现象**：DM 全程只用「上一步/下一步」主持时，`game.startedAt` 永远是 0，计时卡片显示 `--:--`。
- **根因**：`startedAt` 只在遗留 `dmSetPhase()` 里写入，而该接口 UI 早已不调用（§32 演进后 phase 由
  `currentStep` 派生）。「两套写法并存」的漂移从隐患变成了实际 bug。
- **修复**（server.template.js）：`dmSetStep` 内 phase 变化分支补 `if (startedAt===0 && derived!=='setup') startedAt=t`。

### 37.2 R51 · 遗留 `dmSetPhase` 不同步 `currentStep`（unlockStep 搜证判据与 phase 脱钩）

- **现象**：对 `/api/dm/phase {phase:'started'}` 切阶段后，所有 `unlockStep>=0` 的线索搜不到（空搜）。
- **根因**：`doSearch` 的分轮判据是 `clue.unlockStep <= game.currentStep`，而 dmSetPhase 只改 `phase`
  不动 `currentStep`（停在 -1）。
- **修复**：dmSetPhase 按目标 phase 反向同步 currentStep（`setup→-1`、`started→max(0,cur)`、
  `reveal→max(cur,N-1)`；prologue 无法派生，保持不动）。
- **同时**：api-flow-test 从 `/api/dm/phase` 改走 DM 界面唯一路径 `/api/dm/step`，并按
  `maxStartedStep = timeline.length-2` 逐步推进直到出现可搜线索（兼容任意分轮剧本）。

### 37.3 R52 · reveal 双控件漂移（顶栏"已揭晓"而真相面板仍锁着）

- **现象**：DM 把剧情推进到末节点（reveal）后，玩家端顶栏显示"已揭晓"，真相 tab 却仍是"真相尚未揭晓"
  ——还要 DM 再单独点一次「揭晓真相」按钮。
- **修复**：`dmSetStep` 进入末节点时自动 `truthUnlocked=true` + 记日志「真相自动揭晓」。
  `/api/dm/truth` 保留用于提前揭晓/收回。**单一控制源**：剧情推进本身就承载真相揭晓。

### 37.4 R53 · 认领页硬编码 tip 与 `%CLAIM_SUB%` 重复

- player.template.html 的 `claim-tip` 写死「……以受邀宾客的身份进入这场晚宴」，与自定义副标题同屏重复。
- 改为通用提示：「认领码由本场主持人提供，可在主持人端「玩家列表」查看」。

### 37.5 R54 · 拉码线索不留痕（核心机制的信息会丢）

- **现象**：`/api/fetch` 是纯"查看"语义，拉到的线索只渲染在兑换码页的临时 `#codeResult` 里，
  一导航就消失；玩家辛苦收集的他人线索没有任何沉淀。
- **修复**：
  - server：fetch 成功时把资源 id 记入 `player.fetched[]`（去重、saveDB）；
    `playerState.myClues` 合并 fetched 线索并标 `fetched:true`（公开开关仍归持有者，
    clueCard 以 `holder===me` 判据天然不渲染开关）。
  - common.template.js：`clueCard` 增加「来自兑换码」徽标。
  - player.template.js：拉取成功 toast 改为「资源获取成功，已加入「我的线索」」并立即 `poll()`（免等 5s 轮询）。

### 37.6 R55 · 搜证页区域三分态 + 「剩余 N」语义澄清

- **现象**：① 第一轮讨论期间，全部二轮区域显示可点击的「搜证」按钮，点了只弹"没有可搜的线索"；
  ② 本人房间也渲染成可点按钮（服务端会拒，但 UI 不拦）；③ 「剩余 6」含义不明（是剩余次数还是线索数？）。
- **修复**：`playerState.areas[].clues[]` 暴露 `unlockStep`（轮次门控信息，非剧透，不暴露 text）；
  前端三分态——`未开放（剧情推进后可搜）` / `本人相关区域，不可自搜` / 正常按钮；
  文案改「余 N 条线索」。

### 37.7 R56 · DM 总览「剧情步 0/4」误读

- 筹备期（currentStep=-1）显示 `0/4`，与"已推进到第 1 步"混淆。改为 `currentStep<0` 时显示「未开始」。

### 37.8 已知行为记录（未修）

- **服务重启 = 内存会话清空**：所有玩家/DM 需凭认领码重新登录。LAN 局内可接受（认领码就是为重连设计的）；
  若未来做会话持久化，应把 sessions Map 随 data.json 落盘。
- **MVP 下拉与 3s 轮询的竞态**：DM 在 select 选中后、点击确认前若恰逢整卡重渲染，选择会被重置。
  低频、可重试；若要根治需把玩家侧表单态移出重渲染路径。
- **api-flow-test 依赖 DM reset**：跑一次测试会清空当前局。测试前若有真实对局在跑需先备份 data.json。

### 37.9 验证

- 本剧本 app：`validate-data` + `check-res` 通过（14 处资源）；api-flow-test 全绿（26 断言，无 FAIL）。
- 真人流程（浏览器）：认领→读剧本→一轮（区域正确显示"未开放"）→二轮搜证（AP 扣减/空搜不扣/
  自搜拦截）→拉码（入列+徽标）→公开线索→私聊（DM 可监控）→投票（自投禁、揭晓后锁）→
  推进末节点自动揭晓→真相面板（计票+MVP+关系图）→ 浅色/深色/noir 三主题 × 1440/768/375 三档宽度全过。

### 37.10 R57 · 指认投票未按剧情节点门控（用户实测反馈）

- **现象**：玩家端投票条件只看「started 且真相未揭晓」——从第一轮讨论起就能投凶，
  `timeline` 里的「指认投票」节点形同虚设。
- **修复（数据驱动，通用）**：新增 `settings.voteFromStep`（默认 0，兼容旧剧本）——
  指定投票开放的剧情步（timeline 索引）。服务端 `doVote` 校验 `currentStep >= voteFromStep`；
  玩家端投票面板同判据，未到节点显示「指认投票未开放（推进到剧情步 N 后开启）」并禁用按钮；
  api-flow-test 投票前先推进到 `voteFromStep`。
- **复验**：step1 投票 API 拒绝（"尚未到指认阶段"）+ 玩家端按钮锁定带提示；step2 自动解锁可投；
  flow test 全绿。
- **配套发现（流程坑）**：重建时旧 server 进程未停，其 `saveDB()` 会用内存旧数据覆盖重建产物
  `data.json`——见 loop.md 新增「§8.5 重建/改数据前必须停服」。抢救方式：`cp data.preset.json data.json`。

### 37.11 R58 · DM「区域线索」线索卡操作键归位（用户实测反馈）

- **现象**：线索卡的「解锁/锁定」按钮跟在标题/code 后左对齐，视觉重心散；标题与操作行间距偏小。
- **修复**（dm.template.js）：线索卡改为纵向 flex——标题行在上，「code chip（左）+ 解锁/锁定按钮（右下角）」
  固定在卡片底部一行，`margin-top:12px`；锁定/解锁两种状态布局一致。

### 37.12 R59 · 私聊收件人/草稿被消息轮询重置（用户实测反馈）

- **现象**：玩家端私聊选好收件人后，任何一条新消息到达都会把 `<select>` 重置回「主持人」，
  打到一半的草稿也被清空；DM 端同理（重置回「全员广播」）。
- **根因**：与 R55/MVP 下拉同类——私聊页有独立的消息轮询（`loadMessages`），每来新消息就
  整体重渲染 `#view-msg`，表单态没被保留。
- **修复**（player/dm 模板同改）：收件人选择与草稿提升为模块状态（`msgToSel`/`msgDraft`、
  `dmMsgToSel`/`dmMsgDraft`），每次重渲染后恢复（选项不存在时回退默认）；仅发送成功才清空草稿。
- **教训沉淀**：凡是"轮询驱动的整段 innerHTML 重渲染"内含表单控件，必须把表单态提到渲染函数之外
  并在渲染后恢复——搜索页、投票面板、私聊、MVP 下拉都已按此处理，后续新增视图同理。

### 37.13 · Skill 全量 review：去冗余 / 去剧本化 / 代码去重

> 全量审计（SKILL + loop + references/01..15 + prompts + assets）后的一次性清理。

**代码（assets）**
- `server.template.js`：提取 `areasOut(withText)` 公共视图函数，消除 playerState/dmState 两份手写的
  areas 映射（历史上已因双份映射漂移过一次——unlockStep 只加了一份）。字段变更今后只改一处。

**结构性去重（归口原则：每类事实只有一个权威文件，其余指针化）**
- `prompts/p3`（≈refs/06 全量重复）删除；`prompts/p4`（≈loop.md 全量重复）删除；
  `prompts/p1` 重写为薄流程卡（节奏约定 + 高频注意），步骤细节归口 SKILL §2；
  `prompts/p2` 抽取工具段对齐零依赖管线（禁止引入 pandoc/python-docx/pdftotext/pypdf）。
- 剧透隔离六用例：归口 `loop.md` §7（新增 §4.6 私聊检查），`references/09` 只留协议与指针。
- 锁遮罩 CSS（08↔09）、移动端约定表（11↔07）、高亮示例（08 硬编码色表 → 指向 common.template.js
  动态构建）、refs/06 内联的 pdf-to-png 代码（→ 指向模板文件）：全部指针化。

**过时修正**
- `.mjs` → `.cjs` 共 14 处（模板实际是 CommonJS，pdfjs-dist@^3.11 v3/v4 自动探测）。
- 路由计数 25 → 35（refs/01/04）；refs/04 补「扩展端点索引」（combat→12、messages→14、
  mvp/ack 首次入册）+ 新增 `POST /api/player/vote` 文档。
- refs/03 阶段表/切换图/API 伪代码与实现对齐（transition 移除、prologue 标注遗留可达、
  dmSetStep 派生+startedAt+自动揭晓）。
- refs/08 `CHAR_COLORS` 硬编码示例 → 动态构建描述；refs/14 失效引用 loop.md §4.6 → 已建该节。
- SKILL #22 机制范式现状对齐（M1/M6/M8+医疗档案已实现，实现状态只在 refs/12 总览表维护）；
  "6 种抽取范式" → 10 种；"28 项清单" 等自述计数移除。

**通用性**
- 范式编号撞号治理：10=抽取范式 / 12=机制范式 M1..M8 / 15=M9..M11 设计稿，各文件加编号说明。
- `references/15` 加「设计稿未实现」状态头（此前是零引用孤儿文档）。
- refs/10 实战案例进一步匿名化（去除题材指向）。

**验证**：重建 app 质检关卡通过；api-flow-test 全绿；areasOut 双端视图断言通过
（playerState 无 text 含 unlockStep / dmState 有 text）。

### 37.14 · R60-R66 用户实测反馈七连：会话/通知/资料/计时/真相复盘体验升级

| # | 问题 | 修复 |
|---|------|------|
| R60 | 私聊下拉选收件人，多人时分不清在跟谁说话 | 玩家端私聊改**会话 tab**（主持人/各玩家，带未读红点、每会话独立草稿）；composer 标题「发给：X」，去掉下拉。DM 端 composer 同样 tab 化（全员广播/各玩家），监控列表保留 |
| R61 | **线索公开开关点了没反应** | 根因：`renderMine` 在游离 DOM 上绑 `onchange` 后 `return card.outerHTML` 序列化——**事件监听全部丢失**。修复：卡片只带 `data-clue` 标记，事件在 innerHTML 落地后 `wireVisibility()` 统一绑定；切换成功立即 `poll()` 同步公共线索页 |
| R62 | DM 资料 txt 卡片显示原始英文 "text"，像遗留占位符 | kind → 中文标签映射（文本/图片/音频/文档） |
| R63 | 玩家端「资料」跳外部窗口 | 改站内弹窗内联阅读（`openScript` 的 txt fetch+highlight 管线），不再 `window.open` |
| R64 | 玩家端没有计时 | `playerState.game` 暴露 `startedAt/phaseUpdatedAt/phaseHistory`（非剧透），玩家顶栏加计时 chip（🕐 总时长走秒，tooltip 含当前阶段耗时），与 DM 同源 |
| R65 | 新消息无提醒 | 玩家端任何 tab 下持续增量拉消息；新消息（首拉历史除外）在**屏幕上方居中**弹 pop：DM 消息前缀「DM：」，玩家私信前缀「来自<角色>：」；`common.js` 新增 `pop()`（与底部 toast 队列分离，`#pops` 容器） |
| R66 | DM 端缺玩家视角的真相页，且怕误看剧透 | DM 端「真相复盘」改为**常驻 tab**：未揭晓时内容高斯模糊 + 「剧透保护」卡（手动"显示真相"带警告横幅，回退剧情步自动重新遮蔽）；揭晓后自动明文 |

**通用教训（R61）**：`element.outerHTML` 会丢弃运行时绑定的所有事件监听——"构建 DOM → 绑事件 → 序列化回字符串" 是反模式；要么纯模板字符串 + 落地后按 data-* 绑定，要么全程 DOM append。

### 37.15 · R67-R69 用户复测反馈：DM 直发修复 + DM 端 pop + pop 避让顶栏

| # | 问题 | 修复 |
|---|------|------|
| R67 | **主持人给玩家发消息坏了** | R60 重构时 `renderDmMsg`/发送函数的补丁只有一半落上（模板 sendDmMsg 仍读已删除的 `#dmMsgTo`，抛 null）。修复：`sendDmMsg` 改用 `dmMsgTab`，成功后 `dmMsgDrafts[to]` 清草稿。**教训：同一功能的关联补丁必须一次验证全链路（渲染→输入→发送→落库），不能只验渲染** |
| R68 | DM 端也要消息 pop | `loadDmMessages` 增量弹 pop（首拉历史不弹）：玩家致 DM「来自 x（致DM）：」、玩家间（监控）「x → y：」；`sendDmMsg` 成功即弹确认「已向全员广播：…」/「已发送给 x：…」（自己发的不再重复弹） |
| R69 | pop 太靠上，遮挡顶栏 | `#pops` top 12px → 64px（顶栏之下） |

**验证**：DM→玩家直发（UI 发送成功 + 记录入列 + 草稿清空 + pop 确认 + 玩家收到）；玩家→DM 致私信 DM 端 pop；pop 位置 64px 不挡顶栏。

### 37.16 · R70-R72 用户反馈三项

| # | 项 | 处理 |
|---|-----|------|
| R70 | 人物关系图在 host 端也要有 | `truthPanelHTML` 的「人物关系与动机」卡补上与玩家端同款的环形布局 SVG（truth.relations 驱动，无 relations 时不出图），下方保留逐角色明细 |
| R71 | 玩家端资料按钮"站内阅读"文案生硬 | 改为「阅读」（站内弹窗行为不变） |
| R72 | "按用户分页私聊没了"误报 | 排查确认玩家端/DM 端会话 tab 均在（实机截图验证）；此前 DM 端曾因 R67 的半落补丁整体渲染失败、页面空白，易造成"功能消失"观感——已随 R67 修复。刷新页面即见 |

### 37.17 · 远端 Cloudflare Worker 部署自验收：灌库/KV一致性/测试脚本三坑

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| D1 | 远端 `POST /api/dm/login` 抛 `Cannot read properties of null (reading 'medicalIds')` | `data.json` 根本没灌进 KV：`dmState()` 里 `st=loadStatic()` 返回 null。KV namespace 里只有 Worker 运行时自写的 `tok:dm:*`，没有任何 `g:*` | 用 `kv key list` 全量比对所有 namespace，定位 `data-migrate` 灌库从未落地（见 D2）；灌库后短期会被 KV 一致性延迟掩盖（见 D3） |
| D2 | `data-migrate.cjs` 灌库"看起来成功、实际一个 key 都没写进 KV" | **Windows 上 `cp.spawnSync('npx', ...)` 解析不到 `npx.cmd`，静默失败**（返回 error、无输出），而调用方从不检查 status | `wrangler()` 加 `shell: process.platform==='win32'`，并校验 `r.error` / `r.status!==0` 立即 throw，不再吞错 |
| D3 | Worker 运行时读不到刚灌的 key，debug 端显示所有键只有 7 条 `tok:dm:*` | KV 全局**最终一致**：CLI `--remote` 写的键传播到边缘 colo 有延迟（实测约 10-60s） | 灌库后**轮询** debug/接口直到就位，不要写完立即断言；测试脚本对瞬时失败重试很短秒数即转绿 |
| D4 | `GET /api/dm/state` 认证 fail（级联导致 create 全挂） | 测试脚本把手持方法写成了 `api('POST', '/api/dm/state', ...)`——而 `GET  /api/dm/state` 路由方法不匹配会命中「接口不存在」 | 改回 `api('GET', ...)`。**教训：路由是"方法+路径"查表，手写作（POST到GET/PATCH）必然 404，且一错全链崩** |
| D5 | 资源测试 7a/7b 被跳过 | `scriptPath` 从"搜证响应"取（`r.body?.state?.script`），而 search 响应**不含 `.state`** | 在 step-4 `GET /api/player/state` 时捕获 `scriptPath`，后续 /res 用例复用它 |
| D6 | 测试脚本在需代理的网络"连接超时" | Node 原生 `fetch`(undici) **不会自动走系统/环境代理**（PowerShell 走 WinINET 系统代理所以能通） | 测试脚本检测 `--proxy` / `HTTPS_PROXY` / `HTTP_PROXY`，用 `undici.ProxyAgent` 注入全局 dispatcher |
| D7 | 临时 debug 端点裸奔上生产 | 排查期加的 `/api/__dbg` 会列出 `tok:player/dm:*` 令牌键名 | 上线前必须摘除所有 debug/诊断路由；`server.template.cf.js` 只留业务路由 |

**通用教训（D2）**：Windows + Node 里 `spawnSync('npx', …)` = npx.cmd，不 `shell:true` 就是"假成功真静默"——所有包装 CLI 的脚本必须校验退出码且失败即抛。

**附带产出**：`assets/extract-doc.py`（olefile 解析 `.doc` 的 `WordDocument` 流，UTF-16-LE/GBK 选优，无 olefile 退化启发式扫描）；SKILL.md Step1 新增「读取各种剧本文件（通用）」分派表。
