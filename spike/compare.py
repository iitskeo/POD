"""Compara overlay plano vs mapeo cilindrico exacto.

Usa una rejilla que envuelve los 360 grados para hacer visible la compresion
por cos(theta). Con texto centrado la diferencia es casi nula; con contenido
ancho es donde se separa lo real de lo pegado.
"""
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

PHOTO = "tumbler.png"
PROFILE = "spike/profile.json"
PRINT_W_IN, PRINT_H_IN = 10.93, 3.00
DIAM_IN = PRINT_W_IN / np.pi
FONT_BOLD = r"C:\Windows\Fonts\arialbd.ttf"


def art_grid(w=1639, h=450):
    """Rejilla con marcas cada 30 grados: hace visible la geometria."""
    art = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(art)
    f = ImageFont.truetype(FONT_BOLD, 34)
    for deg in range(-180, 181, 30):
        u = (deg / 360.0) + 0.5
        x = u * w
        col = (255, 90, 31, 255) if deg == 0 else (10, 10, 10, 255)
        d.line([x, 0, x, h], fill=col, width=4)
        if abs(deg) <= 90:
            d.text((x + 6, 10), f"{deg}", font=f, fill=col)
    for i in range(1, 5):
        y = h * i / 5
        d.line([0, y, w, y], fill=(10, 10, 10, 140), width=3)
    return art


def art_text(text, w=1639, h=450, frac=0.6):
    art = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(art)
    size = 200
    while size > 20:
        f = ImageFont.truetype(FONT_BOLD, size)
        if d.textlength(text, font=f) <= w * frac:
            break
        size -= 2
    d.text((w // 2, h // 2), text, font=f, fill=(10, 10, 10, 255), anchor="mm")
    return art


def render(art, mode, out):
    photo = Image.open(PHOTO).convert("RGB")
    P = np.asarray(photo).astype(np.float32)
    h, w, _ = P.shape
    prof = json.load(open(PROFILE))
    cx, Rmax, y_top, y_bot = prof["cx"], prof["Rmax"], prof["y_top"], prof["y_bot"]

    R = np.zeros(h, np.float32)
    for p in prof["profile"]:
        R[p["y"]] = p["R"]

    px_per_in = (Rmax * 2) / DIAM_IN
    ya = y_top
    yb = ya + PRINT_H_IN * px_per_in

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

        if mode == "cyl":
            s = np.clip((xs - cx) / r, -0.9999, 0.9999)
            u = np.arcsin(s) / (2 * np.pi) + 0.5      # geometria exacta
        else:
            # Overlay plano: el arte se estira linealmente sobre el ancho visible.
            # Solo se muestra la porcion central del archivo (la "cara").
            u = 0.5 + ((xs - cx) / r) * 0.25

        v = (y - ya) / (yb - ya)
        ax = np.clip((u * aw).astype(int), 0, aw - 1)
        ay = int(np.clip(v * ah, 0, ah - 1))
        samp = A[ay, ax]
        alpha = samp[:, 3:4] / 255.0
        base = P[y, xs]
        shaded = samp[:, :3] * (base / 255.0)
        out_img[y, xs] = base * (1 - alpha) + shaded * alpha

    Image.fromarray(out_img.astype(np.uint8)).save(out)
    return out


def strip(paths, labels, out):
    ims = [Image.open(p).convert("RGB") for p in paths]
    w = sum(i.width for i in ims)
    canvas = Image.new("RGB", (w, ims[0].height + 34), (245, 245, 240))
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
    g = art_grid()
    render(g, "flat", "spike/_g_flat.png")
    render(g, "cyl", "spike/_g_cyl.png")
    strip(["spike/_g_flat.png", "spike/_g_cyl.png"],
          ["OVERLAY PLANO", "CILINDRICO EXACTO"], "spike/compare_grid.png")

    t = art_text("ABBISS")
    render(t, "flat", "spike/_t_flat.png")
    render(t, "cyl", "spike/_t_cyl.png")
    strip(["spike/_t_flat.png", "spike/_t_cyl.png"],
          ["OVERLAY PLANO", "CILINDRICO EXACTO"], "spike/compare_text.png")
