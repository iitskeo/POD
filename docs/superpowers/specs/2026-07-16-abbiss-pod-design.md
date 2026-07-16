# Abbiss POD - Diseño (Etapa 1)

Fecha: 2026-07-16
Estado: aprobado

## 1. Objetivo

Tienda print-on-demand de productos personalizados (nicho inicial: tumblers de
lenguajes de programación). Dos superficies:

- **Storefront**: el cliente elige producto, elige un icono, escribe un texto, y ve
  un preview fotorrealista que se actualiza en vivo. Sin login.
- **Admin**: importa productos de Printify/Printful, calibra el preview, gestiona la
  librería de iconos, decide qué personalización admite cada producto, y ve órdenes.

El cobro no se implementa en esta etapa. Las órdenes se capturan completas y quedan
en estado `pendiente_pago`.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Origen de productos | Printify y Printful (hay API key de ambos) |
| Personalización | Curada por el admin, no editor libre |
| Zonas | Una de icono + una de texto por producto |
| Preview | Compositing fotorrealista sobre foto real (no 3D, no overlay plano) |
| Mapas | Derivados automáticamente + sliders de ajuste manual |
| Iconos | Subida individual y masiva de SVG desde el admin |
| Stack | Vite + React SPA, Cloudflare Workers, D1, R2 |
| Fin del flujo | Carrito + envío + orden en `pendiente_pago` |
| Auth admin | Cloudflare Access |

### 2.1 Por qué no 3D

Un modelo 3D generado proceduralmente no muestra *el* producto, muestra *un*
producto. El requisito es ver el producto real. La base del preview es por lo tanto
una fotografía real del producto, no un render.

### 2.2 Por qué no los mockups del proveedor

Printify tarda 45-60s en generar mockups; Printful es asíncrono con webhooks y rate
limit agresivo en ese endpoint. Ninguno puede actualizar el preview tecla por tecla.
Sirven para fotos de catálogo, no para el personalizador.

## 3. Riesgos abiertos (decisión del negocio, no técnica)

**Marcas registradas.** Los logos de lenguajes (Python, Java, Rust) tienen políticas
de marca que restringen su uso en merchandising. El riesgo operativo concreto es que
Printify/Printful rechacen la orden en su revisión de propiedad intelectual. El
sistema es agnóstico: el admin sube los SVG que decida. Mitigaciones posibles:
lenguajes con licencia permisiva (Go, Kotlin, Linux), iconos originales que evoquen
sin copiar, o símbolos genéricos (`{ }`, `</>`).

**Pasarela de pago.** Paddle queda descartado: no admite productos físicos ni modelos
mixtos (Acceptable Use Policy). Opciones para Costa Rica cuando toque: ONVO Pay
(3.9% + $0.25 tarjeta, 1.5% SINPE Móvil) o Tilopay (4.25% + $0.35, 2% SINPE Móvil).
El checkout se diseña con el cobro como adaptador aislado.

## 4. Arquitectura

Tres unidades más un paquete compartido:

```
packages/preview-engine/   <- motor de composición (sin dependencias de React/CF)
apps/storefront/           <- SPA pública (Vite + React)
apps/admin/                <- SPA protegida por Cloudflare Access
apps/api/                  <- Cloudflare Worker: única pieza con las API keys
```

**Frontera clave:** el motor de preview es un paquete independiente consumido por el
storefront (cliente) y por el admin (calibración). Un solo motor, dos consumidores.
Esto garantiza que lo aprobado en el admin es idéntico a lo que ve el cliente.

Contrato del motor:

```
render(producto, seleccion) -> canvas         // preview, con displacement+shading
renderPrintFile(producto, seleccion) -> SVG   // arte plano, sin efectos, 300 DPI
```

El motor no conoce Printify, ni React, ni D1. Recibe datos, devuelve píxeles.

### 4.1 El motor de preview

Composición sobre la foto real del producto, en WebGL2 con un fragment shader propio
(~100 líneas, sin librería 3D):

1. **Displacement map** - deforma el arte para seguir la curva del cilindro o los
   pliegues de la tela.
2. **Shading map** - multiplica las luces y sombras de la foto original sobre el arte,
   para que reciba la misma iluminación que el producto.
3. **Máscara** - recorta el arte al área imprimible real.

Es la técnica del smart object de Photoshop, en vivo a 60fps. Es uniforme para
cualquier producto: no hay motores distintos por familia. Cada producto es una foto
más sus tres mapas.

El texto se rasteriza a una textura offscreen (Space Grotesk) y entra al pipeline como
una capa más de arte.

### 4.2 Derivación de mapas

Ocurre en el navegador del admin, una sola vez por producto:

- El admin sube/importa la foto y marca el área imprimible.
- El canvas deriva los mapas (ver 4.2.1 para `revolution`, 4.2.2 para `flat`).
- Sliders ajustan intensidad de curvatura y fuerza de sombra hasta que se vea bien.
- Los mapas resultantes se suben a R2 ya listos.

