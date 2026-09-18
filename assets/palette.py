#!/usr/bin/env python3
"""%PROJECT_TITLE% · 色板生成器 (palette.py)
从剧本题材（色相）或封面图生成一套协调的深色主题色板，输出 JSON，
可直接喂给 gen-theme.cjs --palette-file 定制主题。

用法：
  # 按色相生成（0-360）：--hue 210 冷色科技感 / 0 血色 / 45 沙漠暖金
  python palette.py --hue 210 -o palette.json

  # 从封面/海报图提取主导色（需 Pillow）
  python palette.py --image 封面.jpg -o palette.json

  # 接入主题生成器
  node gen-theme.cjs --genre gothic --palette-file palette.json --name custom --out public/css

输出格式与 theme-presets.template.json 的单色板一致，含 18 个核心变量 +
可选氛围色键（candle/eldritch 等，按需要手加）。
"""
import argparse
import colorsys
import json
import math
import sys

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def h2x(h, s, l):
    """HSL(0-360, 0-1, 0-1) -> #rrggbb。"""
    r, g, b = colorsys.hls_to_rgb(h / 360.0, clamp(l), clamp(s))
    return '#%02x%02x%02x' % (int(round(r * 255)), int(round(g * 255)), int(round(b * 255)))


def x2hsl(hexs):
    """#rrggbb -> (h, s, l)。"""
    v = hexs.lstrip('#')
    r, g, b = int(v[0:2], 16) / 255, int(v[2:4], 16) / 255, int(v[4:6], 16) / 255
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return h * 360, s, l


def lum(hexs):
    v = hexs.lstrip('#')
    r, g, b = int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)
    return (299 * r + 587 * g + 114 * b) / 1000


def contrast(t, b):
    t_, b_ = lum(t) + 5, lum(b) + 5
    return t_ / b_


def lighten(hexs, amount):
    """向白色方向提亮 amount(0-1)。"""
    v = hexs.lstrip('#')
    r, g, b = int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)
    r = int(r + (255 - r) * amount)
    g = int(g + (255 - g) * amount)
    b = int(b + (255 - b) * amount)
    return '#%02x%02x%02x' % (r, g, b)


def warm_hue(h):
    """gold/warn 的色相：往琥珀暖色带偏，但避开绿色死区（30-100）。"""
    gh = (h + 38) % 360
    if 30 <= gh <= 100:
        return 40
    return gh


def palette_from_hue(h):
    """以主色相 h 构建全套深色板：bg 深色调、blood 饱和强调、gold 互补暖色。"""
    h = h % 360
    gh = warm_hue(h)
    return {
        'bg': h2x(h, 0.28, 0.055),
        'bg2': h2x(h, 0.26, 0.085),
        'panel': h2x(h, 0.24, 0.12),
        'panel2': h2x(h, 0.22, 0.16),
        'panel3': h2x(h, 0.20, 0.21),
        'line': h2x(h, 0.20, 0.27),
        'line2': h2x(h, 0.18, 0.36),
        'text': h2x(h, 0.16, 0.85),
        'muted': h2x(h, 0.11, 0.62),
        'dim': h2x(h, 0.09, 0.42),
        'blood': h2x(h, 0.55, 0.34),
        'blood2': h2x(h, 0.52, 0.25),
        'gold': h2x(gh, 0.50, 0.50),
        'gold2': h2x(gh, 0.44, 0.38),
        'ok': h2x((h + 90) % 360, 0.32, 0.44),
        'info': h2x((h + 210) % 360, 0.38, 0.46),
        'warn': h2x((gh + 7) % 360, 0.48, 0.48),
        'danger': h2x(h, 0.52, 0.42),
    }


def ladder(bg):
    """从实际 bg 提亮重建面板阶梯，保证亮度严格递增（gen-theme 梯度校验通过）。"""
    return {
        'bg2': lighten(bg, 0.03),
        'panel': lighten(bg, 0.07),
        'panel2': lighten(bg, 0.12),
        'panel3': lighten(bg, 0.18),
        'line': lighten(bg, 0.25),
        'line2': lighten(bg, 0.34),
    }


