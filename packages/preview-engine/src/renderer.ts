import { FRAGMENT_SRC, VERTEX_SRC } from "./shaders";
import type { Calibration, PrintBand, Profile } from "./types";
import { DEFAULT_CALIBRATION } from "./types";

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`Shader: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

export interface RenderInput {
  profile: Profile;
  band: PrintBand;
  /** Arte plano: el archivo de impresion completo (envoltura 360). */
  art: TexImageSource;
  calibration?: Calibration;
  /** Dibuja la guia de zona segura. Solo el admin la usa. */
  showSafeZone?: boolean;
}

export class PreviewRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private photoTex: WebGLTexture;
  private artTex: WebGLTexture;
  private radiiTex: WebGLTexture;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor(canvas: HTMLCanvasElement, photo: TexImageSource) {
    // preserveDrawingBuffer: el preview aprobado se guarda con la orden (spec 5),
    // asi que el buffer tiene que seguir legible despues de componer.
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 no disponible");
    this.gl = gl;

    // R32F para R(y): el radio se guarda en px, no normalizado.
    if (!gl.getExtension("EXT_color_buffer_float")) {
      // Solo hace falta para render-to-float; muestrear R32F es core en WebGL2.
    }

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SRC));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Link: ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;
    gl.useProgram(program);

    for (const name of ["u_photo", "u_art", "u_radii", "u_photoSize", "u_cx",
      "u_yStart", "u_yEnd", "u_shading", "u_safeSin", "u_showSafe"]) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    this.photoTex = this.makeTex(photo, false);
    this.artTex = gl.createTexture()!;
    this.radiiTex = gl.createTexture()!;
  }

  private makeTex(src: TexImageSource, mipmap: boolean): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (mipmap) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    return tex;
  }

  private uploadRadii(profile: Profile) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.radiiTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, profile.height, 0,
      gl.RED, gl.FLOAT, profile.radii);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // NEAREST: R(y) es una tabla por fila, interpolarla no aporta.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  render(input: RenderInput) {
    const gl = this.gl;
    const { profile, band } = input;
    const cal = input.calibration ?? DEFAULT_CALIBRATION;

    gl.bindTexture(gl.TEXTURE_2D, this.artTex);
    // Premultiplicado obligatorio: al generar mipmaps cada texel se promedia con
    // sus vecinos transparentes (rgb=0, a=0). Con alfa recto eso hunde el alfa y
    // los trazos finos desaparecen; con premultiplicado el promedio es correcto.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input.art);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // Mipmaps: hacia los bordes la compresion es extrema y sin ellos aliasea.
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

    this.uploadRadii(profile);

    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.photoTex);
    gl.uniform1i(this.uniforms.u_photo, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.artTex);
    gl.uniform1i(this.uniforms.u_art, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.radiiTex);
    gl.uniform1i(this.uniforms.u_radii, 2);

    gl.uniform2f(this.uniforms.u_photoSize, profile.width, profile.height);
    gl.uniform1f(this.uniforms.u_cx, profile.cx);
    gl.uniform1f(this.uniforms.u_yStart, band.yStart);
    gl.uniform1f(this.uniforms.u_yEnd, band.yStart + band.height);
    gl.uniform1f(this.uniforms.u_shading, cal.shadingStrength);
    gl.uniform1f(this.uniforms.u_safeSin, Math.sin(cal.safeAngleDeg * Math.PI / 180));
    gl.uniform1f(this.uniforms.u_showSafe, input.showSafeZone ? 1 : 0);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}
