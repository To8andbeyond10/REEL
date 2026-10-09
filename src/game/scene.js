// Genesis Lake in 3D: terrain, animated water, forest, reeds, dock, sky and lighting.
import * as pc from 'playcanvas';
import { GeoBuilder, meshEntity, vertexColorMaterial } from './geometry.js';
import { LAKE, SPOT_POSES, depthAt, groundHeight, shoreRadius } from '../sim/lake.js';
import { WEATHER, daylight, sunAngle } from '../sim/world.js';
import { clamp, createRng, lerp, range } from '../sim/random.js';

const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

const SKY = {
  dayZenith: [0.22, 0.45, 0.86],
  dayHorizon: [0.72, 0.84, 0.95],
  duskZenith: [0.24, 0.27, 0.5],
  duskHorizon: [0.96, 0.7, 0.52],
  nightZenith: [0.015, 0.025, 0.07],
  nightHorizon: [0.05, 0.07, 0.13]
};

export class LakeScene {
  constructor(app) {
    this.app = app;
    this.device = app.graphicsDevice;
    this.rng = createRng(20261009);
    this.time = 0;
    this.waveStrength = 1;
    this.buildLights();
    this.buildSky();
    this.buildTerrain();
    this.buildWater();
    this.buildForest();
    this.buildShoreLife();
    this.buildDock();
    this.buildMountainsAndClouds();
    this.rain = Array.from({ length: 260 }, () => new pc.Vec3());
    this.rainColor = new pc.Color(0.75, 0.8, 0.88, 0.5);
  }

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
      const v = (r / rings) * Math.PI * 0.6; // dome plus a bit below the horizon
      for (let s = 0; s <= segs; s += 1) {
        const u = (s / segs) * Math.PI * 2;
        const x = Math.sin(v) * Math.cos(u);
        const y = Math.cos(v);
        const z = Math.sin(v) * Math.sin(u);
        g.vertex([x * 900, y * 900, z * 900], [-x, -y, -z], [1, 1, 1]);
        this.skyHeights.push(y);
      }
    }
    for (let r = 0; r < rings; r += 1) {
      for (let s = 0; s < segs; s += 1) {
        const a = r * (segs + 1) + s;
        const b = a + segs + 1;
        g.indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    this.skyMesh = g.build(this.device);
    this.skyColors = new Uint8Array(g.colors);
    const sky = meshEntity(this.app, 'sky', this.skyMesh, vertexColorMaterial({ unlit: true, fog: false }), { receiveShadows: false });
    this.sky = sky;

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

  buildTerrain() {
    const size = 380;
    const n = 190;
    const step = size / n;
    const g = new GeoBuilder();
    const rng = this.rng;
    for (let i = 0; i <= n; i += 1) {
      for (let j = 0; j <= n; j += 1) {
        const x = -size / 2 + j * step;
        const z = -size / 2 + i * step;
        const y = groundHeight(x, z);
        const e = 0.6;
        const nx = groundHeight(x - e, z) - groundHeight(x + e, z);
        const nz = groundHeight(x, z - e) - groundHeight(x, z + e);
        const len = Math.hypot(nx, 2 * e, nz);
        const normal = [nx / len, (2 * e) / len, nz / len];
        const noise = 0.08 * (Math.sin(x * 0.37) * Math.cos(z * 0.29) + Math.sin(x * 1.3 + z * 0.7) * 0.5) + (rng() - 0.5) * 0.05;
        let c;
        if (y < -2.5) c = [0.16, 0.17, 0.12];
        else if (y < -0.3) c = mix([0.36, 0.32, 0.22], [0.16, 0.17, 0.12], clamp((-y - 0.3) / 2.2, 0, 1));
        else if (y < 0.45) c = [0.56, 0.5, 0.36];
        else if (y < 1.2) c = mix([0.56, 0.5, 0.36], [0.27, 0.4, 0.16], (y - 0.45) / 0.75);
        else c = mix([0.25, 0.4, 0.15], [0.17, 0.3, 0.12], clamp((y - 2) / 8, 0, 1));
        if (normal[1] < 0.82 && y > 0.6) c = mix(c, [0.4, 0.38, 0.34], clamp((0.82 - normal[1]) * 5, 0, 1));
        g.vertex([x, y, z], normal, [c[0] * (1 + noise), c[1] * (1 + noise), c[2] * (1 + noise)]);
      }
    }
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const a = i * (n + 1) + j;
        const b = a + n + 1;
        g.indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    this.terrain = meshEntity(this.app, 'terrain', g.build(this.device), vertexColorMaterial({ gloss: 0.15 }), { castShadows: false });
  }

  buildWater() {
    const size = 260;
    const n = 110;
    const step = size / n;
    const g = new GeoBuilder();
    for (let i = 0; i <= n; i += 1) {
      for (let j = 0; j <= n; j += 1) {
        const x = -size / 2 + j * step;
        const z = -size / 2 + i * step;
        const d = depthAt(x, z);
        const shallow = clamp(d / 5, 0, 1);
        const c = mix([0.3, 0.4, 0.3], [0.1, 0.26, 0.34], shallow);
        g.vertex([x, 0, z], [0, 1, 0], c);
      }
    }
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const a = i * (n + 1) + j;
        const b = a + n + 1;
        g.indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    this.waterBase = new Float32Array(g.positions);
    this.waterPositions = new Float32Array(g.positions);
    this.waterNormals = new Float32Array(g.normals);
    this.waterMesh = g.build(this.device);
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
    this.water = meshEntity(this.app, 'water', this.waterMesh, m, { receiveShadows: true });
  }

  waveHeight(x, z, t) {
    const s = this.waveStrength;
    return s * (0.045 * Math.sin(x * 0.35 + t * 1.4) + 0.035 * Math.sin(z * 0.42 - t * 1.1 + x * 0.1) + 0.02 * Math.sin((x + z) * 0.9 + t * 2.3));
  }

  updateWater(t) {
    const p = this.waterPositions;
    const nrm = this.waterNormals;
    const base = this.waterBase;
    const s = this.waveStrength;
    for (let i = 0; i < p.length; i += 3) {
      const x = base[i];
      const z = base[i + 2];
      p[i + 1] = this.waveHeight(x, z, t);
      const dx = s * (0.045 * 0.35 * Math.cos(x * 0.35 + t * 1.4) + 0.035 * 0.1 * Math.cos(z * 0.42 - t * 1.1 + x * 0.1) + 0.02 * 0.9 * Math.cos((x + z) * 0.9 + t * 2.3));
      const dz = s * (0.035 * 0.42 * Math.cos(z * 0.42 - t * 1.1 + x * 0.1) + 0.02 * 0.9 * Math.cos((x + z) * 0.9 + t * 2.3));
      const len = Math.hypot(dx, 1, dz);
      nrm[i] = -dx / len;
      nrm[i + 1] = 1 / len;
      nrm[i + 2] = -dz / len;
    }
    this.waterMesh.setPositions(p);
    this.waterMesh.setNormals(nrm);
    this.waterMesh.update(pc.PRIMITIVE_TRIANGLES, false);
  }

  nearSpot(x, z, radius) {
    return Object.values(SPOT_POSES).some((p) => Math.hypot(p.x - x, p.z - z) < radius);
  }

  // Keeps a clear casting lane in front of each spot.
  inLane(x, z) {
    return Object.values(SPOT_POSES).some((p) => {
      const fx = -Math.sin(p.yaw);
      const fz = -Math.cos(p.yaw);
      const dx = x - p.x;
      const dz = z - p.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      return ahead > -2 && ahead < 26 && side < 2.5 + ahead * 0.55;
    });
  }

  buildForest() {
    const g = new GeoBuilder();
    const rng = this.rng;
    let placed = 0;
    for (let tries = 0; tries < 9000 && placed < 1100; tries += 1) {
      const a = rng() * Math.PI * 2;
      const shore = shoreRadius(a);
      const dist = shore + 6 + Math.pow(rng(), 1.4) * 150;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      if (Math.abs(x) > 185 || Math.abs(z) > 185) continue;
      if (this.nearSpot(x, z, 7)) continue;
      const y = groundHeight(x, z) - 0.2;
      const s = range(rng, 0.7, 1.5);
      const tint = range(rng, 0.85, 1.15);
      if (rng() < 0.62) {
        g.frustum(x, y, z, 0.28 * s, 0.14 * s, 2.2 * s, [0.3, 0.2, 0.12], 6);
        const green = [0.1 * tint, 0.26 * tint, 0.13 * tint];
        for (let k = 0; k < 4; k += 1) {
          const r = (2.4 - k * 0.5) * s;
          g.frustum(x, y + (1.6 + k * 1.5) * s, z, r, 0, 2.6 * s, green, 9, rng() * 6, 0.15);
        }
      } else {
        g.frustum(x, y, z, 0.3 * s, 0.2 * s, 3 * s, [0.34, 0.25, 0.16], 6);
        const green = [0.2 * tint, 0.36 * tint, 0.14 * tint];
        g.blob(x, y + 4.2 * s, z, 2.4 * s, 2 * s, 2.4 * s, green, 8, 6, 0.25);
        g.blob(x + 1.1 * s, y + 3.4 * s, z + 0.6 * s, 1.6 * s, 1.4 * s, 1.6 * s, mix(green, [0.3, 0.4, 0.15], 0.3), 7, 5, 0.25);
      }
      placed += 1;
    }
    meshEntity(this.app, 'forest', g.build(this.device), vertexColorMaterial({ gloss: 0.1 }), { castShadows: true });
  }

  buildShoreLife() {
    const g = new GeoBuilder();
    const rng = this.rng;
    // Reeds in the shallows, thickest in Reed Bay.
    for (let i = 0; i < 4200; i += 1) {
      const a = rng() * Math.PI * 2;
      const da = Math.atan2(Math.sin(a - LAKE.reedsAngle), Math.cos(a - LAKE.reedsAngle));
      const bay = Math.exp(-(da * da) / 0.12);
      if (rng() > 0.12 + bay) continue;
      const r = shoreRadius(a) - range(rng, -1, 4 + bay * 9);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.nearSpot(x, z, 3.5) || this.inLane(x, z)) continue;
      const d = depthAt(x, z);
      if (d > 1.4) continue;
      const h = range(rng, 1.1, 2.4);
      const c = rng() < 0.3 ? [0.55, 0.5, 0.3] : [0.3, 0.42, 0.18];
      g.blade(x, -d, z, 0.09, h + d, [range(rng, -0.25, 0.25), range(rng, -0.25, 0.25)], c);
    }
    // Lily pads.
    for (let i = 0; i < 160; i += 1) {
      const a = LAKE.reedsAngle + range(rng, -0.35, 0.35);
      const r = shoreRadius(a) - range(rng, 5, 16);
      g.disc(Math.cos(a) * r, 0.03, Math.sin(a) * r, range(rng, 0.25, 0.5), [0.18, 0.36, 0.14]);
    }
    // Grass tufts on the banks.
    for (let i = 0; i < 6000; i += 1) {
      const a = rng() * Math.PI * 2;
      const r = shoreRadius(a) + range(rng, 0.5, 26);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.nearSpot(x, z, 2.2)) continue;
      const y = groundHeight(x, z);
      g.blade(x, y - 0.02, z, 0.12, range(rng, 0.3, 0.7), [range(rng, -0.15, 0.15), range(rng, -0.15, 0.15)], [0.3, 0.45, 0.17]);
    }
    // Rocks on Deep Point.
    for (let i = 0; i < 70; i += 1) {
      const a = LAKE.pointAngle + range(rng, -0.25, 0.25);
      const r = shoreRadius(a) + range(rng, -3, 6);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.nearSpot(x, z, 1.8) || this.inLane(x, z)) continue;
      const s = range(rng, 0.3, 1.3);
      const grey = range(rng, 0.35, 0.5);
      g.blob(x, groundHeight(x, z) + s * 0.2, z, s * 1.2, s * 0.7, s, [grey, grey * 0.97, grey * 0.92], 7, 5, 0.3);
    }
    meshEntity(this.app, 'shore-life', g.build(this.device), vertexColorMaterial({ gloss: 0.2 }), { castShadows: true });
  }

  buildDock() {
    const pose = SPOT_POSES.dock;
    const a = LAKE.dockAngle;
    const out = { x: Math.cos(a), z: Math.sin(a) };
    const rot = -a; // planks run across the radial direction
    const g = new GeoBuilder();
    const wood = [0.42, 0.31, 0.2];
    const start = shoreRadius(a) + 3;
    const end = shoreRadius(a) - 11;
    for (let r = end; r < start; r += 0.32) {
      const shade = 0.85 + ((r * 7.3) % 1) * 0.3;
      g.box(out.x * r, 0.5, out.z * r, 0.28, 0.07, 2.4, [wood[0] * shade, wood[1] * shade, wood[2] * shade], rot);
    }
    const side = { x: -out.z, z: out.x };
    for (let r = end; r < start; r += 2.4) {
      for (const sgn of [-1, 1]) {
        const x = out.x * r + side.x * 1.15 * sgn;
        const z = out.z * r + side.z * 1.15 * sgn;
        g.frustum(x, -3, z, 0.12, 0.12, 3.46, [0.3, 0.22, 0.14], 6);
      }
    }
    // A bench for scale.
    const bx = pose.x + out.x * 2.2 + side.x * 0.7;
    const bz = pose.z + out.z * 2.2 + side.z * 0.7;
    g.box(bx, 0.95, bz, 0.4, 0.06, 1.4, [0.38, 0.28, 0.18], rot);
    meshEntity(this.app, 'dock', g.build(this.device), vertexColorMaterial({ gloss: 0.2 }), { castShadows: true });
  }

  buildMountainsAndClouds() {
    const g = new GeoBuilder();
    const rng = this.rng;
    for (let i = 0; i < 46; i += 1) {
      const a = (i / 46) * Math.PI * 2 + range(rng, -0.05, 0.05);
      const r = range(rng, 330, 520);
      const h = range(rng, 60, 160);
      g.frustum(Math.cos(a) * r, -10, Math.sin(a) * r, range(rng, 90, 170), range(rng, 4, 20), h, [0.2, 0.28, 0.2], 7, rng() * 6, 0.25);
    }
    meshEntity(this.app, 'mountains', g.build(this.device), vertexColorMaterial({ gloss: 0 }), { receiveShadows: false });

    const c = new GeoBuilder();
    for (let i = 0; i < 26; i += 1) {
      const a = rng() * Math.PI * 2;
      const r = range(rng, 150, 520);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = range(rng, 140, 220);
      for (let k = 0; k < 4; k += 1) {
        c.blob(x + range(rng, -40, 40), y + range(rng, -6, 6), z + range(rng, -25, 25), range(rng, 25, 55), range(rng, 8, 16), range(rng, 18, 35), [1, 1, 1], 10, 6, 0.3);
      }
    }
    this.cloudMaterial = new pc.StandardMaterial();
    this.cloudMaterial.useLighting = false;
    this.cloudMaterial.diffuse = new pc.Color(0, 0, 0);
    this.cloudMaterial.emissiveVertexColor = true;
    this.cloudMaterial.emissive = new pc.Color(1, 1, 1);
    this.cloudMaterial.opacity = 0.85;
    this.cloudMaterial.blendType = pc.BLEND_NORMAL;
    this.cloudMaterial.depthWrite = false;
    this.cloudMaterial.useFog = false;
    this.cloudMaterial.update();
    meshEntity(this.app, 'clouds', c.build(this.device), this.cloudMaterial, { receiveShadows: false });
  }

  // Sky colours, sun position and lighting for the hour and weather.
  setEnvironment(hour, weatherId) {
    const w = WEATHER[weatherId];
    const d = daylight(hour);
    const tw = clamp(Math.exp(-(((hour - 6) / 1.1) ** 2)) + Math.exp(-(((hour - 19.6) / 1.1) ** 2)), 0, 1);
    const grey = (c, amount) => {
      const l = (c[0] + c[1] + c[2]) / 3;
      return mix(c, [l, l * 1.02, l * 1.06], amount);
    };
    const overcast = weatherId === 'sunny' ? 0 : weatherId === 'cloudy' ? 0.7 : 0.85;
    let zenith = mix(SKY.nightZenith, SKY.dayZenith, d);
    let horizon = mix(SKY.nightHorizon, SKY.dayHorizon, d);
    zenith = mix(zenith, SKY.duskZenith, tw * 0.6);
    horizon = mix(horizon, SKY.duskHorizon, tw * 0.55 * (1 - overcast * 0.6));
    zenith = grey(zenith, overcast).map((v) => v * (1 - overcast * 0.25));
    horizon = grey(horizon, overcast).map((v) => v * (1 - overcast * 0.2));

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

    const amb = horizon.map((v, i) => 0.03 + v * 0.42 + [0, 0.005, 0.02][i]);
    this.app.scene.ambientLight = new pc.Color(amb[0], amb[1], amb[2]);
    this.app.scene.fog.color = new pc.Color(horizon[0], horizon[1], horizon[2]);
    this.app.scene.fog.density = w.fog;
    // Fake sky reflection: water picks up the horizon colour.
    this.waterMaterial.emissive = new pc.Color(horizon[0] * 0.3, horizon[1] * 0.33, horizon[2] * 0.38);
    // Less sun glint when the sky is grey.
    const glint = 0.55 * (1 - overcast * 0.75) * Math.max(0.25, d);
    this.waterMaterial.specular = new pc.Color(glint, glint, glint);
    this.waterMaterial.gloss = 0.9 - overcast * 0.2;
    this.waterMaterial.update();
    const cloud = mix([0.25, 0.27, 0.32], [1, 0.98, 0.96], d);
    const cloudTint = mix(cloud, [1, 0.72, 0.55], tw * 0.5);
    this.cloudMaterial.emissive = new pc.Color(cloudTint[0] * (1 - overcast * 0.3), cloudTint[1] * (1 - overcast * 0.3), cloudTint[2] * (1 - overcast * 0.3));
    this.cloudMaterial.opacity = 0.75 + overcast * 0.2;
    this.cloudMaterial.update();
    this.waveStrength = weatherId === 'rain' ? 1.8 : weatherId === 'cloudy' ? 1.3 : 1;
    this.horizon = horizon;
    this.raining = weatherId === 'rain';
  }

  update(dt, camPos) {
    this.time += dt;
    this.updateWater(this.time);
    this.sky.setPosition(camPos.x, 0, camPos.z);
    if (this.raining) this.drawRain(dt, camPos);
  }

  drawRain(dt, cam) {
    const pts = [];
    for (const p of this.rain) {
      p.y -= dt * 14;
      if (p.y < -0.2 || Math.abs(p.x - cam.x) > 14 || Math.abs(p.z - cam.z) > 14) {
        p.set(cam.x + range(this.rng, -13, 13), cam.y + range(this.rng, 0, 10), cam.z + range(this.rng, -13, 13));
      }
      pts.push(p.clone(), new pc.Vec3(p.x + 0.03, p.y + 0.45, p.z));
    }
    this.app.drawLines(pts, this.rainColor, true);
  }
}
