// Genesis Lake: shoreline, depth map and the angler's standing spots.
// The water surface is y = 0. Shared by the bite model and the 3D scene.

const TAU = Math.PI * 2;

export const LAKE = {
  name: 'Genesis Lake',
  radius: 64,
  pointAngle: Math.PI / 2 - 2.0,
  reedsAngle: Math.PI / 2 + 2.0,
  dockAngle: Math.PI / 2
};

function angleDelta(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function bump(theta, center, width) {
  const d = angleDelta(theta, center) / width;
  return Math.exp(-d * d);
}

export function shoreRadius(theta) {
  return LAKE.radius + 9 * Math.sin(3 * theta + 0.4) + 6 * Math.cos(5 * theta + 1.3) + 10 * bump(theta, LAKE.reedsAngle, 0.35) - 8 * bump(theta, LAKE.pointAngle, 0.25);
}

function polar(x, z) {
  return { theta: Math.atan2(z, x), dist: Math.hypot(x, z) };
}

// Water depth in metres (0 on land).
export function depthAt(x, z) {
  const { theta, dist } = polar(x, z);
  const d = dist / shoreRadius(theta);
  if (d >= 1) return 0;
  const point = bump(theta, LAKE.pointAngle, 0.55);
  const reeds = bump(theta, LAKE.reedsAngle, 0.5);
  const maxDepth = 8 + 7 * point - 5 * reeds;
  const k = 2 + 5 * point - 0.6 * reeds;
  const ripple = 0.5 * Math.sin(x * 0.13 + 1) * Math.cos(z * 0.11);
  return Math.max(0.15, maxDepth * (1 - Math.pow(d, k)) + ripple * (1 - d));
}

function hills(x, z) {
  return (
    3.2 * Math.sin(x * 0.021 + 0.5) * Math.cos(z * 0.017) +
    1.6 * Math.sin(x * 0.047 + z * 0.031) +
    0.6 * Math.cos(x * 0.11 - z * 0.09)
  );
}

// Ground height (negative under water).
export function groundHeight(x, z) {
  const { theta, dist } = polar(x, z);
  const r = shoreRadius(theta);
  const d = dist / r;
  if (d < 1) return -depthAt(x, z);
  const over = dist - r;
  const rise = Math.min(1, over / 35);
  return over * 0.09 + rise * rise * (6 + hills(x, z)) + 0.05;
}

function spotPose(id, angle, inset, deck = 0) {
  const r = shoreRadius(angle) - inset;
  const x = Math.cos(angle) * r;
  const z = Math.sin(angle) * r;
  const ground = deck || Math.max(0.3, groundHeight(x, z));
  // Face the lake centre.
  const yaw = Math.atan2(x, z);
  return { id, x, z, ground, eye: ground + 1.65, yaw };
}

export const SPOT_POSES = {
  dock: spotPose('dock', LAKE.dockAngle, 9, 0.55),
  reeds: spotPose('reeds', LAKE.reedsAngle, -1.5),
  point: spotPose('point', LAKE.pointAngle, -1.2)
};

// Forward vector for a yaw (0 = -z).
export function forward(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

// Where a cast of `distance` metres at `yaw` lands; pulled back so it lands in water.
export function castLanding(pose, yaw, distance) {
  const f = forward(yaw);
  let dist = distance;
  while (dist > 2) {
    const x = pose.x + f.x * dist;
    const z = pose.z + f.z * dist;
    if (depthAt(x, z) > 0.3) return { x, z, dist };
    dist -= 1;
  }
  return { x: pose.x + f.x * 2, z: pose.z + f.z * 2, dist: 2 };
}
