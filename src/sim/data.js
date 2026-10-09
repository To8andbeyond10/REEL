// Game content: species, gear and spots. Units are kg, metres and seconds.
// Each species is a memecoin wearing a real fish's habits.

export const SPECIES = [
  {
    id: 'doge-gill',
    name: 'Doge Gill',
    ticker: 'DOGEG',
    real: 'bluegill',
    color: '#e8b64c',
    belly: '#f6e2a8',
    rarity: 'common',
    weight: { min: 0.08, median: 0.25, max: 0.7 },
    lengthK: 0.42, // length (cm) ~ lengthK * 100 * cbrt(weight)
    depth: [0.4, 3],
    time: 'day',
    weather: { sunny: 1.1, cloudy: 1, rain: 0.8 },
    lures: { float: 1, spinner: 0.35, jig: 0.3, popper: 0.15, crank: 0.02, bottom: 0.4 },
    wariness: 0.2,
    price: 40,
    fight: { power: 2.24, endurance: 0.6, vmax: 1.6, run: 0.35, hold: 0.25, shake: 0.2, dive: 0.1, jump: 0.02, toward: 0.08, shakeAmp: 0.6 },
    caption: 'Much fish. Very bluegill. Wow.'
  },
  {
    id: 'bonk-perch',
    name: 'Bonk Perch',
    ticker: 'BONKP',
    real: 'yellow perch',
    color: '#c9b13a',
    belly: '#f2efc8',
    rarity: 'common',
    weight: { min: 0.1, median: 0.35, max: 1.2 },
    lengthK: 0.5,
    depth: [1.5, 5],
    time: 'day',
    weather: { sunny: 1, cloudy: 1.1, rain: 0.9 },
    lures: { float: 0.7, spinner: 1, jig: 0.7, popper: 0.1, crank: 0.3, bottom: 0.4 },
    wariness: 0.3,
    price: 55,
    fight: { power: 1.96, endurance: 0.7, vmax: 1.8, run: 0.3, hold: 0.3, shake: 0.25, dive: 0.1, jump: 0, toward: 0.05, shakeAmp: 0.55 },
    caption: 'Bonked on the head by a spinner. Classic.'
  },
  {
    id: 'pepe-bass',
    name: 'Pepe Bass',
    ticker: 'PEPEB',
    real: 'largemouth bass',
    color: '#4f8a3a',
    belly: '#e4e9c0',
    rarity: 'uncommon',
    weight: { min: 0.4, median: 1.4, max: 5.5 },
    lengthK: 0.38,
    depth: [0.3, 4],
    time: 'dawnDusk',
    weather: { sunny: 0.8, cloudy: 1.2, rain: 1.1 },
    lures: { float: 0.3, spinner: 0.6, jig: 1, popper: 0.9, crank: 0.7, bottom: 0.2 },
    wariness: 0.5,
    price: 48,
    fight: { power: 2.1, endurance: 1, vmax: 2.6, run: 0.3, hold: 0.15, shake: 0.25, dive: 0.1, jump: 0.14, toward: 0.06, shakeAmp: 0.9 },
    caption: 'Feels good man. Jumped twice to flex.'
  },
  {
    id: 'shiba-trout',
    name: 'Shiba Trout',
    ticker: 'SHIBT',
    real: 'rainbow trout',
    color: '#9a8f98',
    belly: '#f3c6c6',
    rarity: 'uncommon',
    weight: { min: 0.3, median: 1, max: 4 },
    lengthK: 0.45,
    depth: [2, 7],
    time: 'morning',
    weather: { sunny: 0.7, cloudy: 1.3, rain: 1.2 },
    lures: { float: 0.5, spinner: 1, jig: 0.4, popper: 0.2, crank: 0.6, bottom: 0.3 },
    wariness: 0.7,
    price: 70,
    fight: { power: 2.52, endurance: 0.9, vmax: 3, run: 0.4, hold: 0.1, shake: 0.3, dive: 0.05, jump: 0.1, toward: 0.05, shakeAmp: 0.8 },
    caption: 'Ran like it saw the chart. Rainbow candles.'
  },
  {
    id: 'stonks-cat',
    name: 'Stonks Cat',
    ticker: 'STNKC',
    real: 'channel catfish',
    color: '#5b6470',
    belly: '#d9d6cc',
    rarity: 'uncommon',
    weight: { min: 0.8, median: 3, max: 14 },
    lengthK: 0.42,
    depth: [4, 14],
    time: 'night',
    weather: { sunny: 0.8, cloudy: 1, rain: 1.3 },
    lures: { float: 0.3, spinner: 0.05, jig: 0.3, popper: 0, crank: 0.1, bottom: 1 },
    wariness: 0.3,
    price: 30,
    fight: { power: 1.54, endurance: 1.4, vmax: 1.8, run: 0.35, hold: 0.3, shake: 0.05, dive: 0.3, jump: 0, toward: 0.03, shakeAmp: 0.4 },
    caption: 'Only goes up (from the bottom of the lake).'
  },
  {
    id: 'whale-of-gains',
    name: 'Whale of Gains',
    ticker: 'WHALE',
    real: 'muskellunge',
    color: '#7d8f6a',
    belly: '#e9e6d2',
    rarity: 'legendary',
    weight: { min: 4, median: 9, max: 22 },
    lengthK: 0.5,
    depth: [3, 10],
    time: 'dawnDusk',
    weather: { sunny: 0.8, cloudy: 1.2, rain: 1 },
    lures: { float: 0.05, spinner: 0.3, jig: 0.3, popper: 0.4, crank: 1, bottom: 0.05 },
    wariness: 0.9,
    price: 85,
    fight: { power: 1.82, endurance: 1.6, vmax: 3.2, run: 0.35, hold: 0.15, shake: 0.25, dive: 0.12, jump: 0.08, toward: 0.05, shakeAmp: 0.8 },
    caption: 'The fish of ten thousand casts. Screenshot it.'
  }
];

