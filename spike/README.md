# Spike: motor de preview

Prototipo en Python para contestar una sola pregunta antes de construir nada:
**¿el compositing fotorrealista se ve lo suficientemente real?**

Es desechable. El motor de producción es WebGL2 en el navegador; esto solo valida el
modelo. Se conserva porque las imágenes son la evidencia de las decisiones del spec.

## Correr

```
python spike/profile.py     # extrae R(y) de la silueta -> profile.json + debug
python spike/composite.py   # preview con icono + nombre
python spike/compare.py     # overlay plano vs cilindrico exacto
python spike/safezone.py    # tabla de zona segura + auto-ajuste de texto
```

Requiere `tumbler.png` en la raiz (convertido del .avif de Printify) y Pillow + numpy.

## Resultados

| Archivo | Qué muestra |
|---|---|
| `profile_debug.png` | La silueta detectada sobre la foto. Sale limpia. |
| `preview.png` | Preview con icono + "KENNETH". |
| `compare_grid.png` | Rejilla 360: la compresion `cos(θ)` es visible. |
| `compare_text.png` | El texto ancho se sale del vaso en el modelo real. |
| `final.png` | Auto-ajuste con tres nombres de largo distinto. |

## Hallazgos

1. **La silueta da `R(y)` limpio**, incluido el afinado de la base. No hace falta
   displacement derivado en superficies de revolucion.
2. **La zona segura es ±45° = 25% del archivo** (820 de 3278 px).
3. **El area imprimible (3.00in) no cubre el cuerpo blanco (3.94in)**: el admin tiene
   que marcar la banda a mano.
4. **El auto-ajuste sin minimo deja ilegibles los nombres largos.** Hace falta
   `min_font_size` + salto a dos lineas.

## Limitaciones de esta evidencia

- Foto a **520x520**. El veredicto final de realismo necesita la original de Printify.
- El cuerpo esta iluminado muy plano: el multiply casi no aporta en el centro, que es
  justo donde cae el diseño. Parte del aspecto "pegado" es fisicamente correcto (una
  superficie mate blanca vista de frente se ve plana), pero parte es la foto.
- Falta el reflejo especular sobre el arte: un print real recoge el mismo brillo del
  vaso. No esta modelado.
- Fuentes del spike: Arial/Consolas del sistema, no Space Grotesk.
