import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sonar } from '../src/sim/sonar.js';
import { createEvents } from '../src/sim/events.js';
import { forward, spotById, waterById } from '../src/sim/waters.js';

const base = () => {
  const water = waterById('genesis');
  const spot = spotById('point');
  const pose = water.poses.point;
  return { water, spot, pose, yaw: pose.yaw, hour: 7, weather: 'cloudy', events: createEvents(), minute: 501 };
};

test('the sonar bottom matches the real depth along the cast line', () => {
  const o = base();
  const r = sonar(o);
  const f = forward(o.yaw);
  for (const b of r.bottom) assert.equal(b.depth, o.water.shape.depthAt(o.pose.x + f.x * b.dist, o.pose.z + f.z * b.dist));
  for (const fish of r.fish) {
    const b = r.bottom.find((x) => x.dist === fish.dist);
    assert.ok(fish.depth <= b.depth, 'fish under the bottom');
  }
});

test('the picture is stable from frame to frame', () => {
  const o = base();
  assert.deepEqual(sonar(o), sonar({ ...o, minute: o.minute + 1 }));
});

test('a boil shows up on the sonar as big arcs', () => {
  const o = base();
  const f = forward(o.yaw);
  let quiet = 0;
  let boiling = 0;
  let legend = 0;
  for (let minute = 0; minute < 3000; minute += 3) {
    quiet += sonar({ ...o, minute }).fish.length;
    const events = { list: [{ kind: 'boils', water: 'genesis', x: o.pose.x + f.x * 25, z: o.pose.z + f.z * 25, radius: 14, species: ['whale-of-gains'], mult: 8, until: 1e9 }] };
    const r = sonar({ ...o, minute, events });
    boiling += r.fish.length;
    legend += r.fish.filter((x) => x.legendary).length;
  }
  assert.ok(boiling > quiet);
  assert.ok(legend > 20, `${legend} legendary arcs`);
});
