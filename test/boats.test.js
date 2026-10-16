import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOATS } from '../src/sim/data.js';
import { boatPose, boatSpec, distanceOut, hullFits, launchBoat, nearestSpot, stepBoat } from '../src/sim/boats.js';
import { WATERS, waterById } from '../src/sim/waters.js';
import { ALL_GEAR, buy, newProfile } from '../src/sim/profile.js';
import { cashItemById } from '../src/sim/checkout.js';

const kayak = BOATS.find((b) => b.id === 'boat-kayak');
const bass = BOATS.find((b) => b.id === 'boat-bass');

test('boats are sold in Tackle for REEL and by card, with their stats', () => {
  for (const b of BOATS) {
    const g = ALL_GEAR.find((x) => x.id === b.id);
    assert.equal(g.slot, 'boat');
    assert.ok(g.price > 0 && g.level > 1);
    assert.ok(b.speed > 0 && b.range > 0 && b.eye > 0);
    assert.ok(cashItemById(b.id).usd > 0);
  }
});

test('only an owned, equipped boat can be used', () => {
  const p = newProfile();
  assert.equal(boatSpec(p), null);
  p.loadout.boat = 'boat-kayak';
  assert.equal(boatSpec(p), null);
  p.wallet = 10000;
  p.xp = 1e6;
  assert.equal(buy(p, ALL_GEAR.find((g) => g.id === 'boat-kayak')), true);
  assert.equal(boatSpec(p).id, 'boat-kayak');
});

test('a boat launches into water from every spot', () => {
  for (const water of WATERS) {
    for (const s of water.spots) {
      const boat = launchBoat(water, water.poses[s.id], kayak);
      assert.ok(boat, `${s.id} on ${water.id} can launch`);
      assert.ok(hullFits(water, kayak, boat.x, boat.z, boat.heading));
    }
  }
});

test('driving stays in the water and inside the range', () => {
  for (const water of WATERS) {
    for (const spec of [kayak, bass]) {
      const boat = launchBoat(water, water.poses[water.spots[0].id], spec);
      let steer = 0.4;
      for (let i = 0; i < 4000; i += 1) {
        if (i % 500 === 0) steer = -steer;
        stepBoat(boat, water, spec, { throttle: 1, steer }, 0.05);
        assert.ok(hullFits(water, spec, boat.x, boat.z, boat.heading), `${water.id} boat hit the bank`);
        assert.ok(distanceOut(boat) <= spec.range + 1e-9, `${water.id} boat left its range`);
      }
    }
  }
});

test('the kayak gets out and stops at its range', () => {
  const water = waterById('genesis');
  const boat = launchBoat(water, water.poses.dock, kayak);
  for (let i = 0; i < 600; i += 1) stepBoat(boat, water, kayak, { throttle: 1, steer: 0 }, 0.05);
  assert.ok(distanceOut(boat) > 20, `only got ${distanceOut(boat).toFixed(1)} m out`);
  assert.ok(boat.blocked === 'range' || boat.blocked === 'shore' || distanceOut(boat) <= kayak.range);
  const pose = boatPose(boat, kayak);
  assert.equal(pose.eye, kayak.eye);
  assert.ok(nearestSpot(water, pose.x, pose.z));
});

test('the river current carries a boat with no throttle', () => {
  const river = WATERS.find((w) => w.shape.kind === 'river');
  const boat = launchBoat(river, river.poses[river.spots[0].id], bass);
  const x0 = boat.x;
  for (let i = 0; i < 100; i += 1) stepBoat(boat, river, bass, {}, 0.05);
  assert.notEqual(boat.x, x0);
});
