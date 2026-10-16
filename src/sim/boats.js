// Boats: launch from your spot, drive within the boat's range, and fish from wherever you stop.
// The water surface is y = 0. Shared by the game and the tests; no rendering here.
import { BOATS, byId } from './data.js';
import { forward } from './waters.js';

// The boat the angler has equipped, if they own it.
export function boatSpec(profile) {
  const id = profile.loadout.boat;
  return id && profile.owned.includes(id) ? byId(BOATS, id) || null : null;
}

// Deep enough to float and clear of the bank.
export const canFloat = (water, x, z) => water.shape.depthAt(x, z) >= 0.6 && water.shape.edge(x, z) < -1.5;

// The whole hull fits: the seat floats and the bow and stern are clear of the bank.
export function hullFits(water, spec, x, z, heading) {
  if (!canFloat(water, x, z)) return false;
  const f = forward(heading);
  for (const [k, len] of [[1, spec.bow || 0], [-1, spec.stern || 0]]) {
    const px = x + f.x * len * k;
    const pz = z + f.z * len * k;
    if (water.shape.depthAt(px, pz) < 0.3 || water.shape.edge(px, pz) > -0.5) return false;
  }
  return true;
}

// Puts the boat in the water a few metres past where you stand (clear of docks and ledges),
// facing out. Null if there's no water to launch on.
export function launchBoat(water, pose, spec) {
  const f = forward(pose.yaw);
  for (let d = 4; d <= 30; d += 0.5) {
    const x = pose.x + f.x * d;
    const z = pose.z + f.z * d;
    if (hullFits(water, spec, x, z, pose.yaw)) return { id: spec.id, x, z, heading: pose.yaw, speed: 0, home: { x, z }, range: spec.range, blocked: null };
  }
  return null;
}

export const distanceOut = (boat) => Math.hypot(boat.x - boat.home.x, boat.z - boat.home.z);

// One step of driving. throttle and steer are -1..1 (steer +1 turns left). Rivers push the boat
// downstream. The boat stops at the bank and at the edge of its range; boat.blocked says which.
export function stepBoat(boat, water, spec, { throttle = 0, steer = 0 }, dt) {
  const target = throttle * spec.speed * (throttle < 0 ? 0.4 : 1);
  boat.speed += (target - boat.speed) * Math.min(1, dt * (throttle ? 0.9 : 0.6));
  const turnRate = 0.35 + 0.5 * Math.min(1, Math.abs(boat.speed) / 2);
  const heading = boat.heading + steer * turnRate * dt * (boat.speed < -0.05 ? -1 : 1);
  const f = forward(heading);
  const flow = water.shape.flow(boat.x, boat.z);
  const drift = flow.speed * 0.6;
  const nx = boat.x + (f.x * boat.speed + flow.x * drift) * dt;
  const nz = boat.z + (f.z * boat.speed + flow.z * drift) * dt;
  const inRange = (x, z) => Math.hypot(x - boat.home.x, z - boat.home.z) <= boat.range;
  // Move and turn if the hull fits; otherwise just turn, just move, or hold still.
  const tries = [
    [nx, nz, heading],
    [boat.x, boat.z, heading],
    [nx, nz, boat.heading]
  ];
  boat.blocked = null;
  for (const [x, z, h] of tries) {
    if (!inRange(x, z)) {
      boat.blocked = 'range';
      continue;
    }
    if (!hullFits(water, spec, x, z, h)) {
      boat.blocked = boat.blocked || 'shore';
      continue;
    }
    const moved = x !== boat.x || z !== boat.z;
    boat.x = x;
    boat.z = z;
    boat.heading = h;
    if (moved && h === heading) boat.blocked = null;
    else boat.speed *= 0.2;
    return boat;
  }
  boat.speed *= 0.2;
  return boat;
}

// Where the angler stands while in the boat, in the same shape as a spot's pose.
export function boatPose(boat, spec) {
  return { id: 'boat', x: boat.x, z: boat.z, shoreX: boat.x, shoreZ: boat.z, ground: 0, eye: spec.eye, yaw: boat.heading };
}

// The spot whose fish you're over: the nearest one along the bank.
export function nearestSpot(water, x, z) {
  let best = null;
  let bestD = Infinity;
  for (const s of water.spots) {
    const p = water.poses[s.id];
    const d = Math.hypot(p.shoreX - x, p.shoreZ - z);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}
