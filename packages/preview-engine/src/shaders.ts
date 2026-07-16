export const VERTEX_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos;
  gl_Position = vec4(a_pos.x * 2.0 - 1.0, 1.0 - a_pos.y * 2.0, 0.0, 1.0);
}`;

/**
 * Exact cylindrical mapping + shading by multiply.
 *
 * No displacement map: on a solid of revolution the geometry is known.
 *   x = cx + R(y) * sin(theta)  ->  theta = asin((x - cx) / R(y))
 *   u = theta / wrap + 0.5
 * The compression toward the edges falls out of asin's derivative.
 *
 * The shading is the photo itself: on a white body its luminance IS the lighting.
 * Multiplying the art by it seats the art on the surface.
 */
export const FRAGMENT_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_photo;
uniform sampler2D u_art;
uniform sampler2D u_radii;   // R32F, one column: R(y) in px

uniform vec2  u_photoSize;
uniform float u_cx;
uniform float u_yStart;      // first row of the printable band
uniform float u_yEnd;        // last row
uniform float u_shading;     // 0 = no shading, 1 = the photo as-is
uniform float u_safeSin;     // sin(safeAngle): safe zone limit
uniform float u_showSafe;    // 1 = draw the safe zone guide (admin)
uniform float u_wrapRad;     // radians of the product covered by the file width

const float PI = 3.14159265359;

void main() {
  vec4 photo = texture(u_photo, v_uv);
  outColor = photo;

  vec2 px = v_uv * u_photoSize;
  if (px.y < u_yStart || px.y > u_yEnd) return;

  float r = texture(u_radii, vec2(0.5, v_uv.y)).r;
  if (r < 1.0) return;

  float s = (px.x - u_cx) / r;
  if (abs(s) >= 1.0) return;           // outside the silhouette

  float theta = asin(s);               // front face: -pi/2 .. pi/2

  // The file covers u_wrapRad of the product, not always a full turn: a mug with a
  // handle prints ~320 degrees. Outside that band there is no art to draw.
  if (abs(theta) > u_wrapRad * 0.5) return;
  float u = theta / u_wrapRad + 0.5;
  float v = (px.y - u_yStart) / (u_yEnd - u_yStart);

  // art arrives premultiplied: art.rgb is already multiplied by art.a.
  vec4 art = texture(u_art, vec2(u, v));

  // The art receives the photo's exact lighting.
  vec3 shade = mix(vec3(1.0), photo.rgb, u_shading);
  vec3 color = photo.rgb * (1.0 - art.a) + art.rgb * shade;

  if (u_showSafe > 0.5 && abs(abs(s) - u_safeSin) < 0.006) {
    color = mix(color, vec3(1.0, 0.353, 0.121), 0.85);
  }

  outColor = vec4(color, 1.0);
}`;