#### 4.2.1 Superficies de revolución: geometría exacta, no derivada

Para `surface = revolution` la geometría **no se deriva de la luminancia**: se conoce
analíticamente. La silueta del producto contra el fondo en la foto *es* el perfil
`R(y)` del sólido, incluyendo afinados y curvas (el wine tumbler no es un cilindro:
se estrecha abajo). Se extrae de la propia foto por umbral de contraste contra el
fondo.

Con `R(y)`, el mapeo del archivo de impresión a pantalla es exacto:

```
u (0..1 del archivo) -> θ = (u - 0.5) · 2π
x_pantalla = cx + R(y) · sin(θ)
compresión horizontal = cos(θ)      // 0 en los bordes, 1 al centro
visible cuando cos(θ) > 0           // cara frontal
```

La luminancia se usa solo para el **shading**, que es para lo que sirve. Esto es más
fiel y más simple que un displacement derivado, y elimina un slider.

#### 4.2.2 Superficies planas

Para `surface = flat` (camisetas) no hay geometría analítica: ahí sí aplica el
displacement derivado de luminancia, que aproxima los pliegues de la tela. Es el caso
donde un mapa hecho a mano da mejor resultado y donde el override manual importa.

### 4.2.3 Zona segura (hallazgo del template real)

El template de Printify del Wine Tumbler (12oz) es **3278 × 900 px a 300 DPI =
10.93 × 3.00 in**. Ese ancho es la **circunferencia completa**: 10.93 / π = 3.48 in de
diámetro. El archivo de impresión **envuelve el producto 360°**.

Consecuencia para el personalizador: la cámara solo ve la cara frontal, y por
`cos(θ)` los bordes se comprimen hasta desaparecer. Medido en el spike:

| Ángulo | % del archivo | px del archivo | Compresión `cos(θ)` |
|---|---|---|---|
| ±30° | 16.7% | 546 | 0.87 |
| **±45°** | **25.0%** | **820** | **0.71** |
| ±60° | 33.3% | 1093 | 0.50 |

**La zona segura es ±45°, o sea el 25% central: 820 px de los 3278.** El resto del
archivo envuelve la parte trasera del vaso.

El `text_zone` y el `icon_zone` deben vivir dentro de esa zona, y el admin debe verla
dibujada al calibrar. El spike lo demostró: un texto al 60% del ancho del archivo son
216° de envoltura — se sale del vaso y se corta en la silueta.

Nota adicional del spike: el cuerpo blanco del Wine Tumbler mide 3.94 in de alto pero
el área imprimible son 3.00 in. **El área de impresión no cubre todo el cuerpo**, y la
silueta no dice dónde empieza la banda. De ahí que el admin tenga que marcarla a mano.

Se hace en el cliente porque los Workers no tienen buenas librerías de procesamiento
de imagen, la operación es puntual, y el admin necesita ver el resultado mientras
ajusta. Un mapa hecho a mano puede subirse como override si algún producto lo pide.

### 4.3 Generación del archivo de impresión

**Server-side, desde la receta.** El navegador nunca sube el arte final. El
`order_item` guarda `icon_id` + `text`; el Worker reconstruye el SVG y lo rasteriza a
300 DPI (resvg-wasm) al mandarlo al proveedor.

Si el cliente subiera el PNG, cualquiera podría mandar a imprimir arbitrariedades
desde la consola del navegador. La receta es la fuente de verdad.

El arte de impresión es **plano**: sin displacement ni shading. Esos efectos existen
solo para el preview; la imprenta recibe el arte recto.

## 5. Modelo de datos (D1)

No hay tabla de plantillas: cada producto tiene exactamente una zona de icono y una de
texto, así que son columnas del producto. Una tabla aparte sería abstracción de un
solo uso.

**`products`**
- Identidad: `id`, `name`, `slug`, `price`, `status` (`borrador`|`publicado`)
- Origen: `source` (`printify`|`printful`|`manual`), `external_product_id`,
  `external_variant_id`
- Assets R2: `photo_key`, `displacement_key`, `shading_key`, `mask_key`
- `surface`: `revolution` | `flat`
- `calibration` (JSON): intensidad de curvatura, fuerza de sombra
- `icon_zone` (JSON): rectángulo en coordenadas de la foto
- `text_zone` (JSON): rectángulo + reglas (máx. caracteres, fuente, colores permitidos)
- `print_spec` (JSON): dimensiones y DPI que espera el proveedor

**`icons`** - `id`, `name`, `slug`, `category`, `svg_key`, `active`

**`product_icons`** - tabla puente. Implementa el control del admin: qué iconos se
ofrecen en qué producto.

**`orders`** - cliente, envío, totales, `status`
(`pendiente_pago` -> `pagado` -> `enviado_a_proveedor` -> `cumplido`)

**`order_items`** - `product_id`, `icon_id`, `text`, `print_art_key`, `preview_key`

