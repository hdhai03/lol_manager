"""Gói ảnh trong assets/ thành các file nhị phân data/bin/<nhóm>-<n>.bin + chỉ mục data/bin/index.json.

Dùng khi deploy lên nơi giới hạn số file (vd. Claude Artifact): trình duyệt tải vài file lớn,
cắt ra từng ảnh (Blob) theo chỉ mục. Ảnh giữ nguyên chất lượng gốc, không nén lại.
Game dùng gói khi trang đặt window.RIFT_PACK = true; nếu không sẽ đọc từng file ảnh như bình thường.
Chạy: python3 scripts/build_pack.py
"""
import io
import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data", "bin")
CHUNK = 14 * 1024 * 1024  # mỗi file < 15MB
GROUPS = ["league", "team", "champion", "item", "rune", "spell", "tile", "player", "map", "loading", "splash"]
MIME = {".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg"}

os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.endswith((".bin", ".json")):
        os.remove(os.path.join(OUT, f))

index = {}
for g in GROUPS:
    d = os.path.join(ROOT, "public", "assets", g)
    if not os.path.isdir(d):
        continue
    chunks, cur, files = [], bytearray(), {}
    for name in sorted(os.listdir(d)):
        ext = os.path.splitext(name)[1].lower()
        if ext not in MIME:
            continue
        data = open(os.path.join(d, name), "rb").read()
        mime = MIME[ext]
        if ext == ".png":  # icon PNG nặng: nén lại sang WebP chất lượng cao (giữ nguyên đường dẫn)
            im = Image.open(io.BytesIO(data)).convert("RGBA")
            buf = io.BytesIO()
            im.save(buf, "WEBP", quality=90, method=4)
            data, mime = buf.getvalue(), "image/webp"
        if cur and len(cur) + len(data) > CHUNK:
            chunks.append(cur)
            cur = bytearray()
        files[f"assets/{g}/{name}"] = [len(chunks), len(cur), len(data), mime]
        cur += data
    if cur:
        chunks.append(cur)
    for i, c in enumerate(chunks):
        with open(os.path.join(OUT, f"{g}-{i}.bin"), "wb") as fh:
            fh.write(c)
    index[g] = {"chunks": len(chunks), "bytes": sum(len(c) for c in chunks), "files": files}
    print(f"{g}: {len(files)} ảnh, {len(chunks)} khối, {sum(len(c) for c in chunks) // 1024} KB")

with open(os.path.join(OUT, "index.json"), "w") as fh:
    json.dump(index, fh, separators=(",", ":"))
