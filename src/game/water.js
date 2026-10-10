// The water surface: waves moved on the GPU, colour that deepens with depth, see-through shallows,
// shoreline foam and white water, rain rings, sun glints, and reflections of the sky (or, on High
// quality, a mirrored render of the whole scene).
// waveHeight() is the same wave sum on the CPU, so floats and lily pads ride the waves you see.
// Only the longer waves move the mesh (shorter ones would alias on its grid); the short waves and the
// river chop only bend the lighting.
import * as pc from 'playcanvas';
import { PlanarRenderer } from 'playcanvas/scripts/esm/planar-renderer.mjs';
import { SKY_GLSL } from './sky.js';
import { clamp } from '../sim/random.js';

// dirX, dirZ, wavelength (m), amplitude (m), speed factor. Kept small: lakes, not oceans.
const WAVES = [
  [0.96, 0.28, 7.5, 0.04, 1.0],
  [0.62, -0.78, 4.6, 0.026, 1.1],
  [0.2, 0.98, 2.9, 0.016, 1.25],
  [-0.71, 0.7, 1.9, 0.009, 1.4]
];
const RIVER_CHOP = [0.97, 0.24, 1.6, 0.03, 2.2];
const G = 9.81;

const wave = (w) => {
  const k = (Math.PI * 2) / w[2];
  return { dx: w[0], dz: w[1], k, a: w[3], omega: Math.sqrt(G * k) * w[4] };
};
const W = WAVES.map(wave);
const CHOP = wave(RIVER_CHOP);
const MESH_WAVES = 3;

// Height of the surface at (x, z): strength scales all waves, drift slides the pattern downstream.
export function waveHeight(x, z, t, strength, drift) {
  const xs = x - t * drift;
  let y = 0;
  for (let i = 0; i < MESH_WAVES; i += 1) {
    const w = W[i];
    y += w.a * Math.sin(w.k * (w.dx * xs + w.dz * z) + w.omega * t + i * 1.7);
  }
  return y * strength;
}

const glslVec4 = (w, i) => `vec4(${w.dx.toFixed(4)}, ${w.dz.toFixed(4)}, ${w.k.toFixed(5)}, ${w.a.toFixed(4)})`;
const WAVES_GLSL = /* glsl */ `
  uniform vec4 uWave; // x: strength, y: time, z: drift, w: rain
  const vec4 WAVE0 = ${glslVec4(W[0])};
  const vec4 WAVE1 = ${glslVec4(W[1])};
  const vec4 WAVE2 = ${glslVec4(W[2])};
  const vec4 WAVE3 = ${glslVec4(W[3])};
  const vec4 WAVE_OMEGA = vec4(${W.map((w) => w.omega.toFixed(5)).join(', ')});
  const vec4 CHOP = ${glslVec4(CHOP)};
  const float CHOP_OMEGA = ${CHOP.omega.toFixed(5)};

  // Returns (height, dh/dx, dh/dz) before the per-vertex amplitude. fine adds the short waves and chop.
  vec3 waveSample(vec2 p, bool fine) {
    float t = uWave.y;
    float xs = p.x - t * uWave.z;
    vec3 r = vec3(0.0);
    vec4 ws[4];
    ws[0] = WAVE0; ws[1] = WAVE1; ws[2] = WAVE2; ws[3] = WAVE3;
    for (int i = 0; i < 4; i++) {
      if (!fine && i >= ${MESH_WAVES}) break;
      vec4 w = ws[i];
      float ph = w.z * (w.x * xs + w.y * p.y) + WAVE_OMEGA[i] * t + float(i) * 1.7;
      r += vec3(w.w * sin(ph), w.w * w.z * cos(ph) * w.x, w.w * w.z * cos(ph) * w.y);
    }
    if (fine && uWave.z > 0.0) {
      float ph = CHOP.z * (CHOP.x * xs + CHOP.y * p.y) + CHOP_OMEGA * t;
      r += vec3(CHOP.w * sin(ph), CHOP.w * CHOP.z * cos(ph) * CHOP.x, CHOP.w * CHOP.z * cos(ph) * CHOP.y);
    }
    return r * uWave.x;
  }
`;

