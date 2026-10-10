/**
 * REEL cast economy: every tunable number lives here.
 * Money is USD. Values written as "×" are multiples of the stake of the cast that produced them.
 */

export type SpeciesId =
  | 'boot' | 'minnow' | 'perch' | 'bass' | 'trout' | 'salmon' | 'pike'
  | 'catfish' | 'tuna' | 'swordfish' | 'marlin' | 'shark' | 'whale';

/** Base value of each catch (× stake). The paid value is scaled by a size roll, see `sizeSpread`. */
export const SPECIES: Record<SpeciesId, { name: string; mult: number }> = {
  boot: { name: 'Old Boot', mult: 0.2 },
  minnow: { name: 'Minnow', mult: 0.5 },
  perch: { name: 'Perch', mult: 1 },
  bass: { name: 'Bass', mult: 2 },
  trout: { name: 'Trout', mult: 3 },
  salmon: { name: 'Salmon', mult: 5 },
  pike: { name: 'Pike', mult: 10 },
  catfish: { name: 'Catfish', mult: 20 },
  tuna: { name: 'Bluefin Tuna', mult: 50 },
  swordfish: { name: 'Swordfish', mult: 100 },
  marlin: { name: 'Marlin', mult: 250 },
  shark: { name: 'Great White', mult: 1_000 },
  whale: { name: 'Golden Whale', mult: 5_000 },
};

export type ModeConfig = {
  name: string;
  /** Target game RTP, jackpots included. Changing it rescales every bite rate and keeps the shape. */
  rtp: number;
  /** Hard cap on one cast's win (catch, Frenzy or Chest; jackpots excluded), × stake. Also sets bankroll limits. */
  maxWinX: number;
  /** Catch value = mult × uniform(1 − s, 1 + s). The mean stays 1, so RTP doesn't move. */
  sizeSpread: number;
  /** Relative catch weights. Only the ratios matter; the solver scales them to hit `rtp`. */
  weights: Partial<Record<SpeciesId, number>>;
  /** How the non-jackpot RTP is divided between plain catches, Feeding Frenzy and Treasure Chest. Sums to 1. */
  split: { catch: number; frenzy: number; chest: number };
  /** Hot Spot (the Top Slot idea): before a cast, one eligible species may get a multiplier. */
  hotSpot: { chance: number; minMult: number; maxMult: number; mults: Array<[x: number, weight: number]> };
  /** Feeding Frenzy free casts: multiplier starts at 1× and grows by `multStep` after every catch. */
  frenzy: { casts: number; biteRate: number; multStep: number; maxSpeciesMult: number };
  /** Treasure Chest pick-one prizes (× stake), each equally likely. */
  chest: number[];
};

export const MODES = {
  shallows: {
    name: 'Shallows',
    rtp: 0.965,
    maxWinX: 500,
    sizeSpread: 0.25,
    weights: { boot: 1000, minnow: 1300, perch: 1700, bass: 800, trout: 360, salmon: 150, pike: 45, catfish: 12 },
    split: { catch: 0.84, frenzy: 0.11, chest: 0.05 },
    hotSpot: { chance: 0.25, minMult: 1, maxMult: 20, mults: [[2, 60], [3, 30], [5, 10]] },
    frenzy: { casts: 8, biteRate: 0.9, multStep: 0.5, maxSpeciesMult: 20 },
    chest: [2, 3, 4, 5, 6, 8, 10, 15],
  },
  openSea: {
    name: 'Open Sea',
    rtp: 0.96,
    maxWinX: 5_000,
    sizeSpread: 0.25,
    weights: {
      boot: 800, minnow: 1000, perch: 1500, bass: 800, trout: 380, salmon: 170, pike: 55,
      catfish: 20, tuna: 5.5, swordfish: 1.8, marlin: 0.45, shark: 0.07,
    },
    split: { catch: 0.74, frenzy: 0.18, chest: 0.08 },
    hotSpot: { chance: 0.2, minMult: 1, maxMult: 100, mults: [[2, 50], [3, 25], [5, 15], [10, 7], [25, 3]] },
    frenzy: { casts: 10, biteRate: 0.85, multStep: 1, maxSpeciesMult: 250 },
    chest: [5, 5, 8, 10, 10, 15, 20, 25, 50, 75, 100, 250],
  },
  abyss: {
    name: 'Abyss',
    rtp: 0.955,
    maxWinX: 25_000,
    sizeSpread: 0.25,
    weights: {
      perch: 1800, bass: 900, trout: 300, salmon: 130, pike: 50, catfish: 20, tuna: 6.5,
      swordfish: 2, marlin: 0.6, shark: 0.09, whale: 0.014,
    },
    split: { catch: 0.68, frenzy: 0.22, chest: 0.1 },
    hotSpot: {
      chance: 0.15, minMult: 1, maxMult: 100,
      mults: [[2, 40], [3, 25], [5, 18], [10, 10], [25, 5], [50, 1.5], [100, 0.5]],
    },
    frenzy: { casts: 10, biteRate: 0.7, multStep: 2, maxSpeciesMult: 1_000 },
    chest: [10, 15, 20, 25, 40, 50, 75, 100, 150, 250, 500, 1_000],
  },
} satisfies Record<string, ModeConfig>;

export type ModeKey = keyof typeof MODES;

