// The fight: the line is a spring between the reel and the fish.
// Tension above the drag setting slips line off the spool. Head shakes add spikes the
// drag can't react to. Too much slack and the fish throws the hook. Everything in kgf, m, s.
import { clamp, range, weightedPick } from './random.js';

const G = 9.81;
const SUBSTEP = 1 / 120;

const MODES = {
  run: { thrust: 1, dur: [1.5, 4] },
  hold: { thrust: 0.45, dur: [1, 3] },
  shake: { thrust: 0.6, dur: [0.8, 2] },
  dive: { thrust: 0.8, dur: [1.5, 3] },
  jump: { thrust: 0.9, dur: [0.7, 0.7] },
  toward: { thrust: -0.5, dur: [0.8, 1.8] },
  tired: { thrust: 0.12, dur: [1.5, 3] }
};

export const lineStiffness = (rod, line) => 3.5 * (1 - 0.5 * line.stretch) * (1 - 0.45 * rod.action);

export function createFight(rng, { species, weight, rod, reel, line, distance, depth = 1, bottomAt = () => 6, hookQuality = 0.8 }) {
  const fight = {
    rng,
    species,
    weight,
    rod,
    reel,
    line,
    bottomAt,
    hookQuality,
    k: lineStiffness(rod, line),
    // Big fish pull harder, but not linearly with weight.
    power: Math.pow(weight, 0.8) * species.fight.power,
    fishDist: distance,
    fishDepth: depth,
    fishVel: 0,
    fishAngle: 0,
    fishTurn: 0,
    stamina: 1,
    mode: 'run',
    modeTime: range(rng, 1.5, 3),
    jolt: 0,
    rodPos: 0,
    lineOut: 0,
    t: 0,
    tension: 0,
    peak: 0,
    overload: 0,
    rodOverload: 0,
    slack: 0,
    dragSlipping: false,
    reelStall: false,
    result: null,
    events: []
  };
  fight.lineOut = lineNeeded(fight) - 0.15;
  enterMode(fight, 'run');
  return fight;
}

function lineNeeded(f) {
  return Math.hypot(f.fishDist, f.fishDepth + 1) + f.rodPos * 1.6;
}

function enterMode(f, mode) {
  f.mode = mode;
  const [a, b] = MODES[mode].dur;
  f.modeTime = range(f.rng, a, b);
  if (mode === 'run' || mode === 'dive') {
    // A sudden surge loads the line before the drag starts to give.
    f.jolt = f.power * 0.35 * (1 - 0.5 * f.rod.action) * (1 - 0.4 * f.line.stretch) * (0.4 + 0.6 * f.stamina);
    f.fishTurn = range(f.rng, -0.35, 0.35);
  }
  f.events.push(mode);
  if (mode === 'jump') {
    const frac = f.tension / f.line.strength;
    const risk = clamp((frac - 0.3) * 1.3, 0, 0.9) * (1.25 - f.hookQuality);
    if (f.rng() < risk) f.result = 'unhooked';
  }
}

function nextMode(f) {
  const t = f.species.fight;
  const s = f.stamina;
  const canJump = f.fishDepth < 3 && t.jump > 0;
  const mode = weightedPick(f.rng, [
    { value: 'run', weight: t.run * s },
    { value: 'hold', weight: t.hold },
    { value: 'shake', weight: t.shake * (0.4 + 0.6 * s) },
    { value: 'dive', weight: t.dive * s },
    { value: 'jump', weight: canJump ? t.jump * s * 1.5 : 0 },
    { value: 'toward', weight: t.toward },
    { value: 'tired', weight: (1 - s) * (1 - s) * 1.5 }
  ]);
  enterMode(f, mode);
}

