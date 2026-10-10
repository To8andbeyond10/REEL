// Fish models: one vertex-coloured mesh per species. The body is lofted along the spine from a girth profile,
// with fins, eyes and any barbels or scutes merged in. swimFish() bends the whole mesh along the spine, so the
// tail beats and the fins follow. The head points along +z, the way the rest of the rig expects.
import * as pc from 'playcanvas';
import { GeoBuilder, vertexColorMaterial } from './geometry.js';
import { clamp, lerp } from '../sim/random.js';

const TAU = Math.PI * 2;
const RINGS = 30;
const SEGS = 14;
// Girth from tail (t = 0) to head (t = 1), as a fraction of the widest point: a slim tail stalk, a full
// middle, and a blunt head.
const GIRTH = [
  [0, 0.2],
  [0.12, 0.3],
  [0.35, 0.8],
  [0.6, 1],
  [0.8, 0.84],
  [0.93, 0.58],
  [1, 0.36]
];
const EYE = [0.07, 0.08, 0.1];

const colorOf = (hex) => {
  const c = new pc.Color().fromString(hex);
  return [c.r, c.g, c.b];
};
const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const smooth = (t) => t * t * (3 - 2 * t);

function girth(t) {
  for (let i = 1; i < GIRTH.length; i += 1) {
    const [t0, g0] = GIRTH[i - 1];
    const [t1, g1] = GIRTH[i];
    if (t <= t1) return lerp(g0, g1, (1 - Math.cos(Math.PI * clamp((t - t0) / (t1 - t0), 0, 1))) / 2);
  }
  return GIRTH[GIRTH.length - 1][1];
}

