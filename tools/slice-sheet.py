# 部品シート(白い背景に 10 個の部品を 2 段に並べた 1 枚)を切り分けて src/assets/art/ に置く。
# python3 tools/slice-sheet.py <シート.png> [出力先=src/assets/art]
# 上の段 = 主人公(もも・すね・すね素肌・素足・靴)、下の段 = 友だち(同じ順)。
import sys
from collections import deque
from PIL import Image, ImageFilter

NAMES = [['me_thigh', 'me_shin', 'me_shin_bare', 'me_foot_bare', 'me_shoe', 'me_shoe_worn'],
         ['fr_thigh', 'fr_shin', 'fr_shin_bare', 'fr_foot_bare', 'fr_shoe', 'fr_shoe_worn']]
PER = len(NAMES[0])
src, out = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else 'src/assets/art')
im = Image.open(src).convert('RGBA')
W, H = im.size
S = 4  # 1/4 に縮めて部品のかたまりを探す
small = im.resize((W // S, H // S))
px = small.load()
w, h = small.size
ink = Image.new('L', (w, h))
ip = ink.load()
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        ip[x, y] = 255 if a > 40 and not (r > 228 and g > 228 and b > 228) else 0
ink = ink.filter(ImageFilter.MaxFilter(7))  # 近い線どうしをつなぐ
ip = ink.load()
seen = [[False] * w for _ in range(h)]
boxes = []
for y in range(h):
    for x in range(w):
        if ip[x, y] and not seen[y][x]:
            q = deque([(x, y)]); seen[y][x] = True
            x0 = x1 = x; y0 = y1 = y; n = 0
            while q:
                cx, cy = q.popleft(); n += 1
                x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and ip[nx, ny] and not seen[ny][nx]:
                        seen[ny][nx] = True; q.append((nx, ny))
            if n > 150:
                boxes.append((x0 * S, y0 * S, (x1 + 1) * S, (y1 + 1) * S, n))
def clear_white(img):
    # 外側から白をたどって透明に(線の内側の白い靴下や靴底は残す)
    img = img.copy(); p = img.load(); cw, ch = img.size
    seen = set(); # 下の辺からは始めない(すねの下端は開いていて、白い靴下に入り込むため)
    q = deque([(x, 0) for x in range(cw)] + [(x, y) for y in range(ch) for x in (0, cw - 1)])
    while q:
        x, y = q.popleft()
        if (x, y) in seen or not (0 <= x < cw and 0 <= y < ch): continue
        seen.add((x, y))
        r, g, b, a = p[x, y]
        if a == 0 or (r > 222 and g > 222 and b > 222):
            p[x, y] = (255, 255, 255, 0)
            q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return img

def clear_rows(img):
    # 縦の部品(もも・すね): 各行で一番左と一番右の黒い線の間だけ残す(白い靴下は残る)
    img = img.copy(); p = img.load(); cw, ch = img.size
    for y in range(ch):
        dark = [x for x in range(cw) if sum(p[x, y][:3]) < 330]
        lo, hi = (dark[0], dark[-1]) if dark else (cw, -1)
        for x in range(cw):
            if x < lo or x > hi:
                r, g, b, a = p[x, y]
                if r > 200 and g > 200 and b > 200: p[x, y] = (255, 255, 255, 0)
    return img

boxes.sort(key=lambda b: -b[4])
boxes = boxes[:PER * 2]
print(f'見つかった部品: {len(boxes)} 個')
mid = sorted((b[1] + b[3]) / 2 for b in boxes)
cut = (mid[len(mid) // 2 - 1] + mid[len(mid) // 2]) / 2 if len(mid) >= 2 else H / 2
rows = [sorted([b for b in boxes if (b[1] + b[3]) / 2 < cut], key=lambda b: b[0]),
        sorted([b for b in boxes if (b[1] + b[3]) / 2 >= cut], key=lambda b: b[0])]
for r, row in enumerate(rows):
    for i, b in enumerate(row[:PER]):
        pad = 6
        crop = im.crop((max(0, b[0] - pad), max(0, b[1] - pad), min(W, b[2] + pad), min(H, b[3] + pad)))
        name = NAMES[r][i]
        crop = clear_rows(crop) if ('shin' in name or 'thigh' in name) else clear_white(crop)
        crop.save(f'{out}/{name}.png', optimize=True)
        print(name, crop.size)

# もも + すね を 1 本の脚に合成する(関節の継ぎ目を出さないため。漫画らしい「棒の脚」で歩く)
def column_center(img, y0, y1):
    p = img.load(); xs = []
    for y in range(max(0, y0), min(img.size[1], y1)):
        for x in range(img.size[0]):
            if p[x, y][3] > 100: xs.append(x)
    return sum(xs) / len(xs) if xs else img.size[0] / 2

for who in ('me', 'fr'):
    th = Image.open(f'{out}/{who}_thigh.png')
    for shin_name, leg_name in ((f'{who}_shin', f'{who}_leg'), (f'{who}_shin_bare', f'{who}_leg_bare')):
        sh = Image.open(f'{out}/{shin_name}.png')
        # 余白を切る
        th_c = th.crop(th.getbbox()); sh_c = sh.crop(sh.getbbox())
        th_c = th_c.crop((0, 0, th_c.size[0], th_c.size[1] - 4))
        # すねの上のひざはももの絵と重なるので切り落とす(ひざは 1 つ)
        sh_c = sh_c.crop((0, int(sh_c.size[1] * 0.34), sh_c.size[0], sh_c.size[1]))
        tb = column_center(th_c, th_c.size[1] - 8, th_c.size[1])
        st = column_center(sh_c, 0, 8)
        overlap = 6
        wdt = max(th_c.size[0], sh_c.size[0]) + 80
        hgt = th_c.size[1] + sh_c.size[1] - overlap
        canvas = Image.new('RGBA', (wdt, hgt), (0, 0, 0, 0))
        cx = wdt // 2
        canvas.alpha_composite(sh_c, (int(cx - st), th_c.size[1] - overlap))
        canvas.alpha_composite(th_c, (int(cx - tb), 0))
        canvas = canvas.crop(canvas.getbbox())
        canvas.save(f'{out}/{leg_name}.png', optimize=True)
        print(leg_name, canvas.size)
