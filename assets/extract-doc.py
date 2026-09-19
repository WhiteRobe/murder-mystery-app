#!/usr/bin/env python3
"""%PROJECT_TITLE% · 旧版 .doc 剧本文本抽取 (extract-doc.py)

.docx 是 zip，.doc 是旧二进制 OLE（Word 97-2003）。zipfile/ElementTree 打不开
.doc，必须按 OLE + WordDocument 流的 piece-table 解析，才能拿到**无头部垃圾**的正文。

核心：FIB → fcClx/lcbClx → CLX 里的 PlcPcd（piece table）→ 只读每个 piece 的
文本段落（UTF-16LE；压缩 piece 则 ANSI 单字节）。这样 FIB 头、字体/格式表数据
**完全不会混进输出**——它们不属于任何 piece 的文本区间。

抽取优先级：
  1) olefile 打开 OLE → word:WordDocument 流 → piece-table 精确抽取（最干净，推荐）
  2) 无 olefile 或解析失败 → 退化为「逐字节启发式扫描」（同 extract-docx.py fallback）
  3) 若检测到系统 soffice(LibreOffice)，可加 -S 用其转换作为保底对照（质量最好）

用法：
  pip install olefile            # 推荐；不装则走启发式扫描
  python extract-doc.py 剧本.doc [-o out.txt]
  python extract-doc.py 目录/*.doc        # 逐个抽取，每个输出同名 .txt

输出：纯文本（Markdown 风格段落）。若完全抽不出，写 [EMPTY] 占位并告警，绝不留空文件。
"""
import argparse
import os
import re
import struct
import subprocess
import sys

try:
    import olefile
    HAS_OLEFILE = True
except Exception:
    HAS_OLEFILE = False


# ---------- 编码辅助 ----------
def _cj_ratio(s):
    """粗略统计 CJK 覆盖率，用于判断解码是否像正文。"""
    if not s:
        return 0.0
    n = len(s)
    cjk = sum(1 for c in s if '\u4e00' <= c <= '\u9fff' or
              '\u3000' <= c <= '\u303f' or '\uff00' <= c <= '\uffef')
    return cjk / n if n else 0.0


def _clean_text(raw):
    """统一清洗：剥 BOM、控制符转行、去不可打印字节、折叠空行。"""
    if not raw:
        return ''
    raw = raw.lstrip('\ufeff')
    for ch in ('\x07', '\x0b', '\x0c', '\r'):
        raw = raw.replace(ch, '\n')
    raw = ''.join(c for c in raw if c in ('\n', '\t', ' ') or ord(c) >= 0x20)
    lines = []
    for line in raw.split('\n'):
        line = re.sub(r'[ \t]{2,}', ' ', line).strip()
        if line:
            lines.append(line)
    return '\n'.join(lines)


def _decode_ansi(data):
    """单字节 piece:按编码猜。优先 GBK(中文)，次 cp1252。"""
    for enc in ('gbk', 'cp1252'):
        try:
            s = data.decode(enc)
            if _cj_ratio(s) > 0.0 or enc == 'cp1252':
                return s
        except Exception:
            pass
    return data.decode('latin-1', 'ignore')


# ---------- piece-table 解析 ----------
def _parse_fib(wd):
    """从 WordDocument 流读 FIB 关键字段。返回 (nFib, fcClx, lcbClx) 或 None。"""
    if len(wd) < 0x1AA:
        return None
    n_fib = struct.unpack_from('<H', wd, 0x02)[0]
    # Word95(0x0065) 用旧布局，偏移不同 → 不尝试，交给 fallback。
    if n_fib <= 0x0065:
        return n_fib, None, None
    fc_clx = struct.unpack_from('<I', wd, 0x01A2)[0]
    lcb_clx = struct.unpack_from('<I', wd, 0x01A6)[0]
    return n_fib, fc_clx, lcb_clx


def _parse_piece_table(clx):
    """解析 CLX 里的 PlcPcd，返回 pieces: [(cp_start, cp_end, fc, fCompressed)]。"""
    pieces = []
    pos = 0
    n = len(clx)
    while pos < n:
        t = clx[pos]
        if t == 0x01:          # Prc：跳过
            if pos + 1 >= n:
                break
            cb = clx[pos + 1]
            pos += 2 + cb + 2
        elif t == 0x02:        # Pcdt：真正的 piece table
            if pos + 5 > n:
                break
            lcb = struct.unpack_from('<I', clx, pos + 1)[0]
            plc = clx[pos + 5: pos + 5 + lcb]
            n_piece = (lcb - 4) // 12
            if n_piece <= 0:
                break
            cps = struct.unpack_from('<%dI' % (n_piece + 1), plc, 0)
            pcd = plc[(n_piece + 1) * 4:]
            for i in range(n_piece):
                fc_raw = struct.unpack_from('<I', pcd, i * 8 + 4)[0]
                f_comp = bool(fc_raw & 0x40000000)
                in_table = bool(fc_raw & 0x80000000)
                fc = (fc_raw & 0x3FFFFFFF) >> 1 if f_comp else (fc_raw & 0x3FFFFFFF)
                pieces.append((cps[i], cps[i + 1], fc, f_comp, in_table))
            break
        else:
            break
    return pieces


