"""Calcula la zona segura y renderiza el resultado final con auto-ajuste de texto."""
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from composite import build_art, PHOTO, PROFILE, DIAM_IN, PRINT_H_IN, FONT_BOLD

ART_W = 3278  # px del archivo real a 300dpi


def safe_zone_table():
    print("theta     frac.archivo   px del archivo   compresion")
    for deg in (30, 40, 45, 60, 75):
        frac = (2 * deg) / 360.0
        print(f"+/-{deg:>2}     {frac * 100:>5.1f}%        {frac * ART_W:>6.0f} px      "
              f"cos={np.cos(np.radians(deg)):.2f}")


def render(text, out, zone_frac=0.25):
    photo = Image.open(PHOTO).convert("RGB")
    P = np.asarray(photo).astype(np.float32)
    h, w, _ = P.shape
    prof = json.load(open(PROFILE))
    cx, Rmax, y_top = prof["cx"], prof["Rmax"], prof["y_top"]
    R = np.zeros(h, np.float32)
    for p in prof["profile"]:
        R[p["y"]] = p["R"]

    px_per_in = (Rmax * 2) / DIAM_IN
    ya = y_top
    yb = ya + PRINT_H_IN * px_per_in

    art = build_art(text)
    A = np.asarray(art).astype(np.float32)
    ah, aw, _ = A.shape
    out_img = P.copy()

    for y in range(int(ya), int(yb) + 1):
        r = R[y]
        if r < 1:
            continue
        xs = np.arange(int(cx - r), int(cx + r) + 1)
        xs = xs[(xs >= 0) & (xs < w)]
        if len(xs) == 0:
            continue
        s = np.clip((xs - cx) / r, -0.9999, 0.9999)
        u = np.arcsin(s) / (2 * np.pi) + 0.5
        v = (y - ya) / (yb - ya)
        ax = np.clip((u * aw).astype(int), 0, aw - 1)
        ay = int(np.clip(v * ah, 0, ah - 1))
        samp = A[ay, ax]
        alpha = samp[:, 3:4] / 255.0
        base = P[y, xs]
        out_img[y, xs] = base * (1 - alpha) + (samp[:, :3] * (base / 255.0)) * alpha

    Image.fromarray(out_img.astype(np.uint8)).save(out)


def strip(paths, labels, out):
    ims = [Image.open(p).convert("RGB") for p in paths]
    canvas = Image.new("RGB", (sum(i.width for i in ims), ims[0].height + 34),
                       (245, 245, 240))
    d = ImageDraw.Draw(canvas)
    f = ImageFont.truetype(FONT_BOLD, 20)
    x = 0
    for im, lb in zip(ims, labels):
        canvas.paste(im, (x, 34))
        d.text((x + im.width // 2, 17), lb, font=f, fill=(10, 10, 10), anchor="mm")
        x += im.width
    canvas.save(out)
    print("->", out)


if __name__ == "__main__":
    safe_zone_table()
    names = ["ANA", "KENNETH", "MARIA FERNANDA"]
    paths = []
    for n in names:
        p = f"spike/_final_{n.split()[0]}.png"
        render(n, p)
        paths.append(p)
    strip(paths, names, "spike/final.png")
