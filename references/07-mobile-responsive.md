# 07 · Mobile Responsive — isMobile 模式 + 抽屉侧边栏

## 硬约束

用户原话："所有页面必需完整适配移动端，即宽屏和手机竖屏。"

**两种**端**形态**：
- 宽屏（PC/平板横屏，`window.innerWidth > 820`）：侧边栏常驻在左侧
- 手机竖屏（`window.innerWidth <= 820`）：侧边栏变抽屉（hamburger 按钮触发）

## 断点

```js
function isMobile() { return window.innerWidth <= 820; }
```

`820px` 是已实测验证的阈值，覆盖：
- iPhone SE（375）竖屏
- iPhone 14 Pro Max（430）竖屏
- iPad Mini（768）竖屏
- iPad（820）刚好临界

## CSS 类名约定

| 类 | 桌面端（>820） | 移动端（≤820） |
|----|----------------|----------------|
| `.side-mobile` body class | 不应用 | 应用 |
| `.side-open` body class | 不应用 | 应用（抽屉展开） |
| `.side-hidden` body class | 可应用（用户主动收起） | 不应用（被 .side-mobile 覆盖） |

## 三种状态切换

| 桌面 + 用户收起 | 桌面 + 默认 | 移动 + 抽屉关闭 | 移动 + 抽屉展开 |
|----------------|------------|-----------------|-----------------|
| `.side-hidden` | （无） | `.side-mobile` | `.side-mobile .side-open` |

## JS 实现

```js
const LS_SIDE = 'mystery_side_hidden';
let sideOpenMobile = false;

function isMobile() { return window.innerWidth <= 820; }

function applySidebar() {
  const hidden = localStorage.getItem(LS_SIDE) === '1';
  document.body.classList.toggle('side-hidden', hidden && !isMobile());
  document.body.classList.toggle('side-mobile', isMobile());
  document.body.classList.toggle('side-open', isMobile() && sideOpenMobile);
}

function hideSide() {
  if (isMobile()) sideOpenMobile = false;
  else localStorage.setItem(LS_SIDE, '1');
  applySidebar();
}
function showSide() {
  if (isMobile()) sideOpenMobile = true;
  else localStorage.removeItem(LS_SIDE);
  applySidebar();
}

// hamburger 按钮
$('#sideOpen').onclick = showSide;
// 关闭按钮（抽屉内）
$('#sideClose').onclick = hideSide;
// 黑色遮罩
$('#sideMask').onclick = hideSide;
// 窗口尺寸变化
window.addEventListener('resize', applySidebar);
```

## CSS 关键样式

```css
/* 桌面端：侧边栏常驻 */
#sidebar {
  position: sticky;
  top: 0;
  width: 218px;
  height: 100vh;
  background: var(--panel);
  border-right: 1px solid var(--line);
  transition: margin-left .25s ease;
}
body.side-hidden #sidebar { margin-left: -218px; }
body.side-hidden .dm-main { margin-left: 0; }
#sideOpen { display: none; }     /* 桌面端隐藏 hamburger */

/* 移动端：抽屉 */
@media (max-width: 820px) {
  body.side-mobile #sidebar {
    position: fixed;
    top: 0; left: 0;
    z-index: 100;
    transform: translateX(-100%);
    transition: transform .25s ease;
  }
  body.side-mobile.side-open #sidebar {
    transform: translateX(0);
  }
  body.side-mobile #sideMask {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, .5);
    z-index: 99;
    display: none;
  }
  body.side-mobile.side-open #sideMask {
    display: block;
  }
  body.side-mobile #sideOpen {
    display: inline-flex;     /* 显示 hamburger */
  }
  body.side-mobile .dm-main {
    margin-left: 0 !important;
    width: 100%;
  }
  body.side-mobile .topbar { padding-left: 12px; }
}
```

## 网格响应

DM/Player 端主区常用 `.grid2`（两列网格）。移动端变单列：

```css
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 720px) {
  .grid2 { grid-template-columns: 1fr; }
}
```

## AP pill 响应

```css
.ap-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  background: var(--panel);
  border: 1px solid var(--gold);
  border-radius: 999px;
  font-size: 14px;
}
@media (max-width: 820px) {
  .ap-pill {
    padding: 4px 10px;
    font-size: 12px;
  }
}
```

## code chip 响应

```css
.code-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--panel2);
  border: 1px solid var(--line2);
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 12px;
}
@media (max-width: 820px) {
  .code-row {
    flex-wrap: wrap;        /* chip 允许换行 */
    gap: 6px;
  }
}
```

## 剧本翻页弹窗响应

```css
.script-viewer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.script-viewer img {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, .3);
}
.script-viewer .nav {
  display: flex;
  align-items: center;
  gap: 12px;
}
@media (max-width: 820px) {
  .script-viewer img {
    max-height: 70vh;       /* 避免过高撑出屏幕 */
  }
}
```

## 移动端特殊处理

### 防止 iOS Safari 缩放

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
```

### 防止 iOS 橡皮筋

```css
html, body { overflow-x: hidden; }
```

### 长按选择禁用

```css
.no-select {
  user-select: none;
  -webkit-user-select: none;
}
```

应用到不需要选择的元素（按钮、chip）。

## 表格响应（DM 玩家列表）

```css
.player-table {
  width: 100%;
  border-collapse: collapse;
}
@media (max-width: 820px) {
  .player-table thead { display: none; }
  .player-table tr {
    display: block;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
    margin-bottom: 8px;
  }
  .player-table td {
    display: block;
    padding: 4px 0;
    border: none;
  }
  .player-table td::before {
    content: attr(data-label) ': ';
    color: var(--muted);
    font-size: 12px;
  }
}
```

表格行用 `data-label` 标记列名（如 `<td data-label="AP">8</td>`），移动端伪元素前缀展示。

## 测试方法

1. 浏览器开发者工具 → 设备工具栏 → iPhone 12 Pro (390×844)
2. 检查：
   - 侧边栏自动隐藏
   - 主区单列
   - hamburger 按钮可见
   - 点 hamburger → 抽屉滑出 + 黑色遮罩
   - 点遮罩 → 抽屉收回
3. 切换不同宽度（768 / 820 / 821）观察断点切换是否平滑

## 反例（绝对禁止）

- 禁止桌面端用 `<meta name="viewport" content="width=320">` 强制缩放。
- 禁止用 `@media (max-width: 600px)` 一刀切（忽略 600-820 区间）。
- 禁止移动端隐藏必要功能（如 AP 显示）。
- 禁止侧边栏在移动端不收起导致遮挡主区。
- 禁止长内容溢出（必须 `overflow-x: hidden` 或响应式 grid）。