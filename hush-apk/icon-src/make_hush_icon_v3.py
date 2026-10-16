#!/usr/bin/env python3
"""HuSH launcher icon v3 — Daniel's ORIGINAL icon, recreated.

Daniel supplied the original (his Vercel project avatar) as
hush-icon-original-reference.png: a black circle, glossy hot-pink/red
photorealistic lips across the top, a glossy RED hand in the shh
gesture centered over the lips, and "HuSH" in an elegant serif across
the bottom (H+u white, S+H hot pink). The recreation master was
image-generated from that reference (see the media-generation-*.png
alongside this script) and normalized to hush-icon-master-v3-1024.png.

This script derives the full Android set from the master:
  ic_launcher.png          full-bleed square (legacy densities)
  ic_launcher_round.png    artwork in a black circle, corners clear
  ic_launcher_foreground.png  artwork at 60% on transparency; the
                           adaptive background color is pure black
                           (#000000 in values/ic_launcher_background.xml),
                           matching the circle's field.
"""
from PIL import Image, ImageDraw
import os

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.expanduser("~/workspace/hush-repo/hush-apk/android/app/src/main/res")
GEN = os.path.join(HERE, "media-generation-hush-icon-master-v3-0-3355e144-98ab-423d-894f-91f1c856dd2f.png")
MASTER_PATH = os.path.join(HERE, "hush-icon-master-v3-1024.png")
BLACK = (0, 0, 0, 255)


def load_master():
    im = Image.open(GEN).convert("RGB")
    if im.size != (1024, 1024):
        im = im.resize((1024, 1024), Image.LANCZOS)
    im.save(MASTER_PATH)
    return im.convert("RGBA")


def legacy(master, size):
    return master.resize((size, size), Image.LANCZOS).convert("RGBA")


def round_icon(master, size):
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    d.ellipse([0, 0, size - 1, size - 1], fill=BLACK)
    inner = int(size * 0.94)
    art = master.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    # clip the artwork to the circle so its square corners never poke out
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    out.paste(art, (off, off))
    out.putalpha(mask)
    return out


def foreground(master, size):
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(size * 0.60)
    art = master.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    out.alpha_composite(art, (off, off))
    return out


if __name__ == "__main__":
    master = load_master()
    DENS = {  # folder: (legacy px, adaptive fg px)
        "mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216),
        "xxhdpi": (144, 324), "xxxhdpi": (192, 432),
    }
    for name, (leg, fg) in DENS.items():
        folder = os.path.join(RES, f"mipmap-{name}")
        legacy(master, leg).save(os.path.join(folder, "ic_launcher.png"))
        round_icon(master, leg).save(os.path.join(folder, "ic_launcher_round.png"))
        foreground(master, fg).save(os.path.join(folder, "ic_launcher_foreground.png"))
        print("wrote", name)

    master.convert("RGB").save(os.path.expanduser("~/workspace/your_files/hush-icon-v3.png"))
    print("master + preview saved")

    # small-size check sheet: 192 legacy, fg composited on black, 48s
    prev = Image.new("RGBA", (192 * 2 + 48 + 30, 220), (40, 40, 40, 255))
    prev.alpha_composite(legacy(master, 192), (5, 5))
    bgchk = Image.new("RGBA", (192, 192), BLACK)
    bgchk.alpha_composite(foreground(master, 192))
    prev.alpha_composite(bgchk, (202, 5))
    prev.alpha_composite(legacy(master, 48), (404, 5))
    prev.alpha_composite(round_icon(master, 48), (404, 58))
    prev.alpha_composite(legacy(master, 48), (404, 111))
    prev.convert("RGB").save("/tmp/icon_v3_preview.png")
    print("check sheet saved")
