// All GLSL lives here as template literals so the app runs without a bundler or fetch.

export const VERTEX = /* glsl */ `#version 300 es
precision highp float;
// A real attribute at location 0 (not gl_VertexID): drawing with attrib 0
// disabled forces slow emulation on desktop-GL browsers like Firefox/macOS.
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// Shared value-noise + fbm, and the procedural base nebula.
// The base nebula is the "rest state" the dye field relaxes toward; its domain
// drifts slowly with time, which is what makes the whole cloud crawl.
const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += amp * vnoise(p);
    p = rot * p * 2.03;
    amp *= 0.5;
  }
  return v;
}

// Ridged fbm for filamentary structure.
float ridge(vec2 p) {
  float v = 0.0;
  float amp = 0.55;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += amp * (1.0 - abs(2.0 * vnoise(p) - 1.0));
    p = rot * p * 2.13;
    amp *= 0.5;
  }
  return v;
}

const vec3 NEB_PINK   = vec3(1.00, 0.36, 0.75);
const vec3 NEB_PURPLE = vec3(0.55, 0.34, 0.97);
const vec3 NEB_BLUE   = vec3(0.25, 0.62, 1.00);

// Returns premultiplied nebula color in rgb and dark-dust absorption in a.
// The domain-warp offsets move at different rates from the main drift, so the
// cloud's shape slowly evolves as it crawls — a drift-through, not a slide.
vec4 baseNebula(vec2 uv, float aspect, float time) {
  vec2 p = uv * vec2(aspect, 1.0);
  vec2 drift = vec2(time * 0.009, time * -0.004);

  // Large-scale cloud mass, warped by a second fbm (domain warping).
  vec2 q = p * 1.6 + drift;
  vec2 warp = vec2(fbm(q + vec2(1.7, 9.2)), fbm(q + vec2(8.3, 2.8))) - 0.5;
  float mass = fbm(q + warp * 2.2);

  // Filamentary detail carves the cloud before thresholding.
  float fil = ridge(p * 3.1 + drift * 1.4 + warp * 1.6);
  mass += (fil - 0.55) * 0.16;

  // The nebula's territory ends at a world altitude below the first screen.
  // Reducing MASS (not alpha) means clouds near the boundary shrink and break
  // into smaller complete puffs — no cloud shape is ever sliced by a line.
  float band = smoothstep(-0.45, -0.05, uv.y);
  mass -= (1.0 - band) * 0.6;

  // High threshold + power: dense glowing cores, wispy edges, real dark sky between clouds.
  float density = pow(smoothstep(0.48, 0.95, mass), 1.6);
  density *= 0.4 + 1.1 * fil * fil;

  // Hue field: pink cores -> purple mid -> blue fringes.
  float hue = fbm(p * 2.2 - drift * 0.6 + vec2(4.1, 7.7));
  vec3 col = mix(NEB_BLUE, NEB_PURPLE, smoothstep(0.30, 0.52, hue));
  col = mix(col, NEB_PINK, smoothstep(0.52, 0.74, hue));

  // Hot emission core where the cloud is densest.
  float core = smoothstep(0.80, 1.0, mass + (fil - 0.5) * 0.1);
  col = mix(col, vec3(1.0, 0.75, 0.92), core * 0.8);
  density += core * core * 0.8;

  // Dark dust lanes, strongest at the cloud fringes (mid-density band).
  float dustF = fbm(p * 2.8 + warp * 1.8 + vec2(9.4, 3.1));
  float fringe = smoothstep(0.35, 0.55, mass) * (1.0 - smoothstep(0.60, 0.85, mass));
  float dust = smoothstep(0.55, 0.80, dustF) * fringe;

  return vec4(col * density, dust);
}
`;

