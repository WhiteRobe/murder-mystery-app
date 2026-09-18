# 08 · UI Themes — 3 套主题变量表 + 字体 + 角色主题色

## 硬约束

用户原话："页面样式设计要符合主题，适当加上美术。"

**禁止**：
- 默认 HTML 外观（白底 + 系统字体 + 灰边框）。
- 静态死板的灰阶配色。
- 完全没有视觉层次（无 backdrop-filter、无 gradient、无阴影）。

**必须**：
- 深色面板为主基调。
- 衬线字体用于标题。
- 强调色（金/血红/朱砂/霓虹）。
- 角色主题色 chip。
- 公告/广播有光晕/雷达动画。

## 字体三件套

```css
:root {
  --font-disp: Georgia, 'Songti SC', 'SimSun', serif;
  --font-body: -apple-system, 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', sans-serif;
  --font-mono: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
}
```

- `--font-disp`：标题（剧本名/角色名/真相大标题）。衬线字体增加古典感。
- `--font-body`：正文。系统字体栈保证中文原生渲染。
- `--font-mono`：资源 code chip、时间戳。

## 主题系统总览（与 ref 11 / theme-presets / gen-theme 的分工）

> 本章聚焦**组件级视觉规范**（字体三件套、必备美术元素、角色主题色）与一组**示例变量表**。
> 主题的**方法论 / 题材推导 / 生成器 / 验收清单**见 `references/11-visual-design.md`；
> 可用的**预置主题池**见 `assets/theme-presets.template.json`（castle/victorian/western/steam/noir/science/desert/theatre/cyber/qingci/hospital/maritime/fantasy）；
> **现场生成/定制色板**用 `assets/gen-theme.template.cjs`（`--genre`/`--seed`/`--palette-file`，随机只在池内、对比度自校验）。

**硬约束**：深色面板 + 衬线标题 + 剧本专属强调色 + 角色主题色 chip + 公告有光晕动画。主题必须讲剧本氛围，禁止默认 HTML 外观、禁止只用 `--blood`/`--gold` 两个变量就叫"定制"（至少动字体/氛围/组件覆盖一类）。

### 默认主题（血金暗夜）—— 可作"新剧本至少看一眼"的基线与示例

```css
:root {
  --bg:    #0d0f11;  --bg2:   #111417;  --panel:  #161a1e;
  --panel2: #1c2126; --panel3: #232a30; --line:   #2a3138; --line2: #39424b;
  --text:  #e8e1d0;  --muted: #9aa3ab;  --dim:    #636c75;
  --blood: #c2402e;  --blood2: #a93322; --gold:   #d3a950; --gold2: #b58f3c;
  --ok: #5da97d; --info: #5a9bc0; --warn: #d4a23b; --danger: #c24545;
  --shadow: 0 8px 28px rgba(0,0,0,.45); --shadow-lg: 0 12px 48px rgba(0,0,0,.55);
}
```

其他题材的主题请从 `theme-presets.template.json` 选预置，或 `gen-theme.cjs` 生成——**不要手工再抄一套硬编码变量表**。

## 切换主题

运行时/构建期用 `data-theme="<名>"` 切换，逻辑统一归口 `references/11-visual-design.md` §3.1：
- HTML 根元素挂 `<html data-theme="<名>">`，主 `<link>` 挂默认主题并带 `data-theme-css="<默认名>"`。
- `?theme=<名>` > `localStorage.mystery_theme` > 默认主题，目标未 link 时动态 append、失败回退默认；
- 玩家/DM 端运行时切换 `document.documentElement.dataset.theme = '<名>'`。

## 必备美术元素

### 1. 顶部栏 sticky + backdrop-filter blur

```css
.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(13, 15, 17, .72);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
  padding: 12px 18px;
}
```

### 2. 卡片有 border + border-radius + 阴影

```css
.card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 14px 16px;
  box-shadow: var(--shadow);
}
```

### 3. chip 用 pill 形 + 1px 边框 + 半透明背景

```css
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  background: rgba(211, 169, 80, .12);    /* gold + alpha */
  border: 1px solid var(--gold);
  border-radius: 999px;
  font-size: 12px;
  color: var(--gold);
}
```

### 4. 公告用 radial-gradient 背景光晕

```css
.toast.reveal {
  background: radial-gradient(ellipse at center,
    rgba(211, 169, 80, .2),
    rgba(13, 15, 17, .95) 70%);
  border: 1px solid var(--gold);
  box-shadow: 0 0 24px rgba(211, 169, 80, .35);
}
```

### 5. 锁遮罩用半透明灰底 + lock icon

样式归口 `references/09-spoiler-isolation.md`（剧透隔离的唯一权威文档），此处不再重复。

### 6. 按钮 hover 微动效

```css
.btn {
  background: var(--panel2);
  border: 1px solid var(--line2);
  color: var(--text);
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all .15s ease;
}
.btn:hover {
  background: var(--panel3);
  border-color: var(--gold);
  transform: translateY(-1px);
}
.btn.primary {
  background: var(--blood);
  border-color: var(--blood);
  color: white;
}
.btn.primary:hover {
  background: var(--blood2);
}
.btn.gold {
  background: var(--gold);
  border-color: var(--gold);
  color: var(--bg);
}
```

## 角色主题色

每个角色在 `characters[].color` 给一个 hex。**`CHAR_COLORS` 由 `common.template.js` 在运行时从 data.json 动态构建**（不要硬编码色表），`highlight()` 对所有角色名输出 `<span class="cname" data-color="角色id">`，`data-color` 映射到 CSS 变量后再着色；玩家自己的主题色同时写入全局 `--me-color`。具体实现见 `assets/common.template.js`（唯一权威）。

## 测试方法

1. 浏览器开发者工具 → 检查 computed styles：
   - 背景色是否为深色（`#0d0f11` 系）
   - 标题字体是否为衬线（Georgia/Songti SC）
   - accent color 是否为金/血红
2. 用 `<html data-theme="qingci">` 切换主题，确认所有元素同步变色（不能有遗漏）。
3. 检查移动端：背景色仍深色、字体不变。

## 反例（绝对禁止）

- 禁止用 `background: white; color: black`（默认外观）。
- 禁止全局 `font-family: sans-serif`（无衬线会失去戏剧感）。
- 禁止省略阴影（`box-shadow: none` 会让卡片看起来扁平无层次）。
- 禁止所有元素同色（必须有 `--panel` / `--panel2` / `--panel3` 三层）。
- 禁止角色名不染色（不能纯文本显示其他玩家名字）。