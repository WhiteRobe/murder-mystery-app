# 11 · Visual Design — 视觉设计方法论（模板只是参考，视觉必须贴合剧本）

> 核心原则：`style.template.css` 只是**基础骨架**，`theme-*.css` 只是**参考样例**。
> 每个剧本都必须按自己的题材/氛围生成或定制专属主题——"千篇一律 = 未完成"。
> 同时必须双形态适配：宽屏（PC/横屏）与移动端竖屏（≤820px）。

---

## 1. 硬约束

- **禁止**直接使用默认血金主题不思考 → 每个剧本至少要：选预置主题 / 跑生成器 / 手工调色板三选一。
- **禁止**生成"通用好看但与剧本无关"的主题 → 主题必须讲出剧本的氛围故事。
- **禁止**只做宽屏 → 移动端竖屏（390px 档）必须同样检查。
- **禁止**出现默认 HTML 外观（白底黑字）、无阴影扁卡片、纯系统字体。
- **必须**：深色/主题色面板 + 衬线标题 + 剧本专属强调色 + 角色主题色 + 氛围层 + 动画。

## 2. 题材 → 氛围 → 视觉要素推导表

| 题材 | 氛围关键词 | 基调色 | 强调色 | 字体气质 | 装饰 motif | 动画语言 |
|------|-----------|--------|--------|---------|-----------|---------|
| 哥特古堡/克苏鲁 | 暴风雨、巨烛、深渊 | 深海黑+湿石板 | 锈蚀红+烛金+苔绿 | Cinzel 古典衬线 | ✦ 墓石刻痕 | 烛火 flicker、雾潮 |
| 老酒店/维多利亚 | 昏暗灯光、墙纸、血蜡 | 深棕黑+古董墙纸 | 深红+古铜金 | Playfair 斜体 | ❦ 花体 flourish | 烛火、双线边框 |
| 西部/荒野 | 黄沙、皮革、枪火 | 驼色+沙褐 | 焦铁锈红+日落橙 | 西部木刻粗衬线 | ✦ 仙人掌/星 | 沙尘、酒馆灯 |
| 蒸汽列车/工业 | 铆钉、煤烟、蒸汽 | 煤黑+灰钢 | 黄铜+蒸汽白 | 机械 mono+衬线混排 | ⚙ 齿轮 | 活塞、齿轮旋转 |
| 黑色电影/雨夜 | 午夜、雨幕、霓虹湿光 | 午夜蓝+雨灰 | 冷青+血红 | 窄长衬线 | ☂ 雨滴 | 雨丝、霓虹呼吸 |
| 科幻研究所 | 玻璃、荧光、无菌 | 冷白+深蓝 | 荧光青+危险橙 | 几何无衬线 | ⬡ 六边形 | 数据脉冲、扫描线 |
| 大漠西域/考古 | 沙金、星夜、驼铃 | 沙金+暗夜蓝 | 赭石+铜绿 | 手写感衬线 | ✦ 星芒 | 星辉、沙流 |
| 剧院/派对 | 天鹅绒、舞台光、香槟 | 深红+墨黑 | 香槟金+鎏金 | 戏剧体衬线 | ❖ 菱形灯饰 | 舞台光晕、幕布 |
| 民国/谍战 | 青瓷、烟雨、密码 | 青灰+墨绿 | 朱砂+黄铜 | 宋体衬线 | ❀ 青瓷纹 | 烟雨、电报 |
| 医院/恐怖 | 冷绿、消毒水、走廊灯 | 灰绿+暗白 | 血红+荧光白 | 窄衬线 | ✚ 十字 | 呼吸灯、心跳 |
| 赛博/未来 | 霓虹、全息、雨夜电路 | 深蓝+紫黑 | 霓虹粉+霓虹蓝 | 几何+mono | ⬢ 三角 | 扫描、glitch |
| 海上/求生 | 船体、海雾、求生欲 | 铁灰+雾蓝 | 信号橙+海绿 | 粗重衬线 | ⚓ 锚 | 波浪、雾灯 |

> 表内 motif 字符只是占位建议：正文中禁止依赖 emoji 混排（与角色色/图标体系冲突时用 CSS 绘形或去掉）。

