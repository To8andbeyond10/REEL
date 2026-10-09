// Simple player policies used by the balance tests.
import { createFight, stepFight, fightReadout } from '../src/sim/fight.js';
import { createRng } from '../src/sim/random.js';

export const policies = {
  // Holds reel the whole fight with the drag cranked all the way up.
  naive: () => ({ reeling: true, lift: false, drag: 99 }),
  // Never touches the reel.
  passive: (f) => ({ reeling: false, lift: false, drag: f.line.strength * 0.5 }),
  // Sets the drag under the line's limit, eases off on shakes and runs, pumps when it can.
  skilled: (f) => {
    const r = fightReadout(f);
    const drag = Math.min(f.line.strength, f.rod.maxLoad) * 0.55;
    const hot = r.tensionFrac > 0.6 || f.dragSlipping || f.mode === 'shake' || f.mode === 'jump';
    return { reeling: !hot || f.tension < 0.05, lift: r.tensionFrac < 0.4 && f.mode !== 'jump', drag };
  }
};

export function simulate({ species, weight, rod, reel, line, policy, seed, distance = 25, maxTime = 300, current = 0 }) {
  const rng = createRng(seed);
  const f = createFight(rng, { species, weight, rod, reel, line, distance, depth: 2, bottomAt: () => 8, current });
  const dt = 1 / 30;
  while (!f.result && f.t < maxTime) {
    const input = policies[policy](f);
    stepFight(f, { ...input, reelSpeed: reel.speed * 0.8 }, dt);
  }
  return { result: f.result || 'timeout', time: f.t };
}

export function winRate(opts, n = 200) {
  const tally = {};
  let landed = 0;
  let time = 0;
  for (let i = 0; i < n; i += 1) {
    const r = simulate({ ...opts, seed: 1000 + i });
    tally[r.result] = (tally[r.result] || 0) + 1;
    if (r.result === 'landed') {
      landed += 1;
      time += r.time;
    }
  }
  return { rate: landed / n, avgTime: landed ? time / landed : 0, tally };
}
