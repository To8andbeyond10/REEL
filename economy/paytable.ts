/**
 * Turns a ModeConfig into exact per-cast probabilities that hit the target RTP.
 *
 * RTP is a budget: RTP = jackpots + catches + frenzy + chest. Each component k gets its share of the
 * non-jackpot budget R = rtp − jackpotRtp and the solver sets its frequency to p_k = R · split_k / E[payout_k].
 * Whatever probability is left over is an empty cast.
 */
import { createHash } from 'node:crypto';
import {
  JACKPOTS,
  PRICING,
  RTP_LIMITS,
  SPECIES,
  TIDES,
  type JackpotTier,
  type ModeConfig,
  type SpeciesId,
  type TideKey,
} from './config.ts';

/** `rtp` is this catch's contribution to the mode's RTP, Hot Spot boosts included. */
export type CatchRow = { id: SpeciesId; name: string; mult: number; prob: number; rtp: number; hotEligible: boolean };

export type CompiledMode = {
  /** e.g. "openSea/storm"; recorded on every cast together with `hash`. */
  id: string;
  key: string;
  tide: TideKey;
  name: string;
  /** SHA-256 of the canonical paytable. Publish it; players can check every cast against it. */
  hash: string;
  rtp: number;
  maxWinX: number;
  sizeSpread: number;
  catches: CatchRow[];
  pFrenzy: number;
  pChest: number;
  pNothing: number;
  /** Cumulative probabilities over [...catches, frenzy, chest]; a roll above the last entry is an empty cast. */
  cdf: number[];
  /** Same table with Chum on: Frenzy odds doubled, taken from empty casts. */
  chumCdf: number[];
  hot: { chance: number; species: SpeciesId[]; mults: number[]; cdf: number[] };
  frenzy: {
    casts: number;
    biteRate: number;
    multStep: number;
    species: SpeciesId[];
    mults: number[];
    cdf: number[];
    ev: number;
    sd: number;
  };
  chest: { prizes: number[]; ev: number };
  stats: {
    rtpJackpot: number;
    rtpCatch: number;
    rtpFrenzy: number;
    rtpChest: number;
    /** Share of casts that catch anything (features included). */
    hitRate: number;
    /** Standard deviation of one cast's house-paid return (jackpots excluded; they are pot-funded), × stake. */
    sd: number;
    /** Largest win a single plain catch can produce, × stake. */
    maxCatchX: number;
    /** "Chum the water": cost multiplier for doubled Frenzy odds that leaves RTP unchanged. */
    chumCostX: number;
    /** Price of a Frenzy Buy, × stake, and the RTP it returns. */
    frenzyBuyX: number;
    frenzyBuyRtp: number;
  };
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const running = (ps: number[]) => {
  let acc = 0;
  return ps.map((p) => (acc += p));
};

const cumulative = (ws: number[]) => running(ws.map((w) => w / sum(ws)));

/**
 * Long-run return per $ staked from one jackpot tier: contributions plus house-funded reseeds (renewal-reward).
 * A must-drop pot drops at a uniform point in [seed, cap], i.e. after (cap − seed) / (2 · contribution) wagered.
 */
export const tierRtp = (j: JackpotTier) =>
  'hitEvery' in j ? j.contribution + j.seed / j.hitEvery : (j.contribution * (j.mustDropBy + j.seed)) / (j.mustDropBy - j.seed);

/** Average pot size when the tier pays out. */
export const tierAvgPot = (j: JackpotTier) =>
  'hitEvery' in j ? j.seed + j.contribution * j.hitEvery : (j.seed + j.mustDropBy) / 2;

/** Average $ wagered (all players, all modes) between payouts of a tier. */
export const tierTurnoverPerHit = (j: JackpotTier) =>
  'hitEvery' in j ? j.hitEvery : (j.mustDropBy - j.seed) / (2 * j.contribution);

export const jackpotRtp = () => sum(JACKPOTS.map(tierRtp));

/**
 * Mean and SD of a Feeding Frenzy payout, × stake. Exact backward recursion over the number of catches so far
 * (multiplier = 1 + catches · step). `ev`/`ev2` are the first/second moments of a single caught fish.
 */
export function frenzyMoments(casts: number, bite: number, step: number, ev: number, ev2: number) {
  let a = new Array<number>(casts + 2).fill(0);
  let b = new Array<number>(casts + 2).fill(0);
  for (let t = casts - 1; t >= 0; t--) {
    const na = new Array<number>(casts + 2).fill(0);
    const nb = new Array<number>(casts + 2).fill(0);
    for (let j = 0; j <= t; j++) {
      const k = 1 + j * step;
      na[j] = bite * (k * ev + a[j + 1]) + (1 - bite) * a[j];
      nb[j] = bite * (k * k * ev2 + 2 * k * ev * a[j + 1] + b[j + 1]) + (1 - bite) * b[j];
    }
    a = na;
    b = nb;
  }
  return { mean: a[0], sd: Math.sqrt(Math.max(0, b[0] - a[0] ** 2)) };
}

/** Compiles a mode under a tide. Throws if the result would fall outside RTP_LIMITS. */
export function compileMode(key: string, cfg: ModeConfig, tide: TideKey = 'normal'): CompiledMode {
  const t = TIDES[tide];
  const rtp = cfg.rtp + t.rtpDelta;
  if (rtp < RTP_LIMITS.floor - 1e-12 || rtp > RTP_LIMITS.ceiling + 1e-12) {
    throw new Error(`${cfg.name}/${tide}: RTP ${rtp} is outside ${RTP_LIMITS.floor}–${RTP_LIMITS.ceiling}`);
  }
  const jp = jackpotRtp();
  const budget = rtp - jp;
  const size2 = 1 + cfg.sizeSpread ** 2 / 3; // E[size²] for a uniform size roll with mean 1

  const hotXs = cfg.hotSpot.mults.map(([x]) => x);
  const hotWs = cfg.hotSpot.mults.map(([, w]) => w);
  const hotEx = sum(hotXs.map((x, i) => x * hotWs[i])) / sum(hotWs);
  const hotEx2 = sum(hotXs.map((x, i) => x * x * hotWs[i])) / sum(hotWs);
  const hotChance = Math.min(1, cfg.hotSpot.chance * t.hotChanceX);

  const rows = (Object.entries(cfg.weights) as [SpeciesId, number][]).map(([id, w]) => {
    const mult = SPECIES[id].mult;
    return { id, w: w * mult ** t.tilt, mult, hotEligible: mult >= cfg.hotSpot.minMult && mult <= cfg.hotSpot.maxMult };
  });
  const hotSpecies = rows.filter((r) => r.hotEligible).map((r) => r.id);
  // Chance that a given eligible species is the boosted one on a cast.
  const hotEach = hotChance / hotSpecies.length;
  const hotMean = (eligible: boolean) => (eligible ? 1 + hotEach * (hotEx - 1) : 1);
  const hotSecond = (eligible: boolean) => (eligible ? 1 + hotEach * (hotEx2 - 1) : 1);

  // Plain catches: one scale factor turns the relative weights into probabilities.
  const rtpCatch = budget * cfg.split.catch;
  const scale = rtpCatch / sum(rows.map((r) => r.w * r.mult * hotMean(r.hotEligible)));
  const catches: CatchRow[] = rows.map((r) => ({
    id: r.id,
    name: SPECIES[r.id].name,
    mult: r.mult,
    prob: r.w * scale,
    rtp: r.w * scale * r.mult * hotMean(r.hotEligible),
    hotEligible: r.hotEligible,
  }));

  // Feeding Frenzy draws from the same weights, minus anything above maxSpeciesMult.
  const fRows = rows.filter((r) => r.mult <= cfg.frenzy.maxSpeciesMult);
  const fW = sum(fRows.map((r) => r.w));
  const fEv = sum(fRows.map((r) => r.w * r.mult)) / fW;
  const fEv2 = (sum(fRows.map((r) => r.w * r.mult ** 2)) / fW) * size2;
  const frenzy = frenzyMoments(cfg.frenzy.casts, cfg.frenzy.biteRate, cfg.frenzy.multStep, fEv, fEv2);
  const rtpFrenzy = budget * cfg.split.frenzy;
  const pFrenzy = rtpFrenzy / frenzy.mean;

  const chestEv = sum(cfg.chest) / cfg.chest.length;
  const rtpChest = budget * cfg.split.chest;
  const pChest = rtpChest / chestEv;

  const pCatch = sum(catches.map((c) => c.prob));
  const pNothing = 1 - pCatch - pFrenzy - pChest;
  if (pNothing < pFrenzy) {
    throw new Error(`${cfg.name}/${tide}: only ${(pNothing * 100).toFixed(1)}% of casts are empty; lower weights on cheap fish`);
  }

  const second =
    sum(catches.map((c) => c.prob * c.mult ** 2 * size2 * hotSecond(c.hotEligible))) +
    pFrenzy * (frenzy.sd ** 2 + frenzy.mean ** 2) +
    pChest * (sum(cfg.chest.map((x) => x * x)) / cfg.chest.length);
  const sd = Math.sqrt(second - budget ** 2);

  const maxCatchX = Math.max(
    ...catches.map((c) => c.mult * (1 + cfg.sizeSpread) * (c.hotEligible ? Math.max(...hotXs) : 1)),
  );
  // Rounded down to 0.1× so the buy never returns less than its target.
  const frenzyBuyX = Math.floor((frenzy.mean / (rtp + PRICING.frenzyBuyRtpBonus)) * 10) / 10;

  const id = `${key}/${tide}`;
  const table = {
    id,
    rtp,
    maxWinX: cfg.maxWinX,
    sizeSpread: cfg.sizeSpread,
    catches,
    pFrenzy,
    pChest,
    pNothing,
    cdf: running([...catches.map((c) => c.prob), pFrenzy, pChest]),
    chumCdf: running([...catches.map((c) => c.prob), 2 * pFrenzy, pChest]),
    hot: { chance: hotChance, species: hotSpecies, mults: hotXs, cdf: cumulative(hotWs) },
    frenzy: {
      casts: cfg.frenzy.casts,
      biteRate: cfg.frenzy.biteRate,
      multStep: cfg.frenzy.multStep,
      species: fRows.map((r) => r.id),
      mults: fRows.map((r) => r.mult),
      cdf: cumulative(fRows.map((r) => r.w)),
      ev: frenzy.mean,
      sd: frenzy.sd,
    },
    chest: { prizes: [...cfg.chest], ev: chestEv },
  };

  return {
    ...table,
    key,
    tide,
    name: tide === 'normal' ? cfg.name : `${cfg.name} · ${t.name}`,
    hash: createHash('sha256').update(JSON.stringify(table)).digest('hex'),
    stats: {
      rtpJackpot: jp,
      rtpCatch,
      rtpFrenzy,
      rtpChest,
      hitRate: pCatch + pFrenzy + pChest,
      sd,
      maxCatchX,
      chumCostX: 1 + (pFrenzy * frenzy.mean) / rtp,
      frenzyBuyX,
      frenzyBuyRtp: frenzy.mean / frenzyBuyX,
    },
  };
}