## 3. 主题文件规范

### 3.1 双层结构

```
public/css/
├── style.css            ← 基础骨架（每个 APP 都相同，只替换占位符）
└── theme-<名>.css       ← 氛围覆盖（按剧本定制，1 个默认 + 全部预置主题）
```

`style.css` 定义：布局、组件结构、`--c` 角色色变量、滚动条、移动端断点。
`theme-<名>.css` 定义：配色变量覆盖、氛围层、字体、装饰、动画、组件视觉。

**主题切换库**：`build.cjs` 会把全部预置主题（castle/victorian/western/steam/noir/
science/desert/theatre）一并拷入 `public/css/`，HTML 主 `<link>` 只挂默认主题并带
`data-theme-css="<默认名>"`。运行时切换规则（`player/dm.template.html` 内联脚本）：
1. `?theme=<名>` > `localStorage.mystery_theme` > 默认主题，写入 `<html data-theme>`
2. 目标 ≠ 默认且未 link → 动态 append `<link href="/css/theme-<名>.css">`
3. 加载失败（onerror）→ 移除 link、回退默认主题、清除 localStorage 记忆

这样 `?theme=` 可切到任意预置主题（零 404），也支持拷入自定义主题文件后即切即用。

### 3.2 主题文件必须包含的变量清单

```css
:root[data-theme="<名>"] {
  --bg; --bg2; --panel; --panel2; --panel3;      /* 五层底色（必须梯度，禁止同色） */
  --line; --line2;                                 /* 边框两档 */
  --text; --muted; --dim;                          /* 三级文字 */
  --blood; --blood2;                               /* 主强调 + 深一档 */
  --gold; --gold2;                                 /* 次强调 + 深一档 */
  --ok; --info; --warn; --danger;                  /* 状态色 */
  --font-disp; --font-body; --font-mono;           /* 字体三件套 */
  --radius; --radius-sm;                           /* 圆角 */
  --shadow; --shadow-lg;                           /* 阴影 */
  --ornament;                                      /* 装饰字符（可选） */
}
```

缺失任一核心变量 = 主题不完整，生成器必须自校验（见 §6）。

### 3.3 选择器约定

- 一律用 `[data-theme="<名>"] ...` 前缀（HTML 根元素挂 `data-theme`），不污染全局。
- 覆盖对象优先级：`body::before` 氛围层 → `.topbar`/`.brand .logo` → `.card`
  → `.ap-pill`/`.code-chip` → `.truth-card`/`.lock-mask`/`.toast.reveal` →
  角色色 `.cname[data-color="<id>"]`。
- 角色色段：主题可按剧本角色微调高亮色，让角色色与主题色板更协调；**不想微调可整段删除**，
  因 style.css 的 `.cname[data-color]` 已用内联 `--c` 兜底。

### 3.4 氛围层模板（body::before）

```css
[data-theme="<名>"] body::before {
  content: "";
  position: fixed; inset: 0; pointer-events: none; z-index: 999;
  background:
    radial-gradient(ellipse at 18% 26%, rgba(<强调>, .06) 0%, transparent 42%),
    radial-gradient(ellipse at 82% 74%, rgba(<强调2>, .05) 0%, transparent 40%),
    repeating-linear-gradient(<角度>, transparent 0 110px, rgba(<强调>, .02) 110px 112px);
}
```

氛围层必须 `pointer-events: none`，绝不能挡交互；z-index 高于内容但低于弹窗。

## 4. 移动端双形态（强制项）

移动端布局约定（抽屉侧边栏/单列网格/表格卡片化/chip 收缩）**归口 `references/07-mobile-responsive.md`**，此处不重复。主题只需遵守一条硬规则：每个主题 CSS 末尾必须带 `@media (max-width: 820px)` 段，且只允许**增强**移动端样式，禁止用 `display:none` 隐藏必要功能。

## 5. 视觉验收清单（"经得起考验"）

- [ ] **色板对比度**：`--text` vs `--bg` 亮度对比 ≈ ≥4.5:1（YIQ 公式，见 §6.3）；
      `--muted` vs `--bg` ≥ 3:1。
