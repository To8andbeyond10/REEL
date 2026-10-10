// The sky: a physically based daylight model, a night sky with stars and a moon, a moving cloud layer,
// grey overcast and horizon haze for the weather. The same sky lights the scene: it is baked into an
// environment map whenever the sun moves or the weather changes, so ambient light and reflections match it.
//
// The daylight scattering is the Preetham et al. analytic model as ported in the three.js `Sky` shader
// (MIT: Simon Wallner, Martin Upitis, zz85) and adapted in PlayCanvas's procedural-sky script (MIT).
// The clouds, overcast, haze, lightning and the CPU colour sampling are ours.
import * as pc from 'playcanvas';
import { clamp, lerp } from '../sim/random.js';

const TOTAL_RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const EE = 1000;
const CUTOFF = 1.6110731556870734;
const STEEPNESS = 1.5;
// The daylight model is in absolute units; this brings a clear noon sky to a comfortable brightness.
const SKY_EXPOSURE = 0.25;
const NIGHT_COLOR = [0.012, 0.02, 0.045];

export const SKY_GLSL = /* glsl */ `
  uniform vec3 skySunDir;
  uniform vec3 skyBetaR;
  uniform vec3 skyBetaM;
  uniform float skySunE;
  uniform float skyMieG;
  uniform float skyLuminance;
  uniform float skyNight;
  uniform vec3 skyMoonDir;
  uniform vec3 skyNightColor;
  uniform float skyOvercast;
  uniform vec3 skyOvercastColor;
  uniform vec3 skyHazeColor;
  uniform float skyHaze;
  uniform float skyCover;
  uniform float skyCloudOpacity;
  uniform vec3 skyCloudLit;
  uniform vec3 skyCloudShade;
  uniform float skyTime;
  uniform float skyFlash;

  const float SKY_PI = 3.141592653589793;

  float skyRayleighPhase(float c) { return (3.0 / (16.0 * SKY_PI)) * (1.0 + c * c); }
  float skyHgPhase(float c, float g) {
    float g2 = g * g;
    return (1.0 / (4.0 * SKY_PI)) * ((1.0 - g2) / pow(max(1.0 - 2.0 * g * c + g2, 1e-4), 1.5));
  }

  vec3 skyDay(vec3 dir, float sunDisc) {
    vec3 sunDir = normalize(skySunDir);
    float up = max(0.0, dir.y);
    float zenith = acos(up);
    float denom = cos(zenith) + 0.15 * pow(max(93.885 - degrees(zenith), 1e-3), -1.253);
    vec3 fex = exp(-(skyBetaR * (8.4e3 / denom) + skyBetaM * (1.25e3 / denom)));
    float c = dot(dir, sunDir);
    vec3 bR = skyBetaR * skyRayleighPhase(c * 0.5 + 0.5);
    vec3 bM = skyBetaM * skyHgPhase(c, skyMieG);
    vec3 bSum = skyBetaR + skyBetaM;
    vec3 lin = pow(skySunE * ((bR + bM) / bSum) * (1.0 - fex), vec3(1.5));
    lin *= mix(vec3(1.0), pow(skySunE * ((bR + bM) / bSum) * fex, vec3(0.5)), clamp(pow(1.0 - sunDir.y, 5.0), 0.0, 1.0));
    vec3 l0 = vec3(0.1) * fex;
    l0 += skySunE * 19000.0 * fex * smoothstep(0.99995, 0.999975, c) * sunDisc;
    return min((lin + l0) * 0.04 * skyLuminance + vec3(0.0, 0.0003, 0.00075), vec3(4000.0));
  }

  float skyHash3(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float skyHash2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float skyNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(skyHash2(i), skyHash2(i + vec2(1.0, 0.0)), u.x), mix(skyHash2(i + vec2(0.0, 1.0)), skyHash2(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float skyFbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      s += a * skyNoise(p);
      p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3;
      a *= 0.5;
    }
    return s;
  }

  vec3 skyNightSky(vec3 dir, float detail) {
    vec3 col = skyNightColor * mix(1.15, 0.45, max(dir.y, 0.0));
    // Afterglow over where the sun went down.
    vec3 sunH = normalize(vec3(skySunDir.x, 0.0, skySunDir.z) + vec3(1e-5, 0.0, 0.0));
    float toSun = max(dot(dir, sunH), 0.0);
    col += vec3(1.0, 0.42, 0.14) * pow(toSun, 5.0) * clamp(1.0 + skySunDir.y * 4.0, 0.0, 1.0) * 0.45;
    if (detail > 0.5) {
      vec3 p = dir * 70.0;
      vec3 cell = floor(p);
      float present = step(0.2, skyHash3(cell));
      vec3 sp = vec3(0.3) + 0.4 * vec3(skyHash3(cell + 11.0), skyHash3(cell + 23.0), skyHash3(cell + 37.0));
      float r = mix(0.05, 0.2, pow(skyHash3(cell + 53.0), 2.0));
      float d = length(fract(p) - sp);
      float aa = length(fwidth(p)) + 1e-4;
      float star = present * mix(0.3, 1.0, skyHash3(cell + 71.0)) * (1.0 - smoothstep(r - aa, r + aa, d));
      col += vec3(star * 0.06 * smoothstep(0.0, 0.05, dir.y) * (1.0 - skyOvercast));
      float m = dot(dir, normalize(skyMoonDir));
      float aaM = max(fwidth(m), 1e-5);
      col += vec3(0.8, 0.9, 1.0) * 2.5 * smoothstep(0.99994 - aaM, 0.99994 + aaM, m) * (1.0 - skyOvercast * 0.9);
      col += vec3(0.25, 0.3, 0.4) * pow(max(m, 0.0), 300.0) * 0.4 * (1.0 - skyOvercast * 0.5);
    }
    return col;
  }

  vec4 skyClouds(vec3 dir) {
    if (dir.y <= 0.0 || skyCloudOpacity <= 0.0) return vec4(0.0);
    vec2 uv = dir.xz / (dir.y + 0.1) * 1.4 + skyTime * vec2(0.010, 0.0035);
    float n = skyFbm(uv);
    float d = smoothstep(1.0 - skyCover - 0.08, 1.0 - skyCover + 0.32, n);
    vec2 toSun = normalize(skySunDir.xz + vec2(1e-4)) * 0.07;
    float n2 = skyFbm(uv + toSun);
    float lit = clamp(0.55 + (n - n2) * 4.0, 0.0, 1.0);
    vec3 col = mix(skyCloudShade, skyCloudLit, lit);
    // Bright rims where the sun shines through thin cloud.
    float rim = pow(max(dot(dir, normalize(skySunDir)), 0.0), 10.0) * (1.0 - d) * 1.6;
    col += skyCloudLit * rim;
    float fade = smoothstep(0.0, 0.14, dir.y);
    return vec4(col, d * fade * skyCloudOpacity);
  }

  vec3 skyColor(vec3 dir, float detail) {
    dir = normalize(dir);
    vec3 c;
    if (skyNight <= 0.0) c = skyDay(dir, detail);
    else if (skyNight >= 1.0) c = skyNightSky(dir, detail);
    else c = mix(skyDay(dir, detail), skyNightSky(dir, detail), skyNight);
    vec3 grey = skyOvercastColor * mix(0.8, 1.05, smoothstep(-0.05, 0.5, dir.y));
    c = mix(c, grey, skyOvercast);
    if (detail > 0.5) {
      vec4 cl = skyClouds(dir);
      c = mix(c, cl.rgb, cl.a);
    }
    // Haze: the horizon melts into the fog, and below it is all fog.
    float h = 1.0 - smoothstep(-0.03, 0.3, dir.y);
    c = mix(c, skyHazeColor, clamp(max(skyHaze * h * h, 1.0 - smoothstep(-0.06, 0.02, dir.y)), 0.0, 1.0));
    c += skyFlash * vec3(0.8, 0.85, 1.0);
    return c;
  }
`;

