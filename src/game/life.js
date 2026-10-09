// Wildlife and live-event visuals: gulls overhead, flocks diving on bait balls, boils where a
// legendary is feeding, fish rising, fireflies and bats after dark, foam drifting down the river.
import * as pc from 'playcanvas';
import { GeoBuilder, meshEntity, solidMaterial, vertexColorMaterial } from './geometry.js';
import { createRng, range } from '../sim/random.js';

const TAU = Math.PI * 2;

function birdMesh(device, color) {
  const g = new GeoBuilder();
  // Body plus two wings; scaling the entity's Y flaps the wing tips up and down.
  g.blob(0, 0, 0, 0.07, 0.06, 0.24, color, 6, 4, 0.1);
  for (const s of [-1, 1]) {
    const base = g.count;
    g.vertex([0, 0, 0.1], [0, 1, 0], color);
    g.vertex([0, 0, -0.08], [0, 1, 0], color);
    g.vertex([s * 0.62, 0.22, 0.12], [0, 1, 0], color.map((c) => c * 0.8));
    g.indices.push(base, base + 1, base + 2);
  }
  return g.build(device);
}

export class Life {
  constructor(app, scene, effects) {
    this.app = app;
    this.scene = scene;
    this.effects = effects;
    this.rng = createRng(4242);
    this.t = 0;
    this.onSplash = null;
    const mat = vertexColorMaterial({ gloss: 0.1 });
    const gull = birdMesh(app.graphicsDevice, [0.92, 0.92, 0.9]);
    const bat = birdMesh(app.graphicsDevice, [0.12, 0.1, 0.1]);
    const entity = (name, mesh) => {
      const e = meshEntity(app, name, mesh, mat, { castShadows: false, receiveShadows: false });
      e.enabled = false;
      return e;
    };
    this.birds = Array.from({ length: 12 }, (_, i) => ({ e: entity(`bird-${i}`, gull), mode: 'off', dive: -1 }));
    this.bats = Array.from({ length: 5 }, (_, i) => ({ e: entity(`bat-${i}`, bat), p: new pc.Vec3(), v: new pc.Vec3() }));
    const glow = solidMaterial('#d9ff6a', { emissive: 1.4 });
    this.flies = Array.from({ length: 40 }, () => {
      const e = new pc.Entity('firefly');
      e.addComponent('render', { type: 'sphere', material: glow, castShadows: false, receiveShadows: false });
      e.enabled = false;
      app.root.addChild(e);
      return { e, p: new pc.Vec3(), home: new pc.Vec3(), phase: 0, rate: 1 };
    });
    const foamMat = solidMaterial('#f2f6f4', { opacity: 0.55, gloss: 0.2 });
    this.foam = Array.from({ length: 36 }, () => {
      const e = new pc.Entity('foam');
      e.addComponent('render', { type: 'cylinder', material: foamMat, castShadows: false, receiveShadows: false });
      e.enabled = false;
      app.root.addChild(e);
      return { e, x: 0, z: 0, s: 1, live: false };
    });
    // Churned-up water over a boil.
    this.boilFoam = Array.from({ length: 10 }, () => {
      const e = new pc.Entity('boil-foam');
      e.addComponent('render', { type: 'cylinder', material: foamMat, castShadows: false, receiveShadows: false });
      e.enabled = false;
      app.root.addChild(e);
      return { e, x: 0, z: 0, life: 0, size: 1 };
    });
    this.riseTimer = 2;
    this.hotTimer = 0;
  }

  setWater(water) {
    this.water = water;
    this.shape = water.shape;
    this.cfg = water.life;
    for (const b of this.birds) {
      b.mode = 'off';
      b.e.enabled = false;
    }
    for (const f of this.flies) f.e.enabled = false;
    for (const f of this.foam) {
      f.live = false;
      f.e.enabled = false;
    }
    this.fliesPlaced = false;
  }

  // A random point on the water in front of the camera.
  waterAhead(cam, yaw, min, max) {
    for (let i = 0; i < 12; i += 1) {
      const a = yaw + range(this.rng, -0.9, 0.9);
      const d = range(this.rng, min, max);
      const x = cam.x - Math.sin(a) * d;
      const z = cam.z - Math.cos(a) * d;
      if (this.shape.depthAt(x, z) > 0.6) return { x, z };
    }
    return null;
  }

  update(dt, { cam, yaw, light, hour, hotspots = [], twilight = 0 }) {
    this.t += dt;
    this.updateBirds(dt, cam, yaw, light, hotspots);
    this.updateHotspots(dt, hotspots);
    this.updateRises(dt, cam, yaw, twilight);
    this.updateFlies(dt, cam, light);
    this.updateBats(dt, cam, yaw, light, hour);
    this.updateFoam(dt, cam);
  }

