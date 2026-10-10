/** $ → casts, bankroll-scaled bet limits, derby prize tables and the GGR flywheel split. */
import { DERBY, FLYWHEEL, MODES, PRICING, RISK, type ModeKey, type TideKey } from './config.ts';
import { compileMode, type CompiledMode } from './paytable.ts';

export const bundleBonus = (usd: number) =>
  PRICING.bundleBonus.filter((t) => usd >= t.min).reduce((best, t) => Math.max(best, t.bonus), 0);

/**
 * casts = ⌊ usd · (1 + bonus) / (baseCast · baitX) ⌋
 * The bonus applies only to fresh deposits (`fresh: false` for recasting winnings).
 */
export function quoteCasts(usd: number, baitX: number, { fresh = true } = {}) {
  const stake = PRICING.baseCast * baitX;
  const bonus = fresh ? bundleBonus(usd) : 0;
  const credits = usd * (1 + bonus);
  const casts = Math.floor(credits / stake + 1e-9);
  return { stake, bonus, credits, casts, bonusCasts: casts - Math.floor(usd / stake + 1e-9) };
}

export const castsPerHour = () => 3600 / PRICING.castSeconds;

/** Average cost of an hour of play: casts/hour × stake × house edge. */
export const hourlyCost = (mode: CompiledMode, stake: number) => castsPerHour() * stake * (1 - mode.rtp);

/**
 * Largest stake the bankroll can safely accept in a mode, rounded down to a bait level:
 *   min( maxHitShare · B / maxWinX ,  2 · edge · B / (sd² · ln(1/ruinTarget)) )
 * Limits rise with the bankroll; the odds never change.
 */
export function maxStake(mode: CompiledMode, bankroll: number) {
  const byBiggestHit = (RISK.maxHitShare * bankroll) / mode.maxWinX;
  const byRuin = (2 * (1 - mode.rtp) * bankroll) / (mode.stats.sd ** 2 * Math.log(1 / RISK.ruinTarget));
  const limit = Math.min(byBiggestHit, byRuin);
  const stakes = PRICING.baits.map((b) => b.x * PRICING.baseCast).filter((s) => s <= limit + 1e-9);
  return { limit, stake: stakes.length ? stakes[stakes.length - 1] : 0, byBiggestHit, byRuin };
}

/** Casts until the house is `confidence` sure to be in profit on a mode (normal approximation). */
export function castsToProfitConfidence(mode: CompiledMode, z = 2.326) {
  return Math.ceil(((z * mode.stats.sd) / (1 - mode.rtp)) ** 2);
}

/**
 * Turnover-weighted RTP, e.g. blendedRtp({ shallows: 0.3, openSea: 0.5, abyss: 0.1, derby: 0.1 }).
 * Modes and `derby` are known; pass anything else (an event, a Frenzy Buy) in `extraRtps`.
 */
export function blendedRtp(mix: Record<string, number>, extraRtps: Record<string, number> = {}) {
  const rtps: Record<string, number> = {
    ...Object.fromEntries(Object.entries(MODES).map(([k, m]) => [k, m.rtp])),
    derby: 1 - DERBY.buyIn.rake,
    ...extraRtps,
  };
  let total = 0;
  let weighted = 0;
  for (const [k, w] of Object.entries(mix)) {
    if (rtps[k] === undefined) throw new Error(`blendedRtp: no RTP known for "${k}"`);
    total += w;
    weighted += rtps[k] * w;
  }
  return weighted / total;
}

/**
 * Buy-in derby prizes: every paid place gets minCashX × fee, the rest of the pool follows place^−curve.
 * Pool = entrants · fee · (1 − rake), so the house can't lose a buy-in derby.
 */
export function derbyPayouts(entrants: number, fee: number, cfg = DERBY.buyIn) {
  const pool = entrants * fee * (1 - cfg.rake);
  let paid = Math.max(1, Math.round(entrants * cfg.paidShare));
  while (paid > 1 && paid * cfg.minCashX * fee > pool) paid--;
  const floor = Math.min(cfg.minCashX * fee, pool / paid);
  const weights = Array.from({ length: paid }, (_, i) => (i + 1) ** -cfg.curve);
  const wSum = weights.reduce((a, b) => a + b, 0);
  const prizes = weights.map((w) => Math.floor((floor + ((pool - paid * floor) * w) / wSum) * 100) / 100);
  prizes[0] += Math.round((pool - prizes.reduce((a, b) => a + b, 0)) * 100) / 100; // rounding dust to 1st
  return { pool, rake: entrants * fee - pool, prizes };
}

/** Open (free-entry) derby: pool = max(guarantee, share × derby turnover). Returns the RTP it adds. */
export function openDerby(turnover: number, cfg = DERBY.open) {
  const pool = Math.max(cfg.guarantee, cfg.poolShareOfTurnover * turnover);
  const weights = Array.from({ length: cfg.paidPlaces }, (_, i) => (i + 1) ** -cfg.curve);
  const wSum = weights.reduce((a, b) => a + b, 0);
  return { pool, rtpBoost: pool / turnover, prizes: weights.map((w) => (pool * w) / wSum) };
}

/** Splits GGR per FLYWHEEL and reports what players get back on top of the game RTP. */
export function flywheel(turnover: number, gameRtp: number, derbyEntryFees = 0) {
  const ggr = turnover * (1 - gameRtp) + derbyEntryFees * DERBY.buyIn.rake;
  const split = Object.fromEntries(Object.entries(FLYWHEEL).map(([k, share]) => [k, ggr * share])) as Record<
    keyof typeof FLYWHEEL,
    number
  >;
  const backToPlayers = split.rakeback + split.bundleBonus + split.promos;
  return { ggr, split, effectiveRtp: gameRtp + backToPlayers / turnover };
}

/**
 * Highest average deposit bonus the bundleBonus budget can fund, given turnover per deposited $ (τ):
 *   bonus ≤ FLYWHEEL.bundleBonus · (1 − rtp) · τ / rtp
 */
export const maxAffordableBundleBonus = (rtp: number, turnoverPerDeposit: number) =>
  (FLYWHEEL.bundleBonus * (1 - rtp) * turnoverPerDeposit) / rtp;

export const compileAll = (tide: TideKey = 'normal') =>
  Object.fromEntries((Object.keys(MODES) as ModeKey[]).map((k) => [k, compileMode(k, MODES[k], tide)])) as Record<
    ModeKey,
    CompiledMode
  >;