const SKYBOX_GLSL = /* glsl */ `
  #define LIT_SKYBOX_INTENSITY
  #include "envProcPS"
  #include "gammaPS"
  #include "tonemappingPS"
  #ifdef PREPASS_PASS
    varying float vLinearDepth;
    #include "floatAsUintPS"
  #endif
  varying vec3 vViewDir;
  ${SKY_GLSL}
  void main(void) {
    #ifdef PREPASS_PASS
      gl_FragColor = float2vec4(vLinearDepth);
    #else
      vec3 dir = normalize(vViewDir);
      dir.x *= -1.0;
      gl_FragColor = vec4(gammaCorrectOutput(toneMap(processEnvironment(skyColor(dir, 1.0)))), 1.0);
    #endif
  }
`;

const BAKE_VS = /* glsl */ `
  attribute vec2 vertex_position;
  varying vec2 vUv0;
  void main(void) {
    gl_Position = vec4(vertex_position, 0.5, 1.0);
    vUv0 = vertex_position.xy * 0.5 + 0.5;
  }
`;

const BAKE_FS = /* glsl */ `
  varying vec2 vUv0;
  uniform float skyBakeScale;
  ${SKY_GLSL}
  vec4 encodeRGBM(vec3 color) {
    vec3 c = pow(color, vec3(0.5)) * (1.0 / 8.0);
    float a = clamp(max(max(c.r, c.g), max(c.b, 1.0 / 255.0)), 0.0, 1.0);
    a = ceil(a * 255.0) / 255.0;
    return vec4(c / a, a);
  }
  void main(void) {
    vec2 sph = (vec2(vUv0.x, 1.0 - vUv0.y) * 2.0 - 1.0) * vec2(SKY_PI, SKY_PI * 0.5);
    vec3 dir = vec3(cos(sph.y) * sin(sph.x), sin(sph.y), cos(sph.y) * cos(sph.x));
    // Clouds are left out of the bake; overcast already greys the light.
    gl_FragColor = encodeRGBM(skyColor(dir, 0.0) * skyBakeScale);
  }
`;

