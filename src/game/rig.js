// The angler's rod (bends under load), float, lure, fish models, splashes and ripples.
import * as pc from 'playcanvas';
import { solidMaterial } from './geometry.js';

const SEGMENTS = 9;

function part(parent, type, material, scale, pos = [0, 0, 0], euler = [0, 0, 0]) {
  const e = new pc.Entity(type);
  e.addComponent('render', { type, material, castShadows: false, receiveShadows: false });
  e.setLocalScale(...scale);
  e.setLocalPosition(...pos);
  e.setLocalEulerAngles(...euler);
  parent.addChild(e);
  return e;
}

export class Rod {
  constructor(camera) {
    this.root = new pc.Entity('rod-root');
    camera.addChild(this.root);
    this.root.setLocalPosition(0.4, -0.52, -0.3);
    this.blank = solidMaterial('#20262e', { gloss: 0.75, specular: 0.5 });
    this.cork = solidMaterial('#b08a5a', { gloss: 0.2 });
    this.metal = solidMaterial('#c9ccd2', { gloss: 0.85, specular: 0.8 });
    this.guide = solidMaterial('#9aa0a8', { gloss: 0.8, specular: 0.6 });

    part(this.root, 'cylinder', this.cork, [0.034, 0.36, 0.034], [0, 0.0, 0]);
    // Spinning reel hangs under the rod.
    this.reel = new pc.Entity('reel');
    this.root.addChild(this.reel);
    this.reel.setLocalPosition(0, 0.2, 0.06);
    part(this.reel, 'box', this.metal, [0.012, 0.05, 0.05], [0, 0, 0.0]);
    part(this.reel, 'cylinder', this.metal, [0.075, 0.05, 0.075], [0, 0.02, 0.07], [90, 0, 0]);
    this.spool = part(this.reel, 'cylinder', this.cork, [0.06, 0.035, 0.06], [0, 0.02, 0.105], [90, 0, 0]);
    this.handle = new pc.Entity('handle');
    this.reel.addChild(this.handle);
    this.handle.setLocalPosition(0.05, 0.02, 0.07);
    part(this.handle, 'box', this.metal, [0.008, 0.07, 0.008], [0, 0.035, 0]);
    part(this.handle, 'cylinder', this.cork, [0.018, 0.03, 0.018], [0.015, 0.07, 0], [0, 0, 90]);

    this.pivots = [];
    let parent = this.root;
    this.segLen = 0.22;
    for (let i = 0; i < SEGMENTS; i += 1) {
      const pivot = new pc.Entity(`seg-${i}`);
      pivot.setLocalPosition(0, i === 0 ? 0.18 : this.segLen, 0);
      parent.addChild(pivot);
      const r = 0.017 * (1 - (i / SEGMENTS) * 0.75);
      part(pivot, 'cylinder', this.blank, [r, this.segLen, r], [0, this.segLen / 2, 0]);
      if (i % 2 === 1) part(pivot, 'torus', this.guide, [0.03, 0.03, 0.03], [0, this.segLen * 0.9, 0.012], [90, 0, 0]);
      this.pivots.push(pivot);
      parent = pivot;
    }
    this.tip = new pc.Entity('tip');
    this.tip.setLocalPosition(0, this.segLen, 0);
    parent.addChild(this.tip);

    this.bend = 0;
    this.side = 0;
    this.lift = 0;
    this.whip = 0;
    this.shake = 0;
    this.spin = 0;
  }

  // load: 0..1+ of the rod's limit; side: -1..1 toward the fish; lift: 0..1 rod raised.
  update(dt, { load = 0, side = 0, lift = 0, reeling = 0, whip = 0, twitch = 0 }) {
    this.bend += (Math.min(load, 1.3) - this.bend) * Math.min(1, dt * 10);
    this.side += (side - this.side) * Math.min(1, dt * 4);
    this.lift += (lift - this.lift) * Math.min(1, dt * 6);
    this.whip = whip;
    this.spin += reeling * dt * 14;
    const t = performance.now() / 1000;
    const jitter = (this.bend > 0.5 ? (this.bend - 0.5) * 0.6 : 0) * Math.sin(t * 37) + twitch * Math.sin(t * 50);
    this.root.setLocalEulerAngles(-58 - this.lift * 22 + this.whip * 70, -3 + this.side * 18, 0);
    const per = (-this.bend * 70) / SEGMENTS;
    this.pivots.forEach((p, i) => {
      const w = Math.pow((i + 1) / SEGMENTS, 1.6) * 2;
      p.setLocalEulerAngles(per * w + jitter * w * 2, 0, -this.side * this.bend * w * 3);
    });
    this.handle.setLocalEulerAngles(this.spin * 57.3, 0, 0);
    // Keep the rod on screen in portrait.
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.root.setLocalPosition(aspect < 1 ? 0.2 : 0.4, -0.52, -0.3);
  }

