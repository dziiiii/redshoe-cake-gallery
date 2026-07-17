import json
import shutil
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image, ImageOps

HERE = Path(__file__).resolve()
SITE = HERE.parents[1]
PROJECT = HERE.parents[3]
LOCAL_WEB = PROJECT / "web" / "web"
PUBLIC = SITE / "public"

PUBLIC.mkdir(parents=True, exist_ok=True)
shutil.copy2(LOCAL_WEB / "index.html", PUBLIC / "site.html")
shutil.copy2(LOCAL_WEB / "app.js", PUBLIC / "app.js")
shutil.copy2(LOCAL_WEB / "styles.css", PUBLIC / "styles.css")
(PUBLIC / "data").mkdir(exist_ok=True)
with open(LOCAL_WEB / "data" / "cakes.json", encoding="utf-8") as handle:
    cakes = json.load(handle)

FULL = PUBLIC / "images"
THUMBS = FULL / "thumbs"
FULL.mkdir(exist_ok=True)
THUMBS.mkdir(exist_ok=True)

def prepare(cake):
    code = cake["barcode"]
    source = LOCAL_WEB / "images" / f"{code}.jpg"
    target = FULL / f"{code}.webp"
    thumb_target = THUMBS / f"{code}.webp"
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        detail = image.copy()
        detail.thumbnail((360, 360), Image.Resampling.LANCZOS)
        detail.save(target, "WEBP", quality=25, method=0)
        thumbnail = image.copy()
        thumbnail.thumbnail((112, 112), Image.Resampling.LANCZOS)
        thumbnail.save(thumb_target, "WEBP", quality=12, method=0)
    return "ok"

with ThreadPoolExecutor(max_workers=3) as pool:
    results = list(pool.map(prepare, cakes))

missing = [result for result in results if result != "ok"]
if missing:
    raise SystemExit(f"公开资源缺失：{missing[:10]}")
for stale in [*FULL.glob("*.jpg"), *THUMBS.glob("*.jpg")]:
    stale.unlink()
for cake in cakes:
    cake["img"] = f"/images/{cake['barcode']}.webp"
    cake["thumb"] = f"/images/thumbs/{cake['barcode']}.webp"
with open(PUBLIC / "data" / "cakes.json", "w", encoding="utf-8") as handle:
    json.dump(cakes, handle, ensure_ascii=False, separators=(",", ":"))
print(f"已准备 {len(cakes)} 款公网图片（缩略图 + 详情大图）")
