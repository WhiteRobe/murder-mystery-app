# loop.md · 自验证测试 Loop（检查清单步骤）

## 目的

使用【测试剧本】目录的样本验证 Skill 产出的 APP 是否满足所有硬约束。每个循环执行一次，循环不通过则修复后重跑。

## 前置

确认当前工作目录下有：
- 一个完整 APP（`server.js` + `start.bat` + `public/` + `data.json` + `public/res/scripts/`）
- 【测试剧本】目录（含至少 1 个剧本子目录）

## 循环步骤

### §0.5 · 资源格式混合预检（新增，§25 反哺）

任意剧本工作流 Step 1 执行前先扫一遍剧本目录：

```bash
ls 测试剧本/<剧本名>/                       # 看顶层结构
ls 测试剧本/<剧本名>/人物剧本/             # 角色剧本格式（PDF / docx / doc / 图片？）
ls 测试剧本/<剧本名>/线索/                 # 线索格式（图片 / PDF / docx？）
ls 测试剧本/<剧本名>/                       # 真相 / 组织者手册在哪？
```

输出「资源格式矩阵」，决定后续用哪些工具：

| 文件类型 | 工具 | 备注 |
|---|---|---|
| PDF（角色/线索/组织者） | `pdf-to-png.template.cjs` | 标准流程 |
| docx | `extract-docx.py`（R1 增强后支持 .doc） | 零依赖 zipfile+xml |
| doc（旧 OLE） | `extract-docx.py`（R1 antiword/strings 兜底） | 失败用 `[EMPTY]` 标记 |
| jpg/png（线索图） | 直接 `Copy-Item` 到 `public/res/clues/` | 用 `images[]` 数组注册到 findRefByPath |
| xlsx（平面图） | **跳过 / 手动转 PNG**（R14 P2 待实现） | 列入 Skill 反哺清单 |
| 空文件（如 `新建 Microsoft Word 文档.docx`） | **不引用** | validate-data 会 `[EMPTY]` 警告 |

**额外检查**：
- [ ] 真相文件是否存在独立 `真相.pdf/docx`？若否 → 进入范式 7「真相多源汇聚」（详见 `references/10-script-paradigms.md`）
- [ ] 是否有 `时间轴 / 技能表 / 调查问卷` 等附属 docx？→ 全部纳入 `dmRefs[]`
- [ ] 剧本规模（人数 / 区域数）→ 决定 `settings.maxRounds / apDefault`

**通过条件**：资源格式矩阵填写完整，工具选型明确，无遗留待定项。

### 1 · 启动检查

```bash
node server.js
```

**期望**：
- 终端打印 `http://<ip>:<port>/` 与 `http://<ip>:<port>/host`
- 无 npm 包报错（除 PDF 工具外）
- `data.json` 自动生成（如不存在）

**失败信号**：未打印双 URL / 报错 / data.json 没生成 → 检查 `server.js` 启动段。

---

### 2 · 路由可达性

```bash
curl http://localhost:<port>/            # 期望 player.html
curl http://localhost:<port>/host       # 期望 dm.html
curl http://localhost:<port>/css/style.css
curl http://localhost:<port>/js/common.js
curl http://localhost:<port>/js/player.js
curl http://localhost:<port>/js/dm.js
curl http://localhost:<port>/api/dm/state       # 期望 401（无 token）
curl http://localhost:<port>/api/player/state   # 期望 401
```

**失败信号**：404 / 403 → 检查 `createServer()` 路由表（`references/01-architecture.md`）。

---

### 3 · DM 端流程

浏览器打开 `/host`：
- 自动登录 → 进入 overview 视图
- Players tab：创建一个玩家 → 看到 4 位认领码
- Flow tab：把 phase 切到 `prologue` → 切到 `started` → step +1
- Areas tab：挑一条 clue → unlock → 看到服务端生成 code
- Overview tab：Reveal Truth → 玩家端 truth 应能拉取

**失败信号**：操作后端 500 / 前端无反馈 → 检查 routes 表对应路由（`references/04-server-api.md`）。

---

### 4 · 玩家端流程

浏览器打开 `/`：
- 输入认领码 → 进入主界面
- 我的剧本弹窗：显示 PNG 翻页（非 PDF）
- Search tab：消耗 AP 搜索某 area → 拿到新生成的 4 位数字 code（如 `4382`）
- My Clues tab：显示该线索正文 + 配图 + code chip + public/private 开关
- Public Clues tab：切换 public 后自己能看到
- 切到 `/` 另一个浏览器（或隐身窗口）认领另一个角色 → 输入刚才的 code → 拉到线索

