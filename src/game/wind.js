// Wind for plants: trees, reeds and grass lean and flutter on the GPU. How far a vertex moves depends on
// its bend weight, stored in the alpha of its vertex colour (0 at the root, 1 at the tip; see GeoBuilder.sway).
import * as pc from 'playcanvas';

const WIND_GLSL = /* glsl */ `
  uniform vec4 windVec; // xy: direction, z: strength, w: time
  // Gusts roll across the field; the tips flutter a little on top.
  vec3 windOffset(vec3 p, float bend) {
    float b = bend * bend;
    float gust = 0.55 + 0.45 * sin(windVec.w * 0.45 + p.x * 0.06 + p.z * 0.05);
    float flutter = 0.5 + 0.5 * sin(windVec.w * 2.3 + p.x * 1.7 + p.z * 1.3);
    float amt = b * windVec.z * gust * (0.5 + 0.2 * flutter);
    return vec3(windVec.x * amt, 0.0, windVec.y * amt);
  }
`;

// Replaces the vertex transform of a material so its plants sway. Shadow passes without vertex colours stay still.
export function windMaterial(device, material) {
  const base = pc.ShaderChunks.get(device, pc.SHADERLANGUAGE_GLSL).get('transformVS');
  const swayed = base.replace(
    'vec3 localPos = vertexPosition;',
    `vec3 localPos = vertexPosition;
  #ifdef VERTEX_COLOR
    localPos += windOffset(vertexPosition, vertex_color.a);
  #endif`
  );
  material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).set('transformVS', WIND_GLSL + swayed);
  material.update();
}

// Global wind: one uniform read by every swaying material.
export function setWind(device, time, strength, dir = [0.92, 0.39]) {
  device.scope.resolve('windVec').setValue([dir[0], dir[1], strength, time]);
}