/**
 * Progressive jackpots shared by every mode. Each stake feeds `contribution` into the pot. Pots are escrowed
 * player money: a jackpot win never touches the house bankroll (only the reseed does).
 *  - `hitEvery`: a cast hits with probability stake / hitEvery, so every dollar has the same odds at any bait.
 *  - `mustDropBy`: drops at a uniformly random point before the cap. Decided cast by cast from the cast's own
 *    fair roll (chance = this cast's contribution / room left under the cap), so nobody, owner included,
 *    knows in advance when it will go.
 */
export type JackpotTier = { id: string; name: string; seed: number; contribution: number } & (
  | { hitEvery: number }
  | { mustDropBy: number }
);

export const JACKPOTS: JackpotTier[] = [
  { id: 'mini', name: 'Golden Minnow', seed: 5, contribution: 0.0025, hitEvery: 5_000 },
  { id: 'major', name: 'Silver Marlin', seed: 250, contribution: 0.0025, mustDropBy: 2_500 },
  { id: 'grand', name: 'Kraken', seed: 5_000, contribution: 0.005, hitEvery: 10_000_000 },
];

/** No paytable, base or tide, may be compiled outside these bounds. */
export const RTP_LIMITS = { floor: 0.94, ceiling: 0.985 };

export type Tide = {
  name: string;
  /** Added to the mode's RTP. */
  rtpDelta: number;
  /** Volatility at the same RTP: weights × mult^tilt. Positive = fewer bites, bigger fish; negative = the reverse. */
  tilt: number;
  /** Multiplies the Hot Spot chance; the solver pays for it by trimming bite rates, so RTP doesn't move. */
  hotChanceX: number;
};

/**
 * Tides: pre-published variants of every mode that the owner can schedule (see schedule.ts). Extra RTP in
 * a tide is paid from FLYWHEEL.promos; volatility-only tides cost nothing.
 */
export const TIDES = {
  normal: { name: 'Normal', rtpDelta: 0, tilt: 0, hotChanceX: 1 },
  feedingTime: { name: 'Feeding Time', rtpDelta: 0, tilt: -0.15, hotChanceX: 1.5 },
  storm: { name: 'Storm', rtpDelta: 0, tilt: 0.2, hotChanceX: 1 },
  goldenHour: { name: 'Golden Hour', rtpDelta: 0.01, tilt: 0, hotChanceX: 1 },
  lowTide: { name: 'Low Tide', rtpDelta: -0.01, tilt: 0, hotChanceX: 1 },
} satisfies Record<string, Tide>;

export type TideKey = keyof typeof TIDES;

/** What the owner can and can't do with the tide schedule. */
export const SCHEDULE_RULES = {
  minNoticeMinutes: 15, // windows must be public this long before they start
  maxWindowHours: 12,
  maxWindowsPerModePerDay: 6,
  maxBelowBaseHoursPerDay: 4, // total hours per mode per UTC day in tides with rtpDelta < 0
};

export const PRICING = {
  /** Price of one cast at the cheapest bait. */
  baseCast: 0.1,
  /** Bait = bet size. Payouts scale linearly, so RTP is identical at every bait. */
  baits: [
    { name: 'Worm', x: 1 },
    { name: 'Cricket', x: 2 },
    { name: 'Shrimp', x: 5 },
    { name: 'Squid', x: 10 },
    { name: 'Crab', x: 20 },
    { name: 'Eel', x: 50 },
    { name: 'Golden Lure', x: 100 },
    { name: 'Diamond Lure', x: 250 },
    { name: 'Whale Bait', x: 500 },
    { name: 'Kraken Bait', x: 1_000 },
  ],
  /** Bonus casts on fresh deposits only, never on recast winnings (that would raise RTP on all turnover). */
  bundleBonus: [
    { min: 0, bonus: 0 },
    { min: 20, bonus: 0.005 },
    { min: 50, bonus: 0.01 },
    { min: 100, bonus: 0.02 },
    { min: 500, bonus: 0.03 },
  ],
  /** Seconds per cast including animation; drives casts per hour and hourly cost. */
  castSeconds: 4,
  /** Frenzy Buy returns this much more than the mode's RTP (0 = same RTP as playing for it). */
  frenzyBuyRtpBonus: 0.002,
};

/** Where GGR (stakes − payouts − jackpot contributions) goes. Shares sum to 1. */
export const FLYWHEEL = {
  rakeback: 0.12, // VIP rakeback, paid as casts
  bundleBonus: 0.08, // funds PRICING.bundleBonus
  promos: 0.1, // Golden Hour tides, open derbies, drops
  referrals: 0.1, // rev-share paid to referrers
  buyback: 0.15, // REEL buyback/burn or holder rewards; route to `reserve` if there's no token
  reserve: 0.15, // bankroll growth, which unlocks bigger baits (see maxStake)
  operations: 0.3, // licence, RNG certification, infra, team, marketing
};

export const RISK = {
  /** The biggest possible single win may be at most this share of the bankroll. */
  maxHitShare: 0.02,
  /** Lifetime risk-of-ruin target per mode (diffusion approximation). */
  ruinTarget: 1e-6,
};

export const DERBY = {
  /** Buy-in derby: pari-mutuel, the house keeps only the rake, so it carries no bankroll risk. RTP = 1 − rake. */
  buyIn: { rake: 0.05, paidShare: 0.15, minCashX: 1.5, curve: 1.1 },
  /** Open derby on normal casts, ranked by best single-catch ×. The pool comes out of FLYWHEEL.promos. */
  open: { poolShareOfTurnover: 0.005, guarantee: 250, paidPlaces: 25, curve: 1 },
};
