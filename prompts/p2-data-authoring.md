# p2-data-authoring.md · 剧本 → data.json 抽取引导

## 目标
把剧本样例目录转成 `data.json`。

## 扫描清单

```
剧本目录/
├── 人物剧本/             ← characters[].script
│   ├── 角色1.pdf
│   ├── 角色2.pdf
│   └── ...
├── 角色起始线索/          ← characters[].startClue.image
│   ├── 角色1.jpg
│   └── ...
├── 主持人手册.pdf         ← dmRefs
├── 真相.pdf              ← truth.image（可选）
├── 邀请函.pdf             ← rules
├── 调查问卷.pdf           ← rules
├── 故事背景.pdf           ← rules
├── 线索.pdf              ← areas[].clues[].images
├── 地图.jpg              ← areas[].mapImage
└── 时间线.xlsx            ← timeline（手工转 JSON）
```

## docx / PDF 内容读取

**唯一管线（零依赖）**：docx/doc 一律 `python assets/extract-docx.py <文件> -o out.txt`
（按样式识别标题、表格转 `|` 行、.doc 有 OLE 兜底；失败写 `[EMPTY]` 占位，validate-data 会警告）。
**禁止**为抽取引入 pandoc / python-docx / pdftotext / pypdf 等额外依赖。

**PDF**：文本型交给 `pdf-to-png.template.cjs` 截页后在图上读；需要纯文本时先截页再人工转录，
不引入 PDF 文本库。

## 字段抽取映射

| 剧本资料 | data.json 字段 | 抽取方法 |
|---------|----------------|---------|
| 角色名 | `characters[].name` | PDF 第一页标题 / 角色 docx 文件名 |
| 角色简介 | `characters[].desc` | PDF 第一段 |
| 角色秘密 | `characters[].secret` | PDF 中"秘密"段（DM 独占） |
| 角色提示 | `characters[].hint` | PDF 中"提示"段（DM 独占） |
| 角色职业 | `characters[].title` | PDF 标题或简介中提取 |
| 起始线索 | `characters[].startClue.text` | PDF 中"起始线索"段 |
| 真相 | `truth.text` | 主持人手册或真相.pdf |
| 时间线 | `timeline[]` | 主持人手册中"游戏流程"段 |
| 区域 | `areas[]` | 主持人手册"场景/区域"段 |
| 线索 | `areas[].clues[]` | 线索.pdf 或分散图片 |

## 字段填写规则

- `id`：ASCII 拼音/英文（如 `"char_a"`、`"char_b"`）
- `name`：`name` 用中文，`short` 是 2-3 字简称
- `color`：7 位 hex，按角色性格选色（阴谋家暗红 / 医生冷蓝 / 受害者米白）
- `medical`：true / false，看角色是否能直接读医疗档案
- `gender`：`男` / `女`

详见 `references/02-data-schema.md`。

## 写入前确认

写入 `data.json` 前先展示 schema 草案给用户：
```markdown
## data.json 草案

### characters
- 角色甲（char_a, #c98db5, false, 男, 餐厅老板, 秘密：...)
- 角色乙（char_b, #7fb3d5, true, 女, 服务员, 秘密：...)
...

### areas
- 餐桌（apCost:1）
  - 餐叉线索（card:1, images:["res/clues/1.jpg"]）
  - 餐盘线索（card:2, images:["res/clues/2.jpg"]）
- 厨房（apCost:2, owner:["char_b"], allowOwner:false）
...

### truth
- 真相（TRUTH）：真凶是角色甲，动机是...

是否确认？(Y/N)
```

确认后再写入 `data.json`。

## 失败处理

- docx 解析失败 → 用 pandoc 转 markdown 重试
- PDF 加密 → 提示用户提供密码
- 字段缺失（如找不到秘密）→ 标记为 `"(未提供)"`，不要瞎编