"""Compositing fotorrealista sobre la foto real del tumbler.

Mapeo cilindrico exacto usando R(y) de la silueta + shading por multiply de la
luminancia de la propia foto. Sin displacement derivado: la geometria se conoce.

Pregunta que contesta el spike: se ve real?
"""
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

PHOTO = "tumbler.png"
PROFILE = "spike/profile.json"

# Escala fisica derivada del template real de Printify.
PRINT_W_IN, PRINT_H_IN = 10.93, 3.00   # 3278x900 @300dpi, envoltura 360
DIAM_IN = PRINT_W_IN / np.pi           # 3.48in

FONT_BOLD = r"C:\Windows\Fonts\arialbd.ttf"
FONT_MONO = r"C:\Windows\Fonts\consolab.ttf"


def build_art(text, w=1639, h=450):
    """Tira de arte plana: es el archivo de impresion (envoltura 360)."""
    art = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(art)
    cx, cy = w // 2, h // 2

    # Icono: marco con </> dentro. Placeholder original, sin marca de terceros.
    box = 150
    x0, y0 = cx - box // 2, cy - box - 10
    d.rounded_rectangle([x0, y0, x0 + box, y0 + box], radius=18,
                        outline=(10, 10, 10, 255), width=7)
    f_icon = ImageFont.truetype(FONT_MONO, 62)
    d.text((cx, y0 + box // 2), "</>", font=f_icon, fill=(10, 10, 10, 255), anchor="mm")

    # Texto del cliente, auto-ajustado al ancho de la zona segura.
    zone_w = int(w * 0.22)
    size = 92
    while size > 20:
        f = ImageFont.truetype(FONT_BOLD, size)
        if d.textlength(text, font=f) <= zone_w:
            break
        size -= 2
    d.text((cx, cy + 60), text, font=f, fill=(255, 90, 31, 255), anchor="mm")
    return art


def render(text, y_start_frac=0.0, out="spike/preview.png"):
    photo = Image.open(PHOTO).convert("RGB")
    P = np.asarray(photo).astype(np.float32)
    h, w, _ = P.shape

    prof = json.load(open(PROFILE))
    cx, Rmax = prof["cx"], prof["Rmax"]
    y_top, y_bot = prof["y_top"], prof["y_bot"]

    # R(y) como lookup denso.
    R = np.zeros(h, np.float32)
    for p in prof["profile"]:
        R[p["y"]] = p["R"]

    # Escala: el diametro maximo equivale a DIAM_IN.
    px_per_in = (Rmax * 2) / DIAM_IN
    band_px = PRINT_H_IN * px_per_in                  # alto imprimible en px
    ya = y_top + y_start_frac * (y_bot - y_top)
    yb = ya + band_px

    art = build_art(text)
    A = np.asarray(art).astype(np.float32)
    ah, aw, _ = A.shape

    out_img = P.copy()

    ys = np.arange(h)
    band = (ys >= ya) & (ys <= yb) & (R > 1)
    for y in ys[band]:
        r = R[y]
        xs = np.arange(int(cx - r), int(cx + r) + 1)
        xs = xs[(xs >= 0) & (xs < w)]
        if len(xs) == 0:
            continue

        # Geometria exacta del solido de revolucion.
        s = (xs - cx) / r                      # sin(theta), -1..1
        s = np.clip(s, -0.9999, 0.9999)
        theta = np.arcsin(s)                   # cara frontal: -pi/2..pi/2
        u = theta / (2 * np.pi) + 0.5          # 0..1 sobre el archivo 360
        v = (y - ya) / (yb - ya)

        ax = np.clip((u * aw).astype(int), 0, aw - 1)
        ay = int(np.clip(v * ah, 0, ah - 1))

        samp = A[ay, ax]                       # RGBA del arte
        alpha = samp[:, 3:4] / 255.0
        art_rgb = samp[:, :3]

        base = P[y, xs]                        # foto real: contiene el shading
        # Multiply: el arte recibe la iluminacion exacta de la foto.
        shaded = art_rgb * (base / 255.0)
        out_img[y, xs] = base * (1 - alpha) + shaded * alpha

    Image.fromarray(out_img.astype(np.uint8)).save(out)
    print(f"px/in={px_per_in:.1f}  banda y {ya:.0f}..{yb:.0f} ({band_px:.0f}px)")
    print(f"-> {out}")


if __name__ == "__main__":
    render("KENNETH", 0.0)
