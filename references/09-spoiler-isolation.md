# 09 · Spoiler Isolation — 服务端鉴权 + 前端 lockMask

## 硬约束

用户原话："host端和玩家端，对于未推进到的资源，要加锁加码，避免剧透。"

## 双层防御

### 服务端 — 真鉴权（不能省）

**所有资源访问必经 `/res?p=&t=&c=`**，由 `checkResAccess()` 校验。

#### 四道关

```js
function checkResAccess(viewer, code, ref) {
  // 1. 路径白名单：未登记的资源 → 拒绝
  if (!ref) return false;

  // 2. DM 绕过：DM 看得到所有
  if (viewer && viewer.dm) return true;

  switch (ref.kind) {
    case 'rule':
      return true;                                              // 公共规则

    case 'truth':
      return DB.game.truthUnlocked && !!viewer;                  // 真相需揭晓

    case 'script':
    case 'startClue':
      return !!viewer && viewer.player.characterId === ref.charId; // 仅本人

    case 'clue': {
      const c = getClue(ref.clueId);
      // 3. 状态机：未解锁 → 拒绝
      if (!c || c.state !== 'unlocked') return false;
      // 4. 可见性：本人或 public → 通过；否则需要 code 匹配
      if (viewer && clueAccessibleByPlayer(c, viewer.player)) return true;
      if (code) {
        const t = findClueByCode(code);
        return !!t && t.kind === 'clue' && t.ref.id === c.id;
      }
      return false;
    }

    case 'medical':
      // 同 clue，但查 medicalFiles
      const m = getMedicalFile(ref.fileId);
      if (!m || m.state !== 'unlocked') return false;
      if (viewer && medicalAccessibleByPlayer(m, viewer.player)) return true;
      if (code) {
        const t = findClueByCode(code);
        return !!t && t.kind === 'medical' && t.ref.id === m.id;
      }
      return false;

    case 'dmref':
      return !!(viewer && viewer.dm);                            // 仅 DM

    default:
      return false;
  }
}
```

`findRefByPath()` 反查所有合法路径：

```js
function findRefByPath(p) {
  for (const c of DB.characters) {
    if (c.script === p) return { kind: 'script', charId: c.id };
    if (c.startClue.image === p) return { kind: 'startClue', charId: c.id };
  }
  for (const a of DB.areas) for (const c of a.clues) if (c.images.includes(p)) return { kind: 'clue', clueId: c.id };
  for (const m of DB.medicalFiles) if (m.image === p) return { kind: 'medical', fileId: m.id };
  if (DB.truth.image === p) return { kind: 'truth' };
  for (const r of DB.rules) if (r.file === p) return { kind: 'rule' };
  if (DM_REF_FILES.includes(p)) return { kind: 'dmref' };
  return null;
}
```

### 前端 — 用户体验（不能替代服务端）

- **已解锁**：完整正文 + code chip + public/private 切换。
- **未解锁**：显示 `lockMask`（"尚未解锁"），**不显示标题文字**。
- **未来 timeline step**：显示 `? ? ?` 占位。
- **其他玩家的 private clue**：本玩家列表中不出现（服务端已过滤）。

## 前端 lockMask 组件

```js
function lockMask(tip, icon) {
  const el = document.createElement('div');
  el.className = 'lock-mask';
  el.innerHTML = `
    <div class="mask-overlay">
      ${I[icon || 'lock']}
      <span>${esc(tip || '尚未解锁')}</span>
    </div>
  `;
  return el;
}
```

```css
.lock-mask {
  position: relative;
  background: rgba(35, 42, 48, .35);
  border: 1px dashed var(--line2);
  border-radius: var(--radius);
  padding: 24px 16px;
  text-align: center;
  color: var(--muted);
  min-height: 80px;
}
.mask-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
}
.mask-overlay svg {
  width: 18px;
  height: 18px;
  color: var(--dim);
}
```