const VS = /* glsl */ `
  attribute vec3 vertex_position;
  attribute vec4 vertex_color;
  attribute vec2 vertex_texCoord0;
  uniform mat4 matrix_model;
  uniform mat4 matrix_viewProjection;
  ${WAVES_GLSL}
  varying vec3 vWorldPos;
  varying vec4 vInfo;  // x: depth (m), y: wave amplitude, z: current speed, w: distance from the shore (m)
  varying vec2 vFlow;
  void main(void) {
    vec4 wp = matrix_model * vec4(vertex_position, 1.0);
    float amp = vertex_color.y;
    wp.y += waveSample(wp.xz, false).x * amp;
    vWorldPos = wp.xyz;
    vInfo = vec4(vertex_color.x * 12.0, amp, vertex_color.z * 2.0, vertex_color.w * 8.0);
    vFlow = vertex_texCoord0 * 2.0 - 1.0;
    gl_Position = matrix_viewProjection * wp;
  }
`;

const FS = /* glsl */ `
  #include "gammaPS"
  #include "tonemappingPS"
  #include "fogPS"
  ${WAVES_GLSL}
  ${SKY_GLSL}
  uniform vec3 view_position;
  uniform vec4 uScreenSize;
  uniform sampler2D uNormalMap;
  uniform sampler2D uReflectionMap;
  uniform float uPlanar;
  uniform float uPlanarScale;
  uniform float uSkyDetail;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform float uClarity;
  uniform float uReflect;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uAmbient;
  uniform float uGloss;
  uniform float uFoam;
  uniform float uFix;
  varying vec3 vWorldPos;
  varying vec4 vInfo;
  varying vec2 vFlow;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Expanding rings where raindrops land, as a normal offset.
  vec2 rainRings(vec2 p, float t) {
    vec2 sum = vec2(0.0);
    for (int layer = 0; layer < 2; layer++) {
      vec2 q = p * (layer == 0 ? 1.7 : 2.9) + float(layer) * 13.1;
      vec2 cell = floor(q);
      vec2 f = fract(q);
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 c = cell + vec2(float(i), float(j));
          float h = hash12(c);
          vec2 center = vec2(hash12(c + 3.1), hash12(c + 7.7));
          float life = fract(t * (0.9 + h * 0.6) + h * 9.0);
          vec2 d = f - (vec2(float(i), float(j)) + center);
          float r = length(d);
          float ring = sin((r - life * 0.6) * 60.0) * smoothstep(0.08, 0.0, abs(r - life * 0.6)) * (1.0 - life);
          sum += d / max(r, 1e-3) * ring;
        }
      }
    }
    return sum * 0.35;
  }

  void main(void) {
    float depth = vInfo.x;
    float amp = vInfo.y;
    float speed = vInfo.z;
    float t = uWave.y;
    vec2 p = vWorldPos.xz;

    // Geometry waves plus two scrolling layers of fine ripples (faster, and with the current, on rivers).
    vec3 ws = waveSample(p, true) * amp;
    vec2 flow = vFlow * (0.15 + speed);
    vec2 uv1 = p * 0.16 + vec2(t * 0.021, t * 0.013) - flow * t * 0.16;
    vec2 uv2 = vec2(0.79 * p.x - 0.61 * p.y, 0.61 * p.x + 0.79 * p.y) * 0.27 + vec2(-t * 0.017, t * 0.024) - flow * t * 0.27;
    vec4 n1 = texture2D(uNormalMap, uv1);
    vec4 n2 = texture2D(uNormalMap, uv2);
    float ripple = 0.35 + 0.45 * uWave.x + speed * 0.6;
    vec2 detail = ((n1.xy * 2.0 - 1.0) + (n2.xy * 2.0 - 1.0)) * 0.5 * ripple;
    // Ripples finer than a pixel only shimmer as the camera turns, so they fade out as they shrink below one.
    float texels = max(length(fwidth(uv1)), length(fwidth(uv2))) * 256.0;
    detail *= 1.0 - uFix * smoothstep(1.5, 3.0, texels);
    if (uWave.w > 0.0) detail += rainRings(p, t) * uWave.w;
    vec3 N = normalize(vec3(-ws.y - detail.x * 0.35, 1.0, -ws.z - detail.y * 0.35));

    vec3 toEye = view_position - vWorldPos;
    float dist = length(toEye);
    vec3 V = toEye / dist;
    float NdotV = max(dot(N, V), 0.0);
    // Distant water flattens out so it doesn't sparkle and shimmer.
    float far = smoothstep(40.0, 260.0, dist);
    N = normalize(mix(N, vec3(0.0, 1.0, 0.0), far * 0.7));
    NdotV = max(dot(N, V), 0.0);

    // Reflection: the mirrored scene where we have it, otherwise the sky itself.
    vec3 R = reflect(-V, N);
    R.y = abs(R.y);
    vec3 refl = skyColor(R, uSkyDetail);
    if (uPlanar > 0.5) {
      vec2 suv = gl_FragCoord.xy * uScreenSize.zw;
      vec2 ruv = vec2(suv.x, 1.0 - suv.y) + N.xz * 0.035;
      vec4 planar = texture2D(uReflectionMap, ruv);
      // Where the mirror saw nothing (alpha 0) the sky shows through, still in full HDR.
      refl = mix(refl, planar.rgb * uPlanarScale, planar.a);
    }

    // The body of the water: absorbs light with depth; the view ray travels further at grazing angles.
    float path = depth / max(V.y, 0.12);
    float absorb = 1.0 - exp(-path / uClarity);
    vec3 L = normalize(uSunDir);
    float sunWrap = max(dot(N, L) * 0.6 + 0.4, 0.0);
    vec3 light = uAmbient + uSunColor * sunWrap * 0.35;
    vec3 body = mix(uShallow, uDeep, clamp(depth / 4.0, 0.0, 1.0)) * light;

    float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
    vec3 color = mix(body, refl, clamp(fresnel * uReflect, 0.0, 1.0));

    // Sun glints. A tight glint on rippled water sparkles as the camera turns, so where the normal changes
    // faster than a pixel the highlight is widened to match (specular anti-aliasing).
    vec3 dNx = dFdx(N);
    vec3 dNy = dFdy(N);
    float kernel = min(dot(dNx, dNx) + dot(dNy, dNy), 0.25) * uFix;
    float gloss = 2.0 / (2.0 / (uGloss + 2.0) + kernel) - 2.0;
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), gloss) * (gloss + 8.0) / 25.0;
    color += uSunColor * spec * 0.6 * step(0.0, L.y);

    // Foam lapping along the shore, and white water where the river runs fast and shallow.
    float noise = n1.w * 0.6 + n2.w * 0.4;
    float shoreDist = vInfo.w;
    float lap = 0.6 + 0.4 * sin(t * 1.3 - shoreDist * 4.0 + noise * 3.0);
    float shore = (1.0 - smoothstep(0.0, 0.5 + 0.9 * lap * min(uWave.x, 1.5), shoreDist)) * smoothstep(0.0, 0.04, depth);
    float white = smoothstep(0.55, 1.2, speed) * (1.0 - smoothstep(0.6, 2.4, depth));
    float foam = clamp(smoothstep(0.45, 0.75, (shore * 0.9 + white) * (0.55 + noise * 0.9)) * uFoam, 0.0, 1.0);
    vec3 foamCol = uAmbient * 1.4 + uSunColor * max(L.y, 0.0) * 0.55;
    color = mix(color, foamCol, foam * 0.85);

    float alpha = mix(absorb, 1.0, clamp(fresnel * uReflect + foam, 0.0, 1.0));
    // Soft edge where the water meets the bank.
    alpha *= smoothstep(0.0, 0.06, depth);
    color = addFog(color);
    alpha = mix(1.0, alpha, getFogFactor());
    gl_FragColor = vec4(gammaCorrectOutput(toneMap(color)), alpha);
  }
`;