**失败信号**：跨浏览器拉码失败 → 检查 `findCodeTarget()` 与 `checkResAccess()` 的 code 分支（`references/09-spoiler-isolation.md`）。

---

### 4.5 · 线索 code 随机性检查（防近邻 + 防反推）

在 DM 端连续搜证 ≥ 10 条线索，记录每条 code：
- 都是 4 位数字（`/^\d{4}$/`）
- **连续两条 code 差值 ≥ 50**（不允许 0001/0002 那种连续递增）
- 任意两条 code 差值 ≥ 5（防反推：玩家拿到别人公开 code 无法反推自己未公开 code）
- 千位分布尽量均匀（1-9 各 10% 左右）

可用 `tools/test-code-random.cjs`（构建产物 tools/ 自带）跑 30 条抽样自动校验。

**失败信号**：code 出现 `0001/0002/0003/...` → 检查 `server.template.js` 的 `nextClueCode()` 实现（应是真随机 + NEAR_GAP=50 + INFER_GAP=5 防反推）。

---

### 5 · 移动端 + 视觉双形态检查

**移动端**（浏览器宽度拖到 400px）：
- 侧边栏应自动隐藏，主区出现 hamburger 按钮
- 点 hamburger → 抽屉滑出 + 黑色遮罩
- AP pill 应收缩
- 网格变单列

**视觉主题验收**（两种形态各截一张图，对照 `references/11-visual-design.md` 的验收清单）：
- 宽屏（≥1280px）：顶部栏/卡片/侧栏在主题色下协调；标题衬线、装饰 motif 生效；光晕动画（烛火/霓虹/脉冲等）肉眼可见
- 竖屏（≤820px）：抽屉、单列卡片、表格转卡片；主题 CSS 的移动端段生效；无横向滚动、无文字溢出
- `?theme=<主题名>` 切换后整站配色随动；`data-theme` 默认值与 `<link>` 主题文件一致
- 生成的主题 CSS 记录其 `--genre/--seed`（或 `--palette-file` 来源），保证可复现

**失败信号**：侧边栏不响应 → 检查 CSS `@media (max-width: 820px)` 段（`references/07-mobile-responsive.md`）；主题无氛围/移动端错位 → `references/11-visual-design.md` + 重新生成主题。

---

### 6 · 轮询降频检查

打开浏览器开发者工具 Network：
- 切到 `/` 等 10 秒 → 看到 `/api/player/state` 间隔 ~5s
- 切到其他 tab（页面不可见）→ 间隔变 ~30s
- 切回来 → 恢复 ~5s

**失败信号**：间隔不变 → 检查 `common.template.js` 的 `startPolling()` 与 visibilitychange 监听（`references/01-architecture.md` §轮询策略）。

---

### 7 · 剧透隔离检查（最关键）

**测试 1**：地址栏直接输
```
http://localhost:<port>/res?p=res/clues/4号线索.jpg
```

**期望**：401 或 403，绝不能返回图片。

**测试 2**：
```
http://localhost:<port>/res?p=res/clues/4号线索.jpg&t=<DM token>
```

**期望**：200（DM token 可看）。

**测试 3**：
```
http://localhost:<port>/res?p=res/clues/4号线索.jpg&t=<player token>
```

**期望**：403（玩家没解锁且没提供 code）。

**测试 4**：
```
http://localhost:<port>/res?p=res/clues/4号线索.jpg&t=<player token>&c=4382
```

**期望**：200（code 匹配）。

**测试 5**：路径逃逸
```
http://localhost:<port>/res?p=../package.json
```

**期望**：400 Bad Request。

**测试 6**：直接静态路径
```
http://localhost:<port>/res/clues/4号线索.jpg
```

**期望**：404（必须经 `/res` 路由）。

**失败信号**：任何一项失败 → `references/09-spoiler-isolation.md` + `server.template.js` 的 `checkResAccess()` + `resolveSafe()`。

---

### 4.6 · 私聊机制检查（references/14）

