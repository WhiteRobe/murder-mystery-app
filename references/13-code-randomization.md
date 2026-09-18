# 13 · Code Randomization — 线索/认领 code 随机化

> 把"线索 code 严格递增"改为"4 位数字 + 不可预测 + 防近邻 + 防反推"。

## 为什么要随机化

旧实现 `clueCode(seq) = padStart(4, '0')`：

```js
function clueCode(seq){ return String(seq).padStart(4, '0'); }
let clueSeq = 1;
function nextClueCode() { return clueCode(clueSeq++); }
```

观察玩家连续搜证得到的 code：

```
0001, 0002, 0003, 0004, 0005 ...
```

**问题**：玩家一眼看出"这是我连续搜的第 N 条"，暴露游戏节奏与搜证顺序。若玩家 A 公开了 code `0001`，玩家 B 立刻猜 A 还有 `0002/0003`（很可能未公开）。

## 设计目标

1. **保持 4 位数字**（硬约束 #4，硬要求 `0001`-`9999`，与 `migrateCodes()` 兼容）
2. **不可预测**：连续两条 code 不能 < 50 间隔（防止"递增"感）
3. **防反推**：任意两条 code 差值不能 < 5（防止玩家通过别人公开 code 推算自己隐藏 code）
4. **唯一性**：同局内不重复
5. **跨局独立**：reset 后池子清空，新一局重新洗牌
6. **零依赖**：仍然只用 `crypto.randomInt`，不引入新包
7. **可降级**：极端情况下（9000 个槽位用完）兜底也能生成

## 实现

```js
const CODE_MIN = 1000;             // 避开 0000
const CODE_MAX = 10000;            // 上界（含），池子 9000 个
const NEAR_GAP = 50;               // 与最近 N 条差值 < 50 拒绝
const NEAR_WINDOW = 10;            // 考虑最近 10 条
const INFER_GAP = 5;               // 与任意其他 code 差值 < 5 拒绝
const MAX_TRIES = 200;             // 单次 nextClueCode 尝试上限

let usedClueCodes = new Set();     // 全局已用 code（O(1) 去重）
let recentCodes = [];              // 最近 NEAR_WINDOW 条（FIFO）

function randomClueCode() {
  for (let i = 0; i < MAX_TRIES; i++) {
    const n = crypto.randomInt(CODE_MIN, CODE_MAX);
    if (usedClueCodes.has(n)) continue;
    /* 防近邻 */
    let tooClose = false;
    for (const r of recentCodes) {
      if (Math.abs(r - n) < NEAR_GAP) { tooClose = true; break; }
    }
    if (tooClose) continue;
    /* 防反推 */
    let inferable = false;
    for (const u of usedClueCodes) {
      if (u !== n && Math.abs(u - n) < INFER_GAP) { inferable = true; break; }
    }
    if (inferable) continue;
    return n;
  }
  /* 兜底：仅去重，不防近邻/反推（保证总能生成） */
  for (let i = 0; i < MAX_TRIES; i++) {
    const n = crypto.randomInt(CODE_MIN, CODE_MAX);
    if (!usedClueCodes.has(n)) return n;
  }
  throw new Error('线索 code 池已耗尽，请重启游戏。');
}

function nextClueCode() {
  const n = randomClueCode();
  usedClueCodes.add(n);
  recentCodes.push(n);
  if (recentCodes.length > NEAR_WINDOW) recentCodes.shift();
  return String(n).padStart(4, '0');
}
```

## 关键设计权衡

| 参数 | 值 | 取舍 |
|------|---|------|
| `CODE_MIN=1000` | 避开 0000 | 0000 看起来像"未生成/系统保留" |
| `CODE_MAX=10000` | 4 位数字上界 | 与硬约束 #4 + 旧 0001-9999 习惯一致 |
| `NEAR_GAP=50` | 拒绝相邻差 < 50 | 50 = 4 位数字空间的 0.5%；玩家看上去"两位数级别差异"，无连续感；过严（如 100）会显著降低成功率 |
| `NEAR_WINDOW=10` | 看最近 10 条 | 平衡"防止局部连续"与"避免过度拒绝"。窗口越大越保守 |
| `INFER_GAP=5` | 拒绝任意两 code 差 < 5 | 5 是关键阈值：玩家拿到一个公开 code，反推"我自己可能有 +5/-5 的 code"是无意义的——范围太大（9000/10 ≈ 900 个候选） |
| `MAX_TRIES=200` | 单次尝试上限 | 概率保证：池子半满时 ≈ 200 次能命中；满时退到兜底逻辑 |

