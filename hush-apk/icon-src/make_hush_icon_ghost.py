#!/usr/bin/env python3
"""HuSH launcher icon: white ghost, green finger to its lips (shh), on near-black.
Drawn at 4x supersample, downscaled with LANCZOS."""
from PIL import Image, ImageDraw
import math, os

SS = 4  # supersample factor
BG = (9, 13, 10, 255)          # near-black, green tint (GhostTech)
GHOST = (244, 248, 244, 255)   # cool white
DARK = (9, 13, 10, 255)        # eyes / mouth
GREEN = (47, 230, 115, 255)    # GhostTech terminal green

def draw_ghost(d, cx, top, w, with_face=True):
    """Ghost silhouette: dome + body + 3-hump wavy tail. Returns bottom y."""
    x0, x1 = cx - w / 2, cx + w / 2
    # dome
    d.ellipse([x0, top, x1, top + w], fill=GHOST)
    # body down to tail line
    tail_y = top + w * 1.28
    d.rectangle([x0, top + w / 2, x1, tail_y], fill=GHOST)
    # wavy tail: 3 humps
    r = w / 6
    for i in range(3):
        hx = x0 + r + i * 2 * r
        d.ellipse([hx - r, tail_y - r, hx + r, tail_y + r], fill=GHOST)
    if with_face:
        # eyes
        ew, eh = w * 0.115, w * 0.17
        ey = top + w * 0.52
        for ex in (cx - w * 0.19, cx + w * 0.19):
            d.ellipse([ex - ew / 2, ey - eh / 2, ex + ew / 2, ey + eh / 2], fill=DARK)
        # mouth: small 'o'
        mw, mh = w * 0.13, w * 0.16
        my = top + w * 0.82
        d.ellipse([cx - mw / 2, my - mh / 2, cx + mw / 2, my + mh / 2], fill=DARK)
    return tail_y + r

def draw_finger(size_canvas, cx, top, w):
    """Green shh finger: chunky rounded bar over the mouth, slight tilt."""
    layer = Image.new("RGBA", (size_canvas, size_canvas), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    fw = w * 0.17                      # finger width
    fy0 = top + w * 0.66               # fingertip above mouth
    fy1 = top + w * 1.22               # down past chin line
    d.rounded_rectangle([cx - fw / 2, fy0, cx + fw / 2, fy1], radius=fw / 2, fill=GREEN)
    layer = layer.rotate(7, resample=Image.BICUBIC, center=(cx, (fy0 + fy1) / 2))
    return layer

def scene(size, mode):
    """mode: 'legacy' (full-bleed bg), 'round' (circular bg), 'fg' (transparent, safe-zone)."""
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if mode == "legacy":
        d.rectangle([0, 0, S, S], fill=BG)
        gw = S * 0.62; top = S * 0.13
    elif mode == "round":
        d.ellipse([0, 0, S, S], fill=BG)
        gw = S * 0.58; top = S * 0.16
    else:  # fg — adaptive foreground: keep ghost inside central ~62%
        gw = S * 0.52; top = S * 0.17
    cx = S / 2
    draw_ghost(d, cx, top, gw)
    img = Image.alpha_composite(img, draw_finger(S, cx, top, gw))
    return img.resize((size, size), Image.LANCZOS)

RES = os.path.expanduser("~/workspace/hush-repo/hush-apk/android/app/src/main/res")
DENS = {  # folder: (legacy px, adaptive fg px)
    "mdpi": (48, 108), "hdpi": (72, 162), "xhdpi": (96, 216),
    "xxhdpi": (144, 324), "xxxhdpi": (192, 432),
}
for name, (legacy, fg) in DENS.items():
    folder = os.path.join(RES, f"mipmap-{name}")
    scene(legacy, "legacy").save(os.path.join(folder, "ic_launcher.png"))
    scene(legacy, "round").save(os.path.join(folder, "ic_launcher_round.png"))
    scene(fg, "fg").save(os.path.join(folder, "ic_launcher_foreground.png"))
    print("wrote", name)

# preview sheet: 192 legacy + 48 legacy + fg on dark, for a visual check
prev = Image.new("RGBA", (192 * 2 + 48 + 30, 220), (40, 40, 40, 255))
prev.alpha_composite(scene(192, "legacy"), (5, 5))
f = scene(192, "fg")
bgchk = Image.new("RGBA", (192, 192), BG)
bgchk.alpha_composite(f)
prev.alpha_composite(bgchk, (202, 5))
prev.alpha_composite(scene(48, "legacy"), (404, 5))
prev.alpha_composite(scene(48, "round"), (404, 58))
prev.convert("RGB").save("/tmp/icon_preview.png")
print("preview saved")