const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const lum = (c) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;

// CPU copy of the daylight model, for picking fog, cloud and water colours that match the sky.
function dayRadiance(dir, s) {
  const up = Math.max(0, dir[1]);
  const zenith = Math.acos(up);
  const denom = Math.cos(zenith) + 0.15 * Math.pow(Math.max(93.885 - (zenith * 180) / Math.PI, 1e-3), -1.253);
  const sR = 8.4e3 / denom;
  const sM = 1.25e3 / denom;
  const c = dir[0] * s.sun[0] + dir[1] * s.sun[1] + dir[2] * s.sun[2];
  const rPhase = (3 / (16 * Math.PI)) * (1 + ((c * 0.5 + 0.5) ** 2));
  const g = s.mieG;
  const hg = (1 / (4 * Math.PI)) * ((1 - g * g) / Math.pow(Math.max(1 - 2 * g * c + g * g, 1e-4), 1.5));
  const out = [0, 0, 0];
  const fade = clamp(Math.pow(1 - s.sun[1], 5), 0, 1);
  for (let i = 0; i < 3; i += 1) {
    const fex = Math.exp(-(s.betaR[i] * sR + s.betaM[i] * sM));
    const bTheta = s.betaR[i] * rPhase + s.betaM[i] * hg;
    const bSum = s.betaR[i] + s.betaM[i];
    let lin = Math.pow(s.sunE * (bTheta / bSum) * (1 - fex), 1.5);
    lin *= lerp(1, Math.pow(s.sunE * (bTheta / bSum) * fex, 0.5), fade);
    out[i] = (lin + 0.1 * fex) * 0.04 * s.luminance + [0, 0.0003, 0.00075][i];
  }
  return out;
}

// How much sunlight gets through the air along dir: white overhead, orange and red near the horizon.
function transmittance(dir, s) {
  const up = Math.max(0.02, dir[1]);
  const zenith = Math.acos(up);
  const denom = Math.cos(zenith) + 0.15 * Math.pow(Math.max(93.885 - (zenith * 180) / Math.PI, 1e-3), -1.253);
  return [0, 1, 2].map((i) => Math.exp(-(s.betaR[i] * (8.4e3 / denom) + s.betaM[i] * (1.25e3 / denom))));
}

