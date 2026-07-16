"""Extrae el perfil R(y) del tumbler desde la silueta de la foto.

Objetivo del spike: comprobar que la silueta contra el fondo da un perfil limpio,
incluido el afinado de la base. Si esto sale bien, el mapeo cilindrico es exacto.
"""
import json
import numpy as np
from PIL import Image

SRC = "tumbler.png"
OUT_PROFILE = "spike/profile.json"
OUT_DEBUG = "spike/profile_debug.png"

im = Image.open(SRC).convert("RGB")
a = np.asarray(im).astype(np.float32)
h, w, _ = a.shape

# El fondo es un verde oliva plano. Lo tomamos de la esquina.
bg = a[0:8, 0:8].reshape(-1, 3).mean(axis=0)

# Distancia al color de fondo -> mascara del objeto.
dist = np.linalg.norm(a - bg, axis=2)
obj = dist > 18.0

# Limpieza: nos quedamos con la componente por fila mas ancha y contigua.
rows = []
for y in range(h):
    xs = np.where(obj[y])[0]
    if len(xs) < 4:
        rows.append(None)
        continue
    rows.append((int(xs.min()), int(xs.max())))

# El cuerpo imprimible es blanco; la tapa es acero (mas oscuro/saturado en gris).
# Detectamos "blanco" con luminancia alta y saturacion baja.
mx = a.max(axis=2)
mn = a.min(axis=2)
lum = a.mean(axis=2)
sat = mx - mn
white = (lum > 195) & (sat < 18) & obj

white_frac = np.array([white[y].sum() / max((obj[y].sum()), 1) for y in range(h)])

# Filas del cuerpo: mayoria de pixeles blancos y anchura razonable.
body_rows = [y for y in range(h) if rows[y] is not None and white_frac[y] > 0.75
             and (rows[y][1] - rows[y][0]) > w * 0.25]
y_top, y_bot = min(body_rows), max(body_rows)

profile = []
for y in range(y_top, y_bot + 1):
    xs = np.where(white[y])[0]
    if len(xs) < 4:
        profile.append(None)
        continue
    l, r = int(xs.min()), int(xs.max())
    profile.append({"y": y, "left": l, "right": r, "cx": (l + r) / 2.0, "R": (r - l) / 2.0})

profile = [p for p in profile if p]
cx = float(np.median([p["cx"] for p in profile]))
Rmax = max(p["R"] for p in profile)

print(f"bg={bg.round(1).tolist()}  imagen={w}x{h}")
print(f"cuerpo: y {y_top}..{y_bot}  ({y_bot - y_top + 1} px de alto)")
print(f"cx={cx:.1f}  Rmax={Rmax:.1f}  ancho max={Rmax * 2:.1f}px")
print(f"relacion alto/diametro = {(y_bot - y_top) / (Rmax * 2):.3f}")
print(f"template real: 3.00in alto / 3.48in diam = {3.00 / 3.48:.3f}")

# Afinado de la base: R en el 10% inferior vs R maximo.
low = [p["R"] for p in profile if p["y"] > y_bot - (y_bot - y_top) * 0.10]
print(f"R base (ultimo 10%) = {np.mean(low):.1f}  -> afinado {100 * (1 - np.mean(low) / Rmax):.1f}%")

with open(OUT_PROFILE, "w") as f:
    json.dump({"y_top": y_top, "y_bot": y_bot, "cx": cx, "Rmax": Rmax,
               "profile": profile}, f)

# Debug: dibuja el perfil detectado sobre la foto.
dbg = np.asarray(im).copy()
for p in profile:
    y = p["y"]
    dbg[y, max(0, p["left"] - 1):p["left"] + 2] = [255, 90, 31]
    dbg[y, max(0, p["right"] - 1):p["right"] + 2] = [255, 90, 31]
dbg[y_top, :] = [255, 90, 31]
dbg[y_bot, :] = [255, 90, 31]
dbg[:, int(cx)] = [255, 90, 31]
Image.fromarray(dbg).save(OUT_DEBUG)
print(f"-> {OUT_DEBUG}")
