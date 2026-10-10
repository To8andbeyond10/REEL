// Boat models from primitives. The angler's seat is the model's origin and the bow points to -z,
// so the camera sits in the seat and looks over the bow.
import * as pc from 'playcanvas';
import { solidMaterial } from './geometry.js';

function part(parent, type, material, scale, pos = [0, 0, 0], euler = [0, 0, 0]) {
  const e = new pc.Entity(type);
  e.addComponent('render', { type, material, castShadows: false, receiveShadows: true });
  e.setLocalScale(...scale);
  e.setLocalPosition(...pos);
  e.setLocalEulerAngles(...euler);
  parent.addChild(e);
  return e;
}

function kayak(root) {
  const hull = solidMaterial('#f5a524', { gloss: 0.7, specular: 0.4 });
  const deck = solidMaterial('#1f2a33', { gloss: 0.4 });
  const trim = solidMaterial('#e8e3d8', { gloss: 0.5 });
  const blade = solidMaterial('#39ff6a', { gloss: 0.6, emissive: 0.15 });
  // Long, narrow hull: an ellipsoid half under the water, seat a little behind the middle.
  part(root, 'sphere', hull, [0.78, 0.42, 4.1], [0, 0.02, -0.45]);
  part(root, 'sphere', trim, [0.8, 0.06, 4.12], [0, 0.16, -0.45]);
  // Cockpit rim and the deck lines on the bow.
  part(root, 'cylinder', deck, [0.58, 0.06, 0.95], [0, 0.2, 0.05]);
  part(root, 'box', deck, [0.03, 0.02, 1.4], [0.18, 0.21, -1.4], [0, 4, 0]);
  part(root, 'box', deck, [0.03, 0.02, 1.4], [-0.18, 0.21, -1.4], [0, -4, 0]);
  // Paddle resting across the deck in front of you.
  part(root, 'cylinder', deck, [0.035, 2.1, 0.035], [0, 0.26, -0.75], [0, 0, 90]);
  part(root, 'box', blade, [0.03, 0.42, 0.17], [1.08, 0.26, -0.75], [0, 0, 90]);
  part(root, 'box', blade, [0.03, 0.42, 0.17], [-1.08, 0.26, -0.75], [0, 0, 90]);
}

function bassBoat(root) {
  const hull = solidMaterial('#6b2bd9', { gloss: 0.85, specular: 0.7 });
  const stripe = solidMaterial('#f5c542', { gloss: 0.8, specular: 0.6, emissive: 0.1 });
  const deck = solidMaterial('#6e7680', { gloss: 0.15 });
  const seat = solidMaterial('#e8e3d8', { gloss: 0.4 });
  const metal = solidMaterial('#1a1d22', { gloss: 0.7, specular: 0.5 });
  // Hull: a wide ellipsoid sitting low, with the seat towards the stern and a flat casting deck on top.
  part(root, 'sphere', hull, [2.2, 0.8, 6.2], [0, -0.05, -1.6]);
  part(root, 'sphere', stripe, [2.24, 0.08, 6.26], [0, 0.22, -1.6]);
  part(root, 'box', deck, [1.75, 0.08, 4.2], [0, 0.4, -1.7]);
  part(root, 'box', stripe, [0.06, 0.1, 3.6], [0.9, 0.46, -1.7]);
  part(root, 'box', stripe, [0.06, 0.1, 3.6], [-0.9, 0.46, -1.7]);
  // Console with a windscreen just ahead on your right, as on a real bass boat; seat under you.
  part(root, 'box', metal, [0.42, 0.34, 0.5], [0.62, 0.6, -1.05]);
  part(root, 'box', solidMaterial('#9fd3ff', { opacity: 0.35, gloss: 0.95 }), [0.42, 0.18, 0.03], [0.62, 0.86, -1.3], [-25, 0, 0]);
  part(root, 'cylinder', seat, [0.5, 0.12, 0.5], [0, 0.5, 0.15]);
  part(root, 'box', seat, [0.5, 0.45, 0.1], [0, 0.78, 0.42]);
  // Outboard motor on the transom.
  part(root, 'box', metal, [0.42, 0.55, 0.45], [0, 0.65, 1.55]);
  part(root, 'cylinder', metal, [0.12, 0.8, 0.12], [0, 0.05, 1.62]);
  // Trolling motor on the bow.
  part(root, 'cylinder', metal, [0.04, 1.0, 0.04], [0, 0.5, -4.4]);
}

export class BoatModel {
  constructor(app) {
    this.app = app;
    this.entity = new pc.Entity('boat');
    app.root.addChild(this.entity);
    this.entity.enabled = false;
    this.variant = null;
    this.body = null;
  }

  show(id) {
    if (this.variant !== id) {
      this.body?.destroy();
      this.body = new pc.Entity(id);
      this.entity.addChild(this.body);
      if (id === 'boat-bass') bassBoat(this.body);
      else kayak(this.body);
      this.variant = id;
    }
    this.entity.enabled = true;
  }

  hide() {
    this.entity.enabled = false;
  }

  // Follows the boat, with a gentle bob and roll on the waves; harder when moving or in wind.
  update(boat, t, wind = 0) {
    const chop = 0.5 + Math.min(1, Math.abs(boat.speed) / 4) + wind;
    const bob = Math.sin(t * 1.7) * 0.025 * chop;
    const pitch = Math.sin(t * 1.3 + 0.7) * 0.8 * chop - Math.min(3, boat.speed * 0.35);
    const roll = Math.sin(t * 1.1) * 1.1 * chop;
    this.entity.setPosition(boat.x, bob, boat.z);
    this.entity.setEulerAngles(pitch, (boat.heading * 180) / Math.PI, roll);
    return bob;
  }
}
