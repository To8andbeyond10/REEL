import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FISH_TYPES, createFight, pickFish, stepFight } from '../src/fishing.js';

const DT = 1 / 60;
const SEEDS = 200;

// Small deterministic generator so balance results don't flake.
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function play(fish, seed, policy) {
  const fight = createFight(fish, seeded(seed));
  const seen = [];
  for (;;) {
    seen.push(fight.phase);
    const outcome = stepFight(fight, policy(fight, seen), DT);
    if (outcome) {
      return outcome;
    }
  }
}

function catchRate(fish, policy) {
  let caught = 0;
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    if (play(fish, seed, policy) === 'caught') {
      caught += 1;
    }
  }
  return caught / SEEDS;
}

// Reels while the fish rests, reacting to what it saw about a quarter second ago.
const attentivePlayer = (fight, seen) => {
  const phase = seen[Math.max(0, seen.length - 16)];
  return phase === 'rest' && fight.tension < 85;
};

for (const fish of FISH_TYPES) {
  test(`${fish.name}: holding reel the whole time snaps the line`, () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      assert.equal(play(fish, seed, () => true), 'snapped');
    }
  });

  test(`${fish.name}: never reeling lets it escape`, () => {
    assert.equal(catchRate(fish, () => false), 0);
  });
}

test('an attentive player lands easy fish reliably and the whale more often than not', () => {
  const rates = Object.fromEntries(FISH_TYPES.map((fish) => [fish.name, catchRate(fish, attentivePlayer)]));
  assert.ok(rates['Bubble Bass'] >= 0.95, `Bubble Bass ${rates['Bubble Bass']}`);
  assert.ok(rates['Doge Darter'] >= 0.95, `Doge Darter ${rates['Doge Darter']}`);
  assert.ok(rates['Whale of Gains'] >= 0.5, `Whale of Gains ${rates['Whale of Gains']}`);
  assert.ok(rates['Whale of Gains'] < rates['Bubble Bass'], 'the whale should be the hardest catch');
});

test('a surge is always telegraphed before it starts', () => {
  const fight = createFight(FISH_TYPES[0], seeded(7));
  let previous = fight.phase;
  for (let i = 0; i < 60 * 30 && !stepFight(fight, false, DT); i += 1) {
    if (fight.phase === 'surge' && previous !== 'surge') {
      assert.equal(previous, 'warn');
    }
    previous = fight.phase;
  }
});

test('rarer fish come up less often', () => {
  const rand = seeded(42);
  const counts = new Map(FISH_TYPES.map((fish) => [fish.name, 0]));
  for (let i = 0; i < 10000; i += 1) {
    const fish = pickFish(rand);
    counts.set(fish.name, counts.get(fish.name) + 1);
  }
  assert.ok(counts.get('Bubble Bass') > counts.get('Pepe Pike'));
  assert.ok(counts.get('Pepe Pike') > counts.get('Whale of Gains'));
  assert.ok(counts.get('Whale of Gains') > 0);
});

test('pickFish covers the whole roll range', () => {
  assert.equal(pickFish(() => 0).name, 'Bubble Bass');
  assert.equal(pickFish(() => 0.9999).name, 'Whale of Gains');
});
