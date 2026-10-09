import { test } from 'node:test';
import assert from 'node:assert/strict';
import { biteRates, rollWeight, strike, createBite, stepBite, stepLureDepth } from '../src/sim/bite.js';
import { LINES, LURES, SPOTS, SPECIES, byId, speciesById } from '../src/sim/data.js';
import { createRng } from '../src/sim/random.js';

const rateOf = (opts, id) => biteRates({ line: LINES[0], weather: 'cloudy', retrieving: 0, ...opts }).find((r) => r.species.id === id).rate;

test('catfish bite bottom rigs at night far more than spinners at noon', () => {
  const spot = byId(SPOTS, 'point');
  const night = rateOf({ spot, lure: byId(LURES, 'bottom'), depth: 9, hour: 23 }, 'stonks-cat');
  const noon = rateOf({ spot, lure: byId(LURES, 'spinner'), depth: 1, hour: 12, retrieving: 0.7 }, 'stonks-cat');
  assert.ok(night > noon * 20);
});

test('a lure that is not moving barely gets bites unless it is a jig', () => {
  const spot = byId(SPOTS, 'reeds');
  const still = rateOf({ spot, lure: byId(LURES, 'spinner'), depth: 1.5, hour: 7 }, 'pepe-bass');
  const moving = rateOf({ spot, lure: byId(LURES, 'spinner'), depth: 1.5, hour: 7, retrieving: 0.7 }, 'pepe-bass');
  assert.ok(moving > still * 3);
});

test('trophies are rare', () => {
  const rng = createRng(7);
  const bass = speciesById('pepe-bass');
  const weights = Array.from({ length: 2000 }, () => rollWeight(rng, bass));
  const big = weights.filter((w) => w > 4).length / weights.length;
  assert.ok(big < 0.03 && big > 0);
  assert.ok(weights.every((w) => w >= bass.weight.min && w <= bass.weight.max));
});

test('striking on the take hooks most fish, waiting too long hooks none', () => {
  const rng = createRng(3);
  const lure = byId(LURES, 'float');
  let hooked = 0;
  for (let i = 0; i < 200; i += 1) {
    const bite = createBite(rng, SPECIES[0], lure);
    stepBite(bite, bite.takeAt + 0.1);
    if (strike(rng, bite).hooked) hooked += 1;
  }
  assert.ok(hooked > 160);
  const late = createBite(rng, SPECIES[0], lure);
  stepBite(late, late.takeAt + late.takeWindow + 0.5);
  assert.equal(strike(rng, late).hooked, false);
});

test('a crankbait dives when retrieved and floats up when paused', () => {
  const crank = byId(LURES, 'crank');
  let d = 0;
  for (let i = 0; i < 300; i += 1) d = stepLureDepth(crank, d, 8, 1, 0, 1 / 30);
  assert.ok(d > 2.5);
  for (let i = 0; i < 600; i += 1) d = stepLureDepth(crank, d, 8, 0, 0, 1 / 30);
  assert.equal(d, 0);
});
