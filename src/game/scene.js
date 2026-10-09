// The 3D world for whichever water you're on: terrain, water, trees, shore life, props, sky and weather.
// build(water) throws away the last water's meshes and builds the new one from src/sim/waters.js.
import * as pc from 'playcanvas';
import { GeoBuilder, meshEntity, solidMaterial, vertexColorMaterial } from './geometry.js';
import { WEATHER, daylight, sunAngle } from '../sim/world.js';
import { clamp, createRng, lerp, range } from '../sim/random.js';

const TAU = Math.PI * 2;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const scale3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const SNOW = [0.9, 0.93, 0.97];

const SKY = {
  dayZenith: [0.22, 0.45, 0.86],
  dayHorizon: [0.72, 0.84, 0.95],
  duskZenith: [0.24, 0.27, 0.5],
  duskHorizon: [0.96, 0.7, 0.52],
  nightZenith: [0.015, 0.025, 0.07],
  nightHorizon: [0.05, 0.07, 0.13]
};

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function gridIndices(g, nx, nz) {
  for (let i = 0; i < nz; i += 1) {
    for (let j = 0; j < nx; j += 1) {
      const a = i * (nx + 1) + j;
      const b = a + nx + 1;
      g.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

export class WorldScene {
  constructor(app) {
    this.app = app;
    this.device = app.graphicsDevice;
    this.time = 0;
    this.waveStrength = 1;
    this.drift = 0;
    this.parts = [];
    this.lanterns = [];
    this.flash = 0;
    this.nextFlash = 4;
    this.bolt = null;
    this.onThunder = null;
    this.fxRng = createRng(99);
    this.terrainMaterial = vertexColorMaterial({ gloss: 0.15 });
    this.floraMaterial = vertexColorMaterial({ gloss: 0.1 });
    this.propMaterial = vertexColorMaterial({ gloss: 0.25, specular: 0.08 });
    this.farMaterial = vertexColorMaterial({ gloss: 0 });
    this.lanternMaterial = solidMaterial('#ffcf7a', { emissive: 1 });
    this.buildLights();
    this.buildSky();
    this.buildCloudMaterial();
    this.buildWaterMaterial();
    this.rain = Array.from({ length: 520 }, () => new pc.Vec3(0, -99, 0));
    this.snow = Array.from({ length: 500 }, () => new pc.Vec3(0, -99, 0));
    this.rainColor = new pc.Color(0.75, 0.8, 0.88, 0.5);
    this.snowColor = new pc.Color(0.96, 0.97, 1, 0.9);
    this.boltColor = new pc.Color(0.92, 0.94, 1, 1);
  }

  // ---------- persistent pieces ----------
  buildLights() {
    const sun = new pc.Entity('sun-light');
    sun.addComponent('light', {
      type: 'directional',
      intensity: 1.3,
      castShadows: true,
      shadowDistance: 70,
      shadowResolution: 2048,
      shadowBias: 0.3,
      normalOffsetBias: 0.05
    });
    this.app.root.addChild(sun);
    this.sunLight = sun;
    this.app.scene.fog.type = pc.FOG_EXP2;
    this.app.scene.fog.density = 0.004;
  }

  buildSky() {
    const g = new GeoBuilder();
    const segs = 32;
    const rings = 16;
    this.skyHeights = [];
    for (let r = 0; r <= rings; r += 1) {
      const v = (r / rings) * Math.PI * 0.6;
      for (let s = 0; s <= segs; s += 1) {
        const u = (s / segs) * TAU;
        const x = Math.sin(v) * Math.cos(u);
        const y = Math.cos(v);
        const z = Math.sin(v) * Math.sin(u);
        g.vertex([x * 900, y * 900, z * 900], [-x, -y, -z], [1, 1, 1]);
        this.skyHeights.push(y);
      }
    }
    gridIndices(g, segs, rings);
    this.skyMesh = g.build(this.device);
    this.skyColors = new Uint8Array(g.colors);
    this.skyMaterial = vertexColorMaterial({ unlit: true, fog: false });
    this.sky = meshEntity(this.app, 'sky', this.skyMesh, this.skyMaterial, { receiveShadows: false });

    const disc = (name, color, size) => {
      const e = new pc.Entity(name);
      const m = new pc.StandardMaterial();
      m.useLighting = false;
      m.diffuse = new pc.Color(0, 0, 0);
      m.emissive = new pc.Color().fromString(color);
      m.useFog = false;
      m.update();
      e.addComponent('render', { type: 'sphere', material: m, castShadows: false, receiveShadows: false });
      e.setLocalScale(size, size, size);
      this.app.root.addChild(e);
      return e;
    };
    this.sunDisc = disc('sun-disc', '#fff4d6', 40);
    this.moonDisc = disc('moon-disc', '#dfe6f2', 24);
  }

  buildCloudMaterial() {
    const m = new pc.StandardMaterial();
    m.useLighting = false;
    m.diffuse = new pc.Color(0, 0, 0);
    m.emissiveVertexColor = true;
    m.emissive = new pc.Color(1, 1, 1);
    m.opacity = 0.85;
    m.blendType = pc.BLEND_NORMAL;
    m.depthWrite = false;
    m.useFog = false;
    m.update();
    this.cloudMaterial = m;
  }

  buildWaterMaterial() {
    const m = new pc.StandardMaterial();
    m.diffuse = new pc.Color(1, 1, 1);
    m.diffuseVertexColor = true;
    m.specular = new pc.Color(0.9, 0.9, 0.9);
    m.gloss = 0.93;
    m.opacity = 0.84;
    m.blendType = pc.BLEND_NORMAL;
    m.emissive = new pc.Color(0.1, 0.12, 0.15);
    m.update();
    this.waterMaterial = m;
  }

  // ---------- per water ----------
  build(water) {
    this.clear();
    this.water = water;
    this.shape = water.shape;
    this.pal = water.palette;
    this.flora = water.flora;
    this.poses = Object.values(water.poses);
    this.rng = createRng(hash(water.id));
    const river = this.shape.kind === 'river';
    this.halfX = river ? 380 : water.size / 2;
    this.halfZ = water.size / 2;
    // Water patterns drift downstream on the river.
    this.drift = river ? 1.1 : 0;
    this.lanes = this.poses.map((p) => {
      const f = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
      return { ...p, f, backX: p.shoreX - f.x * 8, backZ: p.shoreZ - f.z * 8 };
    });
    this.buildTerrain();
    this.buildWater();
    this.buildTrees();
    this.buildShore();
    this.buildProps();
    this.buildDistance();
    this.buildClouds();
  }

  clear() {
    for (const e of this.parts) e.destroy();
    this.parts = [];
    this.lanterns = [];
  }

  add(name, g, material, opts = {}) {
    const e = meshEntity(this.app, name, g.build(this.device), material, opts);
    this.parts.push(e);
    return e;
  }

  groundAt(x, z) {
    return this.shape.groundHeight(x, z);
  }

  depthAt(x, z) {
    return this.shape.depthAt(x, z);
  }

  // Keeps a clear space around each standing spot and the path to it.
  nearSpot(x, z, radius) {
    return this.lanes.some((p) => {
      const ax = p.backX;
      const az = p.backZ;
      const bx = p.x - p.f.x * 0;
      const bz = p.z - p.f.z * 0;
      const dx = bx - ax;
      const dz = bz - az;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      return Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < radius;
    });
  }

  // Keeps a clear casting lane in front of each spot.
  inLane(x, z) {
    return this.lanes.some((p) => {
      const dx = x - p.x;
      const dz = z - p.z;
      const ahead = dx * p.f.x + dz * p.f.z;
      const side = Math.abs(dx * p.f.z - dz * p.f.x);
      return ahead > -2 && ahead < 30 && side < 2.5 + ahead * 0.6;
    });
  }

  // A random point on the shoreline, pushed `offset` metres inland (negative = into the water).
  shorePoint(rng, offset) {
    const s = this.shape;
    if (s.kind === 'river') {
      const x = range(rng, -this.halfX * 0.97, this.halfX * 0.97);
      const side = rng() < 0.5 ? -1 : 1;
      return { x, z: s.center(x) + side * (s.halfWidth(x) + offset), a: null };
    }
    const a = rng() * TAU;
    const r = s.shoreRadius(a) + offset;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, a };
  }

  // A random point anywhere on the water.
  waterPoint(rng) {
    const s = this.shape;
    if (s.kind === 'river') {
      const x = range(rng, -this.halfX * 0.97, this.halfX * 0.97);
      return { x, z: s.center(x) + range(rng, -1, 1) * s.halfWidth(x) };
    }
    const a = rng() * TAU;
    const r = s.shoreRadius(a) * Math.sqrt(rng());
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }

  slopeAt(x, z) {
    const e = 1;
    const g = this.shape.groundHeight;
    return Math.hypot(g(x + e, z) - g(x - e, z), g(x, z + e) - g(x, z - e)) / (2 * e);
  }

  terrainColor(x, y, z, ny, noise) {
    const p = this.pal;
    let c;
    if (y < -2.5) c = p.mud;
    else if (y < -0.3) c = mix(p.sand, p.mud, clamp((-y - 0.3) / 2.2, 0, 1));
    else if (y < 0.45) c = p.sand;
    else if (y < 1.2) c = mix(p.sand, p.grass, (y - 0.45) / 0.75);
    else c = mix(p.grass, p.grassHigh, clamp((y - 2) / 8, 0, 1));
    if (ny < 0.82 && y > 0.6) {
      let rock = p.rock;
      // Layered canyon walls.
      if (this.shape.kind === 'river') rock = mix(scale3(rock, 1 + 0.16 * Math.sin(y * 1.7) + 0.07 * Math.sin(y * 4.1 + x * 0.02)), [0.66, 0.42, 0.3], 0.5 + 0.5 * Math.sin(y * 0.6 + 1));
      c = mix(c, rock, clamp((0.82 - ny) * 5, 0, 1));
    }
    if (p.snow && y > 1.5) c = mix(c, SNOW, clamp((y - 1.5) / 5, 0, 1) * (ny > 0.75 ? 1 : 0.35));
    return scale3(c, 1 + noise);
  }

  buildTerrain() {
    const { halfX, halfZ } = this;
    const step = this.shape.kind === 'river' ? 2.5 : 2;
    const nx = Math.round((halfX * 2) / step);
    const nz = Math.round((halfZ * 2) / step);
    const g = new GeoBuilder();
    const h = this.shape.groundHeight;
    const rng = this.rng;
    for (let i = 0; i <= nz; i += 1) {
      for (let j = 0; j <= nx; j += 1) {
        const x = -halfX + j * step;
        const z = -halfZ + i * step;
        const y = h(x, z);
        const e = 0.6;
        const dx = h(x - e, z) - h(x + e, z);
        const dz = h(x, z - e) - h(x, z + e);
        const len = Math.hypot(dx, 2 * e, dz);
        const normal = [dx / len, (2 * e) / len, dz / len];
        const noise = 0.08 * (Math.sin(x * 0.37) * Math.cos(z * 0.29) + Math.sin(x * 1.3 + z * 0.7) * 0.5) + (rng() - 0.5) * 0.05;
        g.vertex([x, y, z], normal, this.terrainColor(x, y, z, normal[1], noise));
      }
    }
    gridIndices(g, nx, nz);
    this.add('terrain', g, this.terrainMaterial, { castShadows: false });
  }

  buildWater() {
    const s = this.shape;
    let x0;
    let x1;
    let z0;
    let z1;
    if (s.kind === 'river') {
      x0 = -this.halfX;
      x1 = this.halfX;
      z0 = Infinity;
      z1 = -Infinity;
      for (let x = x0; x <= x1; x += 4) {
        z0 = Math.min(z0, s.center(x) - s.halfWidth(x) - 4);
        z1 = Math.max(z1, s.center(x) + s.halfWidth(x) + 4);
      }
    } else {
      let r = 0;
      for (let a = 0; a < TAU; a += 0.02) r = Math.max(r, s.shoreRadius(a));
      x0 = z0 = -(r + 6);
      x1 = z1 = r + 6;
    }
    const step = s.kind === 'river' ? 2.5 : 2.2;
    const nx = Math.ceil((x1 - x0) / step);
    const nz = Math.ceil((z1 - z0) / step);
    const [shallowC, deepC] = this.pal.water;
    const g = new GeoBuilder();
    const amp = [];
    for (let i = 0; i <= nz; i += 1) {
      for (let j = 0; j <= nx; j += 1) {
        const x = x0 + j * step;
        const z = z0 + i * step;
        const d = s.depthAt(x, z);
        let c = mix(shallowC, deepC, clamp(d / 5, 0, 1));
        if (s.kind === 'river' && d > 0) {
          // White water where it runs fast and shallow.
          const speed = s.flow(x, z).speed;
          c = mix(c, [0.78, 0.84, 0.86], clamp((speed - 0.45) * 1.3, 0, 0.55) * clamp(1.6 - d * 0.5, 0, 1));
        }
        g.vertex([x, d > 0 ? 0 : -0.06, z], [0, 1, 0], c);
        // Smaller waves in the shallows, none over land.
        amp.push(d > 0 ? clamp(0.3 + d / 2, 0.3, 1) : 0);
      }
    }
    gridIndices(g, nx, nz);
    this.waterBase = new Float32Array(g.positions);
    this.waterPositions = new Float32Array(g.positions);
    this.waterNormals = new Float32Array(g.normals);
    this.waterAmp = new Float32Array(amp);
    this.waterMesh = g.build(this.device);
    this.waterMaterial.opacity = this.pal.opacity;
    this.waterMaterial.update();
    this.waterEntity = meshEntity(this.app, 'water', this.waterMesh, this.waterMaterial, { receiveShadows: true });
    this.parts.push(this.waterEntity);
  }

  waveHeight(x, z, t) {
    const s = this.waveStrength;
    const xs = x - t * this.drift;
    let y = 0.045 * Math.sin(xs * 0.35 + t * 1.4) + 0.035 * Math.sin(z * 0.42 - t * 1.1 + xs * 0.1) + 0.02 * Math.sin((xs + z) * 0.9 + t * 2.3);
    if (this.drift) y += 0.03 * Math.sin(xs * 1.6 + z * 0.4 + t * 3);
    return s * y;
  }

  updateWater(t) {
    const p = this.waterPositions;
    const nrm = this.waterNormals;
    const base = this.waterBase;
    const amp = this.waterAmp;
    const s = this.waveStrength;
    const river = this.drift !== 0;
    for (let i = 0, v = 0; i < p.length; i += 3, v += 1) {
      const k = amp[v];
      if (!k) continue;
      const x = base[i];
      const z = base[i + 2];
      const xs = x - t * this.drift;
      const a1 = Math.cos(xs * 0.35 + t * 1.4);
      const a2 = Math.cos(z * 0.42 - t * 1.1 + xs * 0.1);
      const a3 = Math.cos((xs + z) * 0.9 + t * 2.3);
      let y = 0.045 * Math.sin(xs * 0.35 + t * 1.4) + 0.035 * Math.sin(z * 0.42 - t * 1.1 + xs * 0.1) + 0.02 * Math.sin((xs + z) * 0.9 + t * 2.3);
      let dx = 0.045 * 0.35 * a1 + 0.035 * 0.1 * a2 + 0.02 * 0.9 * a3;
      let dz = 0.035 * 0.42 * a2 + 0.02 * 0.9 * a3;
      if (river) {
        const a4 = xs * 1.6 + z * 0.4 + t * 3;
        y += 0.03 * Math.sin(a4);
        dx += 0.03 * 1.6 * Math.cos(a4);
        dz += 0.03 * 0.4 * Math.cos(a4);
      }
      const m = s * k;
      p[i + 1] = y * m;
      dx *= m;
      dz *= m;
      const len = Math.hypot(dx, 1, dz);
      nrm[i] = -dx / len;
      nrm[i + 1] = 1 / len;
      nrm[i + 2] = -dz / len;
    }
    this.waterMesh.setPositions(p);
    this.waterMesh.setNormals(nrm);
    this.waterMesh.update(pc.PRIMITIVE_TRIANGLES, false);
  }

  // ---------- trees ----------
  buildTrees() {
    const g = new GeoBuilder();
    const rng = this.rng;
    const { trees, treeCount } = this.flora;
    const s = this.shape;
    let placed = 0;
    for (let tries = 0; tries < treeCount * 12 && placed < treeCount; tries += 1) {
      const x = range(rng, -this.halfX, this.halfX);
      const z = range(rng, -this.halfZ, this.halfZ);
      const over = s.edge(x, z);
      if (over < 4) continue;
      // Thickest near the water, thinning out into the hills.
      if (rng() > 0.2 + 0.8 * Math.exp(-(over - 4) / 45)) continue;
      if (this.nearSpot(x, z, 6)) continue;
      const slope = this.slopeAt(x, z);
      if (slope > (trees === 'canyon' ? 0.5 : 0.9)) continue;
      this.tree(g, trees, x, s.groundHeight(x, z) - 0.2, z, rng);
      placed += 1;
    }
    // Trees standing in the water (swamp).
    const wet = this.flora.inWaterTrees || 0;
    for (let tries = 0, n = 0; tries < wet * 20 && n < wet; tries += 1) {
      const p = this.waterPoint(rng);
      const d = s.depthAt(p.x, p.z);
      if (d < 0.2 || d > 1.8 || this.inLane(p.x, p.z) || this.nearSpot(p.x, p.z, 4)) continue;
      this.tree(g, 'cypress', p.x, -d - 0.2, p.z, rng, true);
      n += 1;
    }
    this.add('trees', g, this.floraMaterial, { castShadows: true });
  }

  tree(g, type, x, y, z, rng, wet = false) {
    const sc = range(rng, 0.7, 1.5);
    const tint = range(rng, 0.85, 1.15);
    if (type === 'mixed') {
      if (rng() < 0.62) this.conifer(g, x, y, z, sc, tint, rng, false);
      else this.broadleaf(g, x, y, z, sc, tint, rng);
    } else if (type === 'snowpine') {
      this.conifer(g, x, y, z, sc * 1.1, tint, rng, true);
    } else if (type === 'cypress') {
      this.cypress(g, x, y, z, sc, tint, rng, wet);
    } else if (type === 'canyon') {
      if (rng() < 0.55) this.pine(g, x, y, z, sc, tint, rng);
      else this.juniper(g, x, y, z, sc, tint, rng);
    }
  }

  conifer(g, x, y, z, s, tint, rng, snowy) {
    g.frustum(x, y, z, 0.28 * s, 0.14 * s, 2.2 * s, [0.3, 0.2, 0.12], 6);
    const green = snowy ? [0.07 * tint, 0.19 * tint, 0.13 * tint] : [0.1 * tint, 0.26 * tint, 0.13 * tint];
    const tiers = snowy ? 5 : 4;
    for (let k = 0; k < tiers; k += 1) {
      const r = (2.4 - k * (snowy ? 0.42 : 0.5)) * s;
      const ty = y + (1.6 + k * (snowy ? 1.3 : 1.5)) * s;
      g.frustum(x, ty, z, r, 0, 2.6 * s, green, 9, rng() * 6, 0.15);
      // Snow sitting on each tier.
      if (snowy) g.frustum(x, ty + 0.55 * s, z, r * 0.78, 0, 1.9 * s, SNOW, 9, rng() * 6, 0.05);
    }
  }

  broadleaf(g, x, y, z, s, tint) {
    g.frustum(x, y, z, 0.3 * s, 0.2 * s, 3 * s, [0.34, 0.25, 0.16], 6);
    const green = [0.2 * tint, 0.36 * tint, 0.14 * tint];
    g.blob(x, y + 4.2 * s, z, 2.4 * s, 2 * s, 2.4 * s, green, 8, 6, 0.25);
    g.blob(x + 1.1 * s, y + 3.4 * s, z + 0.6 * s, 1.6 * s, 1.4 * s, 1.6 * s, mix(green, [0.3, 0.4, 0.15], 0.3), 7, 5, 0.25);
  }

  // Bald cypress: flared trunk, flat canopy, Spanish moss.
  cypress(g, x, y, z, s, tint, rng, wet) {
    const bark = [0.36 * tint, 0.3 * tint, 0.24 * tint];
    g.frustum(x, y, z, 0.95 * s, 0.38 * s, 1.6 * s, bark, 8);
    const trunkH = range(rng, 7, 10) * s;
    g.frustum(x, y + 1.5 * s, z, 0.38 * s, 0.18 * s, trunkH, bark, 7);
    const top = y + 1.5 * s + trunkH;
    const green = [0.2 * tint, 0.28 * tint, 0.13 * tint];
    for (let k = 0; k < 4; k += 1) {
      const a = rng() * TAU;
      const r = range(rng, 0.5, 2) * s;
      g.blob(x + Math.cos(a) * r, top - range(rng, 0, 2) * s, z + Math.sin(a) * r, range(rng, 2, 3.2) * s, 0.8 * s, range(rng, 2, 3.2) * s, green, 8, 4, 0.3);
    }
    const moss = [0.5, 0.54, 0.44];
    for (let k = 0; k < 8; k += 1) {
      const a = rng() * TAU;
      const r = range(rng, 0.8, 2.6) * s;
      g.blade(x + Math.cos(a) * r, top - 0.8 * s - range(rng, 0, 1.5) * s, z + Math.sin(a) * r, 0.35, -range(rng, 1.2, 2.8) * s, [range(rng, -0.1, 0.1), range(rng, -0.1, 0.1)], moss);
    }
    // Knees poking out of the water around the trunk.
    if (wet) {
      const knees = 2 + Math.floor(rng() * 5);
      for (let k = 0; k < knees; k += 1) {
        const a = rng() * TAU;
        const r = range(rng, 1.4, 3.5);
        const kx = x + Math.cos(a) * r;
        const kz = z + Math.sin(a) * r;
        const d = this.shape.depthAt(kx, kz);
        g.frustum(kx, -d, kz, 0.16, 0.03, d + range(rng, 0.25, 0.7), bark, 5);
      }
    }
  }

  // Tall canyon pine with a high, open crown.
  pine(g, x, y, z, s, tint, rng) {
    const h = range(rng, 6, 9) * s;
    g.frustum(x, y, z, 0.3 * s, 0.14 * s, h, [0.48, 0.3, 0.18], 6);
    const green = [0.14 * tint, 0.27 * tint, 0.12 * tint];
    for (let k = 0; k < 3; k += 1) {
      const a = rng() * TAU;
      g.blob(x + Math.cos(a) * 0.8 * s, y + h - k * 1.2 * s, z + Math.sin(a) * 0.8 * s, 1.6 * s, 1.1 * s, 1.6 * s, green, 7, 5, 0.25);
    }
  }

  juniper(g, x, y, z, s, tint) {
    const green = [0.17 * tint, 0.25 * tint, 0.15 * tint];
    g.frustum(x, y, z, 0.18 * s, 0.1 * s, 0.9 * s, [0.4, 0.3, 0.22], 5);
    g.blob(x, y + 1.3 * s, z, 1.4 * s, 1.1 * s, 1.3 * s, green, 7, 5, 0.3);
    g.blob(x + 0.7 * s, y + 0.9 * s, z - 0.4 * s, 0.9 * s, 0.7 * s, 0.9 * s, green, 6, 4, 0.3);
  }

  // ---------- reeds, lilies, rocks, grass, stumps, ice ----------
  buildShore() {
    const g = new GeoBuilder();
    const rng = this.rng;
    const s = this.shape;
    const f = this.flora;
    const pal = this.pal;

    if (f.reeds && (f.reeds.base > 0 || f.reeds.bay > 0)) {
      const tries = s.kind === 'river' ? 6000 : 4200;
      for (let i = 0; i < tries; i += 1) {
        const p = this.shorePoint(rng, -range(rng, -1, 4));
        let bay = 0;
        if (f.reeds.bay && p.a !== null) {
          const da = Math.atan2(Math.sin(p.a - f.reeds.angle), Math.cos(p.a - f.reeds.angle));
          bay = f.reeds.bay * Math.exp(-(da * da) / 0.12);
        }
        if (rng() > f.reeds.base + bay) continue;
        const extra = -range(rng, 0, bay * 9);
        const x = p.x + (p.a !== null ? Math.cos(p.a) * extra : 0);
        const z = p.z + (p.a !== null ? Math.sin(p.a) * extra : 0);
        if (this.nearSpot(x, z, 5) || this.inLane(x, z)) continue;
        const d = s.depthAt(x, z);
        if (d > 1.4) continue;
        const y = d > 0 ? -d : s.groundHeight(x, z);
        const h = range(rng, 1.1, 2.4);
        const c = rng() < 0.3 ? [0.55, 0.5, 0.3] : [0.3, 0.42, 0.18];
        const lean = [range(rng, -0.25, 0.25), range(rng, -0.25, 0.25)];
        g.blade(x, y, z, 0.09, h + Math.max(0, d), lean, c);
        // Cattail heads.
        if (rng() < 0.12) g.frustum(x + lean[0] * 0.85, y + (h + Math.max(0, d)) * 0.82, z + lean[1] * 0.85, 0.045, 0.045, 0.28, [0.36, 0.22, 0.12], 5);
      }
    }

    // Lily pads: either a bay or all over the shallows.
    const lil = f.lilies;
    if (lil && lil.count) {
      let placed = 0;
      for (let tries = 0; tries < lil.count * 25 && placed < lil.count; tries += 1) {
        let x;
        let z;
        if (lil.angle !== null) {
          const a = lil.angle + range(rng, -0.35, 0.35);
          const r = s.shoreRadius(a) - range(rng, 5, 16);
          x = Math.cos(a) * r;
          z = Math.sin(a) * r;
        } else {
          ({ x, z } = this.waterPoint(rng));
          const d = s.depthAt(x, z);
          if (d < 0.25 || d > 1.9) continue;
        }
        if (this.inLane(x, z) && rng() < 0.85) continue;
        g.disc(x, 0.03, z, range(rng, 0.25, 0.55), [0.18 * range(rng, 0.85, 1.15), 0.36, 0.14]);
        if (rng() < 0.08) g.blob(x + 0.08, 0.1, z, 0.09, 0.06, 0.09, rng() < 0.5 ? [0.96, 0.95, 0.92] : [0.95, 0.66, 0.78], 6, 3, 0.1);
        placed += 1;
      }
    }

    // Grass tufts on the banks.
    const grassC = pal.snow ? [0.52, 0.48, 0.32] : scale3(pal.grass, 1.1);
    for (let i = 0; i < (f.grass || 0); i += 1) {
      const p = this.shorePoint(rng, range(rng, 0.5, 26));
      if (this.nearSpot(p.x, p.z, 2.2)) continue;
      if (s.kind === 'river' && this.slopeAt(p.x, p.z) > 0.6) continue;
      const y = s.groundHeight(p.x, p.z);
      g.blade(p.x, y - 0.02, p.z, 0.12, range(rng, 0.3, 0.7), [range(rng, -0.15, 0.15), range(rng, -0.15, 0.15)], scale3(grassC, range(rng, 0.85, 1.15)));
    }

    // Rocks clustered on a point.
    if (f.rocks) {
      for (let i = 0; i < f.rocks.count; i += 1) {
        const a = f.rocks.angle + range(rng, -0.25, 0.25);
        const r = s.shoreRadius(a) + range(rng, -3, 6);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (this.nearSpot(x, z, 1.8) || this.inLane(x, z)) continue;
        this.rock(g, x, z, range(rng, 0.3, 1.3), rng);
      }
    }
    // Boulders along and in the river.
    for (let i = 0; i < (f.boulders || 0); i += 1) {
      const p = this.shorePoint(rng, range(rng, -7, 12));
      if (this.nearSpot(p.x, p.z, 2.5) || this.inLane(p.x, p.z)) continue;
      this.rock(g, p.x, p.z, range(rng, 0.5, 2.2), rng);
    }
    // Snow-dusted rocks on the cold lake.
    if (pal.snow) {
      for (let i = 0; i < 120; i += 1) {
        const p = this.shorePoint(rng, range(rng, 2, 30));
        if (this.nearSpot(p.x, p.z, 3)) continue;
        this.rock(g, p.x, p.z, range(rng, 0.4, 1.6), rng);
      }
    }

    // Dead stumps in the swamp shallows.
    for (let i = 0, n = 0; i < (f.stumps || 0) * 20 && n < (f.stumps || 0); i += 1) {
      const p = this.waterPoint(rng);
      const d = s.depthAt(p.x, p.z);
      if (d < 0.2 || d > 2.2 || this.inLane(p.x, p.z) || this.nearSpot(p.x, p.z, 3)) continue;
      const r = range(rng, 0.2, 0.55);
      const h = d + range(rng, 0.2, 1.6);
      g.frustum(p.x, -d, p.z, r * 1.2, r * 0.8, h, [0.27, 0.23, 0.18], 6, rng() * 6, 0.2);
      n += 1;
    }

    // Ice floes along the cold shore.
    for (let i = 0; i < (f.ice || 0); i += 1) {
      const p = this.shorePoint(rng, -range(rng, 1, 9));
      if (this.inLane(p.x, p.z) || this.nearSpot(p.x, p.z, 3)) continue;
      const base = rng() * TAU;
      for (let k = 0; k < 3; k += 1) {
        const ice = mix([0.8, 0.88, 0.94], [0.94, 0.97, 1], rng());
        g.box(p.x + range(rng, -1.2, 1.2), 0.02, p.z + range(rng, -1.2, 1.2), range(rng, 1.2, 3.4), 0.12, range(rng, 1, 2.6), ice, base + range(rng, -0.6, 0.6));
      }
    }
    this.add('shore', g, this.floraMaterial, { castShadows: true });
  }

  rock(g, x, z, size, rng) {
    const grey = range(rng, 0.35, 0.5);
    const base = this.pal.rock;
    const c = mix([grey, grey * 0.97, grey * 0.92], base, 0.5);
    const y = this.shape.groundHeight(x, z);
    g.blob(x, y + size * 0.2, z, size * 1.2, size * 0.7, size, c, 7, 5, 0.3);
    if (this.pal.snow && y > -0.2) g.blob(x, y + size * 0.62, z, size * 0.95, size * 0.28, size * 0.8, SNOW, 7, 3, 0.05);
  }

  // ---------- props ----------
  buildProps() {
    const g = new GeoBuilder();
    for (const spot of this.water.spots) {
      if (!spot.prop) continue;
      const lane = this.lanes.find((l) => l.id === spot.id);
      if (spot.prop === 'dock') this.dock(g, lane, spot.deck, false);
      if (spot.prop === 'boardwalk') this.dock(g, lane, spot.deck, true);
      if (spot.prop === 'ice') this.iceShelf(g, lane, spot.deck);
      if (spot.prop === 'ledge') this.ledge(g, lane, spot.deck);
    }
    if (g.count) this.add('props', g, this.propMaterial, { castShadows: true });
  }

  // A wooden pier from the bank out past the standing spot. The boardwalk is longer, rotten and has rails.
  dock(g, lane, deck, rotten) {
    const rng = this.rng;
    const f = lane.f;
    const side = { x: -f.z, z: f.x };
    const rot = Math.atan2(f.z, f.x);
    const reach = Math.hypot(lane.x - lane.shoreX, lane.z - lane.shoreZ);
    const start = rotten ? -7 : -3;
    const end = reach + 2;
    const wood = rotten ? [0.3, 0.26, 0.19] : [0.42, 0.31, 0.2];
    const at = (t, o = 0) => ({ x: lane.shoreX + f.x * t + side.x * o, z: lane.shoreZ + f.z * t + side.z * o });
    const width = rotten ? 1.8 : 2.4;
    for (let t = start; t < end; t += 0.32) {
      if (rotten && rng() < 0.07 && t > start + 2 && t < end - 4) continue;
      const shade = 0.85 + ((t * 7.3) % 1 + 1) % 1 * 0.3;
      const sag = rotten ? -0.06 * Math.sin(((t - start) / (end - start)) * Math.PI) + range(rng, -0.02, 0.02) : 0;
      const p = at(t);
      g.box(p.x, deck - 0.035 + sag, p.z, 0.28, 0.07, width, scale3(wood, shade), rot + (rotten ? range(rng, -0.05, 0.05) : 0));
    }
    const postC = rotten ? [0.24, 0.2, 0.15] : [0.3, 0.22, 0.14];
    for (let t = start; t <= end; t += 2.4) {
      for (const sgn of [-1, 1]) {
        const p = at(t, (width / 2 - 0.05) * sgn);
        const bottom = -this.shape.depthAt(p.x, p.z) - 0.4;
        const top = deck + (rotten ? 0.95 : 0);
        g.frustum(p.x, bottom, p.z, 0.11, 0.11, top - bottom, postC, 6);
      }
    }
    if (rotten) {
      // Hand rails, one segment per post gap, a couple broken.
      for (let t = start; t < end - 2.4; t += 2.4) {
        for (const sgn of [-1, 1]) {
          if (rng() < 0.12) continue;
          const p = at(t + 1.2, (width / 2 - 0.05) * sgn);
          g.box(p.x, deck + 0.88, p.z, 2.4, 0.07, 0.07, postC, rot);
        }
      }
      // A lantern post just off your left shoulder: look left to see it.
      const lp = at(reach + 0.6, -(width / 2 + 0.1));
      g.frustum(lp.x, deck, lp.z, 0.06, 0.06, 1.7, postC, 5);
      g.box(lp.x, deck + 1.72, lp.z, 0.5, 0.05, 0.05, postC, rot + Math.PI / 2);
      this.lantern(lp.x + side.x * 0.22, deck + 1.52, lp.z + side.z * 0.22);
    } else {
      // A bench for scale.
      const b = at(reach - 2.2, 0.7);
      g.box(b.x, deck + 0.4, b.z, 1.4, 0.06, 0.4, [0.38, 0.28, 0.18], rot);
      for (const o of [-0.6, 0.6]) {
        const lp = at(reach - 2.2 + o, 0.7);
        g.box(lp.x, deck + 0.2, lp.z, 0.06, 0.4, 0.34, [0.3, 0.22, 0.14], rot);
      }
    }
  }

  lantern(x, y, z) {
    const e = new pc.Entity('lantern');
    e.addComponent('render', { type: 'sphere', material: this.lanternMaterial, castShadows: false });
    e.setLocalScale(0.12, 0.17, 0.12);
    e.setPosition(x, y, z);
    const light = new pc.Entity('lantern-light');
    light.addComponent('light', { type: 'omni', color: new pc.Color(1, 0.75, 0.4), intensity: 1.2, range: 9, castShadows: false });
    e.addChild(light);
    this.app.root.addChild(e);
    this.parts.push(e);
    this.lanterns.push({ e, light });
  }

  iceShelf(g, lane, deck) {
    const rng = this.rng;
    const f = lane.f;
    const rot = Math.atan2(f.z, f.x);
    const reach = Math.hypot(lane.x - lane.shoreX, lane.z - lane.shoreZ);
    const len = reach + 7;
    const mid = reach / 2 - 0.5;
    const cx = lane.shoreX + f.x * mid;
    const cz = lane.shoreZ + f.z * mid;
    g.box(cx, deck - 0.3, cz, len, 0.6, 7, [0.84, 0.9, 0.95], rot);
    for (let k = 0; k < 9; k += 1) {
      const t = range(rng, -2, reach + 3);
      const o = range(rng, -5, 5);
      const x = lane.shoreX + f.x * t - f.z * o;
      const z = lane.shoreZ + f.z * t + f.x * o;
      const sz = range(rng, 1.5, 3.5);
      g.box(x, deck - 0.32, z, sz, 0.6, sz * range(rng, 0.6, 1.2), mix([0.78, 0.87, 0.94], [0.95, 0.97, 1], rng()), rot + range(rng, -0.8, 0.8));
    }
    // Snow drifts on top.
    for (let k = 0; k < 6; k += 1) {
      const t = range(rng, -3, reach - 1);
      const o = range(rng, -3, 3);
      if (Math.abs(o) < 1.2 && t > reach - 3) continue;
      g.blob(lane.shoreX + f.x * t - f.z * o, deck, lane.shoreZ + f.z * t + f.x * o, range(rng, 0.8, 1.6), 0.18, range(rng, 0.8, 1.6), SNOW, 7, 3, 0.05);
    }
  }

  ledge(g, lane, deck) {
    const rng = this.rng;
    const f = lane.f;
    const rot = Math.atan2(f.z, f.x);
    const rockC = this.pal.rock;
    const bottom = -4;
    const h = deck - bottom;
    const cx = lane.x + f.x * 0.4;
    const cz = lane.z + f.z * 0.4;
    g.box(cx, bottom + h / 2, cz, 4.4, h, 4.6, rockC, rot);
    g.box(cx - f.x * 2.6, bottom + (h + 0.6) / 2, cz - f.z * 2.6, 4, h + 0.6, 5.4, scale3(rockC, 0.92), rot + 0.15);
    for (let k = 0; k < 6; k += 1) {
      const a = rng() * TAU;
      const r = range(rng, 2.6, 4.2);
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const s = range(rng, 1, 2);
      g.blob(x, deck - s * 0.9, z, s * 1.3, s, s * 1.2, scale3(rockC, range(rng, 0.85, 1.1)), 7, 5, 0.3);
    }
    // Snow on the back of the ledge, leaving the front clear to stand on.
    g.blob(cx - f.x * 2.4, deck + 0.35, cz - f.z * 2.4, 2, 0.25, 2.4, SNOW, 8, 3, 0.05);
  }

  // ---------- horizon and clouds ----------
  buildDistance() {
    const g = new GeoBuilder();
    const rng = this.rng;
    const pal = this.pal;
    const river = this.shape.kind === 'river';
    if (pal.flatHorizon) {
      // A far tree line instead of mountains.
      for (let i = 0; i < 240; i += 1) {
        const a = (i / 240) * TAU + range(rng, -0.01, 0.01);
        const r = range(rng, 200, 260);
        const h = range(rng, 9, 20);
        g.blob(Math.cos(a) * r, h * 0.45, Math.sin(a) * r, range(rng, 6, 12), h, range(rng, 6, 12), scale3(pal.mountains, range(rng, 0.85, 1.1)), 7, 4, 0.2);
      }
    } else {
      for (let i = 0; i < 46; i += 1) {
        const a = (i / 46) * TAU + range(rng, -0.05, 0.05);
        const r = river ? range(rng, 400, 580) : range(rng, 330, 520);
        const h = range(rng, 60, 160) * (pal.snowcaps ? 1.25 : 1);
        const rB = range(rng, 90, 170);
        const rT = range(rng, 4, 20);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const rot = rng() * 6;
        g.frustum(x, -10, z, rB, rT, h, pal.mountains, 7, rot, 0.25);
        if (pal.snowcaps) {
          const t = 0.62;
          g.frustum(x, -10 + h * t, z, (rB + (rT - rB) * t) * 1.02, rT * 1.05, h * (1 - t) + 0.5, SNOW, 7, rot, 0.12);
        }
      }
    }
    this.add('distance', g, this.farMaterial, { receiveShadows: false });
  }

  buildClouds() {
    const c = new GeoBuilder();
    const rng = this.rng;
    for (let i = 0; i < 26; i += 1) {
      const a = rng() * TAU;
      const r = range(rng, 150, 520);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = range(rng, 140, 220);
      for (let k = 0; k < 4; k += 1) {
        c.blob(x + range(rng, -40, 40), y + range(rng, -6, 6), z + range(rng, -25, 25), range(rng, 25, 55), range(rng, 8, 16), range(rng, 18, 35), [1, 1, 1], 10, 6, 0.3);
      }
    }
    this.add('clouds', c, this.cloudMaterial, { receiveShadows: false });
  }

  // ---------- light and weather ----------
  setEnvironment(hour, weatherId) {
    const w = WEATHER[weatherId] || WEATHER.sunny;
    const pal = this.pal;
    const d = daylight(hour);
    const tw = clamp(Math.exp(-(((hour - 6) / 1.1) ** 2)) + Math.exp(-(((hour - 19.6) / 1.1) ** 2)), 0, 1);
    const grey = (c, amount) => {
      const l = (c[0] + c[1] + c[2]) / 3;
      return mix(c, [l, l * 1.02, l * 1.06], amount);
    };
    const overcast = w.overcast;
    let zenith = mix(SKY.nightZenith, SKY.dayZenith, d);
    let horizon = mix(SKY.nightHorizon, SKY.dayHorizon, d);
    zenith = mix(zenith, SKY.duskZenith, tw * 0.6);
    horizon = mix(horizon, SKY.duskHorizon, tw * 0.55 * (1 - overcast * 0.6));
    zenith = grey(zenith, overcast).map((v, i) => v * (1 - overcast * 0.25) * pal.skyTint[i]);
    horizon = grey(horizon, overcast).map((v, i) => v * (1 - overcast * 0.2) * pal.skyTint[i]);
    if (weatherId === 'storm') {
      zenith = zenith.map((v) => v * 0.55);
      horizon = horizon.map((v) => v * 0.7);
    }

    const cols = this.skyColors;
    for (let i = 0; i < this.skyHeights.length; i += 1) {
      const t = clamp(this.skyHeights[i], 0, 1);
      const c = mix(horizon, zenith, Math.pow(t, 0.55));
      cols[i * 4] = clamp(c[0], 0, 1) * 255;
      cols[i * 4 + 1] = clamp(c[1], 0, 1) * 255;
      cols[i * 4 + 2] = clamp(c[2], 0, 1) * 255;
    }
    this.skyMesh.setColors32(cols);
    this.skyMesh.update();

    const elev = sunAngle(hour);
    const sunDir = new pc.Vec3(Math.cos(elev), Math.sin(elev), 0.45).normalize();
    this.sunDisc.setPosition(sunDir.clone().mulScalar(820));
    this.sunDisc.enabled = sunDir.y > -0.05 && overcast < 0.6;
    const moonDir = new pc.Vec3(-Math.cos(elev), -Math.sin(elev), -0.3).normalize();
    this.moonDisc.setPosition(moonDir.clone().mulScalar(820));
    this.moonDisc.enabled = moonDir.y > 0 && overcast < 0.6;

    const night = sunDir.y < 0.02;
    const lightDir = night ? moonDir : sunDir;
    this.sunLight.setPosition(lightDir.clone().mulScalar(100));
    this.sunLight.lookAt(0, 0, 0);
    this.sunLight.rotateLocal(90, 0, 0);
    const warm = mix([1, 0.62, 0.38], [1, 0.97, 0.9], clamp(sunDir.y * 2.5, 0, 1));
    const lc = night ? [0.55, 0.65, 0.9] : warm;
    this.sunLight.light.color = new pc.Color(lc[0], lc[1], lc[2]);
    this.sunLight.light.intensity = night ? 0.22 : (0.25 + 1.35 * d) * w.light;

    const snowBounce = pal.snow ? 0.06 * d : 0;
    // Never pitch black: a little moonlight so you can still find your float.
    this.ambient = horizon.map((v, i) => Math.max([0.075, 0.085, 0.12][i], 0.03 + v * 0.42 + [0, 0.005, 0.02][i] + snowBounce));
    this.app.scene.ambientLight = new pc.Color(this.ambient[0], this.ambient[1], this.ambient[2]);
    this.app.scene.fog.color = new pc.Color(horizon[0], horizon[1], horizon[2]);
    // Thick enough to feel, thin enough to see your float.
    this.app.scene.fog.density = Math.min(0.034, w.fog * pal.fog);
    // Fake sky reflection: water picks up the horizon colour (less on murky water).
    const reflect = 0.3 * (pal.reflect ?? 1);
    this.waterMaterial.emissive = new pc.Color(horizon[0] * reflect, horizon[1] * reflect * 1.1, horizon[2] * reflect * 1.27);
    const glint = 0.55 * (1 - overcast * 0.75) * Math.max(0.25, d);
    this.waterMaterial.specular = new pc.Color(glint, glint, glint);
    this.waterMaterial.gloss = 0.9 - overcast * 0.2;
    this.waterMaterial.update();
    const cloud = mix([0.25, 0.27, 0.32], [1, 0.98, 0.96], d);
    const cloudTint = mix(cloud, [1, 0.72, 0.55], tw * 0.5 * (1 - overcast * 0.8)).map((v) => v * (1 - overcast * (weatherId === 'storm' ? 0.55 : 0.3)));
    this.cloudMaterial.emissive = new pc.Color(cloudTint[0], cloudTint[1], cloudTint[2]);
    // Fog hides the sky.
    this.cloudMaterial.opacity = weatherId === 'fog' ? 0.12 : 0.75 + overcast * 0.2;
    this.cloudMaterial.update();
    this.waveStrength = w.waves;
    this.horizon = horizon;
    this.precip = w.precip || null;
    this.storm = !!w.lightning;
    this.night = d < 0.15;
    for (const l of this.lanterns) {
      l.e.enabled = d < 0.45 || weatherId === 'fog' || weatherId === 'storm';
      l.light.light.intensity = 1.4 * (1 - d);
    }
  }

  update(dt, camPos) {
    this.time += dt;
    this.updateWater(this.time);
    this.sky.setPosition(camPos.x, 0, camPos.z);
    if (this.precip === 'rain') this.drawRain(dt, camPos);
    if (this.precip === 'snow') this.drawSnow(dt, camPos);
    this.updateLightning(dt, camPos);
  }

  updateLightning(dt, cam) {
    if (this.storm) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        const rng = this.fxRng;
        this.nextFlash = range(rng, 4, 14);
        this.flash = 1;
        const a = rng() * TAU;
        const dist = range(rng, 140, 320);
        const bx = cam.x + Math.cos(a) * dist;
        const bz = cam.z + Math.sin(a) * dist;
        const pts = [];
        let p = new pc.Vec3(bx, 190, bz);
        while (p.y > 0) {
          const q = new pc.Vec3(p.x + range(rng, -9, 9), p.y - range(rng, 10, 24), p.z + range(rng, -9, 9));
          pts.push(p, q);
          if (rng() < 0.25) pts.push(q, new pc.Vec3(q.x + range(rng, -18, 18), q.y - range(rng, 10, 25), q.z + range(rng, -18, 18)));
          p = q;
        }
        this.bolt = { pts, life: 0.22 };
        if (this.onThunder) setTimeout(() => this.onThunder(dist), 600 + dist * 6);
      }
    }
    if (this.bolt) {
      this.bolt.life -= dt;
      if (this.bolt.life > 0) {
        this.app.drawLines(this.bolt.pts, this.boltColor, false);
        // Draw it twice, offset, so it reads thicker.
        this.app.drawLines(this.bolt.pts.map((v) => new pc.Vec3(v.x + 0.6, v.y, v.z)), this.boltColor, false);
      } else this.bolt = null;
    }
    if (this.flash > 0 || this.flashWas) {
      this.flash = Math.max(0, this.flash - dt * 3.5);
      const f = this.flash * (0.6 + 0.4 * Math.sin(this.time * 70));
      const amb = this.ambient || [0.2, 0.2, 0.2];
      this.app.scene.ambientLight = new pc.Color(amb[0] + f * 0.7, amb[1] + f * 0.72, amb[2] + f * 0.8);
      this.skyMaterial.emissive = new pc.Color(1 + f * 2.2, 1 + f * 2.2, 1 + f * 2.5);
      this.skyMaterial.update();
      this.flashWas = this.flash > 0;
    }
  }

  drawRain(dt, cam) {
    const pts = [];
    const heavy = this.storm;
    const n = heavy ? this.rain.length : 260;
    const fall = heavy ? 18 : 14;
    const wind = heavy ? 0.35 : 0.03;
    const rng = this.fxRng;
    for (let i = 0; i < n; i += 1) {
      const p = this.rain[i];
      p.y -= dt * fall;
      p.x += dt * fall * wind;
      if (p.y < -0.2 || Math.abs(p.x - cam.x) > 14 || Math.abs(p.z - cam.z) > 14) {
        p.set(cam.x + range(rng, -13, 13), cam.y + range(rng, 0, 10), cam.z + range(rng, -13, 13));
      }
      pts.push(p.clone(), new pc.Vec3(p.x - wind * 0.45, p.y + 0.45, p.z));
    }
    this.app.drawLines(pts, this.rainColor, true);
  }

  drawSnow(dt, cam) {
    const pts = [];
    const rng = this.fxRng;
    const t = this.time;
    const k = 0.035;
    for (let i = 0; i < this.snow.length; i += 1) {
      const p = this.snow[i];
      p.y -= dt * 1.1;
      p.x += dt * (0.35 * Math.sin(t * 0.9 + i) + 0.25);
      p.z += dt * 0.3 * Math.cos(t * 0.7 + i * 1.3);
      if (p.y < -0.1 || Math.abs(p.x - cam.x) > 16 || Math.abs(p.z - cam.z) > 16) {
        p.set(cam.x + range(rng, -15, 15), cam.y + range(rng, -1, 9), cam.z + range(rng, -15, 15));
      }
      pts.push(new pc.Vec3(p.x - k, p.y, p.z), new pc.Vec3(p.x + k, p.y, p.z), new pc.Vec3(p.x, p.y - k, p.z), new pc.Vec3(p.x, p.y + k, p.z));
    }
    this.app.drawLines(pts, this.snowColor, true);
  }
}
