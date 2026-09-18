#!/usr/bin/env python3
"""%PROJECT_TITLE% · docx 剧本文本抽取 (extract-docx.py)
零依赖：只用标准库 zipfile + xml，解析 .docx 的 word/document.xml，
抽取段落/标题/表格文本，输出可粘贴进 data.json 的结构化文本。

用法：
  python extract-docx.py 剧本.docx                 # 输出 剧本.txt（Markdown 风格）
  python extract-docx.py 剧本.docx -o out.md      # 指定输出文件
  python extract-docx.py 剧本.docx --json         # 输出 {title, paragraphs[], tables[]}

规则：
  - 按样式识别标题：Heading1/标题 1 -> "# "，Heading2 -> "## "，依此类推
  - 表格逐行输出，用 | 分隔
  - 忽略页眉页脚（header/footer 不在 document.xml 正文中）
"""
import argparse
import json
import re
import subprocess
import sys
import zipfile
import xml.etree.ElementTree as ET

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS = {'w': W}


def qn(tag):
    """'w:p' -> '{ns}p'（剥掉 w: 前缀，ElementTree 用完整命名空间标签）。"""
    return '{%s}%s' % (W, tag.split(':')[-1])


def style_name(pPr, styles):
    """返回段落样式名（如 Heading1 / 标题 1）。"""
    if pPr is None:
        return None
    sid = pPr.find(qn('w:pStyle'))
    if sid is None:
        return None
    val = sid.get(qn('w:val'))
    if val is None:
        return None
    return styles.get(val, val)


def read_styles(zipped):
    styles = {}
    try:
        with zipped.open('word/styles.xml') as f:
            root = ET.fromstring(f.read())
    except KeyError:
        return styles
    for s in root.findall(qn('w:style')):
        sid = s.get(qn('w:styleId'))
        name = s.find(qn('w:name'))
        if sid is not None and name is not None:
            styles[sid] = name.get(qn('w:val'), sid)
    return styles


def para_text(p):
    """拼接段落内所有 w:t 文本。"""
    parts = []
    for t in p.iter(qn('w:t')):
        parts.append(t.text or '')
    return ''.join(parts)


def heading_level(style):
    if not style:
        return None
    m = re.search(r'([Hh]eading|标题)\s*(\d)', style)
    if m:
        return int(m.group(2))
    if style.lower() in ('title', '标题'):
        return 0
    return None


def table_rows(tbl):
    rows = []
    for tr in tbl.findall(qn('w:tr')):
        cells = []
        for tc in tr.findall(qn('w:tc')):
            txt = ''.join(t.text or '' for t in tc.iter(qn('w:t')))
            cells.append(txt.strip())
        rows.append(cells)
    return rows


def extract(path):
    with zipfile.ZipFile(path) as z:
        styles = read_styles(z)
        with z.open('word/document.xml') as f:
            root = ET.fromstring(f.read())

    paragraphs = []
    tables = []
    body = root.find(qn('w:body'))
    if body is None:
        return {'title': path, 'paragraphs': [], 'tables': []}

    for el in body:
        tag = el.tag
        if tag == qn('w:p'):
            pPr = el.find(qn('w:pPr'))
            style = style_name(pPr, styles)
            text = para_text(el).strip()
            if text:
                lvl = heading_level(style)
                paragraphs.append({'text': text, 'style': style, 'level': lvl})
        elif tag == qn('w:tbl'):
            rows = table_rows(el)
            if rows:
                tables.append(rows)
        elif tag == qn('w:sectPr'):
            continue
    return {'title': path, 'paragraphs': paragraphs, 'tables': tables}


def to_markdown(doc):
    lines = []
    for p in doc['paragraphs']:
        lvl = p['level']
        if lvl == 0:
            lines.append('# ' + p['text'])
        elif lvl:
            lines.append('#' * min(lvl + 1, 6) + ' ' + p['text'])
        else:
            lines.append(p['text'])
        lines.append('')
    for tbl in doc['tables']:
        if not tbl:
            continue
        lines.append('| ' + ' | '.join(tbl[0]) + ' |')
        lines.append('|' + '---|' * len(tbl[0]))
        for row in tbl[1:]:
            lines.append('| ' + ' | '.join(row) + ' |')
        lines.append('')
    return '\n'.join(lines).rstrip() + '\n'


