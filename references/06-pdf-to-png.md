# 06 · PDF → PNG 工具链

## 硬约束

用户原话："游戏剧本是 pdf，所有需要按页截图，而不是直接整个pdf放到网页中。"

**禁止**：
- `<iframe src="*.pdf">`
- `<embed src="*.pdf">`
- `<object data="*.pdf">`
- 任何形式的 PDF 内嵌。

**必须**：先用工具按页截成 PNG，存到 `public/res/scripts/<id>/pN.png`，HTML 中用 `<img src="res/scripts/<id>/pN.png">` 翻页。

## 三选一对比

| 工具 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **pdftoppm**（poppler） | 单文件 exe，最快 | Windows 需下载 poppler-utils；~30MB；用户首次需装 | ⭐⭐⭐ |
| **mutool**（mupdf） | 单文件 exe，质量好 | 同样需下载 mupdf-tools | ⭐⭐ |
| **pdfjs-dist + canvas**（JS） | 零系统依赖；用户只需 `npm i pdfjs-dist@^3.11.174 canvas` | 略慢；canvas 在 Windows 需预编译 | ⭐⭐⭐⭐⭐ **推荐** |

**决策**：使用 `pdfjs-dist + canvas`（纯 JS 方案）。理由：
- 无需下载 exe（用户最敏感的是"开箱即用"）。
- 与 server.js 的零依赖约束不冲突（**工具链独立 npm，server.js 仍 0 依赖**）。
- pdfjs-dist 在 Node.js 下用 `pdfjs-dist/legacy/build/pdf.js`（v3；模板对 v4+ 自动探测，不需 DOM）。

## 工具脚本

详见 `assets/pdf-to-png.template.cjs`。

```bash
# 准备（仅工具链，不污染 server）
cd 项目根
mkdir -p tools
npm i --prefix ./tools pdfjs-dist canvas

# 运行
node tools/pdf-to-png.cjs --in "剧本/角色剧本" --out "public/res/scripts"
```

### 命令行参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `--in <dir>` | 是 | 输入 PDF 目录（递归扫描所有 `.pdf`） |
| `--out <dir>` | 是 | 输出根目录 |
| `--scale <n>` | 否 | 缩放倍率，默认 2.0（≈144 DPI） |
| `--password <pw>` | 否 | 加密 PDF 密码 |

### 输出目录结构

```
public/res/scripts/
├── 角色甲/
│   ├── p1.png
│   ├── p2.png
│   └── p3.png
├── 角色乙/
│   ├── p1.png
│   └── p2.png
...
```

**命名规则**：每个 PDF 文件名（不含 `.pdf`）作为子目录名，每页为 `p<N>.png`（`p1, p2, ..., pN`，N 从 1 开始）。

## 与 data.json 的对应

```jsonc
{
  "characters": [
    {
      "id": "char_a",                          // ASCII id
      "name": "角色甲",
      "script": "res/scripts/角色甲/p1.png",      // 首页（封面）
      "scriptPages": [
        "res/scripts/角色甲/p1.png",
        "res/scripts/角色甲/p2.png",
        "res/scripts/角色甲/p3.png"
      ]
    }
  ]
}
```

玩家端"我的剧本"弹窗用 `<scriptPages>` 数组渲染翻页：
```js
function openScript(char) {
  const pages = char.scriptPages && char.scriptPages.length
    ? char.scriptPages
    : [char.script];
  // 渲染翻页器
  modal(`<div class="script-viewer">
    <img src="${resUrl(pages[0], token, char.script)}">
    <button data-prev>${I.chevL}</button>
    <span class="page-info">1 / ${pages.length}</span>
    <button data-next>${I.chevR}</button>
  </div>`);
}
```

## 处理加密 PDF

部分剧本 PDF 是加密的（限制打印/复制）。工具脚本应：

```js
try {
  await loadingTask.promise;
} catch (e) {
  if (e.name === 'PasswordException') {
    console.warn('[SKIP] 加密 PDF:', pdfPath, '请提供密码 --password XXX');
    return null;
  }
  throw e;
}
```

如果用户提供 `--password`，则使用；否则跳过并 warn。

## 处理扫描版 PDF

扫描版 PDF（图片型）通常几 MB 一页。`pdfjs-dist` 会逐页栅格化（已带 canvas 渲染）。建议 `--scale 1.5` 即可（避免 100MB+ 输出）。

工具实现以 `assets/pdf-to-png.template.cjs` 为准（CommonJS，`pdfjs-dist@^3.11.174` + `canvas`，支持 `--in 单文件或目录`、`--scale`、加密 PDF `--password`），本文不再内联代码以免与模板漂移。

## 在 SKILL 工作流中的位置

```
Step 1 解析剧本样例
  ↓
Step 2 PDF→PNG 截页（执行 pdf-to-png.template.cjs）  ← 你在这里
  ↓
Step 3 拷贝 assets/ 模板到项目根（data.json 填 scriptPages）
  ↓
Step 4 改主题变量
  ↓
Step 5 启动 + loop 自验证
```

## 反例（绝对禁止）

- 禁止用 PDF.js 渲染 PDF 到 `<canvas>` 然后再截图（绕一圈，资源浪费）。
- 禁止直接把 PDF 路径放进 `script` 字段（必须 PNG）。
- 禁止用 ImageMagick / ghostscript 等系统工具（增加 Windows 用户负担）。
- 禁止在 server.js 里 require pdfjs-dist（破坏零依赖约束）。

## 工具污染度评估

| 维度 | 影响 |
|------|------|
| server.js require 列表 | 不变（仍 0 依赖） |
| 项目 node_modules | 仅 `tools/node_modules/pdfjs-dist + canvas`（约 50MB） |
| 玩家端打包体积 | 0（玩家端只拉 PNG，不拉 JS 解析库） |
| 部署便利性 | 首次截页时 `npm i --prefix ./tools` 即可；运行时不需要 |

**结论**：工具链污染可控，server 端零依赖硬约束不破。