`icon_id` + `text` son la receta y la fuente de verdad. `print_art_key` es nulo hasta
que el Worker rasteriza el arte al mandarlo al proveedor (ver 4.3); a partir de ahí
queda como registro inmutable de lo que se imprimió.

Guardar el preview del cliente no es redundante: es el respaldo ante un reclamo, la
imagen exacta que el cliente aprobó al comprar.

### 5.1 Reglas de la zona de texto

El manual de marca exige un solo acento por composición, así que el color del texto es
una lista corta definida por el admin, no un color picker libre.

El motor auto-ajusta el tamaño de fuente, pero **con tamaño mínimo**. El spike mostró
que encoger sin límite deja los nombres largos ilegibles ("MARIA FERNANDA" quedó
diminuto junto a "ANA"). Al llegar al mínimo, el comportamiento es partir en dos
líneas; si aun así no cabe, el campo rechaza más caracteres. El `text_zone` guarda por
tanto `min_font_size` y `max_lines` además del máximo de caracteres.

## 6. Flujos

**Cliente:** elige producto -> elige icono -> escribe texto -> el motor recompone en
cada tecla -> agrega al carrito -> llena envío -> orden en `pendiente_pago`.

**Admin:** importa producto de Printify/Printful -> el Worker baja la foto -> el admin
marca el área imprimible y calibra con sliders -> define zonas y iconos permitidos ->
publica.

## 7. Manejo de errores

- **Import del proveedor falla** (rate limit, key inválida): el producto queda en
  `borrador` con el error visible en el admin. Reintentable.
- **WebGL no disponible** en el navegador del cliente: fallback a composición en Canvas
  2D sin displacement. El preview pierde realismo pero la tienda no se cae. Se avisa
  con un aviso discreto.
- **Foto o mapa faltante** en R2: el producto no se puede publicar. Validación en el
  admin al publicar, no en runtime del cliente.
- **Texto fuera de reglas** (excede máximo): se valida en el cliente al escribir y de
  nuevo en el Worker al crear la orden. El cliente puede saltarse el primero.
- **Orden creada pero el proveedor rechaza**: la orden pasa a estado de error con el
  motivo del proveedor, visible en el admin.

## 8. Testing

- **Motor de preview**: golden-image tests. Entradas fijas (producto + icono + texto),
  se compara el canvas contra una imagen de referencia con tolerancia de píxel. Es lo
  que atrapa regresiones visuales, que es el riesgo real de este proyecto.
- **Coincidencia preview/impresión**: test que verifica que `render` y
  `renderPrintFile` producen la misma geometría de arte (posición y escala relativas),
  variando solo los efectos.
- **Worker**: tests de integración con D1 local (Miniflare) para el ciclo de orden.
  Los clientes de Printify/Printful se mockean.
- **Validación de reglas**: tests de la zona de texto (límites, auto-ajuste de fuente).

## 9. Marca

Del manual Abbiss v1:

- **Paleta**: Negro `#0A0A0A` (fondo), Carbón `#161616` (superficies), Hueso `#F5F5F0`
  (texto), Señal `#FF5A1F` (único acento, un elemento por composición).
- **Tipografía**: Space Grotesk 500/700 (titulares), Inter 400/500 (cuerpo),
  IBM Plex Mono 400/500 (etiquetas y datos).
- **Gráficos**: trama halftone a baja opacidad y uso mínimo, diagonales sutiles.
  Sin degradados, sin neón, sin efectos.
- **Voz**: tuteo, clara y resolutiva. Sin jerga sin explicar. Sin promesas irreales.

## 10. Orden de construcción

El alcance es demasiado grande para un solo plan de implementación. Se descompone en
cuatro entregas, y el orden no es negociable:

**0. Spike del motor de preview (primero, antes que nada).**
Un prototipo mínimo: una foto real de tumbler, un icono, un texto, el shader de
displacement + shading + máscara. Sin React, sin D1, sin admin. El único objetivo es
contestar una pregunta: *¿se ve lo suficientemente real?*

Todo el negocio descansa en esa apuesta y hoy no está verificada. Si el resultado no
convence con las fotos reales, el concepto del producto cambia y el resto del diseño
se replantea. Descubrirlo después de construir el admin y el storefront sería el error
más caro posible. Criterio de éxito: el usuario mira el preview junto a una foto del
producto real y no sabe distinguir cuál lleva el diseño impreso.

**1. Motor + API + esquema D1.** El paquete del motor terminado con sus golden-image
tests, el Worker con los clientes de Printify/Printful, y las tablas.

**2. Admin.** Import, calibración con sliders, librería de iconos, publicación. Va
antes que el storefront porque es lo que produce los datos que el storefront consume.

**3. Storefront.** Landing, personalizador, carrito, captura de orden.

Cada entrega tiene su propio plan de implementación.

## 11. Fuera de alcance (etapa 1)

- Cobro (adaptador preparado, no implementado)
- Múltiples iconos por producto
- Arrastre libre de elementos
- Cuentas de cliente
- Envío de la orden al proveedor en automático (el estado existe; el disparo es manual)
