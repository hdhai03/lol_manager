"""Gói toàn bộ ảnh trong assets/ thành một file data/assets-pack.json (đường dẫn -> data URI WebP).

Dùng khi deploy lên nơi giới hạn số file (vd. Claude Artifact). Game tự dùng gói nếu có,
nếu không sẽ đọc từng file ảnh như bình thường.
Chạy: python3 scripts/build_pack.py
"""
import base64
import io
import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIZES = {"champion": 64, "item": 48, "league": 96, "team": 96, "player": 96}

pack = {}
total = 0
for folder, size in SIZES.items():
    d = os.path.join(ROOT, "assets", folder)
    if not os.path.isdir(d):
        continue
    for name in sorted(os.listdir(d)):
        if not name.lower().endswith((".png", ".webp", ".jpg")):
            continue
        im = Image.open(os.path.join(d, name)).convert("RGBA")
        im.thumbnail((size, size), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=82, method=6)
        b = buf.getvalue()
        total += len(b)
        pack[f"assets/{folder}/{name}"] = "data:image/webp;base64," + base64.b64encode(b).decode()

out = os.path.join(ROOT, "data", "assets-pack.json")
with open(out, "w") as f:
    json.dump(pack, f, separators=(",", ":"))
print(f"{len(pack)} ảnh, {total // 1024} KB ảnh, file gói {os.path.getsize(out) // 1024} KB")
