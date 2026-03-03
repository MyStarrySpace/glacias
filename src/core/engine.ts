import { GlassParams, GlaciasOptions, DEFAULT_PARAMS, SHAPE_INDEX } from "./types";
import { VERT_SRC, FRAG_SRC } from "./shaders";
import { generateProceduralBg } from "./procedural-bg";

const UNIFORM_NAMES = [
  "u_resolution",
  "u_mouse",
  "u_time",
  "u_radius",
  "u_refraction",
  "u_chromatic",
  "u_blur",
  "u_noise",
  "u_edge",
  "u_thickness",
  "u_interior",
  "u_falloff",
  "u_shape",
  "u_bg",
  "u_bg_rect",
  "u_sdf_tex",
  "u_use_sdf_tex",
  "u_sdf_scale",
] as const;

export class GlaciasEngine {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private bgTexture: WebGLTexture;
  private quadBuffer: WebGLBuffer;

  private params: GlassParams;
  private bgRect: [number, number, number, number] = [0, 0, 1, 1];
  private containerEl: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;
  private mouseTarget = { x: 0.5, y: 0.5 };
  private mouseSmooth = { x: 0.5, y: 0.5 };
  private mouseLerp: number;

  private sdfTexture: WebGLTexture | null = null;
  private useSdfTex = false;
  private sdfScale = 0;
  private sdfMaxDist = 0;

  private rafId: number | null = null;
  private startTime = 0;
  private canvas: HTMLCanvasElement;
  private onError?: (msg: string) => void;

