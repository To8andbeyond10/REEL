import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cashwaters from '../src/sim/cashwaters.js';
import { BAITS, CASH_KEY, CATCH_LOOK, START_BALANCE, canTopUp, castCost, frenzyCost, loadCash, modeFor, newCashState, playCast, playFrenzyBuy, saveCash, topUp } from '../src/sim/cashwaters.js';
import { simRng } from '../economy/engine.ts';
import { SPECIES } from '../src/sim/data.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};
const near = (a, b) => Math.abs(a - b) < 1e-6;

test('every water plays a published paytable with its RTP', () => {
  for (const water of ['genesis', 'swamp', 'river', 'cold']) {
    const mode = modeFor(water);
    assert.ok(mode.rtp > 0.9 && mode.rtp < 1, `${water} RTP ${mode.rtp}`);
    assert.match(mode.hash, /^[0-9a-f]{64}$/);
  }
  assert.equal(modeFor('nowhere').id, modeFor('genesis').id);
});

test('every paytable catch has a name, and fish map to real species', () => {
  const ids = new Set(SPECIES.map((s) => s.id));
  for (const water of ['genesis', 'swamp', 'cold']) {
    for (const c of modeFor(water).catches) {
      const look = CATCH_LOOK[c.id];
      assert.ok(look, `no look for ${c.id}`);
      if (look.species) assert.ok(ids.has(look.species), `${look.species} is not a game species`);
    }
  }
});

test('the play balance pays for each cast and books every win', () => {
  const state = newCashState();
  const mode = modeFor('swamp');
  const rng = simRng(42);
  let balance = state.balance;
  let casts = 0;
  for (let i = 0; i < 300; i += 1) {
    state.bait = i % BAITS.length;
    state.chum = i % 3 === 0;
    const cost = castCost(state, mode);
    if (state.balance < cost) break;
    const r = playCast(state, mode, rng);
    assert.ok(Math.abs(r.cost - cost) < 0.006, `cost ${r.cost} vs ${cost}`);
    casts += 1;
    balance = Math.round((balance - r.cost + r.won) * 100) / 100;
    assert.ok(near(state.balance, balance), `balance ${state.balance} vs ${balance}`);
  }
  assert.ok(state.history.length <= 30);
  assert.equal(state.totals.casts, casts);
});

test('a cast or Frenzy Buy is refused when the balance is short', () => {
  const state = newCashState();
  const mode = modeFor('cold');
  state.balance = 0.05;
  assert.equal(playCast(state, mode, simRng(1)), null);
  state.balance = frenzyCost(state, mode) - 0.01;
  assert.equal(playFrenzyBuy(state, mode, simRng(1)), null);
  assert.equal(state.totals.casts, 0);
});

test('free top-ups only come once the balance runs dry', () => {
  const state = newCashState();
  assert.equal(canTopUp(state), false);
  assert.equal(topUp(state), false);
  state.balance = BAITS[0].stake - 0.01;
  assert.equal(topUp(state), true);
  assert.equal(state.balance, START_BALANCE);
  assert.equal(state.topUps, 1);
});

test('Cash Waters state saves and loads, and a broken save starts fresh', () => {
  const storage = memoryStorage();
  const state = newCashState();
  playCast(state, modeFor('genesis'), simRng(7));
  saveCash(storage, state);
  assert.deepEqual(loadCash(storage), state);
  storage.setItem(CASH_KEY, '{bad');
  assert.equal(loadCash(storage).balance, START_BALANCE);
});

test('Cash Waters has no way to buy, withdraw or trade balance', () => {
  for (const name of Object.keys(cashwaters)) assert.ok(!/buy(?!Frenzy)|purchase|withdraw|cashout|deposit|trade|transfer|checkout/i.test(name.replace('playFrenzyBuy', '')), `unexpected export ${name}`);
});
