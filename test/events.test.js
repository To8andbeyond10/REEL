import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvents, eventMultiplier, hotspots, stepEvents } from '../src/sim/events.js';
import { createMarket } from '../src/sim/market.js';
import { createWorld, setClimate, stepWorld } from '../src/sim/world.js';
import { waterById } from '../src/sim/waters.js';
import { createRng } from '../src/sim/random.js';

function run(minutes, { waterId = 'genesis', seed = 5, before, hotspots: allowHotspots = true } = {}) {
  const rng = createRng(seed);
  const water = waterById(waterId);
  const world = createWorld(rng, 6 * 60);
  setClimate(world, water.weather, water.tempBase);
  const market = createMarket(rng);
  const ev = createEvents();
  if (!allowHotspots) ev.nextHotspotAt = Infinity;
  const started = [];
  for (let m = 0; m < minutes; m += 1) {
    if (before) before({ world, market, m });
    stepWorld(world, 1);
    started.push(...stepEvents(ev, { rng, minute: world.minute, water, spot: water.spots[0].id, world, market }));
  }
  return { ev, started, water, world };
}

test('a pump starts a feeding frenzy and a rug pull puts the fish off', () => {
  const pump = run(2, { hotspots: false, before: ({ market, m }) => m === 0 && market.news.unshift({ id: 1, kind: 'pump', species: 'pepe-bass', text: '', tone: 'good' }) });
  assert.equal(eventMultiplier(pump.ev, 'pepe-bass', 0, 0), 2.5);
  assert.equal(eventMultiplier(pump.ev, 'doge-gill', 0, 0), 1);
  const rug = run(2, { hotspots: false, before: ({ market, m }) => m === 0 && market.news.unshift({ id: 1, kind: 'rug', species: 'pepe-bass', text: '', tone: 'bad' }) });
  assert.ok(eventMultiplier(rug.ev, 'pepe-bass', 0, 0) < 0.5);
});

test('hotspots pop up on the water within a few hours and fade with distance', () => {
  const { ev, started, water } = run(8 * 60);
  const spots = started.filter((e) => e.kind === 'boils' || e.kind === 'birds');
  assert.ok(spots.length >= 2, `only ${spots.length} hotspots in 8 hours`);
  for (const h of spots) assert.ok(water.shape.depthAt(h.x, h.z) > 1, 'hotspot on land');
  const live = hotspots(ev, water.id)[0] || spots[spots.length - 1];
  ev.list = [live];
  const id = live.species[0];
  const at = eventMultiplier(ev, id, live.x, live.z);
  const near = eventMultiplier(ev, id, live.x + live.radius, live.z);
  const far = eventMultiplier(ev, id, live.x + live.radius * 3, live.z);
  assert.ok(at > near && near > far, `${at} ${near} ${far}`);
  assert.equal(far, 1);
});

test('fish feed hard ahead of a storm', () => {
  const { started } = run(3, {
    before: ({ world, m }) => {
      if (m === 0) {
        world.weather = 'cloudy';
        world.next = 'storm';
        world.nextWeatherAt = world.minute + 40;
      }
    }
  });
  const front = started.find((e) => e.kind === 'front');
  assert.ok(front, 'no storm front event');
  assert.ok(front.mult > 1);
});