export class Sky {
  constructor(app) {
    this.app = app;
    this.device = app.graphicsDevice;
    const chunks = pc.ShaderChunks.get(this.device, pc.SHADERLANGUAGE_GLSL);
    chunks.set('skyboxPS', SKYBOX_GLSL);
    this.bakeShader = pc.ShaderUtils.createShader(this.device, {
      uniqueName: 'MemefishingSkyBake',
      attributes: { vertex_position: pc.SEMANTIC_POSITION },
      vertexGLSL: BAKE_VS,
      fragmentGLSL: BAKE_FS
    });
    this.rt = null;
    this.source = null;
    this.atlas = null;
    this.bakedKey = '';
    this.bakeCooldown = 0;
    this.time = 0;
    this.flash = 0;
    this.state = null;
    this.app.scene.skyType = pc.SKYTYPE_INFINITE;
    this.app.scene.skyboxMip = 0;
  }

  // sunDir/moonDir: world-space unit vectors. w: { overcast, haze, cover, cloudOpacity, dark, tint, bakeScale }.
  // Returns the colours the rest of the scene borrows: horizon (for fog), sunColor, ambient.
  set(sunDir, moonDir, w) {
    const sun = [-sunDir.x, sunDir.y, sunDir.z];
    const sunY = sun[1];
    const turbidity = 2.2 + w.overcast * 6;
    const rayleigh = 1.6 - w.overcast * 0.6;
    const sunfade = 1 - clamp(1 - Math.exp(sunY), 0, 1);
    const rCoeff = rayleigh - (1 - sunfade);
    const mieC = 0.434 * (0.2 * turbidity * 1e-18) * 0.005;
    const s = {
      sun,
      moon: [-moonDir.x, moonDir.y, moonDir.z],
      betaR: TOTAL_RAYLEIGH.map((v) => v * rCoeff),
      betaM: MIE_CONST.map((v) => v * mieC),
      sunE: EE * Math.max(0, 1 - Math.exp(-((CUTOFF - Math.acos(clamp(sunY, -1, 1))) / STEEPNESS))),
      mieG: 0.8,
      luminance: SKY_EXPOSURE,
      night: clamp((0.05 - sunY) / 0.2, 0, 1),
      bakeScale: 1,
      ...w
    };
    // Colours the rest of the scene borrows from the sky.
    const nightCol = NIGHT_COLOR;
    const horizonDay = mix3(dayRadiance([1, 0.04, 0], s), dayRadiance([-1, 0.04, 0], s), 0.5);
    const towardSun = dayRadiance([sun[0] * 0.98, 0.05, sun[2] * 0.98], s);
    const zenithDay = dayRadiance([0, 1, 0], s);
    const horizon = mix3(mix3(horizonDay, towardSun, 0.3), [nightCol[0] * 2, nightCol[1] * 2, nightCol[2] * 2], s.night);
    const zenith = mix3(zenithDay, nightCol, s.night);
    const dayLight = clamp(sunY * 4 + 0.3, 0, 1);
    // Overcast: a flat grey whose brightness follows the daylight behind it.
    const greyLevel = lerp(0.012, 0.7, dayLight) * (1 - w.dark * 0.7);
    s.overcastColor = [greyLevel * 0.97, greyLevel, greyLevel * 1.04];
    s.horizon = mix3(horizon, s.overcastColor, w.overcast);
    s.zenith = mix3(zenith, s.overcastColor, w.overcast);
    // Cloud lighting: sunlit tops and shaded undersides.
    const sunCol = mix3([1.0, 0.55, 0.3], [1, 0.97, 0.92], clamp(sunY / 0.35, 0, 1));
    const sunPower = clamp(sunY * 6, 0, 1) * (1 - w.overcast * 0.6) * (1 - w.dark * 0.8);
    s.cloudLit = mix3(sunCol.map((v) => v * 1.5 * sunPower + lum(s.zenith) * 0.6), [0.05, 0.06, 0.08], s.night * 0.9);
    s.cloudShade = mix3(s.zenith.map((v, i) => v * 0.55 + s.horizon[i] * 0.35), [0.015, 0.02, 0.03], s.night * 0.9).map((v) => v * (1 - w.dark * 0.5));
    // The haze and fog take the horizon colour, tinted per water (green swamp air, dusty canyon).
    const tint = w.tint || [1, 1, 1];
    s.hazeColor = s.horizon.map((v, i) => v * tint[i] * 0.72);
    const tr = transmittance(sun, s);
    const peak = Math.max(...tr, 1e-4);
    s.sunColor = tr.map((v) => v / peak);
    // Roughly what the baked sky adds as ambient light: the average of zenith and horizon.
    s.ambient = s.zenith.map((v, i) => (v * 0.6 + s.horizon[i] * 0.4) * s.bakeScale);
    this.state = s;
    this.push();
    return s;
  }

