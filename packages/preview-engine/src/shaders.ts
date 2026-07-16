export const VERTEX_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos;
  gl_Position = vec4(a_pos.x * 2.0 - 1.0, 1.0 - a_pos.y * 2.0, 0.0, 1.0);
}`;

/**
 * Mapeo cilindrico exacto + shading por multiply.
 *
 * No hay displacement map: en un solido de revolucion la geometria se conoce.
 *   x = cx + R(y) * sin(theta)  ->  theta = asin((x - cx) / R(y))
 *   u = theta / 2pi + 0.5
 * La compresion hacia los bordes sale sola de la derivada de asin.
 *
 * El shading es la propia foto: sobre un cuerpo blanco, su luminancia ES la
 * iluminacion. Multiplicar el arte por ella lo asienta en la superficie.
 */
export const FRAGMENT_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_photo;
uniform sampler2D u_art;
uniform sampler2D u_radii;   // R32F, una columna: R(y) en px

uniform vec2  u_photoSize;
uniform float u_cx;
uniform float u_yStart;      // primera fila de la banda imprimible
uniform float u_yEnd;        // ultima fila
uniform float u_shading;     // 0 = sin shading, 1 = foto tal cual
uniform float u_safeSin;     // sin(safeAngle): limite de la zona segura
uniform float u_showSafe;    // 1 = dibuja la guia de zona segura (admin)
uniform float u_wrapRad;     // radianes del producto que cubre el ancho del archivo

const float PI = 3.14159265359;

void main() {
  vec4 photo = texture(u_photo, v_uv);
  outColor = photo;

  vec2 px = v_uv * u_photoSize;
  if (px.y < u_yStart || px.y > u_yEnd) return;

  float r = texture(u_radii, vec2(0.5, v_uv.y)).r;
  if (r < 1.0) return;

  float s = (px.x - u_cx) / r;
  if (abs(s) >= 1.0) return;           // fuera de la silueta

  float theta = asin(s);               // cara frontal: -pi/2 .. pi/2

  // El archivo cubre u_wrapRad del producto, no siempre la vuelta entera: una taza
  // con asa imprime ~320 grados. Fuera de esa banda no hay arte que dibujar.
  if (abs(theta) > u_wrapRad * 0.5) return;
  float u = theta / u_wrapRad + 0.5;
  float v = (px.y - u_yStart) / (u_yEnd - u_yStart);

  // art viene premultiplicado: art.rgb ya esta multiplicado por art.a.
  vec4 art = texture(u_art, vec2(u, v));

  // El arte recibe la iluminacion exacta de la foto.
  vec3 shade = mix(vec3(1.0), photo.rgb, u_shading);
  vec3 color = photo.rgb * (1.0 - art.a) + art.rgb * shade;

  if (u_showSafe > 0.5 && abs(abs(s) - u_safeSin) < 0.006) {
    color = mix(color, vec3(1.0, 0.353, 0.121), 0.85);
  }

  outColor = vec4(color, 1.0);
}`;