// A tiling ripple texture: normals in RGB, a height for foam breakup in A.
function rippleTexture(device) {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const waves = [];
  for (let i = 0; i < 48; i += 1) {
    let kx = 0;
    let ky = 0;
    while (kx === 0 && ky === 0) {
      kx = Math.round((rnd() * 2 - 1) * 14);
      ky = Math.round((rnd() * 2 - 1) * 14);
    }
    const k = Math.hypot(kx, ky);
    waves.push({ kx, ky, a: 1 / Math.pow(k, 1.35), ph: rnd() * Math.PI * 2 });
  }
  const norm = waves.reduce((s, w) => s + w.a, 0);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let h = 0;
      let dx = 0;
      let dy = 0;
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      for (const w of waves) {
        const ph = w.kx * u + w.ky * v + w.ph;
        h += w.a * Math.sin(ph);
        dx += w.a * w.kx * Math.cos(ph);
        dy += w.a * w.ky * Math.cos(ph);
      }
      const s = 0.09 / norm;
      const nx = -dx * s;
      const ny = -dy * s;
      const len = Math.hypot(nx, ny, 1);
      const o = (y * size + x) * 4;
      data[o] = clamp((nx / len) * 127.5 + 127.5, 0, 255);
      data[o + 1] = clamp((ny / len) * 127.5 + 127.5, 0, 255);
      data[o + 2] = clamp((1 / len) * 255, 0, 255);
      data[o + 3] = clamp((h / norm) * 255 * 1.6 + 127.5, 0, 255);
    }
  }
  return new pc.Texture(device, {
    name: 'water-ripples',
    width: size,
    height: size,
    format: pc.PIXELFORMAT_RGBA8,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: pc.ADDRESS_REPEAT,
    addressV: pc.ADDRESS_REPEAT,
    anisotropy: 4,
    levels: [data]
  });
}