export const ADVECTION = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexelSize;   // texel size of the velocity field
uniform float uDt;
uniform float uDissipation;
uniform vec2 uShift;       // this frame's scroll motion — fields ride with the cloud
void main() {
  vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uTexelSize - uShift;
  outColor = texture(uSource, coord) / (1.0 + uDissipation * uDt);
}
`;

// Displacement accumulation: the offset field is carried along by the fluid,
// picks up this frame's motion, and decays toward zero — so the cloud is only
// ever *bent* by the cursor and always heals back to its untouched shape.
export const OFFSET_UPDATE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform sampler2D uOffset;
uniform vec2 uTexelSize;   // texel size of the velocity field
uniform float uDt;
uniform float uDecay;
uniform vec2 uShift;       // this frame's scroll motion — deformations ride with the cloud
void main() {
  vec2 v = texture(uVelocity, vUv).xy;
  vec2 back = vUv - uDt * v * uTexelSize - uShift;
  vec2 off = texture(uOffset, back).xy;
  off += v * uTexelSize * uDt;
  off *= exp(-uDecay * uDt);
  float len = length(off);
  if (len > 0.25) off *= 0.25 / len;
  outColor = vec4(off, 0.0, 1.0);
}
`;

// The cloud, recomputed every frame: base nebula sampled through the bent
// coordinates. Divergence of the displacement drives a density response —
// stretched gas thins (cleared path), compressed gas piles up and brightens.
export const CLOUD = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uOffset;
uniform vec2 uOffTexel;
uniform float uAspect;
uniform float uTime;
uniform float uScroll;
${NOISE_GLSL}
void main() {
  vec2 off = texture(uOffset, vUv).xy;
  float dR = texture(uOffset, vUv + vec2(uOffTexel.x, 0.0)).x;
  float dL = texture(uOffset, vUv - vec2(uOffTexel.x, 0.0)).x;
  float dT = texture(uOffset, vUv + vec2(0.0, uOffTexel.y)).y;
  float dB = texture(uOffset, vUv - vec2(0.0, uOffTexel.y)).y;
  float div = 0.5 * ((dR - dL) / uOffTexel.x + (dT - dB) / uOffTexel.y);
  float squeeze = exp(-clamp(div, -3.0, 3.0) * 0.5);
  // Scroll shifts the cloud's *world* coordinates — the procedural field is
  // unbounded, so the nebula slides up with the stars and fresh (or, past the
  // territory boundary, empty) sky enters from below with no texture edge.
  // uScroll arrives pre-multiplied by the world speed (see fluid.js).
  vec4 base = baseNebula(vUv - off - vec2(0.0, uScroll), uAspect, uTime);
  outColor = vec4(base.rgb * squeeze, base.a * squeeze);
}
`;

export const SPLAT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTarget;
uniform float uAspect;
uniform vec2 uPoint;
uniform vec2 uDir;
uniform float uRadius;
uniform float uRadial;  // 0 = directional push, 1 = radial shove away from uPoint
void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  float g = exp(-dot(p, p) / uRadius);
  vec2 radialDir = p / (length(p) + 1e-4);
  vec2 force = mix(uDir, radialDir * length(uDir), uRadial);
  outColor = vec4(texture(uTarget, vUv).xy + force * g, 0.0, 1.0);
}
`;

export const CURL = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
void main() {
  float L = texture(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).y;
  float R = texture(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).y;
  float B = texture(uVelocity, vUv - vec2(0.0, uTexelSize.y)).x;
  float T = texture(uVelocity, vUv + vec2(0.0, uTexelSize.y)).x;
  outColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}
`;

export const VORTICITY = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexelSize;
uniform float uCurlStrength;
uniform float uDt;
void main() {
  float L = texture(uCurl, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture(uCurl, vUv + vec2(uTexelSize.x, 0.0)).x;
  float B = texture(uCurl, vUv - vec2(0.0, uTexelSize.y)).x;
  float T = texture(uCurl, vUv + vec2(0.0, uTexelSize.y)).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 1e-4;
  force *= uCurlStrength * C;
  force.y = -force.y;
  vec2 vel = texture(uVelocity, vUv).xy + force * uDt;
  outColor = vec4(clamp(vel, -1000.0, 1000.0), 0.0, 1.0);
}
`;