**池子用完的临界**：9000 个槽位用完才会触发终极兜底（throw）。实际剧本通常 30-100 条线索，远低于池子容量。

## 初始化与重置

```js
function initClueSeq() {
  usedClueCodes = new Set();
  recentCodes = [];
  /* 把 data.json 里已存在的 code 加入池（迁移兼容） */
  for (const a of DB.areas) for (const c of a.clues) {
    const m = /^(\d{4})$/.exec(String(c.code || ''));
    if (m) usedClueCodes.add(parseInt(m[1], 10));
  }
  for (const m of (DB.medicalFiles || [])) {
    const m2 = /^(\d{4})$/.exec(String(m.code || ''));
    if (m2) usedClueCodes.add(parseInt(m2[1], 10));
  }
}
```

`dmReset()` 也清空池子，让"上一局的 code"不影响下一局。

## 验证（构建产物内 tools/）

### `test-code-random.cjs` —— 30+ 条分布

```
=== 生成 34 条线索 code ===
  01. 角色甲 @ 大厅 -> code=8141
  02. 角色甲 @ 厕所（案发现场） -> code=1503
  ...
  34. 角色乙 @ 角色丙身上 -> code=4291

=== 质量检查 ===
  唯一性: ✅ 34/34
  相邻差 < 50: 0/33 ✅        （无连续递增）
  相邻差 < 5:  0/33 ✅
  任意两 code 差 < 5: 0 对 ✅ （无反推风险）
  范围: [1048, 9639] 均值 5348 标准差 2570
  千位分布: {"1":4,"2":5,"3":3,"4":3,"5":3,"6":5,"7":5,"8":3,"9":3}
```

✅ 4 位数字 + 唯一 + 无连续 + 无反推 + 千位分布均匀（接近 9000 槽位的期望）。

### `test-code-reset.cjs` —— 跨局独立

```
Round 1: 21 codes: [5642, 9231, 1314, 7328, 1710, ...]
Round 2: 21 codes: [1733, 1655, 9208, 3340, 9306, ...]
Round 3: 21 codes: [9608, 9853, 8782, 2974, 4619, ...]
```

3 局各 21 条完全不同 = 63 条 code 全在 [1026, 9900] 随机分布，跨局互不影响。

### `test-code-stress.cjs` —— 单玩家连搜压力

```
=== 压力测试：单玩家连搜 21 条 ===
  01. 3163
  02. 7919
  ...
  21. 6900

=== 质量检查 ===
  唯一性: ✅
  相邻差 < 50: 0/20 ✅
  相邻差 < 5:  0 ✅
```

即使一个玩家疯狂搜证 21 次，仍然每次都跳 50+。

## 兼容旧 data.json

`migrateCodes()` 处理 `C01-ZQAV` 老格式（保持原行为）。`initClueSeq()` 把所有合法 4 位数字 code 加入 usedClueCodes，**绝不会复用**——避免同一局内出现两条相同 code。

旧实现生成的 `0001/0002/0003/0004` 在新 server 启动后被 `initClueSeq()` 收集为已用集。新生成的 code 不会与它们冲突，自然"看上去无规律"。

## 调参指引

| 场景 | 建议 |
|------|------|
| 剧本线索极少（≤10 条） | 默认参数足够；NEAR_GAP 可放宽到 100 以追求更大差异 |
| 剧本线索极多（≥200 条） | NEAR_GAP 改 30、INFER_GAP 改 2；防止 MAX_TRIES 触发 |
| 想要"看起来像真人手写" | 在 4 位数字基础上，前缀 `A-/B-` 等（如 `A-1503`）——但违反硬约束 #4 的"4 位纯数字" |
| 想要完全混合字母数字 | 见下方"未来扩展" |

## 未来扩展（不破坏硬约束）

如果后续放开约束（允许字母数字混合），空间从 9000 跳到 32^4 = 104 万，可：
- 去掉 NEAR_GAP 限制（空间够大不会撞近邻）
- INFER_GAP 改为查"前缀字符"而非"数字差值"
- 仍用 `randStr(4, ALPHA)` 复用现有工具

但当前剧本杀用户体验上，4 位数字仍是"易记、易口播、易输入"的最佳形态。