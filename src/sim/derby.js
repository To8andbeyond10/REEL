// Derbies: scheduled 4-hour (game time) competitions on each water against rival anglers.
import { speciesById } from './data.js';
import { WATERS, waterById } from './waters.js';
import { rollWeight } from './bite.js';
import { createRng, weightedPick } from './random.js';

export const DERBY_HOURS = [7, 13, 19];
export const DERBY_LENGTH = 240;
const RIVALS = ['DiamondHandsDave', 'ser_fishalot', '0xBassMaster', 'WAGMI_Wendy', 'gm_angler', 'NGMI_Ned', 'LamboLarry', 'RugSurvivor', 'satoshi_nakatroutmoto', 'CopiumCarl'];

export const FORMATS = {
  heaviest: { label: 'Heaviest fish', unit: 'kg', score: (w) => (w.length ? Math.max(...w) : 0) },
  bag: { label: 'Best 3-fish bag', unit: 'kg', score: (w) => [...w].sort((a, b) => b - a).slice(0, 3).reduce((s, x) => s + x, 0) },
  count: { label: 'Most fish', unit: 'fish', score: (w) => w.length }
};
const FORMAT_KEYS = Object.keys(FORMATS);

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function derbyAt(waterId, day, slot) {
  const wi = WATERS.findIndex((w) => w.id === waterId);
  const start = day * 1440 + DERBY_HOURS[slot] * 60;
  return {
    id: `${waterId}-${day}-${slot}`,
    water: waterId,
    start,
    end: start + DERBY_LENGTH,
    format: FORMAT_KEYS[(day + slot + wi) % FORMAT_KEYS.length],
    fee: 20 + 20 * wi
  };
}

// The next few derbies on a water that you can still enter (running or upcoming).
export function upcomingDerbies(waterId, minute, count = 3) {
  const out = [];
  let day = Math.floor(minute / 1440);
  while (out.length < count) {
    for (let slot = 0; slot < DERBY_HOURS.length && out.length < count; slot += 1) {
      const d = derbyAt(waterId, day, slot);
      if (d.end > minute) out.push(d);
    }
    day += 1;
  }
  return out;
}

export const prizePool = (d) => d.fee * 12;
export const PAYOUT = [0.5, 0.3, 0.2];

export function register(profile, derby) {
  if (profile.derby && !profile.derby.settled) return false;
  if (profile.wallet < derby.fee) return false;
  const rng = createRng(hash(derby.id));
  const names = [...RIVALS].sort(() => rng() - 0.5).slice(0, 7);
  profile.wallet -= derby.fee;
  profile.derby = {
    ...derby,
    you: [],
    rivals: names.map((name) => ({ name, skill: 0.6 + rng() * 0.9, catches: [] })),
    settled: false
  };
  return true;
}

export const derbyActive = (d, minute) => !!d && !d.settled && minute >= d.start && minute < d.end;

// One game minute of rival fishing.
export function stepDerby(d, minute, rng) {
  if (!derbyActive(d, minute)) return;
  const water = waterById(d.water);
  const pool = {};
  // Rivals land legendaries far less often than their density suggests: they have the wrong gear too.
  for (const s of water.spots) for (const [id, dens] of Object.entries(s.density)) pool[id] = (pool[id] || 0) + dens * (speciesById(id).rarity === 'legendary' ? 0.25 : 1);
  const entries = Object.entries(pool).map(([value, weight]) => ({ value, weight }));
  for (const r of d.rivals) {
    if (rng() < 0.012 * r.skill) {
      const s = speciesById(weightedPick(rng, entries));
      r.catches.push(Math.round(rollWeight(rng, s) * (0.85 + 0.25 * r.skill) * 100) / 100);
    }
  }
}

export function derbyCatch(d, minute, waterId, weight) {
  if (!derbyActive(d, minute) || d.water !== waterId) return false;
  d.you.push(Math.round(weight * 100) / 100);
  return true;
}

export function standings(d) {
  const f = FORMATS[d.format];
  return [{ name: 'You', you: true, score: f.score(d.you) }, ...d.rivals.map((r) => ({ name: r.name, score: f.score(r.catches) }))].sort((a, b) => b.score - a.score || (a.you ? -1 : 1));
}

// Pays out once the derby is over. Returns { rank, prize, xp } or null.
export function settleDerby(profile, minute) {
  const d = profile.derby;
  if (!d || d.settled || minute < d.end) return null;
  d.settled = true;
  const table = standings(d);
  const rank = table.findIndex((r) => r.you) + 1;
  const scored = table[rank - 1].score > 0;
  const prize = scored && rank <= 3 ? Math.round(prizePool(d) * PAYOUT[rank - 1]) : 0;
  const xp = scored ? [250, 150, 100][rank - 1] || 40 : 0;
  profile.wallet += prize;
  profile.xp += xp;
  profile.stats.derbies += 1;
  if (rank === 1 && scored) profile.stats.derbyWins += 1;
  return { rank, prize, xp, format: FORMATS[d.format].label };
}

export function formatScore(d, score) {
  const f = FORMATS[d.format];
  return f.unit === 'kg' ? `${score.toFixed(2)} kg` : `${score} fish`;
}
