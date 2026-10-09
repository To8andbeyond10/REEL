// The angler's wallet, gear, bag, journal and level. Saved to the browser.
import { LINES, LURES, REELS, RODS, SPOTS, byId } from './data.js';

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
    spots: ['dock'],
    spot: 'dock',
    bag: [],
    journal: {},
    brokenRod: null,
    stats: { caught: 0, released: 0, sold: 0, earned: 0 }
  };
}

export function loadProfile(storage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return newProfile();
    const data = JSON.parse(raw);
    if (data.version !== 2) return newProfile();
    return { ...newProfile(), ...data };
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

// Level n needs 120 * n^1.6 total XP.
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
  ...LURES.map((g) => ({ ...g, slot: 'lure' }))
];

export function canBuy(profile, item) {
  if (profile.owned.includes(item.id)) return { ok: false, why: 'Owned' };
  if (levelOf(profile.xp) < item.level) return { ok: false, why: `Level ${item.level}` };
  if (profile.wallet < item.price) return { ok: false, why: 'Not enough MEME' };
  return { ok: true };
}

export function buy(profile, item) {
  if (!canBuy(profile, item).ok) return false;
  profile.wallet -= item.price;
  profile.owned.push(item.id);
  profile.loadout[item.slot] = item.id;
  return true;
}

export function canTravel(profile, spot) {
  if (profile.spots.includes(spot.id)) return { ok: true };
  if (levelOf(profile.xp) < spot.level) return { ok: false, why: `Level ${spot.level}` };
  if (profile.wallet < spot.price) return { ok: false, why: `${spot.price} MEME` };
  return { ok: true, cost: spot.price };
}

export function travel(profile, spotId) {
  const spot = byId(SPOTS, spotId);
  const check = canTravel(profile, spot);
  if (!check.ok) return false;
  if (check.cost) {
    profile.wallet -= check.cost;
    profile.spots.push(spot.id);
  }
  profile.spot = spot.id;
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
