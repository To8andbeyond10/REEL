// The angler's wallet, gear, bag, journal, missions and level. Saved to the browser.
import { ELECTRONICS, LINES, LURES, REELS, RODS, byId } from './data.js';
import { spotById, waterById } from './waters.js';

export const SAVE_KEY = 'memefishing-save-v2';
export const BAG_SIZE = 6;
const START_WALLET = 150;

export function newProfile() {
  return {
    version: 2,
    wallet: START_WALLET,
    xp: 0,
    owned: ['rod-paper', 'reel-starter', 'line-mono6', 'float', 'spinner'],
    loadout: { rod: 'rod-paper', reel: 'reel-starter', line: 'line-mono6', lure: 'float' },
    floatDepth: 1.2,
    water: 'genesis',
    waters: ['genesis'],
    spots: ['dock'],
    spot: 'dock',
    bag: [],
    journal: {},
    missions: [],
    missionSeq: 0,
    brokenRod: null,
    stats: { caught: 0, released: 0, sold: 0, earned: 0, missions: 0, derbies: 0, derbyWins: 0 }
  };
}

export function loadProfile(storage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return newProfile();
    const data = JSON.parse(raw);
    if (data.version !== 2) return newProfile();
    const fresh = newProfile();
    const profile = { ...fresh, ...data, stats: { ...fresh.stats, ...data.stats } };
    if (!spotById(profile.spot)) profile.spot = 'dock';
    return profile;
  } catch {
    return newProfile();
  }
}

export function saveProfile(storage, profile) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(profile));
  } catch {
    // Private browsing or storage full: keep playing without saving.
  }
}

// Level n needs 120 * (n - 1)^1.6 total XP.
export function levelOf(xp) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level += 1;
  return level;
}
export const xpForLevel = (level) => (level <= 1 ? 0 : Math.round(120 * Math.pow(level - 1, 1.6)));

export function catchXp(species, weight, released) {
  const rarity = { common: 1, uncommon: 1.8, legendary: 6 }[species.rarity];
  const base = 10 + 14 * rarity * Math.sqrt(weight / species.weight.median);
  return Math.round(base * (released ? 1.6 : 1));
}

export function gear(profile) {
  const l = profile.loadout;
  return { rod: byId(RODS, l.rod), reel: byId(REELS, l.reel), line: byId(LINES, l.line), lure: byId(LURES, l.lure) };
}

export const ALL_GEAR = [
  ...RODS.map((g) => ({ ...g, slot: 'rod' })),
  ...REELS.map((g) => ({ ...g, slot: 'reel' })),
  ...LINES.map((g) => ({ ...g, slot: 'line' })),
  ...LURES.map((g) => ({ ...g, slot: 'lure' })),
  ...ELECTRONICS.map((g) => ({ ...g, slot: 'electronics' }))
];

export const owns = (profile, id) => profile.owned.includes(id);

export function canBuy(profile, item) {
  if (profile.owned.includes(item.id)) return { ok: false, why: 'Owned' };
  if (levelOf(profile.xp) < item.level) return { ok: false, why: `Level ${item.level}` };
  if (profile.wallet < item.price) return { ok: false, why: 'Not enough REEL' };
  return { ok: true };
}

export function buy(profile, item) {
  if (!canBuy(profile, item).ok) return false;
  profile.wallet -= item.price;
  profile.owned.push(item.id);
  if (item.slot !== 'electronics') profile.loadout[item.slot] = item.id;
  return true;
}

// Walking to another spot on the same water.
export function canTravel(profile, spot) {
  if (spot.water !== profile.water) return { ok: false, why: 'Other water' };
  if (profile.spots.includes(spot.id)) return { ok: true };
  if (levelOf(profile.xp) < spot.level) return { ok: false, why: `Level ${spot.level}` };
  if (profile.wallet < spot.price) return { ok: false, why: `${spot.price} REEL` };
  return { ok: true, cost: spot.price };
}

export function travel(profile, spotId) {
  const spot = spotById(spotId);
  const check = canTravel(profile, spot);
  if (!check.ok) return false;
  if (!profile.spots.includes(spot.id)) {
    profile.wallet -= check.cost || 0;
    profile.spots.push(spot.id);
  }
  profile.spot = spot.id;
  return true;
}

// Bridging to another water costs a gas fee every trip (home is free).
export function canBridge(profile, waterId) {
  const water = waterById(waterId);
  if (profile.water === waterId) return { ok: false, why: 'You are here' };
  if (levelOf(profile.xp) < water.level) return { ok: false, why: `Level ${water.level}` };
  if (profile.wallet < water.gas) return { ok: false, why: `${water.gas} REEL gas` };
  return { ok: true, cost: water.gas };
}

export function bridge(profile, waterId) {
  const check = canBridge(profile, waterId);
  if (!check.ok) return false;
  const water = waterById(waterId);
  profile.wallet -= check.cost;
  profile.water = waterId;
  if (!profile.waters.includes(waterId)) profile.waters.push(waterId);
  const first = water.spots[0];
  if (!profile.spots.includes(first.id)) profile.spots.push(first.id);
  profile.spot = first.id;
  return true;
}

export function recordCatch(profile, species, weight) {
  const entry = profile.journal[species.id] || { count: 0, best: 0 };
  entry.count += 1;
  entry.best = Math.max(entry.best, weight);
  profile.journal[species.id] = entry;
  profile.stats.caught += 1;
}

export const repairCost = (rod) => Math.max(20, Math.round(rod.price * 0.25));
