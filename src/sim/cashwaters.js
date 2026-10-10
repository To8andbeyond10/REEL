// Cash Waters on play money (Phase 1 beta). Each cast is rolled from Robby's paytables (economy/),
// never from the fishing sim, so gear, skill and store items can't change what it pays.
// The balance is play money: it starts at 100, can be topped up for free, and can't be bought,
// withdrawn or traded. Nothing here touches real money (see flags.js and docs/BETA.md).
import { MODES, PRICING } from '../../economy/config.ts';
import { compileMode } from '../../economy/paytable.ts';
import { JackpotPool, buyFrenzy, cast } from '../../economy/engine.ts';

export const CASH_KEY = 'memefishing-cashwaters-v1';
export const START_BALANCE = 100;
// Bait sizes offered in the beta (stake = base cast × bait).
export const BAITS = PRICING.baits.slice(0, 6).map((b) => ({ name: b.name, stake: Math.round(PRICING.baseCast * b.x * 100) / 100 }));
// How long a cast takes before its result shows. Quick Cast never goes below 2.5 s.
export const CAST_MS = { quick: 2500, full: 8000 };

// Which paytable each water uses.
export const WATER_MODE = { genesis: 'shallows', swamp: 'openSea', river: 'openSea', cold: 'abyss' };

// The paytable's catches, shown as the game's fish. Names only: the payout comes from the paytable row.
export const CATCH_LOOK = {
  boot: { name: 'Old Boot', species: null },
  minnow: { name: 'Minnow', species: null },
  perch: { name: 'Bonk Perch', species: 'bonk-perch' },
  bass: { name: 'Pepe Bass', species: 'pepe-bass' },
  trout: { name: 'Shiba Trout', species: 'shiba-trout' },
  salmon: { name: 'SOL Steelhead', species: 'sol-steelhead' },
  pike: { name: 'Floki Pike', species: 'floki-pike' },
  catfish: { name: 'Stonks Cat', species: 'stonks-cat' },
  tuna: { name: 'Ledger Laker', species: 'ledger-laker' },
  swordfish: { name: 'Rugpull Gar', species: 'rugpull-gar' },
  marlin: { name: 'Satoshi Sturgeon', species: 'satoshi-sturgeon' },
  shark: { name: 'Diamond Char', species: 'diamond-char' },
  whale: { name: 'Whale of Gains', species: 'whale-of-gains' }
};

const compiled = {};
export function modeFor(waterId) {
  const key = WATER_MODE[waterId] || 'shallows';
  compiled[key] ??= compileMode(key, MODES[key]);
  return compiled[key];
}

const round2 = (x) => Math.round(x * 100) / 100;

export function newCashState() {
  return { version: 1, balance: START_BALANCE, bait: 0, quick: true, chum: false, pots: null, topUps: 0, history: [], totals: { casts: 0, staked: 0, won: 0 } };
}

export function loadCash(storage) {
  try {
    const data = JSON.parse(storage?.getItem(CASH_KEY) || 'null');
    if (!data || data.version !== 1) return newCashState();
    return { ...newCashState(), ...data };
  } catch {
    return newCashState();
  }
}

export function saveCash(storage, state) {
  try {
    storage?.setItem(CASH_KEY, JSON.stringify(state));
  } catch {
    // Play money: losing it to full storage is harmless.
  }
}

export const stakeOf = (state) => BAITS[Math.min(state.bait, BAITS.length - 1)].stake;
export const castCost = (state, mode) => round2(state.chum ? stakeOf(state) * mode.stats.chumCostX : stakeOf(state));
export const frenzyCost = (state, mode) => round2(stakeOf(state) * mode.stats.frenzyBuyX);

// A free top-up, only once the balance can't pay for the smallest cast.
export const canTopUp = (state) => state.balance < BAITS[0].stake;
export function topUp(state) {
  if (!canTopUp(state)) return false;
  state.balance = START_BALANCE;
  state.topUps += 1;
  return true;
}

function settle(state, result) {
  const jackpot = result.jackpots.reduce((s, j) => s + j.amount, 0);
  const won = round2(result.payout + jackpot);
  state.balance = round2(state.balance - result.cost + won);
  state.totals.casts += 1;
  state.totals.staked = round2(state.totals.staked + result.cost);
  state.totals.won = round2(state.totals.won + won);
  const entry = { outcome: result.outcome, cost: result.cost, won, winX: result.winX, paytable: result.paytable, catch: result.catch?.species ?? null, jackpots: result.jackpots.map((j) => j.id) };
  state.history.unshift(entry);
  state.history.length = Math.min(state.history.length, 30);
  return { ...result, won };
}

export function playCast(state, mode, rng) {
  if (state.balance < castCost(state, mode)) return null;
  const pool = new JackpotPool(state.pots ?? undefined);
  const result = cast(mode, stakeOf(state), rng, pool, { chum: state.chum });
  state.pots = pool.pots;
  return settle(state, result);
}

export function playFrenzyBuy(state, mode, rng) {
  if (state.balance < frenzyCost(state, mode)) return null;
  return settle(state, buyFrenzy(mode, stakeOf(state), rng));
}
