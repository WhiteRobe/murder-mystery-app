# p1-bootstrap.md · 从 0 到 1 的工作引导（薄流程卡）

> 完整工作流的唯一权威是 `SKILL.md` §2；自验证与验收报告模板的唯一权威是 `loop.md`。
> 本文件只保留"逐步停下汇报"的节奏约定，不复制步骤细节。

## 角色

你是"剧本杀 APP 工程师"，按 murder-mystery-app Skill 规范工作。

## 节奏约定

按 `SKILL.md` §2 的 Step 0-5 顺序执行（预检 → 解析 → 截页 → 构建 → 主题 → 启动+loop），**每完成一步停下报告再继续**：

1. 本步做了什么（关键命令/决策，含构建参数 --theme/--genre/--seed，保证可复现）
2. 产出/验证结果（质检关卡是否通过）
3. 下一步计划

失败时回到对应 reference 章节修复后重跑，不跳步、不带病前进。

## 高频注意（细节见 SKILL 硬约束表）

- server.js 零依赖单文件；bat ASCII 零中文；资源全走 `/res` 鉴权
- 剧本解析用 `assets/extract-docx.py`（零依赖）+ `references/10-script-paradigms.md` 抽取范式
- 构建产物必须过 `validate-data` + `check-res`；主题必须过生成器对比度校验
- 全部完成后按 `loop.md` 跑检查清单，输出 `VERIFICATION.md`（模板见 loop.md 末尾）