- [ ] **基本发收**：玩家 A 发给 B → B 收到 → B 标已读 → A 看到"已读"
- [ ] **会话 tab 化**：私聊页按会话分 tab（主持人/各玩家），composer 标题「发给：X」，无收件人下拉；切换 tab 草稿独立保存
- [ ] **新消息 pop**：任何 tab 下收到 DM/玩家消息 → 屏幕上方居中弹 pop（前缀「DM：」/「来自<角色>：」），首拉历史不弹
- [ ] **公开开关**：我的线索卡公开开关可切换（outerHTML 重渲染不得丢事件）→ 公共线索页即时可见；公开后开关锁定不可收回
- [ ] **收件人/草稿保持**：选中某收件人 + 输入一半草稿 → 来新消息触发重渲染 → 选择与草稿不丢（R59）
- [ ] **DM 审查**：DM 在私聊 tab 看到 A↔B 的全部私信（受 `dmMonitorPrivateMessages` 开关）
- [ ] **DM ↔ 玩家**：玩家发主持人 → DM 收到；DM 回信/广播 → 玩家收到
- [ ] **重置清理**：DM 重置后 `game.messages[]` 清空
- [ ] **限制生效**：`maxMessageLength` 等触发时返回错误（若启用）

### 8 · 真相复盘检查

推进到末剧情步**自动揭晓**（DM 也可提前手动揭晓）→ 玩家端 Truth tab：
- 显示 `truth.title`
- 显示 `truth.text`（多段叙述）
- 显示 `truth.image`（如配图）
- 显示 code "TRUTH"
- 顶栏「已揭晓」与真相面板状态一致（不出现双控件漂移）

**顺带检查**：设了 `settings.voteFromStep` 的剧本，末节点前一步投票锁定、到步解锁。

**失败信号**：truth 仍 lock → 检查推进步是否已到末节点、`DB.game.truthUnlocked`（`references/04-server-api.md`）。

---

### 8.5 · 重建/改数据前必须停服（§37 实测）

`node server.js` 是常驻进程，RAM DB 每次变更都会原子写回 `data.json`。若**不杀旧进程就重跑
build.cjs**，旧进程的下一次 `saveDB()` 会用内存里的旧数据覆盖刚构建好的 `data.json`
（`data.preset.json` 不受影响，可 `cp data.preset.json data.json` 抢救）。
所以：**先 taskkill node，再 build，再启动**。

### 9 · 重启检查

DM 端点重置：
- 所有玩家下线
- `data.json` 恢复初始
- 所有 clue state 回 `locked`
- `claimCode` 重新生成

**失败信号**：旧数据残留 → 检查 `dmReset()` 是否真 `DB = buildDefaultData()` + `sessions.clear()`。

---

### 10 · bat 验收

退出 Node 进程后用记事本打开 `start.bat` / `install.bat` / `stop.bat`：
- 无中文（肉眼检查或 grep `[一-龥]`）
- 无 `C:\` / `D:\` 绝对路径
- `title` 是 ASCII
- 所有 `echo` 是 ASCII

**失败信号**：bat 含中文或绝对路径 → 重写（`references/05-bat-conventions.md`）。

---

## 通过条件

检查清单步骤全部通过 = loop 完成。输出以下验收报告：

```markdown
## mystery-skill 验收报告

- APP 路径：<project>
- 启动 URL：<player> / <host>
- 剧本：<source>
- 角色数：N / 区域数：M / 线索数：K
- 循环检查：10/10 通过
- bat 合规：是/否
- 主题：<题材/seed/文件名>
- 双形态：宽屏 + 竖屏截图均无错位
- 构建命令：<build.cjs 的 --script/--out/--genre/--seed/--theme 参数>
- 备注：<可选>
```

保存到 `<项目根>/VERIFICATION.md`。

## 失败处理

任何一步失败：
1. 记录失败步骤 + 错误信息。
2. 回到对应 reference（见 SKILL.md §5 表格）查阅修复方案。
3. 修改对应文件。
4. 重跑整个 loop（**不跳步**）。

## 反例

- ❌ 跳过 step 7（剧透隔离）—— 这是最关键的验证。
- ❌ "应该可以" 就放过 step 10（bat 验收）—— 编码问题极常见。
- ❌ "先这样吧" 放过 step 9（重启检查）—— sessions 与 data.json 不同步是常见 bug。
- ❌ 部分 PASS 就出验收报告 —— 10/10 才是通过。
- ❌ 改 Skill 而非改产出 APP —— loop 验证的是产出，不是 Skill。