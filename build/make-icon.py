"""Draws the EasyTuber Animation Studio icon.

    python build/make-icon.py

Writes
  build/icon.png   256 px, the window icon
  build/icon.ico   Windows (256, 64, 48, 32, 16)
  build/icon.icns  macOS (512, 256, 128)
Needs Pillow (pip install pillow). The icon is a rounded tile with a timeline and a keyframe diamond.
"""
import io
import os
import struct

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
S = 1024  # drawn large, scaled down for each size


def draw():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    # tile: a vertical purple gradient, rounded
    grad = Image.new("RGBA", (S, S))
    gd = ImageDraw.Draw(grad)
    top, bottom = (124, 108, 240), (58, 42, 140)
    for y in range(S):
        t = y / (S - 1)
        gd.line([(0, y), (S, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)) + (255,))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([40, 40, S - 40, S - 40], radius=220, fill=255)
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)
    # a motion curve rising to the key
    pts = []
    for i in range(101):
        u = i / 100
        e = 1 - (1 - u) ** 3
        pts.append((190 + u * 330, 760 - e * 330))
    d.line(pts, fill=(255, 255, 255, 120), width=34, joint="curve")
    # the timeline, with ticks
    d.rounded_rectangle([170, 800, S - 170, 836], radius=18, fill=(255, 255, 255, 235))
    for x in (250, 420, 590, 760):
        d.rounded_rectangle([x - 9, 760, x + 9, 800], radius=8, fill=(255, 255, 255, 170))
    # the playhead
    d.rounded_rectangle([660, 300, 684, 880], radius=12, fill=(255, 122, 200, 255))
    # the keyframe diamond
    cx, cy, r = 520, 430, 190
    d.polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], fill=(255, 209, 102, 255))
    r2 = 92
    d.polygon([(cx, cy - r2), (cx + r2, cy), (cx, cy + r2), (cx - r2, cy)], fill=(255, 236, 180, 255))
    return img


def png(img, size):
    out = io.BytesIO()
    img.resize((size, size), Image.LANCZOS).save(out, "PNG")
    return out.getvalue()


def main():
    img = draw()
    sizes = {s: png(img, s) for s in (512, 256, 128, 64, 48, 32, 16)}
    open(os.path.join(HERE, "icon.png"), "wb").write(sizes[256])

    ico = [256, 64, 48, 32, 16]
    entries, blobs, offset = b"", b"", 6 + 16 * len(ico)
    for s in ico:
        entries += struct.pack("<BBBBHHII", s % 256, s % 256, 0, 0, 1, 32, len(sizes[s]), offset + len(blobs))
        blobs += sizes[s]
    open(os.path.join(HERE, "icon.ico"), "wb").write(struct.pack("<HHH", 0, 1, len(ico)) + entries + blobs)

    body = b""
    for kind, s in ((b"ic07", 128), (b"ic08", 256), (b"ic09", 512)):
        body += kind + struct.pack(">I", 8 + len(sizes[s])) + sizes[s]
    open(os.path.join(HERE, "icon.icns"), "wb").write(b"icns" + struct.pack(">I", 8 + len(body)) + body)
    print("wrote icon.png, icon.ico and icon.icns")


if __name__ == "__main__":
    main()