## timeline 占位

```js
function renderTimeline(st) {
  const tl = st.timeline;
  const current = st.game.currentStep;
  return tl.map((t, i) => {
    const unlocked = i <= current;
    return `
      <div class="timeline-step ${unlocked ? 'current' : 'locked'}">
        <div class="step-time">${esc(t.time)}</div>
        <div class="step-title">${unlocked ? esc(t.title) : '? ? ?'}</div>
        <div class="step-text">${unlocked ? esc(t.text) : ''}</div>
      </div>
    `;
  }).join('');
}
```

```css
.timeline-step.locked {
  opacity: .35;
  filter: blur(2px);
  pointer-events: none;
}
```

## 资源 URL 构造

前端 `<img>` / fetch 都走 `/res`：

```js
function resUrl(p, token, code) {
  let u = '/res?p=' + encodeURIComponent(p);
  if (token) u += '&t=' + encodeURIComponent(token);
  if (code)   u += '&c=' + encodeURIComponent(code);
  return u;
}
```

## 直接访问测试

六用例操作清单（无 token 403 / DM 200 / 玩家 403 / +code 200 / `../` 逃逸 400 / 静态路径 404）
**归口 `loop.md` §7**——那里是唯一权威的验收清单，本文只定义协议与判定规则，不重复用例。

**这是关键**：禁止静态托管 `public/res/`（必须经 `/res`）。

## 路径安全（防 ../ 逃逸）

```js
function resolveSafe(rootDir, relPath) {
  const full = path.normalize(path.join(rootDir, relPath || ''));
  if (full !== rootDir && !full.startsWith(rootDir + path.sep)) return null;
  return full;
}
```

测试：
```
GET /res?p=../package.json
→ 期望 400 Bad Request
```

## 反例（绝对禁止）

### ❌ 前端 display:none 藏线索

```js
// 错！服务端必须拒绝，前端只是 UX
if (!st.isDM) $('.locked-clue').css('display', 'none');
```

### ❌ 静态托管 res/

```js
// 错！必须经 /res
app.use('/res', express.static('public/res'));
```

正确：
```js
// 所有资源经 /res 路由 + checkResAccess
if (p === '/res') { ... }
```

### ❌ 客户端拼接 path 直接 fetch

```js
// 错！必须经 /res?p=&t=&c=
fetch('/res/clues/' + clueId + '.jpg');
```

### ❌ 真相永远返回

```js
// 错！必须检查 truthUnlocked
const state = { truth: DB.truth };   // ← 永远返回
```

正确：
```js
const state = { truth: DB.game.truthUnlocked ? DB.truth : null };
```

### ❌ timeline 不分可见性

```js
// 错！未来 step 也会剧透
return DB.timeline;
```

正确：
```js
return DB.timeline.map((t, i) => i <= DB.game.currentStep ? t : { id: t.id, code: t.code, locked: true });
```

## 测试 checklist

| # | 测试 | 期望 |
|---|------|------|
| 1 | 浏览器直输 `/res?p=res/clues/X.jpg` 无 token | 403 |
| 2 | 浏览器直输 `/res?p=res/clues/X.jpg&t=dm_token` | 200 |
| 3 | 浏览器直输 `/res/clues/X.jpg` 静态路径 | 404 |
| 4 | 玩家未解锁线索时直输 `/res?p=...&t=player_token` | 403 |
| 5 | 提供正确 code 后玩家访问 | 200 |
| 6 | `/res?p=../package.json` | 400 |
| 7 | timeline 未推进 step 玩家端显示 | `? ? ?` 占位 |
| 8 | 真相未揭晓玩家端 truth tab | 显示"尚未揭晓" |
| 9 | DM 端 `/host` 永远能看到所有资源 | 200 |
| 10 | `dmRefs`（组织手册）玩家端访问 | 403 |

未全部通过 = 剧透隔离失败，必须修复。