  updateBirds(dt, cam, yaw, light, hotspots) {
    const rng = this.rng;
    const flock = hotspots.find((h) => h.kind === 'birds');
    const day = light > 0.25 && this.cfg.birds;
    this.birds.forEach((b, i) => {
      const wantHot = flock && i < 9;
      const wantAmbient = !wantHot && day && i >= 9;
      const want = wantHot ? 'hot' : wantAmbient ? 'ambient' : 'off';
      if (b.mode !== want || (wantHot && b.spot !== flock.id)) {
        b.mode = want;
        b.spot = flock?.id;
        b.e.enabled = want !== 'off';
        b.phase = rng() * TAU;
        b.speed = range(rng, 5, 8);
        b.dive = -1;
        if (want === 'hot') {
          b.cx = flock.x;
          b.cz = flock.z;
          b.r = range(rng, 4, 11);
          b.h = range(rng, 4, 9);
        } else if (want === 'ambient') {
          const p = this.waterAhead(cam, yaw, 40, 90) || { x: cam.x, z: cam.z - 60 };
          b.cx = p.x;
          b.cz = p.z;
          b.r = range(rng, 18, 35);
          b.h = range(rng, 16, 30);
        }
      }
      if (b.mode === 'off') return;
      b.phase += (dt * b.speed) / b.r;
      let y = b.h + Math.sin(this.t * 0.7 + i) * 1.2;
      if (b.mode === 'hot') {
        if (b.dive < 0 && rng() < dt * 0.25) b.dive = 0;
        if (b.dive >= 0) {
          const before = b.dive;
          b.dive += dt * 0.9;
          y = b.h * (1 - Math.sin(Math.min(1, b.dive) * Math.PI) * 0.97);
          if (before < 0.5 && b.dive >= 0.5) this.splash(new pc.Vec3(b.cx + Math.cos(b.phase) * b.r, 0, b.cz + Math.sin(b.phase) * b.r), 0.35);
          if (b.dive >= 1) b.dive = -1;
        }
      }
      const x = b.cx + Math.cos(b.phase) * b.r;
      const z = b.cz + Math.sin(b.phase) * b.r;
      b.e.setPosition(x, y, z);
      b.e.lookAt(x - Math.sin(b.phase) * 2, y, z + Math.cos(b.phase) * 2);
      const flap = b.dive >= 0 ? -0.6 : Math.sin(this.t * (b.mode === 'hot' ? 11 : 6) + i) * (Math.sin(this.t * 0.4 + i) > 0.2 ? 1 : 0.15);
      b.e.setLocalScale(1.4, flap * 1.4, 1.4);
    });
  }

  updateHotspots(dt, hotspots) {
    const boil = hotspots.find((h) => h.kind === 'boils');
    for (const f of this.boilFoam) {
      f.life -= dt;
      if (f.life <= 0) {
        if (!boil) {
          f.e.enabled = false;
          continue;
        }
        const a = this.rng() * TAU;
        const r = Math.sqrt(this.rng()) * boil.radius * 0.5;
        f.x = boil.x + Math.cos(a) * r;
        f.z = boil.z + Math.sin(a) * r;
        f.life = range(this.rng, 1.5, 4);
        f.max = f.life;
        f.size = range(this.rng, 1.2, 3);
        f.e.enabled = true;
        f.e.setEulerAngles(0, this.rng() * 360, 0);
      }
      const t = 1 - f.life / f.max;
      const s = f.size * (0.4 + t * 0.8);
      f.e.setLocalScale(s, 0.01, s * 0.7);
      f.e.setPosition(f.x, this.scene.waveHeight(f.x, f.z, this.scene.time) + 0.03, f.z);
    }
    this.hotTimer -= dt;
    if (this.hotTimer > 0) return;
    this.hotTimer = range(this.rng, 0.4, 1.4);
    for (const h of hotspots) {
      const a = this.rng() * TAU;
      const r = Math.sqrt(this.rng()) * h.radius * 0.6;
      const p = new pc.Vec3(h.x + Math.cos(a) * r, 0, h.z + Math.sin(a) * r);
      if (h.kind === 'boils') {
        if (this.rng() < 0.45) this.splash(p, range(this.rng, 1.2, 2.2));
        else this.effects.ripple(p, range(this.rng, 1.2, 2.4));
      } else {
        // Bait spraying out of the water.
        this.effects.ripple(p, 0.5);
        if (this.rng() < 0.3) this.splash(p, 0.25);
      }
    }
  }

  splash(p, size) {
    this.effects.splash(p, size);
    if (this.onSplash) this.onSplash(p, size);
  }

