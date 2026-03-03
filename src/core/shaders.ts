export const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform vec2 u_mouse;        // normalized [0,1]
uniform float u_time;
uniform float u_radius;       // in pixels
uniform float u_refraction;   // 0..1
uniform float u_chromatic;    // 0..1
uniform float u_blur;         // 0..1
uniform float u_noise;        // 0..1
uniform float u_edge;         // 0..1
uniform float u_thickness;    // 0..1  (edge band width)
uniform float u_interior;     // 0..1  (base distortion in center)
uniform float u_falloff;      // 0..1  (0 = uniform, 1 = edges only)
uniform int u_shape;          // 0=circle, 1=roundrect, 2=hex, 3=clover, 4=star
uniform sampler2D u_bg;
uniform vec4 u_bg_rect;       // (x, y, w, h) normalized rect within bg texture

// ── Simplex-style noise (2D) ──
vec3 mod289(vec3 x) { return x - floor(x / 289.0) * 289.0; }
vec2 mod289v2(vec2 x) { return x - floor(x / 289.0) * 289.0; }
vec3 permute(vec3 x) { return mod289((x * 34.0 + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289v2(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x_ = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x_) - 0.5;
  vec3 ox = floor(x_ + 0.5);
  vec3 a0 = x_ - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// ── Smooth min for organic boolean unions ──
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// ── SDF shapes ──
float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float sdHexagon(vec2 p, float r) {
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  vec2 q = abs(p);
  q -= 2.0 * min(dot(k.xy, q), 0.0) * k.xy;
  q -= vec2(clamp(q.x, -k.z * r, k.z * r), r);
  return length(q) * sign(q.y);
}

// 6-petal flower — distinct rounded petals around a small center
float sdClover(vec2 p, float r) {
  float petalR = r * 0.38;
  float ringR = r * 0.46;
  float k = r * 0.18;
  float d = sdCircle(p, petalR * 0.45);
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 6.2831853 / 6.0;
    vec2 c = vec2(cos(a), sin(a)) * ringR;
    d = smin(d, sdCircle(p - c, petalR), k);
  }
  return d;
}

// 5-pointed star with elongated limbs — Inigo Quilez star polygon SDF
float sdStar(vec2 p, float r) {
  const float an = 0.6283185307;  // pi/5
  const float en = 0.9; // center radius factor - tweak for more/less pointy
  vec2 acs = vec2(cos(an), sin(an));
  vec2 ecs = vec2(cos(en), sin(en));
  float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
  p = length(p) * vec2(cos(bn), abs(sin(bn)));
  p -= r * acs;
  p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
  return length(p) * sign(p.x);
}

float shapeSDF(vec2 p, float r, int shape) {
  if (shape == 1) return sdRoundBox(p, vec2(r * 1.4, r * 0.9), r * 0.25);
  if (shape == 2) return sdHexagon(p, r);
  if (shape == 3) return sdClover(p, r);
  if (shape == 4) return sdStar(p, r);
  return sdCircle(p, r);
}

// ── Smooth interior: erases internal SDF seams for compound shapes ──
float smoothInterior(vec2 p, float r, int shape) {
  float d = shapeSDF(p, r, shape);
  if (d >= 0.0) return d;
  float radialD = length(p) - r;
  float t = smoothstep(0.0, r * 0.35, -d);
  return mix(d, radialD, t);
}

// ── SDF gradient for surface normal ──
vec2 sdfNormal(vec2 p, float r, int shape) {
  float eps = max(6.0, r * 0.04);
  float d  = smoothInterior(p, r, shape);
  float dx = smoothInterior(p + vec2(eps, 0.0), r, shape) - d;
  float dy = smoothInterior(p + vec2(0.0, eps), r, shape) - d;
  vec2 n = vec2(dx, dy);
  float len = length(n);
  return (len > 0.001) ? n / len : vec2(0.0);
}

// ── Map canvas-local UV to background texture UV ──
vec2 toBgUV(vec2 localUV) {
  return u_bg_rect.xy + localUV * u_bg_rect.zw;
}

// ── Fake blur via multi-sample ──
vec3 sampleBlur(sampler2D tex, vec2 localUV, float amount) {
  vec2 bgUV = toBgUV(localUV);
  if (amount < 0.001) return texture(tex, bgUV).rgb;
  vec3 col = vec3(0.0);
  float total = 0.0;
  const int SAMPLES = 16;
  for (int i = 0; i < SAMPLES; i++) {
    float angle = float(i) * 6.2831853 / float(SAMPLES);
    vec2 offset = vec2(cos(angle), sin(angle)) * amount / u_resolution * u_bg_rect.zw;
    col += texture(tex, bgUV + offset).rgb;
    total += 1.0;
  }
  col += texture(tex, bgUV).rgb * 2.0;
  total += 2.0;
  return col / total;
}

void main() {
  vec2 uv = v_uv;
  vec2 pixel = uv * u_resolution;
  vec2 mousePixel = u_mouse * u_resolution;

  vec2 delta = pixel - mousePixel;
  float radiusPx = u_radius;

  float d = shapeSDF(delta, radiusPx, u_shape);

  // Outside the glass — just draw background
  if (d > 3.0) {
    fragColor = vec4(texture(u_bg, toBgUV(uv)).rgb, 1.0);
    return;
  }

  // ── Edge band (for Fresnel glow & specular) ──
  float bandWidth = radiusPx * u_thickness;
  float edgeBand = smoothstep(-bandWidth, 0.0, d) * (1.0 - smoothstep(0.0, 3.0, d));

  // ── Radial distortion mask ──
  float depth = clamp(-d / radiusPx, 0.0, 1.0);   // 0 at edge, 1 deep inside
  float edgeProximity = 1.0 - depth;                // 1 at edge, 0 at center
  float falloffExp = mix(3.0, 1.0, u_interior);     // u_interior widens the band
  float edgeFalloff = pow(edgeProximity, falloffExp);
  float radialFalloff = mix(1.0, edgeFalloff, u_falloff); // 0 = uniform, 1 = edges only
  float inside = 1.0 - smoothstep(-1.0, 2.0, d);
  float distortMask = radialFalloff * inside;

  // ── Surface normal → edge tangent (parallel to edge) ──
  vec2 surfNormal = sdfNormal(delta, radiusPx, u_shape);
  vec2 edgeTangent = vec2(-surfNormal.y, surfNormal.x);

  // ── Animated noise ──
  float t = u_time * 0.3;
  vec2 noiseOffset = vec2(
    snoise(pixel * 0.005 + vec2(t, 0.0)),
    snoise(pixel * 0.005 + vec2(0.0, t * 1.3))
  ) * u_noise * 40.0 / u_resolution;

  // ── Combine distortion ──
  float refractStrength = u_refraction * radiusPx * 0.6;
  vec2 distortion = (edgeTangent * refractStrength * distortMask + noiseOffset * distortMask) / u_resolution;

  // Chromatic aberration
  float chromaStrength = u_chromatic * 0.6;
  vec2 rUV = uv + distortion * (1.0 + chromaStrength);
  vec2 gUV = uv + distortion;
  vec2 bUV = uv + distortion * (1.0 - chromaStrength);

  // Blur
  float blurAmount = u_blur * 10.0 * distortMask;
  float r = sampleBlur(u_bg, rUV, blurAmount).r;
  float g = sampleBlur(u_bg, gUV, blurAmount).g;
  float b = sampleBlur(u_bg, bUV, blurAmount).b;

  vec3 color = vec3(r, g, b);

  // ── Edge highlight (Fresnel glow) ──
  float glowBand = smoothstep(-radiusPx * 0.12, 0.0, d) * (1.0 - smoothstep(0.0, 5.0, d));
  color += vec3(1.0) * glowBand * u_edge * 0.4;

  // ── Specular highlight ──
  vec2 lightDir = normalize(vec2(0.3, -0.5));
  float spec = pow(max(dot(surfNormal, lightDir), 0.0), 12.0) * edgeBand;
  color += vec3(1.0, 0.98, 0.95) * spec * u_edge * 0.25;

  // ── Inner shadow ──
  float innerShadow = smoothstep(0.0, radiusPx * 0.08, -d);
  color *= mix(0.88, 1.0, innerShadow);

  fragColor = vec4(color, 1.0);
}`;