export class WaterSurface {
  constructor(app, camera) {
    this.app = app;
    this.camera = camera;
    this.device = app.graphicsDevice;
    this.layer = new pc.Layer({ name: 'Water' });
    const layers = app.scene.layers;
    // Draw the water before other see-through things (splashes, rings) so they sit on top of it.
    const worldTransparent = layers.getTransparentIndex(layers.getLayerById(pc.LAYERID_WORLD));
    layers.insertTransparent(this.layer, worldTransparent);
    camera.camera.layers = [...camera.camera.layers, this.layer.id];

    this.material = new pc.ShaderMaterial({
      uniqueName: 'MemefishingWater',
      attributes: { vertex_position: pc.SEMANTIC_POSITION, vertex_color: pc.SEMANTIC_COLOR, vertex_texCoord0: pc.SEMANTIC_TEXCOORD0 },
      vertexGLSL: VS,
      fragmentGLSL: FS
    });
    this.material.blendType = pc.BLEND_NORMAL;
    this.material.depthWrite = true;
    this.material.cull = pc.CULLFACE_NONE;
    this.ripples = rippleTexture(this.device);
    this.material.setParameter('uNormalMap', this.ripples);
    this.blank = new pc.Texture(this.device, { width: 1, height: 1, format: pc.PIXELFORMAT_RGBA8, levels: [new Uint8Array([0, 0, 0, 0])] });
    this.material.setParameter('uReflectionMap', this.blank);
    this.material.setParameter('uPlanar', 0);
    this.material.setParameter('uPlanarScale', 1);
    this.material.setParameter('uSkyDetail', 1);
    this.material.setParameter('uFix', 1);
    this.material.update();
    this.entity = null;
    this.planar = null;
    this.params = { strength: 1, drift: 0, rain: 0 };
  }

  // Mirror reflections: a second camera renders the scene upside down into a texture.
  setPlanar(on) {
    if (on && !this.planar) {
      const e = new pc.Entity('reflection-camera');
      // The sky is left out: the water shader fills it in from the sky model, brighter than the mirror could store.
      e.addComponent('camera', {
        layers: [pc.LAYERID_WORLD],
        priority: -1,
        clearColor: new pc.Color(0, 0, 0, 0),
        toneMapping: pc.TONEMAP_LINEAR,
        gammaCorrection: pc.GAMMA_SRGB
      });
      e.addComponent('script');
      this.app.root.addChild(e);
      this.planar = e.script.create(PlanarRenderer, {
        properties: { sceneCameraEntity: this.camera, mode: 'reflection', scale: 0.5, planePoint: new pc.Vec3(0, 0, 0), planeNormal: new pc.Vec3(0, 1, 0), clipBias: 0.08 }
      });
      this.planarEntity = e;
    } else if (!on && this.planar) {
      this.planarEntity.destroy();
      this.planar = null;
      this.planarEntity = null;
      this.material.setParameter('uReflectionMap', this.blank);
    }
    this.material.setParameter('uPlanar', on ? 1 : 0);
  }