// Builds the untransformed fish. Dimensions: L is the model length scale, the body runs from -half to +half.
function fishGeometry(species, m, dims) {
  const { L, bodyLen, half, hH, hW } = dims;
  const back = colorOf(species.color);
  const belly = colorOf(species.belly);
  const fin = mixC(back, belly, 0.35);
  const eye = EYE;
  const g = new GeoBuilder();

  // A ring of the body cross-section: an ellipse, flatter underneath.
  const ring = (z, top, bot, side) => {
    const base = g.count;
    for (let j = 0; j < SEGS; j += 1) {
      const a = (j / SEGS) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const h = s >= 0 ? top : bot;
      const len = Math.hypot(c / side, s / h);
      const k = smooth(clamp((s + 0.35) / 0.55, 0, 1));
      g.vertex([c * side, s * h, z], [c / side / len, s / h / len, 0], mixC(belly, back, k));
    }
    return base;
  };

  const rings = [];
  for (let r = 0; r <= RINGS; r += 1) {
    const t = r / RINGS;
    const s = girth(t);
    rings.push({ z: -half + t * bodyLen, top: s * hH, bot: s * hH * 0.8, side: s * hW });
  }
  // A snout runs on from the head, tapering to a point.
  if (m.snout) {
    const s = girth(1);
    for (let k = 1; k <= 6; k += 1) {
      const u = k / 6;
      const q = s * (1 - 0.55 * u);
      rings.push({ z: half + u * m.snout * 0.9, top: q * hH, bot: q * hH * 0.8, side: q * hW });
    }
  }
  const starts = rings.map((rg) => ring(rg.z, rg.top, rg.bot, rg.side));
  for (let r = 0; r < starts.length - 1; r += 1) {
    for (let j = 0; j < SEGS; j += 1) {
      const j1 = (j + 1) % SEGS;
      const p = starts[r] + j;
      const q = starts[r] + j1;
      const u = starts[r + 1] + j;
      const v = starts[r + 1] + j1;
      g.indices.push(p, u, q, q, u, v);
    }
  }
  // Caps close the tail stalk and the snout.
  const cap = (base, z, nz) => {
    const c = g.count;
    g.vertex([0, 0, z], [0, 0, nz], mixC(back, belly, 0.5));
    for (let j = 0; j < SEGS; j += 1) g.indices.push(c, base + j, base + ((j + 1) % SEGS));
  };
  cap(starts[0], rings[0].z, -1);
  cap(starts[starts.length - 1], rings[rings.length - 1].z, 1);
  // The body is everything so far; its normals are rebuilt as it bends. Fins keep their set normals.
  g.body = { verts: g.count, idx: g.indices.length };

  // A flat fin. Its normal faces out to the side it is seen from, so both sides light the same.
  const tri = (a, b, c, col, nrm) => {
    const base = g.count;
    let nn = nrm;
    if (!nn) {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      nn = n.map((x) => x / len);
    }
    g.vertex(a, nn, col);
    g.vertex(b, nn, col);
    g.vertex(c, nn, col);
    g.indices.push(base, base + 1, base + 2);
  };
  const SIDE = [0.6, 0.8, 0];
  const UP = [0, 1, 0];
  // A fin standing on the back (sign +1) or belly (sign -1), tallest in the middle.
  const sail = (tA, tB, sign, height, col) => {
    const K = 8;
    let prev = null;
    for (let k = 0; k <= K; k += 1) {
      const t = lerp(tA, tB, k / K);
      const s = girth(t);
      const z = -half + t * bodyLen;
      const base = [0, sign > 0 ? s * hH : -s * hH * 0.8, z];
      const tip = [0, base[1] + sign * height * Math.sin((Math.PI * k) / K), z - 0.02 * L];
      if (prev) {
        tri(prev.base, prev.tip, tip, col, SIDE);
        tri(prev.base, tip, base, col, SIDE);
      }
      prev = { base, tip };
    }
  };
  sail(0.18, 0.7, 1, hH * 0.6, fin);
  sail(0.14, 0.38, -1, hH * 0.4, fin);

  // Pectoral and pelvic fins, one each side.
  const fl = 0.14 * L;
  for (const sg of [-1, 1]) {
    const s0 = girth(0.7);
    const z0 = -half + 0.7 * bodyLen;
    tri([sg * s0 * hW * 0.95, -0.02 * hH, z0 + 0.04 * L], [sg * (s0 * hW + fl), -0.12 * hH, z0 - 0.1 * L], [sg * s0 * hW * 0.95, -0.14 * hH, z0 - 0.02 * L], fin, UP);
    const s1 = girth(0.36);
    const z1 = -half + 0.36 * bodyLen;
    tri([sg * s1 * hW * 0.9, -0.2 * hH, z1 + 0.02 * L], [sg * (s1 * hW + 0.6 * fl), -0.3 * hH, z1 - 0.08 * L], [sg * s1 * hW * 0.9, -0.36 * hH, z1 - 0.02 * L], fin, UP);
  }

  // Forked tail fin.
  const zb = -half + 0.02 * L;
  const zt = -half - 0.2 * L;
  const zn = -half - 0.12 * L;
  const spread = 1.1 * hH;
  const p0 = [0, 0.35 * hH, zb];
  const p1 = [0, spread, zt];
  const p2 = [0, 0, zn];
  const p3 = [0, -spread, zt];
  const p4 = [0, -0.35 * hH, zb];
  tri(p0, p1, p2, fin, SIDE);
  tri(p2, p3, p4, fin, SIDE);
  tri(p0, p2, p4, fin, SIDE);

  // Eyes sit high on the side of the head.
  const eyeT = 0.88;
  for (const sg of [-1, 1]) {
    const s = girth(eyeT);
    g.blob(sg * s * hW * 0.92, s * hH * 0.22, half - 0.12 * bodyLen, 0.035 * L, 0.035 * L, 0.035 * L, eye, 6, 4, 0);
  }

  const chinY = -girth(0.97) * hH * 0.8;
  if (m.barbels) {
    for (const sg of [-1, 1]) {
      g.frustum(sg * 0.03 * L, chinY - 0.14 * L, half - 0.04 * L, 0.012 * L, 0.006 * L, 0.14 * L, fin, 5);
    }
  }
  if (m.scutes) {
    for (let i = 0; i < 7; i += 1) {
      const t = 0.2 + i * 0.1;
      const s = girth(t);
      g.frustum(0, s * hH, -half + t * bodyLen, 0.03 * L, 0, 0.035 * L, back, 5);
    }
  }
  return g;
}

