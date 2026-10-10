// Builds merged, vertex-coloured meshes from simple shapes so the whole forest is one draw call.
import * as pc from 'playcanvas';

export class GeoBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.indices = [];
    // Wind bend: alpha runs from 0 at swayBase up to 1 at swayBase + swayLen (see wind.js). Off by default.
    this.swayBase = 0;
    this.swayLen = 0;
  }

  // Plants added after this bend from their root (y = base) to their tip (y = base + len).
  sway(base, len) {
    this.swayBase = base;
    this.swayLen = len;
  }

  get count() {
    return this.positions.length / 3;
  }

  vertex(p, n, c) {
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    // Clamp: bright colours times shading would otherwise wrap around in the 8-bit buffer.
    const bend = this.swayLen > 0 ? Math.min(1, Math.max(0, (p[1] - this.swayBase) / this.swayLen)) : 0;
    this.colors.push(Math.min(255, c[0] * 255), Math.min(255, c[1] * 255), Math.min(255, c[2] * 255), bend * 255);
  }

  // Cone or cylinder (rTop may be 0) around a vertical axis at (x, y, z).
  frustum(x, y, z, rBottom, rTop, height, color, segments = 8, rot = 0, tint = 0) {
    const base = this.count;
    const slope = (rBottom - rTop) / height;
    for (let i = 0; i <= segments; i += 1) {
      const a = rot + (i / segments) * Math.PI * 2;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      const len = Math.hypot(1, slope);
      const n = [cx / len, slope / len, cz / len];
      const shade = 1 - tint * (0.5 + 0.5 * Math.sin(a * 3));
      const c = [color[0] * shade, color[1] * shade, color[2] * shade];
      this.vertex([x + cx * rBottom, y, z + cz * rBottom], n, c);
      this.vertex([x + cx * rTop, y + height, z + cz * rTop], n, [c[0] * 1.12, c[1] * 1.12, c[2] * 1.12]);
    }
    for (let i = 0; i < segments; i += 1) {
      const a = base + i * 2;
      this.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  // Squashed UV sphere.
  blob(x, y, z, rx, ry, rz, color, segs = 8, rings = 6, tint = 0.08) {
    const base = this.count;
    for (let r = 0; r <= rings; r += 1) {
      const v = (r / rings) * Math.PI;
      for (let s = 0; s <= segs; s += 1) {
        const u = (s / segs) * Math.PI * 2;
        const nx = Math.sin(v) * Math.cos(u);
        const ny = Math.cos(v);
        const nz = Math.sin(v) * Math.sin(u);
        const shade = 1 - tint + tint * ny;
        this.vertex([x + nx * rx, y + ny * ry, z + nz * rz], [nx, ny, nz], [color[0] * shade, color[1] * shade, color[2] * shade]);
      }
    }
    for (let r = 0; r < rings; r += 1) {
      for (let s = 0; s < segs; s += 1) {
        const a = base + r * (segs + 1) + s;
        const b = a + segs + 1;
        this.indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }

  // Axis-aligned box rotated around Y.
  box(x, y, z, sx, sy, sz, color, rotY = 0) {
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    const tr = (px, pz) => [x + px * c - pz * s, z + px * s + pz * c];
    const faces = [
      [[0, 1, 0], [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]],
      [[0, -1, 0], [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]]],
      [[1, 0, 0], [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]]],
      [[-1, 0, 0], [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]]],
      [[0, 0, 1], [[1, -1, 1], [-1, -1, 1], [-1, 1, 1], [1, 1, 1]]],
      [[0, 0, -1], [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]]]
    ];
    for (const [n, corners] of faces) {
      const base = this.count;
      const rn = [n[0] * c - n[2] * s, n[1], n[0] * s + n[2] * c];
      const shade = n[1] > 0 ? 1.08 : n[1] < 0 ? 0.7 : 0.9;
      for (const [px, py, pz] of corners) {
        const p = tr((px * sx) / 2, (pz * sz) / 2);
        this.vertex([p[0], y + (py * sy) / 2, p[1]], rn, [color[0] * shade, color[1] * shade, color[2] * shade]);
      }
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  // Thin upright blade (two crossed quads), for reeds and grass.
  blade(x, y, z, width, height, lean, color) {
    for (const a of [0, Math.PI / 2]) {
      const base = this.count;
      const dx = (Math.cos(a) * width) / 2;
      const dz = (Math.sin(a) * width) / 2;
      const n = [Math.sin(a), 0.3, -Math.cos(a)];
      const top = [color[0] * 1.25, color[1] * 1.2, color[2] * 1.1];
      this.vertex([x - dx, y, z - dz], n, color);
      this.vertex([x + dx, y, z + dz], n, color);
      this.vertex([x + lean[0], y + height, z + lean[1]], n, top);
      this.indices.push(base, base + 1, base + 2);
    }
  }

  // Flat horizontal disc (lily pads).
  disc(x, y, z, r, color, segments = 9) {
    const base = this.count;
    this.vertex([x, y, z], [0, 1, 0], color);
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 1.8;
      this.vertex([x + Math.cos(a) * r, y, z + Math.sin(a) * r], [0, 1, 0], color);
    }
    for (let i = 1; i < segments; i += 1) this.indices.push(base, base + i + 1, base + i);
  }

  build(device) {
    const mesh = new pc.Mesh(device);
    mesh.setPositions(this.positions);
    mesh.setNormals(this.normals);
    mesh.setColors32(this.colors);
    mesh.setIndices(this.indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    return mesh;
  }
}

export function vertexColorMaterial({ gloss = 0.25, specular = 0.05, cull = pc.CULLFACE_NONE, unlit = false, fog = true } = {}) {
  const m = new pc.StandardMaterial();
  if (unlit) {
    m.useLighting = false;
    m.diffuse = new pc.Color(0, 0, 0);
    m.emissive = new pc.Color(1, 1, 1);
    m.emissiveVertexColor = true;
  } else {
    m.diffuse = new pc.Color(1, 1, 1);
    m.diffuseVertexColor = true;
    m.specular = new pc.Color(specular, specular, specular);
    m.gloss = gloss;
  }
  m.useFog = fog;
  m.cull = cull;
  m.update();
  return m;
}

export function meshEntity(app, name, mesh, material, { castShadows = false, receiveShadows = true } = {}) {
  const entity = new pc.Entity(name);
  const instance = new pc.MeshInstance(mesh, material);
  entity.addComponent('render', { meshInstances: [instance], castShadows, receiveShadows });
  app.root.addChild(entity);
  return entity;
}

export function solidMaterial(hex, { gloss = 0.3, specular = 0.1, opacity = 1, emissive = 0 } = {}) {
  const m = new pc.StandardMaterial();
  const c = new pc.Color().fromString(hex);
  m.diffuse = c;
  m.specular = new pc.Color(specular, specular, specular);
  m.gloss = gloss;
  if (emissive) m.emissive = c.clone().mulScalar(emissive);
  if (opacity < 1) {
    m.opacity = opacity;
    m.blendType = pc.BLEND_NORMAL;
    m.depthWrite = false;
  }
  m.update();
  return m;
}