  // Fish dimpling the surface: more at dawn and dusk.
  updateRises(dt, cam, yaw, twilight) {
    this.riseTimer -= dt * (0.6 + twilight * 1.6);
    if (this.riseTimer > 0) return;
    this.riseTimer = range(this.rng, 2, 7);
    const p = this.waterAhead(cam, yaw, 8, 45);
    if (p) this.effects.ripple(new pc.Vec3(p.x, 0, p.z), range(this.rng, 0.3, 0.8));
  }

  updateFlies(dt, cam, light) {
    const n = Math.round(this.flies.length * (this.cfg.fireflies || 0));
    const on = light < 0.2 && n > 0;
    if (!on) {
      if (this.fliesPlaced) for (const f of this.flies) f.e.enabled = false;
      this.fliesPlaced = false;
      return;
    }
    if (!this.fliesPlaced) {
      this.fliesPlaced = true;
      this.flies.forEach((f, i) => {
        if (i >= n) return;
        // Over the banks and shallows near you.
        for (let k = 0; k < 20; k += 1) {
          const x = cam.x + range(this.rng, -18, 18);
          const z = cam.z + range(this.rng, -18, 18);
          const edge = this.shape.edge(x, z);
          if (edge < -6 || edge > 14) continue;
          const y = Math.max(0, this.shape.groundHeight(x, z)) + range(this.rng, 0.4, 2.2);
          f.home.set(x, y, z);
          break;
        }
        f.phase = this.rng() * TAU;
        f.rate = range(this.rng, 0.8, 1.6);
        f.e.enabled = true;
      });
    }
    this.flies.forEach((f, i) => {
      if (i >= n) return;
      const t = this.t * f.rate + f.phase;
      f.e.setPosition(f.home.x + Math.sin(t * 0.5) * 1.2, f.home.y + Math.sin(t * 0.8) * 0.4, f.home.z + Math.cos(t * 0.37) * 1.2);
      const glow = Math.pow(Math.max(0, Math.sin(t * 1.7)), 6);
      const s = 0.05 + glow * 0.16;
      f.e.setLocalScale(s, s, s);
    });
  }

  updateBats(dt, cam, yaw, light, hour) {
    const on = this.cfg.bats && light < 0.4 && (hour > 18.5 || hour < 6);
    this.bats.forEach((b, i) => {
      if (!on) {
        b.e.enabled = false;
        return;
      }
      if (!b.e.enabled) {
        b.e.enabled = true;
        b.p.set(cam.x - Math.sin(yaw) * 12 + range(this.rng, -6, 6), range(this.rng, 3, 7), cam.z - Math.cos(yaw) * 12 + range(this.rng, -6, 6));
      }
      // Erratic, fluttering flight that stays in front of you.
      const cx = cam.x - Math.sin(yaw) * 12;
      const cz = cam.z - Math.cos(yaw) * 12;
      b.v.x += (range(this.rng, -1, 1) * 30 + (cx - b.p.x) * 0.8) * dt;
      b.v.y += (range(this.rng, -1, 1) * 18 + (5 - b.p.y) * 1.2) * dt;
      b.v.z += (range(this.rng, -1, 1) * 30 + (cz - b.p.z) * 0.8) * dt;
      b.v.mulScalar(1 - dt * 1.5);
      b.p.add(b.v.clone().mulScalar(dt));
      b.e.setPosition(b.p);
      b.e.lookAt(b.p.x + b.v.x, b.p.y, b.p.z + b.v.z);
      b.e.setLocalScale(0.5, Math.sin(this.t * 22 + i) * 0.5, 0.5);
    });
  }

  updateFoam(dt, cam) {
    if (!this.cfg.foam) return;
    const s = this.shape;
    for (const f of this.foam) {
      if (!f.live) {
        const x = cam.x + range(this.rng, -45, 30);
        const z = s.center(x) + range(this.rng, -0.85, 0.85) * s.halfWidth(x);
        f.x = x;
        f.z = z;
        f.s = range(this.rng, 0.15, 0.6);
        f.live = true;
        f.e.enabled = true;
        f.e.setLocalScale(f.s, 0.01, f.s * range(this.rng, 0.5, 1.4));
        f.e.setEulerAngles(0, this.rng() * 360, 0);
      }
      const flow = s.flow(f.x, f.z);
      f.x += flow.x * flow.speed * dt * 1.8;
      f.z += flow.z * flow.speed * dt * 1.8;
      f.e.setPosition(f.x, this.scene.waveHeight(f.x, f.z, this.scene.time) + 0.025, f.z);
      if (f.x > cam.x + 45 || s.depthAt(f.x, f.z) < 0.1) f.live = false;
    }
  }
}