// Recomputes the body's vertex normals from its faces, so the flanks turn with the spine as the fish bends.
// Each vertex averages the faces around it; `sign` keeps them pointing out of the body.
function bodyNormals(pos, out, body, indices, sign) {
  out.fill(0, 0, 3 * body.verts);
  for (let t = 0; t < body.idx; t += 3) {
    const a = 3 * indices[t];
    const b = 3 * indices[t + 1];
    const c = 3 * indices[t + 2];
    const ux = pos[b] - pos[a];
    const uy = pos[b + 1] - pos[a + 1];
    const uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a];
    const vy = pos[c + 1] - pos[a + 1];
    const vz = pos[c + 2] - pos[a + 2];
    const nx = (uy * vz - uz * vy) * sign;
    const ny = (uz * vx - ux * vz) * sign;
    const nz = (ux * vy - uy * vx) * sign;
    out[a] += nx;
    out[a + 1] += ny;
    out[a + 2] += nz;
    out[b] += nx;
    out[b + 1] += ny;
    out[b + 2] += nz;
    out[c] += nx;
    out[c + 1] += ny;
    out[c + 2] += nz;
  }
  for (let v = 0; v < 3 * body.verts; v += 3) {
    const len = Math.hypot(out[v], out[v + 1], out[v + 2]);
    if (len > 1e-9) {
      out[v] /= len;
      out[v + 1] /= len;
      out[v + 2] /= len;
    }
  }
}

// The geometry is built around the rest pose; each vertex knows how far back along the body it sits.
export function buildFish(app, species) {
  const m = { deep: 0.26, snout: 0, barbels: false, scutes: false, length: 1, ...species.model };
  const L = m.length;
  const bodyLen = 0.86 * L - m.snout * 0.6;
  const dims = { L, bodyLen, half: bodyLen / 2, hH: m.deep / 2, hW: 0.1 + m.deep * 0.08 };
  const g = fishGeometry(species, m, dims);
  const mesh = g.build(app.graphicsDevice);
  // Pad the bounds so the bent fish is never culled while it swims.
  mesh.aabb.halfExtents.x += 0.2 * L;
  mesh.aabb.halfExtents.y += 0.2 * L;
  mesh.aabb.halfExtents.z += 0.2 * L;

  const n = g.count;
  const rest = Float32Array.from(g.positions);
  const pos = Float32Array.from(g.positions);
  const normals = Float32Array.from(g.normals);
  // Face winding decides which way the faces point; flip the sum if the rest pose faces inward.
  bodyNormals(rest, normals, g.body, g.indices, 1);
  let facing = 0;
  for (let v = 0; v < g.body.verts; v += 1) {
    facing += normals[3 * v] * g.normals[3 * v] + normals[3 * v + 1] * g.normals[3 * v + 1] + normals[3 * v + 2] * g.normals[3 * v + 2];
  }
  const sign = facing < 0 ? -1 : 1;
  const reach = new Float32Array(n);
  for (let i = 0; i < n; i += 1) reach[i] = clamp((dims.half - rest[3 * i + 2]) / bodyLen, 0, 1.4);

  // Less ambient light than the scene: the sky's bright horizon otherwise bleaches the flanks.
  const material = vertexColorMaterial({ gloss: 0.5, specular: 0.1 });
  material.ambient = new pc.Color(0.5, 0.5, 0.5);
  // Sunlit flanks go past 1.0 and the tone map washes them to white, so the colour is held a little lower.
  material.diffuse = new pc.Color(0.65, 0.65, 0.65);
  material.update();
  const body = new pc.Entity('fish-body');
  body.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, material)], castShadows: false, receiveShadows: false });

  const root = new pc.Entity(`fish-${species.id}`);
  root.addChild(body);
  app.root.addChild(root);
  root.enabled = false;

  // Bend the body sideways: the tail swings most, the head stays put, and the wave runs back along the fish.
  root.fish = {
    animate(time, pace = 1) {
      const ph = time * (2.4 + 2.8 * pace) * TAU;
      const amp = 0.08 * L * (0.5 + 0.7 * pace);
      for (let i = 0; i < n; i += 1) {
        const w = reach[i];
        pos[3 * i] = rest[3 * i] + amp * Math.pow(w, 1.5) * Math.sin(ph - 3.2 * w);
      }
      bodyNormals(pos, normals, g.body, g.indices, sign);
      mesh.setPositions(pos);
      mesh.setNormals(normals);
      mesh.update(pc.PRIMITIVE_TRIANGLES, false);
    }
  };
  return root;
}

// Swims a fish model: slow and wide when it is held, quicker and livelier while it fights.
export function swimFish(model, time, pace = 1) {
  model.fish?.animate(time, pace);
}