def _extract_by_piece_table(path):
    """piece-table 精确抽取。返回清洗后的正文或 None。"""
    if not HAS_OLEFILE:
        return None
    ole = olefile.OleFileIO(path)
    try:
        if not ole.exists('WordDocument'):
            return None
        wd = ole.openstream('WordDocument').read()
        # Table stream（极少数 fc 指向表流）
        table = None
        if ole.exists('Table'):
            table = ole.openstream('Table').read()
    finally:
        ole.close()

    fib = _parse_fib(wd)
    if not fib:
        return None
    n_fib, fc_clx, lcb_clx = fib
    if fc_clx is None or lcb_clx is None or lcb_clx <= 0:
        return None
    if fc_clx < 0 or fc_clx + lcb_clx > len(wd):
        return None

    pieces = _parse_piece_table(wd[fc_clx: fc_clx + lcb_clx])
    if not pieces:
        return None

    out = []
    for cp_start, cp_end, fc, f_comp, in_table in pieces:
        span = cp_end - cp_start
        if span <= 0 or fc < 0:
            continue
        src = table if in_table and table else wd
        if f_comp:
            data = src[fc: fc + span]
            out.append(_decode_ansi(data))
        else:
            data = src[fc: fc + span * 2]
            out.append(data.decode('utf-16-le', 'ignore'))
    text = ''.join(out)
    return _clean_text(text) or None


# ---------- soffice 保底（可用则自动启用） ----------
def _find_soffice():
    import shutil
    for name in ('soffice', 'soffice.exe', 'libreoffice'):
        p = shutil.which(name)
        if p:
            return p
    return None


def _extract_by_soffice(path):
    so = _find_soffice()
    if not so:
        return None
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        # 以二进制捕获输出：soffice 可能向 stderr 写非 UTF-8 字节，
        # 用 text=True 会在读取线程里抛 UnicodeDecodeError(良性竞态)污染输出。
        r = subprocess.run([so, '--headless', '--convert-to', 'txt:Text (encoded):UTF8',
                            '--outdir', td, path],
                           capture_output=True, timeout=120)
        base = os.path.splitext(os.path.basename(path))[0]
        out = os.path.join(td, base + '.txt')
        if r.returncode == 0 and os.path.exists(out):
            with open(out, 'r', encoding='utf-8', errors='ignore') as f:
                return _clean_text(f.read()) or None
    return None


# ---------- 启发式扫描兜底 ----------
def _extract_by_scan(path):
    with open(path, 'rb') as f:
        data = f.read()
    out = []
    i, n = 0, len(data)
    while i < n:
        b = data[i]
        if 32 <= b < 127 or b in (10, 13, 9):
            out.append(chr(b)); i += 1; continue
        if i + 1 < n:
            lo, hi = b, data[i + 1]
            if hi == 0 and 0x20 <= lo < 0x7f:
                out.append(chr(lo)); i += 2; continue
            code = lo | (hi << 8)
            if 0x4e00 <= code <= 0x9fff or 0x3000 <= code <= 0x303f or 0xff00 <= code <= 0xffef:
                out.append(chr(code)); i += 2; continue
        i += 1
    return _clean_text(''.join(out)) or None


def extract(path, use_soffice=False):
    """按优先级抽取，返回 (text, method)。
    顺序：piece-table（零依赖，标准 Word97 干净）→ soffice（可解析 fast-save 等
    piece-table 抽不出的 doc，质量最高，但依赖系统 LibreOffice）→ heuristic 兜底。"""
    t = _extract_by_piece_table(path)
    if t:
        return t, 'piece-table'
    if use_soffice or _find_soffice():
        t = _extract_by_soffice(path)
        if t:
            return t, 'soffice'
    t = _extract_by_scan(path)
    if t:
        return t, 'heuristic'
    return None, 'none'


def main():
    ap = argparse.ArgumentParser(description='Extract clean text from legacy binary .doc')
    ap.add_argument('docs', nargs='+', help='.doc file(s) or directory')
    ap.add_argument('-o', '--out', help='override output file (only for single input)')
    ap.add_argument('-S', '--soffice', action='store_true',
                    help='also try system LibreOffice as a fallback')
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
        out = args.out if (args.out and len(files) == 1) else src.rsplit('.', 1)[0] + '.txt'
        text, method = extract(src, use_soffice=args.soffice)
        with open(out, 'w', encoding='utf-8') as f:
            f.write(text + ('\n' if text else '[EMPTY] 抽取失败: ' + src + '\n'))
        if text:
            print('OK  %s -> %s (%d chars, %s)' % (src, out, len(text), method))
        else:
            print('WARN %s 完全抽不出，写出占位 %s' % (src, out), file=sys.stderr)


if __name__ == '__main__':
    main()