function substep(f, input, h) {
  const sp = f.species.fight;
  const staminaF = 0.25 + 0.75 * f.stamina;

  f.modeTime -= h;
  if (f.modeTime <= 0) nextMode(f);
  if (f.result) return;

  // Fish
  const thrust = f.power * MODES[f.mode].thrust * staminaF;
  const accelScale = G / (f.weight * 1.6 + 0.1);
  const vmax = sp.vmax * (0.4 + 0.6 * f.stamina);
  const waterDrag = (f.power * accelScale) / vmax;
  const len = Math.max(0.5, Math.hypot(f.fishDist, f.fishDepth + 1));
  const along = f.fishDist / len;
  f.fishVel += (thrust * accelScale - f.tension * along * accelScale - waterDrag * f.fishVel) * h;
  f.fishDist = Math.max(1, f.fishDist + f.fishVel * h);
  f.fishAngle = clamp(f.fishAngle + f.fishTurn * h * (f.mode === 'run' ? 1 : 0.3), -0.9, 0.9);

  const bottom = Math.max(0.3, f.bottomAt(f.fishDist, f.fishAngle));
  let targetDepth;
  if (f.mode === 'dive') targetDepth = bottom * 0.9;
  else if (f.mode === 'jump') targetDepth = 0;
  else if (f.mode === 'tired' || f.fishDist < 6) targetDepth = 0.4;
  else targetDepth = Math.min(bottom, (f.species.depth[0] + f.species.depth[1]) / 2);
  f.fishDepth = clamp(f.fishDepth + (targetDepth - f.fishDepth) * h * (f.mode === 'jump' ? 4 : 0.6), 0, bottom);

  // Rod and reel
  f.rodPos = clamp(f.rodPos + (input.lift ? 1.6 : -1.6) * h, 0, 1);
  f.reelStall = input.reeling && f.tension > f.reel.power;
  if (input.reeling && !f.reelStall) f.lineOut -= input.reelSpeed * h;
  f.lineOut = Math.max(0.5, f.lineOut);

  const needed = lineNeeded(f);
  let tension = Math.max(0, (needed - f.lineOut) * f.k);
  const drag = Math.min(input.drag, f.reel.maxDrag);
  f.dragSlipping = tension > drag;
  if (f.dragSlipping) {
    f.lineOut = needed - drag / f.k;
    tension = drag;
  }
  f.tension = tension;

  // Shocks the drag can't absorb in time.
  f.jolt *= Math.exp(-h / 0.25);
  // Cranking into a surge or a head shake makes the shock much worse.
  const crank = input.reeling ? 1.6 : 1;
  let spike = tension > 0.1 ? f.jolt * crank : 0;
  if (f.mode === 'shake' && tension > 0.1) {
    const amp = f.weight * sp.shakeAmp * staminaF * (1 - 0.55 * f.rod.action) * (1 - 0.45 * f.line.stretch);
    spike += amp * Math.abs(Math.sin(f.t * Math.PI * 10)) * crank * (1 - 0.25 * f.rodPos);
  }
  f.peak = tension + spike;

  if (f.lineOut > f.reel.capacity) {
    f.result = 'spooled';
    return;
  }
  if (f.peak > f.line.strength) f.overload += h;
  else f.overload = Math.max(0, f.overload - h * 2);
  if (f.overload > 0.06) {
    f.result = 'snapped';
    return;
  }
  const rodLoad = (f.peak * (1 + 0.35 * f.rodPos)) / f.rod.maxLoad;
  if (rodLoad > 1) f.rodOverload += h;
  else f.rodOverload = Math.max(0, f.rodOverload - h);
  if (f.rodOverload > 0.35) {
    f.result = 'rod';
    return;
  }

  if (tension < 0.05) f.slack += h;
  else f.slack = Math.max(0, f.slack - h * 3);
  if (f.slack > 1.6 + f.hookQuality * 1.6) {
    f.result = 'unhooked';
    return;
  }

  // Fish tire while they pull against the rod.
  const drain = ((tension / Math.max(0.05, f.power)) * 0.045 * (1 + 0.6 * f.rodPos)) / sp.endurance + 0.004;
  f.stamina = clamp(f.stamina - drain * h + (tension < 0.15 * f.power ? 0.012 * h : 0), 0, 1);

  if (f.fishDist < 2.2 && (f.stamina < 0.45 || f.mode === 'tired')) f.result = 'landed';
}

// input: { reeling, reelSpeed (m/s), lift, drag (kg) }
export function stepFight(f, input, dt) {
  f.events = [];
  let left = dt;
  while (left > 1e-6 && !f.result) {
    const h = Math.min(SUBSTEP, left);
    f.t += h;
    substep(f, input, h);
    left -= h;
  }
  return f;
}

export const fightReadout = (f) => ({
  tensionFrac: f.peak / f.line.strength,
  dragFrac: f.tension / f.line.strength,
  rodLoad: (f.peak * (1 + 0.35 * f.rodPos)) / f.rod.maxLoad,
  lineOut: f.lineOut,
  distance: f.fishDist,
  depth: f.fishDepth
});

export const RESULT_TEXT = {
  landed: 'Landed!',
  snapped: 'Line snapped',
  rod: 'Rod broke',
  unhooked: 'It threw the hook',
  spooled: 'Spooled. It took all your line'
};
