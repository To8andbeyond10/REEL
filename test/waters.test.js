import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WATERS, castLanding, forward, speciesIn } from '../src/sim/waters.js';
import { speciesById } from '../src/sim/data.js';

test('every spot stands on the bank or a deck and faces fishable water', () => {
  for (const water of WATERS) {
    for (const spot of water.spots) {
      const pose = water.poses[spot.id];
      const f = forward(pose.yaw);
      const ahead = water.shape.depthAt(pose.x + f.x * 12, pose.z + f.z * 12);
      assert.ok(ahead > 0.5, `${spot.id} faces ${ahead.toFixed(2)} m of water`);
      if (!spot.deck) assert.ok(water.shape.groundHeight(pose.x, pose.z) > -0.1, `${spot.id} is standing in the water`);
    }
  }
});

test('casts always land in the water, whichever way you aim', () => {
  for (const water of WATERS) {
    for (const spot of water.spots) {
      const pose = water.poses[spot.id];
      for (let aim = -1; aim <= 1; aim += 0.25) {
        const land = castLanding(water, pose, pose.yaw + aim, 40);
        assert.ok(water.shape.depthAt(land.x, land.z) > 0, `${spot.id} aim ${aim}`);
      }
    }
  }
});

test('each water has its own legendary and at least four species', () => {
  const legends = new Set();
  for (const water of WATERS) {
    const species = speciesIn(water).map(speciesById);
    assert.ok(species.length >= 4, water.id);
    const legendary = species.filter((s) => s.rarity === 'legendary');
    assert.ok(legendary.length >= 1, `${water.id} has no legendary`);
    for (const s of legendary) legends.add(s.id);
  }
  assert.ok(legends.size >= 4);
});

test('the river runs downstream and fastest mid-channel', () => {
  const river = WATERS.find((w) => w.id === 'river').shape;
  for (const x of [-80, 0, 60]) {
    const mid = river.flow(x, river.center(x));
    const edge = river.flow(x, river.center(x) + river.halfWidth(x) * 0.9);
    assert.ok(mid.x > 0.5, 'flows toward +x');
    assert.ok(mid.speed > edge.speed * 2, `x=${x}`);
  }
  const lake = WATERS.find((w) => w.id === 'genesis').shape;
  assert.equal(lake.flow(0, 0).speed, 0);
});