  push() {
    const s = this.state;
    const scope = this.device.scope;
    scope.resolve('skySunDir').setValue(s.sun);
    scope.resolve('skyBetaR').setValue(s.betaR);
    scope.resolve('skyBetaM').setValue(s.betaM);
    scope.resolve('skySunE').setValue(s.sunE);
    scope.resolve('skyMieG').setValue(s.mieG);
    scope.resolve('skyLuminance').setValue(s.luminance);
    scope.resolve('skyNight').setValue(s.night);
    scope.resolve('skyMoonDir').setValue(s.moon);
    scope.resolve('skyNightColor').setValue(NIGHT_COLOR);
    scope.resolve('skyOvercast').setValue(s.overcast);
    scope.resolve('skyOvercastColor').setValue(s.overcastColor);
    scope.resolve('skyHazeColor').setValue(s.hazeColor);
    scope.resolve('skyHaze').setValue(s.haze);
    scope.resolve('skyCover').setValue(s.cover);
    scope.resolve('skyCloudOpacity').setValue(s.cloudOpacity);
    scope.resolve('skyCloudLit').setValue(s.cloudLit);
    scope.resolve('skyCloudShade').setValue(s.cloudShade);
    scope.resolve('skyTime').setValue(this.time);
    scope.resolve('skyFlash').setValue(this.flash);
    scope.resolve('skyBakeScale').setValue(s.bakeScale);
  }

  update(dt) {
    this.time += dt;
    this.bakeCooldown -= dt;
    if (!this.state) return;
    this.push();
    const s = this.state;
    // Re-bake the lighting when the sun has moved about a degree or the weather has shifted.
    const key = [Math.round(Math.atan2(s.sun[1], Math.hypot(s.sun[0], s.sun[2])) * 60), Math.round(s.overcast * 40), Math.round(s.haze * 40), Math.round(s.dark * 40), Math.round(s.night * 40), Math.round(s.bakeScale * 40), s.tint ? s.tint.join(',') : ''].join('|');
    if (key !== this.bakedKey && (this.bakeCooldown <= 0 || !this.atlas)) {
      this.bake();
      this.bakedKey = key;
      this.bakeCooldown = 0.35;
    }
  }

  bake() {
    const device = this.device;
    if (!this.rt) {
      const tex = new pc.Texture(device, {
        name: 'sky-equirect',
        width: 256,
        height: 128,
        format: pc.PIXELFORMAT_RGBA8,
        type: pc.TEXTURETYPE_RGBM,
        projection: pc.TEXTUREPROJECTION_EQUIRECT,
        addressU: pc.ADDRESS_CLAMP_TO_EDGE,
        addressV: pc.ADDRESS_CLAMP_TO_EDGE,
        minFilter: pc.FILTER_LINEAR,
        magFilter: pc.FILTER_LINEAR,
        mipmaps: false
      });
      this.rt = new pc.RenderTarget({ name: 'sky-equirect-rt', colorBuffer: tex, depth: false });
    }
    pc.drawQuadWithShader(device, this.rt, this.bakeShader);
    this.source = pc.EnvLighting.generateLightingSource(this.rt.colorBuffer, { target: this.source, size: 64 });
    const first = !this.atlas;
    this.atlas = pc.EnvLighting.generateAtlas(this.source, { target: this.atlas, size: 256, numReflectionSamples: 128, numAmbientSamples: 256 });
    if (first) this.app.scene.envAtlas = this.atlas;
  }
}
