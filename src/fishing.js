// Pure fishing rules: no rendering or DOM, so the balance can be tested in Node.

export const FISH_TYPES = [
  {
    name: 'Bubble Bass',
    color: '#66d9ff',
    reward: 8,
    weight: 40,
    biteDelay: [1.5, 3.8],
    reelRate: 22,
    slipRate: 4,
    surgeSlip: 7,
    restTension: 9,
    surgeTension: 95,
    restTime: [1.6, 2.6],
    surgeTime: [0.8, 1.2],
    escapeTime: 20
  },
  {
    name: 'Doge Darter',
    color: '#ffd166',
    reward: 14,
    weight: 28,
    biteDelay: [1.4, 3.4],
    reelRate: 20,
    slipRate: 5,
    surgeSlip: 9,
    restTension: 11,
    surgeTension: 105,
    restTime: [1.4, 2.4],
    surgeTime: [0.8, 1.3],
    escapeTime: 20
  },
  {
    name: 'Shiba Snapper',
    color: '#ff8f70',
    reward: 20,
    weight: 18,
    biteDelay: [1.3, 3.2],
    reelRate: 19,
    slipRate: 6,
    surgeSlip: 10,
    restTension: 13,
    surgeTension: 115,
    restTime: [1.2, 2.2],
    surgeTime: [0.9, 1.4],
    escapeTime: 22
  },
  {
    name: 'Pepe Pike',
    color: '#7ae582',
    reward: 28,
    weight: 10,
    biteDelay: [1.2, 2.9],
    reelRate: 18,
    slipRate: 6,
    surgeSlip: 11,
    restTension: 15,
    surgeTension: 125,
    restTime: [1.0, 1.9],
    surgeTime: [0.9, 1.5],
    escapeTime: 24
  },
  {
    name: 'Whale of Gains',
    color: '#cba6ff',
    reward: 45,
    weight: 4,
    biteDelay: [1.0, 2.6],
    reelRate: 18,
    slipRate: 6,
    surgeSlip: 11,
    restTension: 17,
    surgeTension: 140,
    restTime: [1.0, 1.8],
    surgeTime: [1.0, 1.6],
    escapeTime: 28
  }
];

// How long a surge is telegraphed before it starts pulling.
export const WARN_TIME = 0.45;
// Tension shed per second while the reel is released.
export const TENSION_RELAX = 32;
// Tension added instantly if the reel is held at the moment a surge hits.
export const SURGE_JOLT = 30;
export const START_PROGRESS = 15;
export const START_TENSION = 10;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const range = ([min, max], rand) => min + rand() * (max - min);

export function pickFish(rand = Math.random) {
  const total = FISH_TYPES.reduce((sum, fish) => sum + fish.weight, 0);
  let roll = rand() * total;
  for (const fish of FISH_TYPES) {
    roll -= fish.weight;
    if (roll < 0) {
      return fish;
    }
  }
  return FISH_TYPES[FISH_TYPES.length - 1];
}

export function createFight(fish, rand = Math.random) {
  return {
    fish,
    rand,
    phase: 'rest',
    phaseClock: range(fish.restTime, rand),
    progress: START_PROGRESS,
    tension: START_TENSION,
    elapsed: 0
  };
}

// The fish alternates between resting and surging, with a short warning before
// each surge. Reeling while it rests lands it; reeling through a surge snaps the line.
// Returns 'caught', 'snapped', 'escaped' or null while the fight goes on.
export function stepFight(fight, held, dt) {
  const { fish } = fight;
  fight.elapsed += dt;
  fight.phaseClock -= dt;

  if (fight.phaseClock <= 0) {
    if (fight.phase === 'rest') {
      fight.phase = 'warn';
      fight.phaseClock = WARN_TIME;
    } else if (fight.phase === 'warn') {
      fight.phase = 'surge';
      fight.phaseClock = range(fish.surgeTime, fight.rand);
      if (held) {
        fight.tension += SURGE_JOLT;
      }
    } else {
      fight.phase = 'rest';
      fight.phaseClock = range(fish.restTime, fight.rand);
    }
  }

  const surging = fight.phase === 'surge';
  if (held) {
    fight.progress += fish.reelRate * (surging ? 0.25 : 1) * dt;
    fight.tension += (surging ? fish.surgeTension : fish.restTension) * dt;
  } else {
    fight.progress -= (surging ? fish.surgeSlip : fish.slipRate) * dt;
    // A surging fish keeps the line taut, so it relaxes more slowly.
    fight.tension -= TENSION_RELAX * (surging ? 0.5 : 1) * dt;
  }

  fight.progress = clamp(fight.progress, 0, 100);
  fight.tension = clamp(fight.tension, 0, 100);

  if (fight.tension >= 100) {
    return 'snapped';
  }
  if (fight.progress >= 100) {
    return 'caught';
  }
  if (fight.progress <= 0 || fight.elapsed >= fish.escapeTime) {
    return 'escaped';
  }
  return null;
}
