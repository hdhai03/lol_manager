"""Tách nền cho logo đội/giải để mọi logo cùng một kiểu trong suốt.

Một số logo trên Leaguepedia là "ô vuông" (logo đặt trên nền màu đặc):
  - Nếu hình logo là phần khoét trong suốt của ô (vd. Sentinels): đảo lại, tô hình đó
    bằng màu của ô (hoặc trắng nếu ô quá tối) và bỏ ô đi.
  - Nếu ô là nền màu đặc quanh logo: khoá màu nền thành trong suốt (giữ viền mượt).
  - Nếu tách xong gần như không còn gì (ô chính là logo): giữ nguyên.
Chạy: python3 scripts/clean_logos.py   (fetch-images.mjs tự gọi)
"""
import os
from collections import deque

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def lum(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def recenter(im):
    w, h = im.size
    bbox = im.getbbox()
    if not bbox:
        return im
    im = im.crop(bbox)
    im.thumbnail((w, h), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
    return canvas


def holes_inside(px, w, h, x0, y0, x1, y1):
    """Điểm trong suốt nằm trong ô mà không thông ra mép ảnh (phần khoét)."""
    seen = set()
    q = deque([(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)])
    while q:
        x, y = q.popleft()
        if (x, y) in seen or not (0 <= x < w and 0 <= y < h) or px[x, y][3] > 128:
            continue
        seen.add((x, y))
        q.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    inner = [(x, y) for y in range(y0, y1) for x in range(x0, x1) if px[x, y][3] <= 200 and (x, y) not in seen]
    return inner if len(inner) > 0.03 * w * h else []


def clean(path):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    bbox = im.getbbox()
    if not bbox:
        return None
    x0, y0, x1, y1 = bbox
    area = (x1 - x0) * (y1 - y0)
    # chỉ xử lý logo dạng ô: phủ gần hết khung, viền ô là một màu đặc
    if area < 0.6 * w * h:
        return None
    edge = [px[x, y] for x in range(x0 + 3, x1 - 3) for y in (y0 + 3, y1 - 4)] + \
           [px[x, y] for y in range(y0 + 3, y1 - 3) for x in (x0 + 3, x1 - 4)]
    if sum(1 for c in edge if c[3] > 200) < 0.9 * len(edge):
        return None
    bg = max(set(edge), key=edge.count)
    if sum(1 for c in edge if max(abs(c[i] - bg[i]) for i in range(3)) < 40) < 0.8 * len(edge):
        return None

    holes = holes_inside(px, w, h, x0, y0, x1, y1)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    if holes:
        # logo khoét: tô phần khoét bằng màu ô (trắng nếu ô tối)
        color = (245, 245, 245) if lum(bg) < 60 else bg[:3]
        for (x, y) in holes:
            op[x, y] = (*color, 255 - px[x, y][3])
        kind = "đảo hình khoét"
    else:
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                d = max(abs(r - bg[0]), abs(g - bg[1]), abs(b - bg[2]))
                k = min(1.0, max(0.0, (d - 35) / 70))
                op[x, y] = (r, g, b, int(a * k))
        kind = "khoá màu nền"
        # phần còn lại tối mà ô có màu (vd. Sentinels): tô hình bằng màu ô
        rest = [op[x, y] for y in range(h) for x in range(w) if op[x, y][3] > 128]
        if rest and sum(lum(c) for c in rest) / len(rest) < 60 and lum(bg) >= 60:
            for y in range(h):
                for x in range(w):
                    if op[x, y][3]:
                        op[x, y] = (*bg[:3], op[x, y][3])
            kind = "khoá màu nền + tô màu ô"
    if sum(1 for y in range(h) for x in range(w) if op[x, y][3] > 128) < 0.04 * w * h:
        return None  # ô chính là logo: giữ nguyên
    recenter(out).save(path, "WEBP", quality=88)
    return kind


def whiten_mono_dark(path):
    """Logo một màu tối (đen/xanh than) không nhìn thấy trên nền tối: đổi sang bản trắng,
    giống cách các giải đấu dùng logo trắng trên nền tối. Logo có nhiều mảng sáng thì giữ nguyên."""
    im = Image.open(path).convert("RGBA")
    px = im.load()
    w, h = im.size
    pts = [px[x, y] for y in range(h) for x in range(w) if px[x, y][3] > 128]
    if not pts:
        return False
    # tối = gần đen, hoặc tối và ít màu (đen/xám/xanh than); đỏ/tím đậm vẫn giữ màu
    dark = sum(1 for c in pts if lum(c) < 40 or (lum(c) < 70 and max(c[:3]) - min(c[:3]) < 45)) / len(pts)
    light = sum(1 for c in pts if lum(c) > 150) / len(pts)
    if dark < 0.75 or light > 0.08:
        return False
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a:
                px[x, y] = (240, 242, 246, a)
    im.save(path, "WEBP", quality=88)
    return True


for folder in ("league", "team"):
    d = os.path.join(ROOT, "assets", folder)
    for name in sorted(os.listdir(d)):
        k = clean(os.path.join(d, name))
        if k:
            print(f"tách nền ({k}): {folder}/{name}")
        if whiten_mono_dark(os.path.join(d, name)):
            print(f"logo trắng: {folder}/{name}")
