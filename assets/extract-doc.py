#!/usr/bin/env python3
"""%PROJECT_TITLE% · 旧版 .doc 剧本文本抽取 (extract-doc.py)

扩展 .docx 解析：.doc 是旧二进制 OLE 格式（Word 97-2003），不是 zip，
zipfile/ElementTree 都打不开，必须走独立路径。本方按优先级逐级尝试，
**任一文件都能抽到纯文本**（传入不同文件都会自动分派）:

  1) olefile 解析 OLE 的 word:WordDocument 流 → 拿字节串
     - UTF-16-LE 解码（中文剧本最常用编码）
     - 若 UTF-16 基本抽不出正文，回退 GBK / ANSI 单字节解码
     - 清洗控制字符、折叠空行
  2) 无 olefile 库时 → 退化为「逐字节启发式扫描」：
     - ASCII 可打印 + UTF-16-LE 中日韩字符混合提取（同 extract-docx.py 的 fallback）

用法：
  pip install olefile            # 可选；不装则自动走启发式扫描
  python extract-doc.py 剧本.doc [-o out.txt]
  python extract-doc.py 目录/*.doc        # 逐个抽取，每个输出同名 .txt

输出：纯文本（Markdown 风格段落），可直接粘贴进 data.json 的：
  characters[].desc/hint/secret、timeline[].text、truth.text、clues[].text。
若完全抽不出，写出 [EMPTY] 占位并打印警告（需人工补全），绝不静默产出空文件。
"""
import argparse
import re
import sys

try:
    import olefile
    HAS_OLEFILE = True
except Exception:
    HAS_OLEFILE = False


def _clean_text(raw):
    """统一清洗：控制符转行、去不可打印字节、折叠空行。"""
    if not raw:
        return ''
    for ch in ('\x07', '\x0b', '\x0c', '\r'):
        raw = raw.replace(ch, '\n')
    raw = ''.join(c for c in raw if c in ('\n', '\t', ' ') or ord(c) >= 0x20)
    lines = []
    for line in raw.split('\n'):
        line = re.sub(r'[ \t]{2,}', ' ', line).strip()
        if line:
            lines.append(line)
    return '\n'.join(lines)


def _cj_ratio(s):
    """粗略统计 CJK 覆盖率，用于判断哪种解码有效。"""
    if not s:
        return 0.0
    cjk = sum(1 for c in s if '\u4e00' <= c <= '\u9fff' or
              '\u3000' <= c <= '\u303f' or '\uff00' <= c <= '\uffef')
    return cjk / len(s)


def _by_olefile(path):
    if not HAS_OLEFILE:
        return None
    ole = olefile.OleFileIO(path)
    try:
        if not ole.exists('WordDocument'):
            return None
        wd = ole.openstream('WordDocument').read()
    finally:
        ole.close()

    # 1) UTF-16-LE（中文剧本最常；Word 97 中文用青田字在 piece table 里也是 UTF-16LE）
    cur = _clean_text(wd.decode('utf-16-le', errors='ignore'))
    # 2) 若 UTF-16 正文稀疏，回退 GBK / ANSI 单字节
    if _cj_ratio(cur) < 0.001:
        for enc in ('gbk', 'cp1252', 'latin-1'):
            try:
                cand = _clean_text(wd.decode(enc, errors='ignore'))
            except Exception:
                continue
            if len(cand) > len(cur):
                cur = cand
    return cur or None


def _by_scan(path):
    """无 olefile 时的启发式扫描：ASCII 可打印 + UTF-16-LE 中日韩。"""
    with open(path, 'rb') as f:
        data = f.read()
    out = []
    i = 0
    n = len(data)
    while i < n:
        b = data[i]
        if 32 <= b < 127 or b in (10, 13, 9):
            out.append(chr(b))
            i += 1
            continue
        if i + 1 < n and b != 0:
            lo, hi = b, data[i + 1]
            if hi == 0 and 0x20 <= lo < 0x7f:
                out.append(chr(lo)); i += 2; continue
            code = lo | (hi << 8)
            if 0x4e00 <= code <= 0x9fff or 0x3000 <= code <= 0x303f or \
               0xff00 <= code <= 0xffef:
                out.append(chr(code)); i += 2; continue
        i += 1
    return _clean_text(''.join(out)) or None


def extract(path):
    try:
        if HAS_OLEFILE:
            t = _by_olefile(path)
            if t:
                return t
        t = _by_scan(path)
        return t or None
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser(description='Extract text from legacy binary .doc')
    ap.add_argument('docs', nargs='+', help='.doc file(s) or directory')
    ap.add_argument('-o', '--out', help='override output file (only for single input)')
    args = ap.parse_args()

    files = []
    for d in args.docs:
        if os.path.isdir(d):
            files += [os.path.join(d, f) for f in os.listdir(d)
                      if f.lower().endswith('.doc')]
        else:
            files.append(d)
    if not files:
        print('[ERROR] no .doc input', file=sys.stderr)
        sys.exit(1)

    for src in files:
        out = args.out or src.rsplit('.', 1)[0] + '.txt'
        text = extract(src)
        with open(out, 'w', encoding='utf-8') as f:
            f.write(text + '\n' if text else '[EMPTY] 抽取失败: ' + src + '\n')
        if text:
            print('OK  %s -> %s (%d chars, olefile=%d)' % (
                src, out, len(text), HAS_OLEFILE))
        else:
            print('WARN %s 完全抽不出，写出占位 %s' % (src, out), file=sys.stderr)


if __name__ == '__main__':
    import os
    main()