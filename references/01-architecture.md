# 01 · Architecture — C/S 双端架构与资源 code 协议

## 系统全景图

```
                          LAN / WiFi
                +-------------------------------+
                |                               |
                v                               v
       +-----------------+             +-----------------+
       |  DM Browser     |             | Player Browser  |
       |  /host          |             | /               |
       |  ipad/phone/pc  |             | ipad/phone/pc   |
       +--------+--------+             +--------+--------+
                | x-token                      | x-token
                | (32 hex chars)               |
                +-----------+------------------+
                            | HTTP (single process, polling)
                            v
       +----------------------------------------------------+
       |                Node.js server.js                   |
       |  +--------------+  +-------------+  +-------------+ |
       |  | routes{}     |  | DB in RAM   |  | sessions    | |
       |  | 35 endpoints |  | data.json   |  | Map<token,  | |
       |  |              |  | <->disk     |  |   session>  | |
       |  +-------+------+  +------+------+  +------+------+ |
       |          |                |                |        |
       |          v                v                v        |
       |  +------------------------------------------------+ |
       |  |   /api/claim   /api/fetch   /api/player/state  | |
       |  |   /api/player/search  /api/dm/login           | |
       |  |   /api/dm/step   /api/dm/reset   /api/dm/truth| |
       |  |   /res?p=&t=&c=  checkResAccess()             | |
       |  +-----+----------------------+-------------------+ |
       +--------|----------------------|--------------------+
                |                      |
                v                      v
   +------------------------+  +----------------------+
   | data.json (DB state)   |  | public/res/*         |
   | characters / areas /   |  | scripts/<id>/p*.png  |
   | clues / timeline /     |  | clues/*.jpg          |
   | truth / rules / log    |  | maps/*.png           |
   +------------------------+  +----------------------+
   (atomic write .tmp)         (stat served via /res)
```

**核心约束**：单一 Node.js 进程同时服务 DM 与玩家；不引入 express / ws / 任何 npm 包。

## 单文件 server.js 模块布局（17 个块按顺序）

```
1. require + 常量 + MIME 表
2. 工具函数: randStr / newToken / claimCode / clueCode / now / esc
3. 数据存取: loadDB / saveDB (atomic .tmp) / addLog / announce / notifyPlayer
4. 默认数据: buildDefaultData()
5. 查找: getPlayer / getCharacter / getArea / getClue / getMedicalFile
6. code 反查: findClueByCode / findCodeTarget / findRefByPath
7. 鉴权: viewerFromReq / clueAccessibleByPlayer / medicalAccessibleByPlayer
8. 资源白名单: DM_REF_FILES (组织者独占 PDF)
9. 剧本逐页缓存: scriptPageCache / scriptPagesOf (player.js 用)
10. 玩家逻辑: doClaim / doSearch / doMedical / doVisible
11. DM 逻辑: dmCreatePlayer / dmSetPhase / dmSetStep / dmAnnounce /
            dmSetClueState / dmResetArea / dmReset / dmSetTruth
12. 状态组装: phaseLabel / searchEnabled / playerState / dmState
13. HTTP 工具: sendJSON / readBody / resolveSafe / serveFile
14. 资源访问检查: checkResAccess (核心鉴权)
15. API 路由表: routes = { 'POST /api/claim': ..., ... 35 个 }
16. HTTP 服务器: createServer()
17. 启动: server.listen() + 打印双 URL
```

## token 机制

| 角色 | 入口 | token 格式 | session |
|------|------|----------|---------|
| 玩家 | `POST /api/claim` 带 `{code: '1234'}` | 32 hex 字符 | `Map<token, {type:'player', playerId: p.id}>` |
| DM | `POST /api/dm/login` 带 `{}` | 32 hex 字符 | `Map<token, {type:'dm'}>` |

- token 通过 HTTP header `x-token` 携带。
- server 端从 `viewerFromReq()` 中读 `x-token` → 查 sessions Map。
- viewer 信息（player 或 dm）传给 `checkResAccess()` 做后续鉴权。
- token 永不过期；DM `reset` 才整体清空 sessions。

## 资源访问协议

**所有静态资源**经单一出口：

```
GET /res?p=<相对路径>&t=<token>&c=<code>
```

| 参数 | 必填 | 说明 |
|-----|------|------|
| `p` | 是 | 相对路径，如 `res/scripts/角色甲/p1.png` 或 `02 组织人拥有/线索手册.pdf` |
| `t` | 否 | viewer token（玩家或 DM） |
| `c` | 否 | 4 位数字 code（`1000-9999`），跨玩家拉码时用 |

`checkResAccess(viewer, code, ref)` 的完整实现（四道关：路径白名单 → DM 绕过 → 状态机 → 可见性/code 匹配）与 `clueAccessibleByPlayer()`，**统一归口在 `references/09-spoiler-isolation.md`**——本章只讲架构定位，不再重复贴实现代码。

**关键不变量**：前端 `display:none` 或 `visibility:hidden` 都不算鉴权；任何资源访问必须经过 `/res` 路由 + `checkResAccess()`（见 `references/09-spoiler-isolation.md`）。

## 轮询策略

| 端 | 活跃间隔 | 后台间隔 | 实现 |
|----|----------|----------|------|
| 玩家 | 5s | 30s | `setInterval` + `visibilitychange` 监听 |
| DM | 3s | 10s | 同上（DM 端更频繁，因为要响应操控） |

```js
function startPolling(fn, ms, slowMs) {
  let interval = ms;
  let id;
  const tick = () => fn().then(() => {
    id = setTimeout(tick, document.hidden ? slowMs : interval);
  });
  const start = () => { tick(); };
  const stop  = () => clearTimeout(id);
  document.addEventListener('visibilitychange', () => {
    clearTimeout(id);
    if (!document.hidden) tick();
  });
  start();
}
```

## 与旧版原型系统的差异（关键决策依据）

| 维度 | 旧版原型系统 | 本 Skill（murder-mystery-app） |
|------|--------------|-------------------------------|
| 框架 | express + ws | 零依赖 Node.js（仅 http/fs/path/crypto/os/url） |
| 实时通信 | WebSocket | HTTP 轮询 + visibilitychange |
| 阶段 | 9 阶段（lobby → alibi → investigation → reasoning → vote1 → discussion → investigation2 → final_clue → reveal） | 4 主阶段（setup/prologue/started/reveal）+ timeline.currentStep 双轴（阶段切换的 `transition`/`ended` 为过渡态） |
| 资源出口 | `/player/resource/:playerId/:code` 直挂 | `/res?p=&t=&c=` 统一鉴权 |
| PDF 处理 | 直接 `<iframe>` | 必须先 `pdf-to-png.template.cjs` 截 PNG |
| bat | 英文 echo | 英文 echo |
| 主题 | 暗色英伦风 | 双层结构（`style.css` 骨架 + `theme-<名>.css` 主题库，`?theme=` 运行时切换；见 `references/11-visual-design.md`） |
| 中文 UI | 否 | 是 |

**决策**：不沿用旧原型的技术栈；只参考其阶段命名思路（lobby/setup、investigation/started、reveal）。

## 早期实现的关键贡献

早期实现已实现全部用户硬约束（除 PDF 工具链自动化）。本 Skill 以其 `server.js` / `data.json` / `public/` 为骨架，`checkResAccess` / `clueAccessibleByPlayer` / 轮询 / `claimCode` 函数直接抽取。

**唯一不同**：早期实现的 PDF 截屏是手工 `_extract/`，本 Skill 用 `pdf-to-png.template.cjs` 自动化。