export const DIVERGENCE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
void main() {
  float L = texture(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).x;
  float B = texture(uVelocity, vUv - vec2(0.0, uTexelSize.y)).y;
  float T = texture(uVelocity, vUv + vec2(0.0, uTexelSize.y)).y;
  vec2 C = texture(uVelocity, vUv).xy;
  // Solid-ish boundaries: reflect velocity at the edges.
  if (vUv.x - uTexelSize.x < 0.0) L = -C.x;
  if (vUv.x + uTexelSize.x > 1.0) R = -C.x;
  if (vUv.y - uTexelSize.y < 0.0) B = -C.y;
  if (vUv.y + uTexelSize.y > 1.0) T = -C.y;
  outColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}
`;

export const PRESSURE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexelSize;
void main() {
  float L = texture(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
  float B = texture(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
  float T = texture(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
  float div = texture(uDivergence, vUv).x;
  outColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}
`;

export const GRADIENT_SUBTRACT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
void main() {
  float L = texture(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
  float B = texture(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
  float T = texture(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
  vec2 vel = texture(uVelocity, vUv).xy - vec2(R - L, T - B) * 0.5;
  outColor = vec4(vel, 0.0, 1.0);
}
`;

export const COMPOSITE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uDye;
uniform float uScroll;      // 0 = deep space, 1 = full day
uniform float uTime;
uniform float uAspect;
${NOISE_GLSL}

// --- Sky gradient keyframes: (top, mid, bottom) per scroll stop ---
// space -> night -> dawn -> day
const vec3 SKY_TOP[4] = vec3[4](
  vec3(0.012, 0.004, 0.055),  // space: near-black violet
  vec3(0.016, 0.043, 0.110),  // night: deep blue
  vec3(0.118, 0.157, 0.369),  // dawn: indigo
  vec3(0.353, 0.647, 0.925)   // day: sky blue
);
const vec3 SKY_MID[4] = vec3[4](
  vec3(0.024, 0.010, 0.078),
  vec3(0.043, 0.086, 0.180),
  vec3(0.557, 0.337, 0.482),  // dawn: dusty rose
  vec3(0.565, 0.792, 0.965)
);
const vec3 SKY_BOT[4] = vec3[4](
  vec3(0.043, 0.024, 0.110),
  vec3(0.078, 0.145, 0.278),
  vec3(1.000, 0.620, 0.380),  // dawn: horizon orange
  vec3(0.851, 0.945, 0.996)   // day: pale horizon
);
const float SKY_STOPS[4] = float[4](0.0, 0.36, 0.74, 1.0);

vec3 skyColor(float y, float s) {
  int i = 0;
  if (s >= SKY_STOPS[1]) i = 1;
  if (s >= SKY_STOPS[2]) i = 2;
  int j = min(i + 1, 3);
  float t = clamp((s - SKY_STOPS[i]) / max(SKY_STOPS[j] - SKY_STOPS[i], 1e-4), 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  vec3 top = mix(SKY_TOP[i], SKY_TOP[j], t);
  vec3 mid = mix(SKY_MID[i], SKY_MID[j], t);
  vec3 bot = mix(SKY_BOT[i], SKY_BOT[j], t);
  // y: 1 at top of screen, 0 at bottom; mid peaks low for a horizon glow.
  // Overlapping blends keep the slope continuous — butting two smoothsteps
  // at a midpoint leaves a flat seam that reads as a dark band.
  vec3 c = mix(bot, mid, smoothstep(0.0, 0.60, y));
  return mix(c, top, smoothstep(0.25, 1.0, y));
}

// --- Bright stars: dots with varied size; the glow halo only shows where
// nebula gas can diffract the light (glow = local gas density). ---
vec3 brightStars(vec2 uv, float glow) {
  vec2 g = uv * 7.0;
  vec2 id = floor(g);
  vec2 f = fract(g);
  float rnd = hash12(id);
  // The grid is world-space, so a narrow portrait screen holds fewer cells —
  // raise the spawn odds as the aspect narrows to keep the count feeling even.
  float spawn = 0.12 / clamp(uAspect, 0.45, 1.0);
  if (rnd > spawn) return vec3(0.0);
  vec2 pos = vec2(hash12(id + 17.1), hash12(id + 31.7)) * 0.5 + 0.25;
  float r = length(f - pos);
  float w = mix(500.0, 2200.0, hash12(id + 23.7)); // core sharpness varies star to star
  float core = exp(-r * r * w);
  float halo = exp(-r * r * w * 0.08) * 0.30 * glow;
  vec3 tint = mix(vec3(1.0, 0.86, 0.70), vec3(0.75, 0.85, 1.0), step(0.5, hash12(id + 3.3)));
  float amp = 0.30 + 0.70 * pow(hash12(id + 8.8), 2.0); // many dim, few bright
  return (core + halo) * tint * amp;
}

// --- Stars: parallax layers of hashed grid points, steady (no twinkle) ---
float starLayer(vec2 uv, float cells, float density) {
  vec2 g = uv * cells;
  vec2 id = floor(g);
  vec2 f = fract(g);
  float rnd = hash12(id);
  if (rnd > density) return 0.0;
  vec2 pos = vec2(hash12(id + 17.1), hash12(id + 31.7)) * 0.6 + 0.2;
  float d = length(f - pos);
  float size = 0.045 + 0.10 * hash12(id + 47.3);
  float star = smoothstep(size, 0.0, d);
  float bright = 0.35 + 0.65 * hash12(id + 5.5);
  return star * star * bright;
}

void main() {
  float s = uScroll;
  vec3 col = skyColor(vUv.y, s);

  // Camera descends as you scroll: stars and nebula slide upward with parallax.
  vec2 suv = vec2(vUv.x * uAspect, vUv.y);

  // Sample the nebula first: local gas density gates the bright-star glow.
  // The nebula stays in place and dissolves; parallax-shifting it drags the
  // dye texture's clamped edge across the screen as a visible line.
  // The nebula ends by scrolling past its world-space territory, not by
  // fading. This late fade only lets the shader skip cloud work once the
  // territory has already left the viewport — it is never visible.
  float nebFade = 1.0 - smoothstep(0.50, 0.65, s);
  vec4 dye = vec4(0.0);
  if (nebFade > 0.0) dye = texture(uDye, vUv);
  float gasDen = clamp(dot(dye.rgb, vec3(0.6)) * nebFade, 0.0, 1.0);

  float starFade = 1.0 - smoothstep(0.62, 0.86, s);
  if (starFade > 0.0) {
    float stars = 0.0;
    stars += starLayer(suv - vec2(0.0, s * 0.45), 170.0, 0.28) * 0.30;  // dust of tiny stars
    stars += starLayer(suv - vec2(-53.0, s * 0.60), 95.0, 0.12) * 0.55; // far
    stars += starLayer(suv - vec2(-37.0, s * 0.85), 55.0, 0.08) * 0.85; // mid
    // Faint cool tint on dim stars, white on bright.
    vec3 starCol = mix(vec3(0.70, 0.78, 1.0), vec3(1.0), clamp(stars, 0.0, 1.0));
    col += stars * starCol * starFade;
    float glow = smoothstep(0.02, 0.28, gasDen);
    col += brightStars(suv - vec2(-11.0, s * 1.10), glow) * starFade;
  }

  // Nebula: dust lanes absorb, gas emits. Gone by the time night fully sets in.
  if (nebFade > 0.0) {
    col *= 1.0 - dye.a * 0.8 * nebFade; // dark dust dims sky and stars behind it
    // Soft additive: keeps cores hot without clipping to white.
    vec3 gas = 1.0 - exp(-dye.rgb * 1.7);
    col += gas * nebFade;
  }

  // Gentle filmic-ish curve + dither to prevent gradient banding.
  col = col / (1.0 + col * 0.15);
  float dither = (hash12(gl_FragCoord.xy + fract(uTime) * 61.7) - 0.5) / 255.0 * 2.0;
  col += dither;

  outColor = vec4(col, 1.0);
}
`;
