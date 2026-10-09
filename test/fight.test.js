import { test } from 'node:test';
import assert from 'node:assert/strict';
import { winRate } from './bots.js';
import { RODS, REELS, LINES, speciesById } from '../src/sim/data.js';

const KITS = {
  starter: { rod: RODS[0], reel: REELS[0], line: LINES[0] },
  mid: { rod: RODS[1], reel: REELS[1], line: LINES[1] },
  heavy: { rod: RODS[2], reel: REELS[2], line: LINES[2] }
};
const run = (id, weight, kit, policy) => winRate({ species: speciesById(id), weight, ...KITS[kit], policy }, 100);

test('holding reel with the drag locked loses a decent bass', () => {
  assert.ok(run('pepe-bass', 3.5, 'mid', 'naive').rate < 0.1);
  assert.ok(run('stonks-cat', 3, 'mid', 'naive').rate < 0.1);
});

test('holding reel with the drag locked loses a whale even on heavy gear', () => {
  assert.ok(run('whale-of-gains', 9, 'heavy', 'naive').rate < 0.1);
});

test('never reeling loses the fish', () => {
  for (const [id, w, kit] of [['doge-gill', 0.25, 'starter'], ['pepe-bass', 1.4, 'mid'], ['stonks-cat', 3, 'mid']]) {
    assert.equal(run(id, w, kit, 'passive').rate, 0, id);
  }
});

test('playing the drag and pausing on shakes lands matched fish', () => {
  assert.ok(run('doge-gill', 0.25, 'starter', 'skilled').rate > 0.9);
  assert.ok(run('pepe-bass', 1.4, 'mid', 'skilled').rate > 0.85);
  assert.ok(run('stonks-cat', 8, 'heavy', 'skilled').rate > 0.85);
  assert.ok(run('whale-of-gains', 9, 'heavy', 'skilled').rate > 0.85);
});

test('gear matters: a whale on starter gear always gets away', () => {
  assert.equal(run('whale-of-gains', 9, 'starter', 'skilled').rate, 0);
});

test('fights last long enough to be a fight', () => {
  const r = run('pepe-bass', 1.4, 'mid', 'skilled');
  assert.ok(r.avgTime > 15 && r.avgTime < 90, `avg ${r.avgTime}`);
});

const BIG = { rod: RODS[3], reel: REELS[3], line: LINES[3] };
const runKit = (id, weight, kit, opts = {}) => winRate({ species: speciesById(id), weight, ...kit, policy: 'skilled', ...opts }, 80);

test('legendaries snap mid gear and need the heavy or big-game kit', () => {
  assert.equal(runKit('satoshi-sturgeon', 22, KITS.mid).rate, 0);
  assert.equal(runKit('rugpull-gar', 14, KITS.mid).rate, 0);
  assert.ok(runKit('satoshi-sturgeon', 35, KITS.heavy).rate < 0.3, 'trophy sturgeon on heavy gear');
  assert.ok(runKit('satoshi-sturgeon', 35, BIG).rate > 0.85);
  assert.ok(runKit('rugpull-gar', 14, BIG).rate > 0.8);
});

test('river current makes the same fish harder to land', () => {
  const still = runKit('sol-steelhead', 3, KITS.mid);
  const river = runKit('sol-steelhead', 3, KITS.mid, { current: 0.8 });
  assert.ok(river.rate < still.rate || river.avgTime > still.avgTime * 1.2, `still ${JSON.stringify(still)} river ${JSON.stringify(river)}`);
});
