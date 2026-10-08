# 部品シート(白い背景に 10 個の部品を 2 段に並べた 1 枚)を切り分けて src/assets/art/ に置く。
# python3 tools/slice-sheet.py <シート.png> [出力先=src/assets/art]
# 上の段 = 主人公(もも・すね・すね素肌・素足・靴)、下の段 = 友だち(同じ順)。
import sys
from collections import deque
from PIL import Image, ImageFilter

NAMES = [['me_thigh', 'me_shin', 'me_shin_bare', 'me_foot_bare', 'me_shoe'],
         ['fr_thigh', 'fr_shin', 'fr_shin_bare', 'fr_foot_bare', 'fr_shoe']]
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
boxes.sort(key=lambda b: -b[4])
boxes = boxes[:10]
print(f'見つかった部品: {len(boxes)} 個')
mid = sorted((b[1] + b[3]) / 2 for b in boxes)
cut = (mid[len(mid) // 2 - 1] + mid[len(mid) // 2]) / 2 if len(mid) >= 2 else H / 2
rows = [sorted([b for b in boxes if (b[1] + b[3]) / 2 < cut], key=lambda b: b[0]),
        sorted([b for b in boxes if (b[1] + b[3]) / 2 >= cut], key=lambda b: b[0])]
for r, row in enumerate(rows):
    for i, b in enumerate(row[:5]):
        pad = 6
        crop = im.crop((max(0, b[0] - pad), max(0, b[1] - pad), min(W, b[2] + pad), min(H, b[3] + pad)))
        name = NAMES[r][i]
        crop.save(f'{out}/{name}.png')
        print(name, crop.size)
