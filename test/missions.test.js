import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureMissions, missionCatch, missionSell } from '../src/sim/missions.js';
import { newProfile } from '../src/sim/profile.js';
import { WATERS, speciesIn, waterById } from '../src/sim/waters.js';
import { createRng } from '../src/sim/random.js';

test('every water offers three missions you can actually complete there', () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    const rng = createRng(seed);
    const p = newProfile();
    for (const water of WATERS) {
      const list = ensureMissions(p, water.id, rng);
      assert.equal(list.length, 3);
      for (const m of list) if (m.species) assert.ok(speciesIn(water).includes(m.species), `${m.species} not in ${water.id}`);
    }
  }
});

test('completing a mission pays out once and a new one takes its place', () => {
  const rng = createRng(3);
  const p = newProfile();
  p.missions = [{ id: 1, water: 'genesis', kind: 'release', target: 2, progress: 0, text: 'Release 2 fish', reward: { meme: 40, xp: 90 } }];
  const catchOf = (released) => ({ water: 'genesis', species: 'doge-gill', weight: 0.3, lure: 'float', hour: 12, released, trophy: false });
  assert.equal(missionCatch(p, catchOf(false)).length, 0);
  assert.equal(missionCatch(p, catchOf(true)).length, 0);
  const wallet = p.wallet;
  const done = missionCatch(p, catchOf(true));
  assert.equal(done.length, 1);
  assert.equal(p.wallet, wallet + 40);
  assert.equal(p.xp, 90);
  assert.equal(p.stats.missions, 1);
  assert.equal(missionCatch(p, catchOf(true)).length, 0, 'paid twice');
  assert.equal(ensureMissions(p, 'genesis', rng).length, 3);
});

test('catches on another water do not count', () => {
  const p = newProfile();
  p.missions = [{ id: 1, water: 'swamp', kind: 'count', species: 'doge-gill', target: 1, progress: 0, text: '', reward: { meme: 10, xp: 10 } }];
  assert.equal(missionCatch(p, { water: 'genesis', species: 'doge-gill', weight: 0.3, lure: 'float', hour: 12 }).length, 0);
  assert.equal(missionCatch(p, { water: 'swamp', species: 'doge-gill', weight: 0.3, lure: 'float', hour: 12 }).length, 1);
});

test('selling into a pump completes the pump mission', () => {
  const p = newProfile();
  p.missions = [{ id: 1, water: 'genesis', kind: 'pumpSell', target: 1, progress: 0, text: '', reward: { meme: 120, xp: 60 } }];
  assert.equal(missionSell(p, { water: 'genesis', total: 50, changes: [0.04] }).length, 0);
  assert.equal(missionSell(p, { water: 'genesis', total: 50, changes: [0.04, 0.12] }).length, 1);
  assert.ok(waterById('genesis'));
});
