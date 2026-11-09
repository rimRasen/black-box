"""Generates the extension icons. Run: python scripts/make-icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "extension" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

def draw(size: int) -> Image.Image:
    s = 512  # draw large, then downscale for smooth edges
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((16, 16, s - 16, s - 16), radius=110, fill=(0, 0, 0, 255),
                        outline=(80, 80, 80, 255), width=14)
    # empty "box"
    d.rounded_rectangle((120, 150, 392, 362), radius=28, outline=(230, 230, 230, 255), width=30)
    # strike-through: the box is removed
    d.line((110, 400, 402, 112), fill=(29, 155, 240, 255), width=40)
    return img.resize((size, size), Image.LANCZOS)

for size in (16, 32, 48, 128):
    draw(size).save(OUT / f"icon-{size}.png")
    print("wrote", OUT / f"icon-{size}.png")
