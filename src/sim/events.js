// Live situations that change where and what bites, so no two sessions play the same:
// - boils: a legendary is feeding at the surface somewhere you can reach
// - birds: birds diving on a bait ball; everything nearby feeds hard
// - frenzy / sulk: a coin pumps or gets rugged and its fish feed harder or go quiet
// - front: pressure is dropping before a storm and every fish feeds
import { speciesById } from './data.js';
import { forecastIn } from './world.js';
import { speciesIn } from './waters.js';
import { range } from './random.js';

export function createEvents() {
  return { list: [], lastNews: 0, nextHotspotAt: 40, seq: 0 };
}

const isHotspot = (e) => e.kind === 'boils' || e.kind === 'birds';

function add(ev, event) {
  ev.seq += 1;
  const e = { id: ev.seq, ...event };
  ev.list.push(e);
  return e;
}

function pickPoint(rng, water, poses, currentSpot) {
  const ids = Object.keys(poses);
  for (let tries = 0; tries < 30; tries += 1) {
    const id = rng() < 0.6 ? currentSpot : ids[Math.floor(rng() * ids.length)];
    const pose = poses[id];
    const yaw = pose.yaw + range(rng, -0.6, 0.6);
    const dist = range(rng, 16, 38);
    const x = pose.x - Math.sin(yaw) * dist;
    const z = pose.z - Math.cos(yaw) * dist;
    if (water.shape.depthAt(x, z) > 1) return { x, z, spot: id };
  }
  return null;
}

// Advance one game minute. Returns events that just started (for notices).
export function stepEvents(ev, { rng, minute, water, spot, world, market }) {
  const started = [];
  ev.list = ev.list.filter((e) => e.until > minute && (!isHotspot(e) || e.water === water.id));

  // The market moves the fish.
  for (const n of [...market.news].reverse()) {
    if (n.id <= ev.lastNews) continue;
    ev.lastNews = n.id;
    if (n.kind !== 'pump' && n.kind !== 'rug') continue;
    const s = speciesById(n.species);
    const here = speciesIn(water).includes(s.id);
    const e = add(ev, {
      kind: n.kind === 'pump' ? 'frenzy' : 'sulk',
      species: [s.id],
      mult: n.kind === 'pump' ? 2.5 : 0.4,
      until: minute + 90,
      text: n.kind === 'pump' ? `Feeding frenzy: $${s.ticker} pumped and ${s.name} are feeding hard` : `$${s.ticker} got rugged. ${s.name} have gone quiet`,
      tone: n.kind === 'pump' ? 'good' : 'bad'
    });
    if (here) started.push(e);
  }

  // Falling pressure before a storm.
  if (world.next === 'storm' && world.weather !== 'storm' && forecastIn(world) < 60 && !ev.list.some((e) => e.kind === 'front')) {
    started.push(add(ev, { kind: 'front', species: null, mult: 1.6, until: minute + forecastIn(world), text: 'Pressure is dropping. A storm is coming and the fish are feeding', tone: 'good' }));
  }

  // Hotspots on this water.
  if (minute >= ev.nextHotspotAt && !ev.list.some((e) => isHotspot(e) && e.water === water.id)) {
    ev.nextHotspotAt = minute + range(rng, 70, 160);
    const point = pickPoint(rng, water, water.poses, spot);
    const resident = speciesIn(water).map(speciesById);
    const legendary = resident.find((s) => s.rarity === 'legendary');
    if (point) {
      if (legendary && rng() < 0.3) {
        started.push(
          add(ev, {
            kind: 'boils',
            water: water.id,
            x: point.x,
            z: point.z,
            radius: 14,
            species: [legendary.id],
            mult: 8,
            until: minute + range(rng, 45, 80),
            text: `Whale alert: something huge is boiling off ${water.spots.find((s) => s.id === point.spot).name}`,
            tone: 'good'
          })
        );
      } else {
        started.push(
          add(ev, {
            kind: 'birds',
            water: water.id,
            x: point.x,
            z: point.z,
            radius: 16,
            species: resident.filter((s) => s.rarity !== 'legendary').map((s) => s.id),
            mult: 3,
            until: minute + range(rng, 30, 60),
            text: `Birds are diving on bait off ${water.spots.find((s) => s.id === point.spot).name}`,
            tone: 'good'
          })
        );
      }
    }
  }
  return started;
}

// How much active events boost (or cut) bites for a species at a point.
export function eventMultiplier(ev, speciesId, x, z) {
  let m = 1;
  for (const e of ev.list) {
    if (e.species && !e.species.includes(speciesId)) continue;
    if (isHotspot(e)) {
      const d = Math.hypot(x - e.x, z - e.z);
      if (d < e.radius * 2) m *= Math.pow(e.mult, Math.max(0, 1 - d / (e.radius * 2)));
    } else {
      m *= e.mult;
    }
  }
  return m;
}

export const hotspots = (ev, waterId) => ev.list.filter((e) => isHotspot(e) && e.water === waterId);
