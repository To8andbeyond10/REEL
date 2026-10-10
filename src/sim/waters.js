// The waters: each one is its own "chain" with a shape, depth map, scenery palette, weather,
// fish and standing spots. The water surface is y = 0. Shared by the sim and the 3D scene.

const TAU = Math.PI * 2;

function angleDelta(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function bump(theta, center, width) {
  const d = angleDelta(theta, center) / width;
  return Math.exp(-d * d);
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function hills(x, z) {
  return (
    3.2 * Math.sin(x * 0.021 + 0.5) * Math.cos(z * 0.017) +
    1.6 * Math.sin(x * 0.047 + z * 0.031) +
    0.6 * Math.cos(x * 0.11 - z * 0.09)
  );
}

// A roughly round lake. Shoreline and depth are functions of the angle around the centre.
function makeLake(p) {
  const shoreRadius = (theta) => {
    let r = p.radius;
    for (const [amp, freq, phase] of p.waves) r += amp * Math.sin(freq * theta + phase);
    for (const b of p.shoreBumps) r += b.amount * bump(theta, b.angle, b.width);
    return r;
  };
  const depthAt = (x, z) => {
    const theta = Math.atan2(z, x);
    const d = Math.hypot(x, z) / shoreRadius(theta);
    if (d >= 1) return 0;
    let maxDepth = p.depth;
    let k = p.steep;
    for (const b of p.deeps) {
      const w = bump(theta, b.angle, b.width);
      maxDepth += b.depth * w;
      k += (b.steep || 0) * w;
    }
    const ripple = p.ripple * Math.sin(x * 0.13 + 1) * Math.cos(z * 0.11);
    return Math.max(0.15, maxDepth * (1 - Math.pow(d, k)) + ripple * (1 - d));
  };
  const edge = (x, z) => Math.hypot(x, z) - shoreRadius(Math.atan2(z, x));
  const groundHeight = (x, z) => {
    const over = edge(x, z);
    if (over < 0) return -depthAt(x, z);
    const rise = Math.min(1, over / p.hillDist);
    return over * p.bank + rise * rise * (p.hillBase + p.hillAmp * hills(x, z)) + 0.05;
  };
  const flow = () => ({ x: 0, z: 0, speed: 0 });
  return { kind: 'lake', shoreRadius, depthAt, edge, groundHeight, flow };
}

// A river running along +x, meandering in z.
function makeRiver(p) {
  const center = (x) => p.amp1 * Math.sin(x * p.f1) + p.amp2 * Math.sin(x * p.f2 + 1);
  const slope = (x) => p.amp1 * p.f1 * Math.cos(x * p.f1) + p.amp2 * p.f2 * Math.cos(x * p.f2 + 1);
  const pool = (x) => p.pools.reduce((s, q) => s + q.depth * Math.exp(-(((x - q.x) / q.width) ** 2)), 0);
  const halfWidth = (x) => p.width + p.widthVar * Math.sin(x * 0.03 + 0.5) + pool(x) * 0.8;
  const edge = (x, z) => Math.abs(z - center(x)) - halfWidth(x);
  const depthAt = (x, z) => {
    const hw = halfWidth(x);
    const t = Math.abs(z - center(x)) / hw;
    if (t >= 1) return 0;
    return Math.max(0.15, (p.depth + pool(x)) * (1 - Math.pow(t, p.steep)));
  };
  const groundHeight = (x, z) => {
    const over = edge(x, z);
    if (over < 0) return -depthAt(x, z);
    const wall = smoothstep(p.wallStart, p.wallStart + p.wallWidth, over);
    return over * p.bank + wall * (p.wallHeight + 4 * hills(x, z)) + 0.05;
  };
  // Current: strongest mid-river and in the narrow, shallow runs.
  const flow = (x, z) => {
    const hw = halfWidth(x);
    const t = Math.min(1, Math.abs(z - center(x)) / hw);
    const narrow = Math.max(0, (p.width - hw) / p.width + 0.2);
    const speed = p.current * (1 - t * t) * (0.6 + narrow * 1.6);
    const s = slope(x);
    const len = Math.hypot(1, s);
    return { x: 1 / len, z: s / len, speed };
  };
  return { kind: 'river', center, halfWidth, depthAt, edge, groundHeight, flow };
}

const HOME_DEPTH = { pointAngle: Math.PI / 2 - 2.0, reedsAngle: Math.PI / 2 + 2.0, dockAngle: Math.PI / 2 };

export const WATERS = [
  {
    id: 'genesis',
    name: 'Genesis Lake',
    chain: 'Home chain',
    blurb: 'A friendly temperate lake. Pines, reeds and an old dock. Where every angler starts.',
    level: 1,
    gas: 0,
    tempBase: 19,
    size: 380,
    mapSpan: 190,
    shape: makeLake({
      radius: 64,
      waves: [
        [9, 3, 0.4],
        [6, 5, 1.3 + Math.PI / 2]
      ],
      shoreBumps: [
        { angle: HOME_DEPTH.reedsAngle, width: 0.35, amount: 10 },
        { angle: HOME_DEPTH.pointAngle, width: 0.25, amount: -8 }
      ],
      depth: 8,
      steep: 2,
      deeps: [
        { angle: HOME_DEPTH.pointAngle, width: 0.55, depth: 7, steep: 5 },
        { angle: HOME_DEPTH.reedsAngle, width: 0.5, depth: -5, steep: -0.6 }
      ],
      ripple: 0.5,
      bank: 0.09,
      hillDist: 35,
      hillBase: 6,
      hillAmp: 1
    }),
    weather: { sunny: 3, cloudy: 2, rain: 0.8, storm: 0.25, fog: 0.5 },
    palette: {
      water: [[0.3, 0.4, 0.3], [0.1, 0.26, 0.34]],
      // Metres of water you can see into before it goes opaque.
      clarity: 1.4,
      mud: [0.16, 0.17, 0.12],
      sand: [0.56, 0.5, 0.36],
      grass: [0.27, 0.4, 0.16],
      grassHigh: [0.17, 0.3, 0.12],
      rock: [0.4, 0.38, 0.34],
      snow: 0,
      fog: 1,
      skyTint: [1, 1, 1],
      mountains: [0.2, 0.28, 0.2],
      snowcaps: false
    },
    flora: { trees: 'mixed', treeCount: 1100, reeds: { angle: HOME_DEPTH.reedsAngle, base: 0.12, bay: 1 }, lilies: { angle: HOME_DEPTH.reedsAngle, count: 160 }, rocks: { angle: HOME_DEPTH.pointAngle, count: 70 }, grass: 6000 },
    life: { birds: true, fireflies: 0.4, frogs: 0.3, bats: false },
    spots: [
      {
        id: 'dock',
        name: 'Old Dock',
        blurb: 'Shallow to medium water off the end of the dock.',
        level: 1,
        price: 0,
        lakeAngle: HOME_DEPTH.dockAngle,
        inset: 9,
        deck: 0.55,
        face: [0, 0],
        prop: 'dock',
        density: { 'doge-gill': 1, 'bonk-perch': 0.7, 'pepe-bass': 0.4, 'shiba-trout': 0.2, 'stonks-cat': 0.45, 'whale-of-gains': 0.03 }
      },
      {
        id: 'reeds',
        name: 'Reed Bay',
        blurb: 'Weedy shallows. Bass country.',
        level: 2,
        price: 150,
        lakeAngle: HOME_DEPTH.reedsAngle,
        inset: -1.5,
        face: [0, 0],
        density: { 'doge-gill': 0.8, 'bonk-perch': 0.4, 'pepe-bass': 1, 'shiba-trout': 0.1, 'stonks-cat': 0.3, 'whale-of-gains': 0.05, 'floki-pike': 0.15 }
      },
      {
        id: 'point',
        name: 'Deep Point',
        blurb: 'A rocky point dropping into the deepest water.',
        level: 3,
        price: 400,
        lakeAngle: HOME_DEPTH.pointAngle,
        inset: -1.2,
        face: [0, 0],
        density: { 'doge-gill': 0.2, 'bonk-perch': 0.6, 'pepe-bass': 0.3, 'shiba-trout': 0.8, 'stonks-cat': 0.8, 'whale-of-gains': 0.09 }
      }
    ]
  },
  {
    id: 'swamp',
    name: 'Shitcoin Swamp',
    chain: 'Degen chain',
    blurb: 'A warm, murky bayou. Cypress, moss, mist and fireflies. Low fees, high risk, enormous gar.',
    level: 2,
    gas: 30,
    tempBase: 27,
    size: 380,
    mapSpan: 200,
    shape: makeLake({
      radius: 70,
      waves: [
        [12, 4, 0.9],
        [7, 7, 2.1],
        [4, 11, 0.3]
      ],
      shoreBumps: [{ angle: -1.2, width: 0.3, amount: 14 }],
      depth: 2.6,
      steep: 1.3,
      deeps: [{ angle: -1.2, width: 0.35, depth: 3.2, steep: 1.5 }],
      ripple: 0.35,
      bank: 0.03,
      hillDist: 60,
      hillBase: 1.4,
      hillAmp: 0.35
    }),
    weather: { sunny: 1.5, cloudy: 2, rain: 1.6, storm: 0.6, fog: 1.6 },
    palette: {
      water: [[0.08, 0.09, 0.05], [0.035, 0.05, 0.03]],
      clarity: 0.35,
      foam: 0.4,
      reflect: 0.45,
      mud: [0.13, 0.12, 0.08],
      sand: [0.33, 0.3, 0.2],
      grass: [0.26, 0.33, 0.14],
      grassHigh: [0.2, 0.27, 0.12],
      rock: [0.3, 0.29, 0.24],
      snow: 0,
      fog: 2.2,
      skyTint: [0.96, 1.02, 0.9],
      mountains: [0.18, 0.23, 0.16],
      snowcaps: false,
      flatHorizon: true
    },
    flora: { trees: 'cypress', treeCount: 900, inWaterTrees: 120, reeds: { angle: 0, base: 0.5, bay: 0 }, lilies: { angle: null, count: 520 }, stumps: 90, grass: 7000 },
    life: { birds: true, fireflies: 1, frogs: 1, bats: true },
    spots: [
      {
        id: 'boardwalk',
        name: 'Rotten Boardwalk',
        blurb: 'A sagging boardwalk over the lily pads. Bowfin and bass.',
        level: 2,
        price: 0,
        lakeAngle: Math.PI / 2 + 0.3,
        inset: 7,
        deck: 0.45,
        face: [0, 0],
        prop: 'boardwalk',
        density: { 'doge-gill': 0.7, 'pepe-bass': 0.8, 'wojak-bowfin': 1, 'stonks-cat': 0.4, 'rugpull-gar': 0.03 }
      },
      {
        id: 'cypress',
        name: 'Cypress Knees',
        blurb: 'Stumps and knees everywhere. Ambush water.',
        level: 2,
        price: 0,
        lakeAngle: 2.9,
        inset: -1,
        face: [0, 0],
        density: { 'doge-gill': 0.5, 'pepe-bass': 1, 'wojak-bowfin': 0.7, 'stonks-cat': 0.5, 'rugpull-gar': 0.05 }
      },
      {
        id: 'channel',
        name: 'Gator Channel',
        blurb: 'The only deep water in the swamp. Catfish and something much bigger.',
        level: 2,
        price: 0,
        lakeAngle: -1.2 + 0.55,
        inset: -1,
        face: [16, -42],
        density: { 'doge-gill': 0.2, 'pepe-bass': 0.3, 'wojak-bowfin': 0.5, 'stonks-cat': 1, 'rugpull-gar': 0.1 }
      }
    ]
  },
  {
    id: 'river',
    name: 'Bull Run River',
    chain: 'Fast chain',
    blurb: 'A cold, fast river in a rocky canyon. Your float drifts with the current. Steelhead run here.',
    level: 3,
    gas: 60,
    tempBase: 15,
    size: 380,
    mapSpan: 340,
    shape: makeRiver({
      amp1: 22,
      f1: 0.016,
      amp2: 8,
      f2: 0.043,
      width: 20,
      widthVar: 5,
      depth: 2.4,
      steep: 2.2,
      pools: [
        { x: 10, width: 28, depth: 4.5 },
        { x: -95, width: 22, depth: 2.5 }
      ],
      current: 0.55,
      bank: 0.12,
      wallStart: 18,
      wallWidth: 40,
      wallHeight: 34
    }),
    weather: { sunny: 2.5, cloudy: 2, rain: 1.1, storm: 0.3, fog: 0.7 },
    palette: {
      water: [[0.26, 0.4, 0.34], [0.07, 0.21, 0.24]],
      clarity: 2,
      mud: [0.3, 0.29, 0.25],
      sand: [0.52, 0.49, 0.42],
      grass: [0.3, 0.4, 0.18],
      grassHigh: [0.5, 0.42, 0.33],
      rock: [0.58, 0.46, 0.36],
      snow: 0,
      fog: 0.9,
      skyTint: [1, 1, 1.02],
      mountains: [0.32, 0.31, 0.3],
      snowcaps: true
    },
    flora: { trees: 'canyon', treeCount: 700, reeds: { angle: 0, base: 0.05, bay: 0 }, lilies: { angle: null, count: 0 }, boulders: 160, grass: 3500 },
    life: { birds: true, fireflies: 0.1, frogs: 0, bats: false, foam: true },
    spots: [
      {
        id: 'riffle',
        name: 'Gravel Riffle',
        blurb: 'Fast, shallow water. Trout hold behind the boulders.',
        level: 3,
        price: 0,
        riverX: -60,
        side: -1,
        inset: -1,
        density: { 'shiba-trout': 1, 'sol-steelhead': 0.5, 'bonk-perch': 0.2, 'stonks-cat': 0.1, 'satoshi-sturgeon': 0.01 }
      },
      {
        id: 'bend',
        name: 'Big Bend Pool',
        blurb: 'A deep, slow pool on the outside of the bend. Sturgeon country.',
        level: 3,
        price: 0,
        riverX: 10,
        side: 1,
        inset: -1,
        density: { 'shiba-trout': 0.3, 'sol-steelhead': 0.5, 'stonks-cat': 0.8, 'satoshi-sturgeon': 0.08 }
      },
      {
        id: 'tail',
        name: 'Rapids Tail',
        blurb: 'Where the rapids slow down. Steelhead stack up here at dawn.',
        level: 3,
        price: 0,
        riverX: 75,
        side: -1,
        inset: -1,
        density: { 'shiba-trout': 0.6, 'sol-steelhead': 1, 'stonks-cat': 0.2, 'satoshi-sturgeon': 0.02 }
      }
    ]
  },
  {
    id: 'cold',
    name: 'Cold Wallet Lake',
    chain: 'Cold storage',
    blurb: 'A deep alpine lake under snowy peaks. Ice on the edges, char in the depths.',
    level: 4,
    gas: 90,
    tempBase: 2,
    size: 380,
    mapSpan: 180,
    shape: makeLake({
      radius: 58,
      waves: [
        [7, 3, 2.2],
        [5, 6, 0.4]
      ],
      shoreBumps: [{ angle: 0.3, width: 0.3, amount: -7 }],
      depth: 13,
      steep: 3.2,
      deeps: [{ angle: 0.3, width: 0.5, depth: 7, steep: 3 }],
      ripple: 0.8,
      bank: 0.22,
      hillDist: 30,
      hillBase: 16,
      hillAmp: 2.6
    }),
    weather: { sunny: 2, cloudy: 2, snow: 1.6, fog: 0.5, storm: 0.15 },
    palette: {
      water: [[0.3, 0.45, 0.5], [0.05, 0.18, 0.3]],
      clarity: 2.6,
      mud: [0.22, 0.23, 0.22],
      sand: [0.62, 0.6, 0.57],
      grass: [0.82, 0.85, 0.88],
      grassHigh: [0.9, 0.92, 0.95],
      rock: [0.36, 0.36, 0.38],
      snow: 1,
      fog: 0.8,
      skyTint: [0.95, 1, 1.08],
      mountains: [0.3, 0.33, 0.38],
      snowcaps: true
    },
    flora: { trees: 'snowpine', treeCount: 800, reeds: { angle: 0, base: 0, bay: 0 }, lilies: { angle: null, count: 0 }, rocks: { angle: 0.3, count: 90 }, ice: 26, grass: 1500 },
    life: { birds: true, fireflies: 0, frogs: 0, bats: false },
    spots: [
      {
        id: 'beach',
        name: 'Frozen Beach',
        blurb: 'A gravel beach. Perch and trout cruise the drop-off.',
        level: 4,
        price: 0,
        lakeAngle: Math.PI / 2 + 0.4,
        inset: -1,
        face: [0, 0],
        density: { 'bonk-perch': 0.8, 'shiba-trout': 0.7, 'floki-pike': 0.6, 'ledger-laker': 0.3, 'diamond-char': 0.03 }
      },
      {
        id: 'shelf',
        name: 'Ice Shelf',
        blurb: 'Stand on the ice edge over deep, clear water.',
        level: 4,
        price: 0,
        lakeAngle: -2.3,
        inset: 6,
        deck: 0.14,
        face: [0, 0],
        prop: 'ice',
        density: { 'bonk-perch': 0.3, 'shiba-trout': 0.4, 'floki-pike': 0.6, 'ledger-laker': 0.9, 'diamond-char': 0.06 }
      },
      {
        id: 'ledge',
        name: 'Cliff Ledge',
        blurb: 'A rock ledge above the deepest hole. Lakers and the legendary char.',
        level: 4,
        price: 0,
        lakeAngle: 0.3,
        inset: -0.8,
        deck: 2.2,
        face: [0, 0],
        prop: 'ledge',
        density: { 'bonk-perch': 0.2, 'floki-pike': 0.3, 'ledger-laker': 1, 'diamond-char': 0.1 }
      }
    ]
  }
];

// ---------- spots ----------

function gradient(shape, x, z) {
  const e = 0.25;
  return {
    x: (shape.edge(x + e, z) - shape.edge(x - e, z)) / (2 * e),
    z: (shape.edge(x, z + e) - shape.edge(x, z - e)) / (2 * e)
  };
}

function spotPose(water, spot) {
  const { shape } = water;
  let x;
  let z;
  if (spot.lakeAngle !== undefined) {
    const r = shape.shoreRadius(spot.lakeAngle);
    x = Math.cos(spot.lakeAngle) * r;
    z = Math.sin(spot.lakeAngle) * r;
  } else {
    x = spot.riverX;
    z = shape.center(spot.riverX) + spot.side * shape.halfWidth(spot.riverX);
  }
  // Snap onto the shoreline.
  for (let i = 0; i < 20; i += 1) {
    const e = shape.edge(x, z);
    const g = gradient(shape, x, z);
    const gl = Math.hypot(g.x, g.z) || 1;
    x -= (g.x / gl) * e;
    z -= (g.z / gl) * e;
  }
  let f;
  if (spot.face) {
    const dx = spot.face[0] - x;
    const dz = spot.face[1] - z;
    const l = Math.hypot(dx, dz);
    f = { x: dx / l, z: dz / l };
  } else {
    const g = gradient(shape, x, z);
    const l = Math.hypot(g.x, g.z);
    f = { x: -g.x / l, z: -g.z / l };
  }
  const px = x + f.x * spot.inset;
  const pz = z + f.z * spot.inset;
  const ground = spot.deck || Math.max(0.3, shape.groundHeight(px, pz));
  const yaw = Math.atan2(-f.x, -f.z);
  return { id: spot.id, x: px, z: pz, shoreX: x, shoreZ: z, ground, eye: ground + 1.65, yaw };
}

const waterIndex = {};
const spotIndex = {};
for (const water of WATERS) {
  waterIndex[water.id] = water;
  water.poses = {};
  for (const spot of water.spots) {
    spot.water = water.id;
    spotIndex[spot.id] = spot;
    water.poses[spot.id] = spotPose(water, spot);
  }
}

export const waterById = (id) => waterIndex[id];
export const spotById = (id) => spotIndex[id];
export const poseOf = (spotId) => waterIndex[spotIndex[spotId].water].poses[spotId];

// Every species that lives somewhere in a water.
export function speciesIn(water) {
  const ids = new Set();
  for (const s of water.spots) for (const [id, d] of Object.entries(s.density)) if (d > 0) ids.add(id);
  return [...ids];
}

// Forward vector for a yaw (0 = -z).
export function forward(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

// Where a cast of `distance` metres at `yaw` lands: pulled back, then swung toward the spot's
// facing, until it lands in water.
export function castLanding(water, pose, yaw, distance) {
  for (let k = 0; k <= 10; k += 1) {
    const y = yaw + (pose.yaw - yaw) * (k / 10);
    const f = forward(y);
    for (let dist = distance; dist > 2; dist -= 1) {
      const x = pose.x + f.x * dist;
      const z = pose.z + f.z * dist;
      if (water.shape.depthAt(x, z) > 0.3) return { x, z, dist, yaw: y };
    }
  }
  const f = forward(pose.yaw);
  return { x: pose.x + f.x * 2, z: pose.z + f.z * 2, dist: 2, yaw: pose.yaw };
}
