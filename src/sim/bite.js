// What bites, when, and whether the strike sets the hook.
import { SPECIES } from './data.js';
import { clamp, gaussian, range, weightedPick } from './random.js';
import { timeMultiplier } from './world.js';

const BASE_RATE = 0.05; // bites per second for a perfectly matched, dense species

// Moves the lure's depth for one step. `retrieving` is the retrieve speed in m/s (0 when paused).
export function stepLureDepth(lure, depth, bottom, retrieving, floatDepth, dt) {
  if (lure.kind === 'float') return Math.min(floatDepth, bottom);
  if (lure.kind === 'bottom') return bottom;
  if (lure.topwater) return 0;
  let next = depth;
  if (retrieving > 0) {
    const pull = clamp(retrieving / lure.idealSpeed, 0, 1.6);
    const target = lure.dive * Math.min(1, pull);
    next += (target - depth) * Math.min(1, dt * (0.8 + pull));
  } else {
    next += lure.sink * dt;
  }
  return clamp(next, 0, bottom);
}

function depthMatch(species, depth) {
  const [min, max] = species.depth;
  if (depth >= min && depth <= max) return 1;
  const off = depth < min ? min - depth : depth - max;
  return Math.exp(-(off * off) / 3);
}

function actionMatch(lure, retrieving) {
  if (lure.kind !== 'lure') return 1;
  if (retrieving <= 0) return lure.pauseAppeal;
  const ratio = retrieving / lure.idealSpeed;
  return Math.exp(-((ratio - 1) ** 2) / 0.5);
}

// Weather the species tables don't mention.
const WEATHER_DEFAULT = { storm: 0.75, fog: 1.05, snow: 0.9 };

// Bites per second for each species right now. eventMult(speciesId) folds in live events.
export function biteRates({ spot, lure, line, depth, retrieving, hour, weather, sentimentBite = 1, eventMult = () => 1 }) {
  // Fog hides the line from wary fish.
  const lineShow = weather === 'fog' ? 0.4 : 1;
  return SPECIES.map((s) => {
    const density = spot.density[s.id] || 0;
    if (!density) return { species: s, rate: 0 };
    const visibility = 1 - line.visibility * s.wariness * 0.6 * lineShow;
    const rate =
      BASE_RATE *
      density *
      (s.lures[lure.id] ?? 0) *
      depthMatch(s, depth) *
      actionMatch(lure, retrieving) *
      timeMultiplier(s.time, hour) *
      (s.weather[weather] ?? WEATHER_DEFAULT[weather] ?? 1) *
      visibility *
      sentimentBite *
      eventMult(s.id);
    return { species: s, rate };
  });
}

// Rolls whether something bites during dt; returns the species or null.
export function rollBite(rng, rates, dt) {
  const total = rates.reduce((sum, r) => sum + r.rate, 0);
  if (rng() < 1 - Math.exp(-total * dt)) {
    return weightedPick(rng, rates.map((r) => ({ value: r.species, weight: r.rate })));
  }
  return null;
}

// Log-normal weight so trophies are rare.
export function rollWeight(rng, species) {
  const { min, median, max } = species.weight;
  const w = median * Math.exp(0.45 * gaussian(rng));
  return Math.round(clamp(w, min, max) * 1000) / 1000;
}

export function lengthCm(species, weight) {
  return Math.round(species.lengthK * 100 * Math.cbrt(weight));
}

export function trophyRank(species, weight) {
  const { median, max } = species.weight;
  if (weight >= median + (max - median) * 0.55) return 'Trophy';
  if (weight >= median * 1.5) return 'Big';
  return null;
}

// A bite plays out as nibbles then a take. Striking during the take sets the hook;
// striking on a nibble spooks the fish; never striking lets it drop the bait.
export function createBite(rng, species, lure) {
  const nibbles = lure.kind === 'lure' ? 0 : Math.floor(range(rng, 0, 3));
  const takeAt = lure.kind === 'lure' ? 0.05 : range(rng, 0.6, 1.6) + nibbles * 0.4;
  const takeWindow = lure.kind === 'lure' ? 0.9 : 1.3;
  return { species, t: 0, nibbles, takeAt, takeWindow, done: false };
}

export function stepBite(bite, dt) {
  bite.t += dt;
  if (bite.t > bite.takeAt + bite.takeWindow) bite.done = true;
  return bite;
}

export function biteCue(bite) {
  if (bite.t >= bite.takeAt) return 'take';
  return 'nibble';
}

// Returns { hooked, quality } for a strike at the bite's current time.
export function strike(rng, bite) {
  if (bite.t < bite.takeAt) {
    return { hooked: rng() < 0.15, quality: 0.4, early: true };
  }
  const late = (bite.t - bite.takeAt) / bite.takeWindow;
  if (late > 1) return { hooked: false, quality: 0 };
  const quality = clamp(1 - late * 0.7, 0.3, 1);
  return { hooked: rng() < 0.6 + quality * 0.38, quality };
}