  tipPosition() {
    return this.tip.getPosition();
  }
}

export class FloatBobber {
  constructor(app) {
    this.entity = new pc.Entity('float');
    part(this.entity, 'sphere', solidMaterial('#f2f2ee', { gloss: 0.6 }), [0.07, 0.09, 0.07], [0, -0.02, 0]);
    part(this.entity, 'sphere', solidMaterial('#e8402e', { gloss: 0.6, emissive: 0.25 }), [0.072, 0.07, 0.072], [0, 0.03, 0]);
    part(this.entity, 'cylinder', solidMaterial('#ffb21e', { emissive: 0.5 }), [0.012, 0.16, 0.012], [0, 0.12, 0]);
    app.root.addChild(this.entity);
    this.entity.enabled = false;
  }
}

export class Lure {
  constructor(app) {
    this.entity = new pc.Entity('lure');
    part(this.entity, 'sphere', solidMaterial('#d8dde4', { gloss: 0.9, specular: 0.9 }), [0.04, 0.03, 0.09]);
    part(this.entity, 'sphere', solidMaterial('#ff5a3a', { emissive: 0.3 }), [0.02, 0.02, 0.02], [0, 0, 0.05]);
    app.root.addChild(this.entity);
    this.entity.enabled = false;
  }
}

// A low-poly fish from primitives, coloured per species, about `model.length` units long.
// species.model: deep (body height), snout (beak length), barbels, scutes (bony back plates).
export class Effects {
  constructor(app) {
    this.app = app;
    const white = solidMaterial('#eef6ff', { opacity: 0.85, gloss: 0.8 });
    this.drops = Array.from({ length: 120 }, () => {
      const e = part(app.root, 'sphere', white, [0.05, 0.05, 0.05]);
      e.enabled = false;
      return { e, v: new pc.Vec3(), life: 0 };
    });
    this.rings = Array.from({ length: 20 }, () => {
      const m = solidMaterial('#dfefff', { opacity: 0.6, gloss: 0.9 });
      const e = part(app.root, 'torus', m, [1, 0.05, 1]);
      e.enabled = false;
      return { e, m, life: 0, size: 1, max: 1 };
    });
  }

  splash(pos, strength = 1) {
    let n = Math.round(8 + strength * 12);
    for (const d of this.drops) {
      if (n <= 0) break;
      if (d.life > 0) continue;
      d.life = 0.5 + Math.random() * 0.5;
      d.e.enabled = true;
      d.e.setPosition(pos.x, 0.05, pos.z);
      const a = Math.random() * Math.PI * 2;
      const sp = (0.6 + Math.random()) * strength;
      d.v.set(Math.cos(a) * sp, 2 + Math.random() * 2.5 * strength, Math.sin(a) * sp);
      const s = 0.03 + Math.random() * 0.06 * strength;
      d.e.setLocalScale(s, s, s);
      n -= 1;
    }
    this.ripple(pos, 0.6 + strength);
  }

  ripple(pos, max = 1) {
    const r = this.rings.find((x) => x.life <= 0) || this.rings[0];
    r.life = 1.4;
    r.max = max;
    r.e.enabled = true;
    r.e.setPosition(pos.x, 0.03, pos.z);
  }

  update(dt) {
    for (const d of this.drops) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.v.y -= 9.8 * dt;
      const p = d.e.getPosition();
      d.e.setPosition(p.x + d.v.x * dt, p.y + d.v.y * dt, p.z + d.v.z * dt);
      if (d.life <= 0 || p.y < -0.1) {
        d.life = 0;
        d.e.enabled = false;
      }
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const t = 1 - r.life / 1.4;
      const s = 0.2 + t * r.max * 2.4;
      r.e.setLocalScale(s, 0.02, s);
      r.m.opacity = 0.55 * (1 - t);
      r.m.update();
      if (r.life <= 0) r.e.enabled = false;
    }
  }
}
