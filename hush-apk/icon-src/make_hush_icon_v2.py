#!/usr/bin/env python3
"""HuSH launcher icon v2 (Daniel's spec): a bold pair of LIPS with a FINGER
pressed vertically over their center (the shush gesture), the word "HuSH"
beneath, on the near-black green-tinted GhostTech background.
No ghost. Drawn at 4x supersample, downscaled with LANCZOS."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, os

SS = 4  # supersample factor
BG = (9, 13, 10, 255)              # near-black, green tint (GhostTech)
LIP_LOWER = (216, 40, 56, 255)     # bright crimson — lower lip
LIP_UPPER = (168, 26, 40, 255)     # deeper crimson — upper lip
LIP_EDGE = (96, 8, 18, 255)        # silhouette edge
MOUTH = (30, 3, 7, 255)            # mouth line, near-black maroon
SKIN = (243, 197, 152, 255)        # finger
SKIN_SHADE = (228, 164, 112, 255)  # finger side shading
SKIN_EDGE = (178, 116, 70, 255)    # finger outline
NAIL = (252, 231, 210, 255)        # fingernail
TEXT = (245, 249, 245, 255)        # wordmark, near-white

FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]

CX = 512.0          # icon center x (1024-space)
LIP_CY = 402.0      # mouth-line height at center
LIP_HW = 332.0      # lip half-width
LIP_UP = 122.0      # upper-lip peak height
LIP_DN = 168.0      # lower-lip depth
FINGER_W = 120.0
FINGER_TOP = 148.0
FINGER_BOT = 682.0
TEXT_WORD = "HuSH"
TEXT_TOP = 706.0
TEXT_W = 560.0      # target wordmark width


def _dome(t):
    return max(0.0, 1.0 - t * t)


def mouth_y(t):
    return LIP_CY + 9.0 * t * t


def top_y(t):
    bow = _dome(t) ** 0.75
    dip = 1.0 - 0.30 * math.exp(-((t / 0.17) ** 2))  # cupid's-bow dip
    return mouth_y(t) - LIP_UP * bow * dip


def bot_y(t):
    return mouth_y(t) + LIP_DN * (_dome(t) ** 0.62)


class Canvas:
    """Draws 1024-space artwork onto a size x size canvas, scaled by k."""

    def __init__(self, size, k=1.0):
        self.size = size
        self.S = size * SS
        self.k = k
        self.u = SS * size / 1024.0  # canvas px per 1024-space unit
        self.ox = (self.S - 1024 * self.u * k) / 2.0
        self.oy = (self.S - 1024 * self.u * k) / 2.0
        self.img = Image.new("RGBA", (self.S, self.S), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def X(self, x):
        return x * self.u * self.k + self.ox

    def Y(self, y):
        return y * self.u * self.k + self.oy

    def W(self, w):
        return w * self.u * self.k

    def pt(self, x, y):
        return (self.X(x), self.Y(y))

    def finish(self):
        return self.img.resize((self.size, self.size), Image.LANCZOS)


def lip_points(fn, n=260):
    return [(-1.0 + 2.0 * i / n) for i in range(n + 1)]


def draw_lips(cv: Canvas):
    ts = lip_points(top_y)
    top = [cv.pt(CX + t * LIP_HW, top_y(t)) for t in ts]
    bot = [cv.pt(CX + t * LIP_HW, bot_y(t)) for t in reversed(ts)]
    mid = [cv.pt(CX + t * LIP_HW, mouth_y(t)) for t in ts]
    sil = top + bot
    # silhouette: lower-lip colour + darker edge
    cv.d.polygon(sil, fill=LIP_LOWER)
    cv.d.line(sil + [sil[0]], fill=LIP_EDGE, width=max(2, int(cv.W(6))), joint="curve")
    # upper lip: deeper crimson
    cv.d.polygon(top + list(reversed(mid)), fill=LIP_UPPER)
    # soft shadow band under the mouth line on the lower lip
    band_top = [cv.pt(CX + t * LIP_HW, mouth_y(t) + 4) for t in ts]
    band_bot = [cv.pt(CX + t * LIP_HW, mouth_y(t) + 44 * _dome(t) ** 0.5 + 6) for t in reversed(ts)]
    sh = Image.new("RGBA", cv.img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).polygon(band_top + band_bot, fill=(70, 0, 10, 90))
    sh = sh.filter(ImageFilter.GaussianBlur(cv.W(10)))
    # clip shadow to silhouette
    mask = Image.new("L", cv.img.size, 0)
    ImageDraw.Draw(mask).polygon(sil, fill=255)
    cv.img.paste(Image.alpha_composite(cv.img, sh), (0, 0), mask)
    cv.d = ImageDraw.Draw(cv.img)
    # glossy highlight on the lower lip
    hl = Image.new("RGBA", cv.img.size, (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hx0, hy0 = CX - 150, LIP_CY + 78
    hx1, hy1 = CX + 150, LIP_CY + 138
    hd.ellipse([cv.X(hx0), cv.Y(hy0), cv.X(hx1), cv.Y(hy1)], fill=(255, 190, 195, 110))
    hl = hl.filter(ImageFilter.GaussianBlur(cv.W(16)))
    cv.img.paste(Image.alpha_composite(cv.img, hl), (0, 0), mask)
    cv.d = ImageDraw.Draw(cv.img)
    # mouth line
    cv.d.line(mid, fill=MOUTH, width=max(2, int(cv.W(17))), joint="curve")
    for ex in (mid[0], mid[-1]):
        r = cv.W(8.5)
        cv.d.ellipse([ex[0] - r, ex[1] - r, ex[0] + r, ex[1] + r], fill=MOUTH)


def draw_finger(cv: Canvas):
    x0, x1 = CX - FINGER_W / 2, CX + FINGER_W / 2
    # drop shadow on the lips (offset down-right, blurred, clipped to lips)
    ts = lip_points(top_y)
    sil = [cv.pt(CX + t * LIP_HW, top_y(t)) for t in ts] + \
          [cv.pt(CX + t * LIP_HW, bot_y(t)) for t in reversed(ts)]
    mask = Image.new("L", cv.img.size, 0)
    ImageDraw.Draw(mask).polygon(sil, fill=255)
    sh = Image.new("RGBA", cv.img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [cv.X(x0 + 12), cv.Y(FINGER_TOP + 14), cv.X(x1 + 12), cv.Y(FINGER_BOT + 14)],
        radius=cv.W(FINGER_W / 2), fill=(0, 0, 0, 130))
    sh = sh.filter(ImageFilter.GaussianBlur(cv.W(12)))
    cv.img.paste(Image.alpha_composite(cv.img, sh), (0, 0), mask)
    cv.d = ImageDraw.Draw(cv.img)
    # finger capsule
    box = [cv.X(x0), cv.Y(FINGER_TOP), cv.X(x1), cv.Y(FINGER_BOT)]
    cv.d.rounded_rectangle(box, radius=cv.W(FINGER_W / 2), fill=SKIN,
                           outline=SKIN_EDGE, width=max(2, int(cv.W(5))))
    # cylindrical side shading (right side), clipped to the capsule
    fmask = Image.new("L", cv.img.size, 0)
    ImageDraw.Draw(fmask).rounded_rectangle(box, radius=cv.W(FINGER_W / 2), fill=255)
    shade = Image.new("RGBA", cv.img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shade).rectangle(
        [cv.X(CX + 16), cv.Y(FINGER_TOP), cv.X(x1), cv.Y(FINGER_BOT)],
        fill=SKIN_SHADE[:3] + (165,))
    shade = shade.filter(ImageFilter.GaussianBlur(cv.W(14)))
    cv.img.paste(Image.alpha_composite(cv.img, shade), (0, 0), fmask)
    cv.d = ImageDraw.Draw(cv.img)
    # fingernail: light oval near the tip
    nx0, ny0 = CX - 37, FINGER_TOP + 26
    nx1, ny1 = CX + 37, FINGER_TOP + 128
    cv.d.ellipse([cv.X(nx0), cv.Y(ny0), cv.X(nx1), cv.Y(ny1)], fill=NAIL,
                 outline=SKIN_EDGE, width=max(2, int(cv.W(4))))
    # knuckle crease: one soft arc across the finger, mid-lips height
    crease_y = LIP_CY + 118
    cv.d.arc([cv.X(x0 + 12), cv.Y(crease_y - 26), cv.X(x1 - 12), cv.Y(crease_y + 26)],
             start=15, end=165, fill=SKIN_EDGE, width=max(2, int(cv.W(5))))


def draw_text(cv: Canvas):
    font_path = next(p for p in FONT_PATHS if os.path.exists(p))
    # binary-search the font size that hits the target width (with tracking)
    def measure(size):
        f = ImageFont.truetype(font_path, size)
        track = size * 0.05
        w = sum(cv.d.textlength(ch, font=f) for ch in TEXT_WORD) + track * (len(TEXT_WORD) - 1)
        return w / (cv.u * cv.k), f, track
    lo, hi = 40, 400
    for _ in range(24):
        mid = (lo + hi) // 2
        w, _, _ = measure(mid)
        if w < TEXT_W:
            lo = mid
        else:
            hi = mid
    _, font, track = measure(lo)
    total = sum(cv.d.textlength(ch, font=font) for ch in TEXT_WORD) + track * (len(TEXT_WORD) - 1)
    x = cv.X(CX) - total / 2
    y = cv.Y(TEXT_TOP)
    for ch in TEXT_WORD:
        cv.d.text((x, y), ch, font=font, fill=TEXT)
        x += cv.d.textlength(ch, font=font) + track


def draw_content(cv: Canvas):
    draw_lips(cv)
    draw_finger(cv)
    draw_text(cv)


def scene(size, mode):
    """mode: 'legacy' (full-bleed bg), 'round' (circular bg), 'fg' (transparent, safe-zone)."""
    if mode == "legacy":
        cv = Canvas(size, 1.0)
        cv.d.rectangle([0, 0, cv.S, cv.S], fill=BG)
        draw_content(cv)
        return cv.finish()
    if mode == "round":
        cv = Canvas(size, 0.94)
        cv.d.ellipse([0, 0, cv.S, cv.S], fill=BG)
        draw_content(cv)
        return cv.finish()
    cv = Canvas(size, 0.60)  # fg — adaptive foreground, keep inside safe zone
    draw_content(cv)
    return cv.finish()


if __name__ == "__main__":
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

    # master (1024) + standalone preview for Daniel
    master = scene(1024, "legacy")
    master.save(os.path.expanduser(
        "~/workspace/hush-repo/hush-apk/icon-src/hush-icon-master-v2-1024.png"))
    master.save(os.path.expanduser("~/workspace/your_files/hush-icon-v2.png"))
    print("master + preview saved")

    # small-size check sheet: 192 + 48 legacy, 48 round, fg composited on bg
    prev = Image.new("RGBA", (192 * 2 + 48 + 30, 220), (40, 40, 40, 255))
    prev.alpha_composite(scene(192, "legacy"), (5, 5))
    bgchk = Image.new("RGBA", (192, 192), BG)
    bgchk.alpha_composite(scene(192, "fg"))
    prev.alpha_composite(bgchk, (202, 5))
    prev.alpha_composite(scene(48, "legacy"), (404, 5))
    prev.alpha_composite(scene(48, "round"), (404, 58))
    prev.alpha_composite(scene(48, "legacy"), (404, 111))
    prev.convert("RGB").save("/tmp/icon_v2_preview.png")
    print("check sheet saved")