export const RODS = [
  { id: 'rod-paper', name: 'Paper Hands UL 1.8m', maxLoad: 3.5, action: 0.8, cast: 30, price: 0, level: 1, blurb: 'Soft and forgiving. Bends if a gill sneezes.' },
  { id: 'rod-diamond', name: 'Diamond Hands M 2.1m', maxLoad: 7, action: 0.55, cast: 42, price: 250, level: 2, blurb: 'All-rounder for bass and trout.' },
  { id: 'rod-whale', name: 'Whale Hunter H 2.4m', maxLoad: 16, action: 0.35, cast: 52, price: 1200, level: 5, blurb: 'Stiff, long and built for whales.' }
];

export const REELS = [
  { id: 'reel-starter', name: 'Starter 2000', maxDrag: 3, speed: 1.2, capacity: 120, power: 4, price: 0, level: 1, blurb: 'Gets the job done on small fish.' },
  { id: 'reel-moon', name: 'Moonshot 3000', maxDrag: 6, speed: 1.5, capacity: 160, power: 8, price: 300, level: 2, blurb: 'Smooth drag, faster retrieve.' },
  { id: 'reel-cold', name: 'Cold Storage 5000', maxDrag: 13, speed: 1.7, capacity: 220, power: 18, price: 1400, level: 5, blurb: 'Locks up like a hardware wallet.' }
];

export const LINES = [
  { id: 'line-mono6', name: 'Mono 6 lb', strength: 2.7, stretch: 0.7, visibility: 0.4, price: 0, level: 1, blurb: 'Stretchy and cheap.' },
  { id: 'line-fluoro10', name: 'Fluoro 10 lb', strength: 4.5, stretch: 0.45, visibility: 0.1, price: 120, level: 2, blurb: 'Nearly invisible. Wary fish bite more.' },
  { id: 'line-braid30', name: 'HODL Braid 30 lb', strength: 13.6, stretch: 0.05, visibility: 0.7, price: 400, level: 4, blurb: 'Huge strength, zero stretch. Shakes hit hard.' }
];

// kind: float (hangs at the float depth), bottom (lies on the bottom),
// lure (needs to be retrieved; depth depends on sinking and retrieve speed).
export const LURES = [
  { id: 'float', name: 'Moon Worm Float Rig', kind: 'float', price: 0, level: 1, blurb: 'Worm under a float. Set the depth, wait for the dip.' },
  { id: 'spinner', name: 'Pump Spinner #2', kind: 'lure', sink: 0.5, dive: 1.2, idealSpeed: 0.7, pauseAppeal: 0.25, price: 0, level: 1, blurb: 'Steady retrieve, mid water.' },
  { id: 'jig', name: 'Bag Holder Jig', kind: 'lure', sink: 0.9, dive: 0.5, idealSpeed: 0.4, pauseAppeal: 0.9, price: 60, level: 1, blurb: 'Let it sink, hop it, pause. Bites on the drop.' },
  { id: 'popper', name: 'Rug Pull Popper', kind: 'lure', sink: -1, dive: 0, idealSpeed: 0.45, pauseAppeal: 0.6, topwater: true, price: 90, level: 2, blurb: 'Topwater. Pop, pause, explosion.' },
  { id: 'bottom', name: 'Stinky Bags Bottom Rig', kind: 'bottom', price: 80, level: 2, blurb: 'Sits on the bottom. Catfish cannot resist.' },
  { id: 'crank', name: 'Bull Crank 3m', kind: 'lure', sink: -0.3, dive: 3.2, idealSpeed: 1, pauseAppeal: 0.1, price: 220, level: 3, blurb: 'Dives deep on a fast retrieve. Whale food.' }
];

export const SPOTS = [
  {
    id: 'dock',
    name: 'Old Dock',
    blurb: 'Shallow to medium water off the end of the dock.',
    level: 1,
    price: 0,
    density: { 'doge-gill': 1, 'bonk-perch': 0.7, 'pepe-bass': 0.4, 'shiba-trout': 0.2, 'stonks-cat': 0.45, 'whale-of-gains': 0.03 }
  },
  {
    id: 'reeds',
    name: 'Reed Bay',
    blurb: 'Weedy shallows. Bass country.',
    level: 2,
    price: 150,
    density: { 'doge-gill': 0.8, 'bonk-perch': 0.4, 'pepe-bass': 1, 'shiba-trout': 0.1, 'stonks-cat': 0.3, 'whale-of-gains': 0.05 }
  },
  {
    id: 'point',
    name: 'Deep Point',
    blurb: 'A rocky point dropping into the deepest water.',
    level: 3,
    price: 400,
    density: { 'doge-gill': 0.2, 'bonk-perch': 0.6, 'pepe-bass': 0.3, 'shiba-trout': 0.8, 'stonks-cat': 0.8, 'whale-of-gains': 0.09 }
  }
];

export const byId = (list, id) => list.find((item) => item.id === id);
export const speciesById = (id) => byId(SPECIES, id);