  setSkyDetail(on) {
    this.material.setParameter('uSkyDetail', on ? 1 : 0);
  }

  // Builds the surface for a water: depth, wave amplitude and current baked into the vertices.
  build(shape, bounds, step, palette) {
    this.destroyMesh();
    const { x0, x1, z0, z1 } = bounds;
    const nx = Math.ceil((x1 - x0) / step);
    const nz = Math.ceil((z1 - z0) / step);
    const positions = [];
    const colors = [];
    const uvs = [];
    const indices = [];
    for (let i = 0; i <= nz; i += 1) {
      for (let j = 0; j <= nx; j += 1) {
        const x = x0 + j * step;
        const z = z0 + i * step;
        const d = shape.depthAt(x, z);
        const f = shape.flow(x, z);
        positions.push(x, d > 0 ? 0 : -0.08, z);
        // Smaller waves in the shallows, none over land.
        const amp = d > 0 ? clamp(0.3 + d / 2, 0.3, 1) : 0;
        const shoreDist = clamp(-shape.edge(x, z), 0, 8);
        colors.push(clamp((d / 12) * 255, 0, 255), amp * 255, clamp((f.speed / 2) * 255, 0, 255), (shoreDist / 8) * 255);
        uvs.push(f.x * 0.5 + 0.5, f.z * 0.5 + 0.5);
      }
    }
    for (let i = 0; i < nz; i += 1) {
      for (let j = 0; j < nx; j += 1) {
        const a = i * (nx + 1) + j;
        const b = a + nx + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const mesh = new pc.Mesh(this.device);
    mesh.setPositions(positions);
    mesh.setColors32(colors);
    mesh.setUvs(0, uvs);
    mesh.setIndices(indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    // Waves lift the surface a little above its flat mesh.
    mesh.aabb.halfExtents.y += 0.5;
    const e = new pc.Entity('water');
    const mi = new pc.MeshInstance(mesh, this.material);
    e.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false, layers: [this.layer.id] });
    this.app.root.addChild(e);
    this.entity = e;
    this.mesh = mesh;

    const [shallow, deep] = palette.water;
    const lin = (c) => c.map((v) => Math.pow(v, 2.2));
    this.material.setParameter('uShallow', lin(shallow));
    this.material.setParameter('uDeep', lin(deep));
    // Murky water goes opaque within half a metre; clear water shows the bottom a few metres down.
    this.material.setParameter('uClarity', palette.clarity ?? 1.2);
    this.material.setParameter('uReflect', palette.reflect ?? 1);
    this.material.setParameter('uFoam', palette.foam ?? 1);
  }

  destroyMesh() {
    if (this.entity) this.entity.destroy();
    this.entity = null;
  }

  setLight({ sunDir, sunColor, ambient, gloss }) {
    this.material.setParameter('uSunDir', [sunDir.x, sunDir.y, sunDir.z]);
    this.material.setParameter('uSunColor', sunColor);
    this.material.setParameter('uAmbient', ambient);
    this.material.setParameter('uGloss', gloss);
  }

  update(time, { strength, drift, rain }) {
    this.params = { strength, drift, rain };
    this.material.setParameter('uWave', [strength, time, drift, rain]);
    // The mirror camera already applied the exposure; the main camera applies it again.
    this.material.setParameter('uPlanarScale', 1 / (this.app.scene.exposure || 1));
    if (this.planar) {
      const tex = this.planar.frameUpdate();
      if (tex) this.material.setParameter('uReflectionMap', tex);
    }
  }
}