def extract_doc_fallback(path, out):
    """提取 .doc（旧二进制 OLE 格式）的内容，输出纯文本到 out。

    策略（按优先级）：
      1) antiword（若已安装）→ 直接拿纯文本
      2) catdoc / wvText / soffice --headless（备选）
      3) UTF-16 LE 段解码（OLE Word 文档里 ChineseText 用 UTF-16 LE 存储）
      4) ASCII 兜底（终极）

    返回写入的字符数（0 表示完全失败，写入 [EMPTY] 占位标记）。
    """
    # 1) antiword / catdoc / wvText
    for tool in ('antiword', 'catdoc', 'wvText'):
        try:
            r = subprocess.run([tool, path], capture_output=True, timeout=15)
            if r.returncode == 0 and r.stdout and r.stdout.strip():
                with open(out, 'wb') as f:
                    f.write(r.stdout)
                return len(r.stdout)
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            continue
    # 2) ASCII + UTF-16 LE 双解码（OLE Word 文档里 ChineseText 用 UTF-16 LE 存储）
    try:
        with open(path, 'rb') as f:
            data = f.read()
        out_chars = []
        i = 0
        while i < len(data):
            b = data[i]
            # ASCII 可打印字符
            if 32 <= b < 127 or b in (10, 13, 9):
                out_chars.append(chr(b))
                i += 1
                continue
            # UTF-16 LE 双字节：连续 2 字节都在 0x20-0x7E 或 0x4E00-0x9FFF / 0x3000-0x303F（中文/标点）
            if i + 1 < len(data) and b != 0:
                lo, hi = b, data[i + 1]
                if hi == 0 and 0x20 <= lo < 0x7F:
                    # ASCII as UTF-16LE（罕见）
                    out_chars.append(chr(lo))
                    i += 2
                    continue
                # 中日韩字符（BMP 区段）
                code = lo | (hi << 8)
                if 0x4E00 <= code <= 0x9FFF or 0x3000 <= code <= 0x303F or 0xFF00 <= code <= 0xFFEF:
                    try:
                        out_chars.append(chr(code))
                        i += 2
                        continue
                    except ValueError:
                        pass
            # 跳过控制字节
            i += 1
        cleaned = ''.join(out_chars)
        # 整理空白
        cleaned = re.sub(r'[ \t]{2,}', ' ', cleaned)
        cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
        if cleaned.strip():
            with open(out, 'w', encoding='utf-8') as f:
                f.write(cleaned[:50000])
            return len(cleaned)
    except Exception:
        pass
    return 0


def main():
    ap = argparse.ArgumentParser(description='Extract text from .docx/.doc script files')
    ap.add_argument('docx', help='input .docx or .doc file')
    ap.add_argument('-o', '--out', help='output file (default: <docx>.txt)')
    ap.add_argument('--json', action='store_true', help='output raw JSON structure')
    args = ap.parse_args()

    out = args.out or args.docx.rsplit('.', 1)[0] + '.txt'
    src_lower = args.docx.lower()

    if src_lower.endswith('.doc'):
        # .doc 旧格式走 fallback
        n = extract_doc_fallback(args.docx, out)
        if n > 0:
            print('⚠️  .doc fallback 抽取: %s -> %s (%d 字节)' % (args.docx, out, n))
        else:
            with open(out, 'w', encoding='utf-8') as f:
                f.write('[EMPTY] .doc 抽取完全失败（antiword 未安装 / 二进制无法解码）: ' + args.docx + '\n')
            print('⚠️  .doc 抽取失败，写入占位标记: %s -> %s' % (args.docx, out), file=sys.stderr)
        return

    if not zipfile.is_zipfile(args.docx):
        print('[ERROR] 不是有效的 .docx 文件:', args.docx, file=sys.stderr)
        sys.exit(1)

    doc = extract(args.docx)
    if args.json:
        data = json.dumps(doc, ensure_ascii=False, indent=2)
        with open(out, 'w', encoding='utf-8') as f:
            f.write(data + '\n')
    else:
        with open(out, 'w', encoding='utf-8') as f:
            f.write(to_markdown(doc))
    n_para = len(doc['paragraphs'])
    n_tbl = len(doc['tables'])
    print('✅ 抽取完成: %s -> %s (%d 段, %d 表)' % (args.docx, out, n_para, n_tbl))


if __name__ == '__main__':
    main()