  constructor(options: GlaciasOptions) {
    this.canvas = options.canvas;
    this.onError = options.onError;
    this.mouseLerp = options.mouseLerp ?? 0.08;
    this.params = { ...DEFAULT_PARAMS, ...options.initialParams };

    const gl = this.canvas.getContext("webgl2", {
      antialias: false,
      premultipliedAlpha: false,
    });
    if (!gl) {
      this.onError?.("WebGL2 not supported");
      throw new Error("WebGL2 not supported");
    }
    this.gl = gl;

    // Compile shaders
    this.program = this.createProgram(VERT_SRC, FRAG_SRC);
    gl.useProgram(this.program);

    // Cache uniform locations
    for (const name of UNIFORM_NAMES) {
      this.loc[name] = gl.getUniformLocation(this.program, name);
    }

    // Fullscreen quad
    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    this.quadBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(this.program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Background texture
    this.bgTexture = gl.createTexture()!;
    this.setBackground(options.backgroundSrc ?? "procedural");

    this.resize();
  }

  // ── Public API ───────────────────────────────────────────────────

  start(): void {
    if (this.rafId !== null) return;
    this.startTime = performance.now();
    const loop = (time: number) => {
      this.rafId = requestAnimationFrame(loop);
      this.render(time);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  pause(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  destroy(): void {
    this.pause();
    const { gl } = this;
    gl.deleteProgram(this.program);
    gl.deleteTexture(this.bgTexture);
    if (this.sdfTexture) gl.deleteTexture(this.sdfTexture);
    gl.deleteBuffer(this.quadBuffer);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  setParams(partial: Partial<GlassParams>): void {
    Object.assign(this.params, partial);
  }

  getParams(): Readonly<GlassParams> {
    return { ...this.params };
  }

  setMouse(x: number, y: number): void {
    this.mouseTarget.x = x;
    this.mouseTarget.y = y;
  }

  setBgRect(rect: [number, number, number, number]): void {
    this.bgRect = rect;
  }

  /** Upload a custom SDF texture for shape masking */
  setSdfTexture(imageData: ImageData, maxInteriorDist: number): void {
    const { gl } = this;
    if (!this.sdfTexture) {
      this.sdfTexture = gl.createTexture()!;
    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.sdfTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.useSdfTex = true;
    this.sdfMaxDist = maxInteriorDist;
  }

  clearSdfTexture(): void {
    if (this.sdfTexture) {
      this.gl.deleteTexture(this.sdfTexture);
      this.sdfTexture = null;
    }
    this.useSdfTex = false;
  }

  /** Track DOM elements for automatic per-frame bgRect computation */
  setElements(container: HTMLElement | null, label: HTMLElement | null): void {
    this.containerEl = container;
    this.labelEl = label;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  setBackground(src: string): void {
    if (src === "procedural") {
      const bg = generateProceduralBg(1920, 1080);
      this.uploadTexture(bg);
    } else {
      // Load image, show procedural until ready
      const bg = generateProceduralBg(1920, 1080);
      this.uploadTexture(bg);

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => this.uploadTexture(img);
      img.onerror = () => this.onError?.(`Failed to load background: ${src}`);
      img.src = src;
    }
  }

  // ── Internal ────────────────────────────────────────────────────

  private computeBgRect(): void {
    if (!this.containerEl || !this.labelEl) return;
    const c = this.containerEl.getBoundingClientRect();
    const l = this.labelEl.getBoundingClientRect();
    if (c.width === 0 || c.height === 0) return;

    this.bgRect[0] = (l.left - c.left) / c.width;
    this.bgRect[1] = 1 - (l.bottom - c.top) / c.height;
    this.bgRect[2] = l.width / c.width;
    this.bgRect[3] = l.height / c.height;
  }

  private render(time: number): void {
    this.computeBgRect();
    const { gl, loc, params } = this;
    const dpr = window.devicePixelRatio || 1;

    // Lerp mouse
    this.mouseSmooth.x += (this.mouseTarget.x - this.mouseSmooth.x) * this.mouseLerp;
    this.mouseSmooth.y += (this.mouseTarget.y - this.mouseSmooth.y) * this.mouseLerp;

    // Compute effective radius: use SDF max interior distance when texture is active
    const avgCanvasSize = Math.sqrt(this.canvas.width * this.canvas.height);
    const sdfTexSize = 256; // matches generateSdfTexture default
    const effectiveRadius = this.useSdfTex
      ? this.sdfMaxDist * (avgCanvasSize / sdfTexSize)
      : params.radius * dpr;
    const sdfScale = avgCanvasSize; // (texVal - 0.5) * sdfScale → pixel distance

    // Set uniforms
    gl.uniform2f(loc.u_resolution!, this.canvas.width, this.canvas.height);
    gl.uniform2f(loc.u_mouse!, this.mouseSmooth.x, this.mouseSmooth.y);
    gl.uniform1f(loc.u_time!, time * 0.001);
    gl.uniform1f(loc.u_radius!, effectiveRadius);
    gl.uniform1f(loc.u_refraction!, params.refraction);
    gl.uniform1f(loc.u_chromatic!, params.chromatic);
    gl.uniform1f(loc.u_blur!, params.blur);
    gl.uniform1f(loc.u_noise!, params.noise);
    gl.uniform1f(loc.u_edge!, params.edge);
    gl.uniform1f(loc.u_thickness!, params.thickness);
    gl.uniform1f(loc.u_interior!, params.interior);
    gl.uniform1f(loc.u_falloff!, params.falloff);
    gl.uniform1i(loc.u_shape!, SHAPE_INDEX[params.shape]);
    gl.uniform1i(loc.u_bg!, 0);
    gl.uniform4f(loc.u_bg_rect!, this.bgRect[0], this.bgRect[1], this.bgRect[2], this.bgRect[3]);
    gl.uniform1i(loc.u_use_sdf_tex!, this.useSdfTex ? 1 : 0);
    gl.uniform1f(loc.u_sdf_scale!, sdfScale);
    gl.uniform1i(loc.u_sdf_tex!, 1);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.bgTexture);
    if (this.sdfTexture) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.sdfTexture);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private uploadTexture(source: TexImageSource): void {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.bgTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private createProgram(vertSrc: string, fragSrc: string): WebGLProgram {
    const { gl } = this;
    const vs = this.compileShader(gl.VERTEX_SHADER, vertSrc);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(prog);
      this.onError?.(`Shader link error: ${info}`);
      throw new Error(`Shader link error: ${info}`);
    }
    return prog;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const { gl } = this;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      this.onError?.(`Shader compile error: ${info}`);
      throw new Error(`Shader compile error: ${info}`);
    }
    return shader;
  }
}
