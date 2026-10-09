// The fish finder: what a sonar shows along your cast line. It reads the same density, depth,
// time, weather and event numbers the bite model uses, so the arcs are where fish really feed.
import { speciesById } from './data.js';
import { forward } from './waters.js';
import { timeMultiplier } from './world.js';
import { eventMultiplier } from './events.js';
import { createRng } from './random.js';

const ARC_RATE = 0.06; // arcs per metre for a fully active, density-1 species

export function sonar({ water, spot, pose, yaw, hour, weather, events, minute, reach = 45, buckets = 30 }) {
  const f = forward(yaw);
  const step = reach / buckets;
  // Stable for a few game minutes and a given aim, so the picture doesn't flicker.
  const seed = (Math.floor(minute / 3) * 7919 + Math.round(yaw * 20) * 104729) >>> 0;
  const rng = createRng(seed);
  const bottom = [];
  const fish = [];
  for (let i = 0; i < buckets; i += 1) {
    const dist = (i + 0.5) * step;
    const x = pose.x + f.x * dist;
    const z = pose.z + f.z * dist;
    const depth = water.shape.depthAt(x, z);
    bottom.push({ dist, depth });
    for (const [id, density] of Object.entries(spot.density)) {
      const roll = rng();
      const at = rng();
      if (depth < 0.3) continue;
      const s = speciesById(id);
      if (s.depth[0] > depth + 1) continue;
      const activity = density * timeMultiplier(s.time, hour) * (s.weather[weather] ?? 1) * eventMultiplier(events, id, x, z);
      if (roll >= activity * ARC_RATE * step) continue;
      const lo = Math.min(s.depth[0], depth - 0.2);
      const hi = Math.min(s.depth[1], depth - 0.2);
      fish.push({ dist, depth: Math.max(0.2, lo + at * Math.max(0, hi - lo)), species: id, size: Math.sqrt(s.weight.median), legendary: s.rarity === 'legendary' });
    }
  }
  return { bottom, fish, reach };
}