- [ ] **面板梯度**：`--bg` < `--panel` < `--panel2` < `--panel3`（亮度递增，肉眼可辨）。
- [ ] **无默认外观**：肉眼检查无白底/系统字体/灰边框残留。
- [ ] **组件覆盖**：chip / card / btn / modal / toast / lock-mask / truth-card / script-viewer
      全部有主题色（截图逐项过）。
- [ ] **角色名染色**：真相/时间线/记录中的角色名以主题色高亮（`.cname`）。
- [ ] **双形态**：宽屏 1440px + 移动端 390px 竖屏各截一张，检查无溢出、无白边、功能完整。
- [ ] **动画适度**：氛围动画存在但不过度（flicker/脉冲 ≤ 3s 周期，不抢占内容可读性）。
- [ ] **滚动条**：thin + 主题色 thumb。
- [ ] **认领页**：剧本标题 + 定制副标题 + 装饰，与主题一致。
- [ ] **Consolo 无报错**：切换 `?theme=` 时无 404（CSS 已 link）。

## 6. 主题生成器（gen-theme.cjs）

### 6.1 用法

```bash
node assets/gen-theme.template.cjs --genre gothic --seed 42 --name abyss --out public/css
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `--genre` | 是 | 题材 key（见 `assets/theme-presets.template.json`） |
| `--seed` | 否 | 随机种子（默认时间戳；固定后可复现） |
| `--name` | 否 | 主题名（默认 `<genre>-<seed>`） |
| `--out` | 否 | 输出目录（默认当前目录） |
| `--palette-file` | 否 | 从 `palette.py` 输出的 JSON 读取自定义色板 |

### 6.2 设计原理

- **随机只在候选池内发生**：每个题材预置 3-5 组"已被验证协调"的色板/字体/motif，
  seed 决定选哪组。不自由生成 hex → "怎么抽都不难看"。
- **自校验兜底**：生成后检查核心变量齐全 + 对比度达标；不达标自动换下一候选组；
  全部不达标 → 报错退出（宁可失败，不输出丑主题）。
- **seed 可复现**：同 seed 输出逐字节一致，便于回归。

### 6.3 对比度（YIQ 亮度）

```
Y = (299*r + 587*g + 114*b) / 1000      # r,g,b ∈ [0,255]
contrast = (Y_text + 0.05) / (Y_bg + 0.05)  # 需 text > bg
```

生成器对 `--text`/`--muted` 与 `--bg` 做断言；不达标自动回退。

### 6.4 输出结构

```
theme-<name>.css
├── 头部注释（题材/氛围/启用方式）
├── :root[data-theme] 变量块
├── body::before 氛围层
├── topbar / brand.logo / side-sub 覆盖
├── card / ap-pill / code-chip 覆盖
├── truth-card / lock-mask / toast.reveal 覆盖
├── 特色动画（@keyframes + 挂载）
├── @media (max-width: 820px) 适配段
└── 角色色占位段（注释：按 data.json 替换 .cname[data-color]）
```

## 7. 与 palette.py 联动（以剧本视觉资产为准）

当剧本自带封面/线索图且用户希望"视觉取自剧本"时：

```bash
python assets/palette.py "剧本目录/封面.png" --k 3 --format json > palette.json
node assets/gen-theme.template.cjs --genre gothic --palette-file palette.json --name custom
```

- `palette.py` 用 k-means 提取主色，输出 `{bg:[...], accent:[...], gold:[...]}` 候选；
- 生成器对自定义色板同样跑对比度校验（不达标报错并提示人工调整）。

## 8. 反例（绝对禁止）

- ❌ 默认血金主题直接交付，不思考剧本氛围。
- ❌ 主题好看但与剧本无关（给西部剧本用赛博霓虹，无理由）。
- ❌ 只调 `--blood`/`--gold` 两个变量就叫"定制主题"（必须动字体/氛围/组件覆盖至少一类）。
- ❌ 移动端 390px 截图检查缺失。
- ❌ 生成器输出的主题不经校验直接上线。
- ❌ 在主题 CSS 里塞 emoji 图标（与角色色/图标体系冲突）。
