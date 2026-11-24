"""Gói ảnh trong assets/ thành các file data/pack-<thư mục>.json (đường dẫn -> data URI WebP).

Dùng khi deploy lên nơi giới hạn số file (vd. Claude Artifact). Game dùng gói khi trang đặt
window.RIFT_PACK = true; nếu không sẽ đọc từng file ảnh như bình thường.
Chạy: python3 scripts/build_pack.py
"""
import base64
import io
import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# chiều rộng tối đa (px) — đủ nét cho màn hình độ phân giải cao
SIZES = {"champion": 120, "item": 64, "league": 256, "team": 192, "player": 320, "loading": 240}

for folder, size in SIZES.items():
    d = os.path.join(ROOT, "assets", folder)
    if not os.path.isdir(d):
        continue
    pack = {}
    for name in sorted(os.listdir(d)):
        if not name.lower().endswith((".png", ".webp", ".jpg")):
            continue
        im = Image.open(os.path.join(d, name)).convert("RGBA")
        if im.width > size:
            im = im.resize((size, round(im.height * size / im.width)), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=84, method=6)
        pack[f"assets/{folder}/{name}"] = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    out = os.path.join(ROOT, "data", f"pack-{folder}.json")
    with open(out, "w") as f:
        json.dump(pack, f, separators=(",", ":"))
    print(f"{folder}: {len(pack)} ảnh, {os.path.getsize(out) // 1024} KB")