def palette_from_image(img_path, count=5):
    """从封面图取主导色：最暗做 bg、最饱和中亮度做 blood、最亮非白做 gold。
    图片低饱和（近似黑白）时回退为从 bg 色相推导整套色板，保证输出永远可用。"""
    if not HAS_PIL:
        print('[ERROR] 图片模式需要 Pillow：pip install pillow', file=sys.stderr)
        sys.exit(1)
    img = Image.open(img_path).convert('RGB')
    img = img.resize((96, int(96 * img.height / img.width)), Image.LANCZOS)
    q = img.quantize(colors=count, method=Image.MEDIANCUT).convert('RGB')
    colors = sorted(q.getcolors(96 * 96), reverse=True)
    hexes = []
    for _, px in colors:
        h = '#%02x%02x%02x' % px
        if h not in hexes:
            hexes.append(h)

    bg = min(hexes, key=lum)
    sat = [h for h in hexes if x2hsl(h)[1] > 0.18 and 20 < lum(h) < 180]
    if not sat:
        # 低饱和图：直接用 bg 色相推导整套（与 --hue 模式同构）
        p = palette_from_hue(x2hsl(bg)[0])
        p['bg'] = bg if lum(bg) < 110 else h2x(x2hsl(bg)[0], x2hsl(bg)[1], 0.12)
        p.update(ladder(p['bg']))
        if lum(p['bg']) > 110:
            p['text'] = h2x(x2hsl(p['bg'])[0], 0.15, 0.88)
        return p

    blood = max(sat, key=lambda h: x2hsl(h)[1])
    bright = [h for h in hexes if 110 < lum(h) < 235]
    gold = max(bright, key=lum) if bright else lighten(blood, 0.5)

    h, s, _ = x2hsl(blood)
    gh, gs, _ = x2hsl(gold)
    p = palette_from_hue(h)
    p['bg'] = bg if lum(bg) < 110 else h2x(h, x2hsl(bg)[1], 0.12)
    p.update(ladder(p['bg']))
    p.update({
        'blood': blood,
        'blood2': h2x(h, max(0.4, s - 0.08), max(0.14, x2hsl(blood)[2] - 0.10)),
        'gold': gold,
        'gold2': h2x(gh, max(0.3, gs - 0.08), max(0.22, x2hsl(gold)[2] - 0.14)),
        'text': h2x(gh, 0.16, 0.88 if lum(p['bg']) < 110 else 0.30),
    })
    return p


def report(p):
    lines = []
    lines.append('主色: bg=%s  blood=%s  gold=%s  text=%s' % (p['bg'], p['blood'], p['gold'], p['text']))
    lines.append('对比度: text/bg=%.2f (≥4.5 达标)  muted/bg=%.2f (≥3)' % (
        contrast(p['text'], p['bg']), contrast(p['muted'], p['bg'])))
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser(description='Generate a coordinated dark palette')
    ap.add_argument('--hue', type=float, help='主色相 0-360（纯数学生成，无需依赖）')
    ap.add_argument('--image', help='封面图路径（需 Pillow）')
    ap.add_argument('-o', '--out', default='palette.json', help='输出 JSON 路径')
    ap.add_argument('--count', type=int, default=5, help='图片取色数量（默认 5）')
    args = ap.parse_args()

    if args.hue is not None:
        p = palette_from_hue(args.hue % 360)
        src = 'hue=%g' % args.hue
    elif args.image:
        p = palette_from_image(args.image, args.count)
        src = 'image=%s' % args.image
    else:
        print('[ERROR] 需要 --hue 或 --image 之一', file=sys.stderr)
        sys.exit(1)

    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(p, f, ensure_ascii=False, indent=2)
    print('✅ 色板已生成: %s（来源: %s）' % (args.out, src))
    print(report(p))
    print('   接入: node gen-theme.cjs --genre <题材> --palette-file %s --name custom' % args.out)


if __name__ == '__main__':
    main()
