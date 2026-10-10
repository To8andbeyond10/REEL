// Missions: three contracts per water at a time, refilled as you finish them.
import { LURES, speciesById } from './data.js';
import { speciesIn, waterById } from './waters.js';
import { range } from './random.js';

const PER_WATER = 3;
const RARITY = { common: 1, uncommon: 1.8, legendary: 6 };
const round = (n, step) => Math.max(step, Math.round(n / step) * step);

// Each template returns a mission for this water, or null if it doesn't fit.
const TEMPLATES = [
  (rng, water, resident) => {
    const pool = resident.filter((s) => s.rarity !== 'legendary');
    const s = pool[Math.floor(rng() * pool.length)];
    const n = s.rarity === 'common' ? 3 + Math.floor(rng() * 2) : 2;
    return { kind: 'count', species: s.id, target: n, text: `Catch ${n} ${s.name}`, reward: { meme: round(25 * n * RARITY[s.rarity], 5), xp: 20 * n } };
  },
  (rng, water, resident) => {
    const pool = resident.filter((s) => s.rarity !== 'legendary');
    const s = pool[Math.floor(rng() * pool.length)];
    const w = Math.round(s.weight.median * range(rng, 1.2, 1.5) * 10) / 10;
    return { kind: 'weight', species: s.id, minWeight: w, target: 1, text: `Land a ${s.name} over ${w} kg`, reward: { meme: round(70 * RARITY[s.rarity], 5), xp: 60 } };
  },
  (rng, water, resident) => {
    const useful = LURES.filter((l) => resident.some((s) => (s.lures[l.id] ?? 0) >= 0.7));
    const lure = useful[Math.floor(rng() * useful.length)];
    if (!lure) return null;
    return { kind: 'lure', lure: lure.id, target: 3, text: `Catch 3 fish on the ${lure.name}`, reward: { meme: 90, xp: 60 } };
  },
  () => ({ kind: 'night', target: 2, text: 'Catch 2 fish between 21:00 and 04:00', reward: { meme: 110, xp: 70 } }),
  () => ({ kind: 'release', target: 3, text: 'Release 3 fish', reward: { meme: 40, xp: 90 } }),
  () => ({ kind: 'trophy', target: 1, text: 'Land a Big or Trophy fish of any kind', reward: { meme: 150, xp: 100 } }),
  (rng) => {
    const total = round(range(rng, 150, 450), 50);
    return { kind: 'sell', target: total, text: `Sell ${total} REEL of fish in one sale`, reward: { meme: round(total * 0.25, 5), xp: 50 } };
  },
  () => ({ kind: 'pumpSell', target: 1, text: 'Sell a fish while its coin is up 10% or more in the last hour', reward: { meme: 120, xp: 60 } }),
  (rng, water, resident) => {
    const legend = resident.find((s) => s.rarity === 'legendary');
    if (!legend || rng() > 0.35) return null;
    return { kind: 'count', species: legend.id, target: 1, text: `Land the ${legend.name} of ${water.name}`, reward: { meme: 1200, xp: 600 }, legendary: true };
  }
];

export function ensureMissions(profile, waterId, rng) {
  const water = waterById(waterId);
  const resident = speciesIn(water).map(speciesById);
  const active = profile.missions.filter((m) => m.water === waterId);
  let guard = 0;
  while (active.length < PER_WATER && guard < 40) {
    guard += 1;
    const make = TEMPLATES[Math.floor(rng() * TEMPLATES.length)];
    const m = make(rng, water, resident);
    if (!m) continue;
    if (active.some((a) => a.kind === m.kind && a.species === m.species)) continue;
    profile.missionSeq += 1;
    const mission = { id: profile.missionSeq, water: waterId, progress: 0, ...m };
    profile.missions.push(mission);
    active.push(mission);
  }
  return active;
}

function complete(profile, m) {
  profile.wallet += m.reward.meme;
  profile.xp += m.reward.xp;
  profile.stats.missions += 1;
  profile.missions = profile.missions.filter((x) => x !== m);
}

function bump(profile, m, amount, done) {
  m.progress = Math.min(m.target, m.progress + amount);
  if (m.progress >= m.target) {
    complete(profile, m);
    done.push(m);
  }
}

// c: { water, species, weight, lure, hour, released, trophy }
export function missionCatch(profile, c) {
  const done = [];
  for (const m of profile.missions.filter((x) => x.water === c.water)) {
    if (m.kind === 'count' && m.species === c.species) bump(profile, m, 1, done);
    else if (m.kind === 'weight' && m.species === c.species && c.weight >= m.minWeight) bump(profile, m, 1, done);
    else if (m.kind === 'lure' && m.lure === c.lure) bump(profile, m, 1, done);
    else if (m.kind === 'night' && (c.hour >= 21 || c.hour < 4)) bump(profile, m, 1, done);
    else if (m.kind === 'release' && c.released) bump(profile, m, 1, done);
    else if (m.kind === 'trophy' && c.trophy) bump(profile, m, 1, done);
  }
  return done;
}

// s: { water, total, changes: [1h change for each fish sold] }
export function missionSell(profile, s) {
  const done = [];
  for (const m of profile.missions.filter((x) => x.water === s.water)) {
    if (m.kind === 'sell' && s.total >= m.target) bump(profile, m, m.target, done);
    else if (m.kind === 'pumpSell' && s.changes.some((c) => c >= 0.1)) bump(profile, m, 1, done);
  }
  return done;
}

export const missionLabel = (m) => {
  if (m.kind === 'sell') return m.progress >= m.target ? 'Done' : `0/${m.target} REEL`;
  return `${m.progress}/${m.target}`;
};

