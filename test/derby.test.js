import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DERBY_LENGTH, PAYOUT, derbyAt, derbyCatch, prizePool, register, settleDerby, standings, stepDerby, upcomingDerbies } from '../src/sim/derby.js';
import { newProfile } from '../src/sim/profile.js';
import { createRng } from '../src/sim/random.js';

test('derbies run on a fixed schedule with a fee that rises with the water', () => {
  const a = derbyAt('genesis', 0, 1);
  assert.equal(a.start, 13 * 60);
  assert.equal(a.end - a.start, DERBY_LENGTH);
  assert.deepEqual(derbyAt('genesis', 0, 1), a);
  assert.ok(derbyAt('cold', 0, 1).fee > a.fee);
  const next = upcomingDerbies('genesis', 14 * 60);
  assert.equal(next[0].id, a.id, 'a running derby can still be joined');
  assert.ok(next.every((d) => d.end > 14 * 60));
});

test('entering charges the fee once and fills the field with rivals', () => {
  const p = newProfile();
  const d = derbyAt('genesis', 0, 1);
  assert.ok(register(p, d));
  assert.equal(p.wallet, 150 - d.fee);
  assert.equal(p.derby.rivals.length, 7);
  assert.equal(register(p, derbyAt('genesis', 0, 2)), false, 'two derbies at once');
});

function play(yourFish) {
  const p = newProfile();
  const d = derbyAt('genesis', 0, 0);
  register(p, d);
  const rng = createRng(9);
  for (let m = d.start; m < d.end; m += 1) {
    stepDerby(p.derby, m, rng);
    if (m === d.start + 30) for (const w of yourFish) derbyCatch(p.derby, m, 'genesis', w);
  }
  return { p, d, result: settleDerby(p, d.end) };
}

test('rivals catch fish during the derby', () => {
  const { p } = play([]);
  const caught = p.derby.rivals.reduce((s, r) => s + r.catches.length, 0);
  assert.ok(caught > 5, `rivals caught ${caught}`);
});

test('a monster wins the pot and nothing scores nothing', () => {
  const win = play([30, 20, 10]);
  assert.equal(win.result.rank, 1);
  assert.equal(win.result.prize, Math.round(prizePool(win.d) * PAYOUT[0]));
  assert.equal(win.p.stats.derbyWins, 1);
  assert.equal(settleDerby(win.p, win.d.end + 5), null, 'paid twice');
  const blank = play([]);
  assert.equal(blank.result.prize, 0);
  assert.ok(standings(blank.p.derby).length === 8);
});

test('catches outside the derby window or on another water do not count', () => {
  const p = newProfile();
  const d = derbyAt('genesis', 0, 1);
  register(p, d);
  assert.equal(derbyCatch(p.derby, d.start - 1, 'genesis', 2), false);
  assert.equal(derbyCatch(p.derby, d.start + 10, 'swamp', 2), false);
  assert.equal(derbyCatch(p.derby, d.start + 10, 'genesis', 2), true);
});
