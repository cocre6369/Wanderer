/**
 * WANDERER — Geometry helpers
 * ---------------------------
 * Everything the world is built from is assembled out of primitives and then
 * merged, so a whole village or a whole tree costs one draw call.
 */

import * as THREE from '../three.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

/** Merge [{ geo, matrix, color }] into one non-indexed coloured geometry. */
export function mergeParts(parts) {
  let total = 0;
  const list = [];
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    list.push({ g, p });
    total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const { g, p } of list) {
    const gp = g.attributes.position.array;
    const gn = g.attributes.normal ? g.attributes.normal.array : null;
    const m = p.matrix || new THREE.Matrix4();
    const nm = new THREE.Matrix3().setFromMatrix4(m).invert().transpose();
    _c.set(p.color === undefined ? 0xffffff : p.color);
    const tint = p.tint === undefined ? 1 : p.tint;
    for (let i = 0; i < g.attributes.position.count; i++) {
      _v.set(gp[i * 3], gp[i * 3 + 1], gp[i * 3 + 2]).applyMatrix4(m);
      pos[o * 3] = _v.x; pos[o * 3 + 1] = _v.y; pos[o * 3 + 2] = _v.z;
      if (gn) {
        _v.set(gn[i * 3], gn[i * 3 + 1], gn[i * 3 + 2]).applyMatrix3(nm).normalize();
      } else _v.set(0, 1, 0);
      nrm[o * 3] = _v.x; nrm[o * 3 + 1] = _v.y; nrm[o * 3 + 2] = _v.z;
      const j = 0.9 + ((i * 37) % 11) / 55;   // slight per-vertex variation
      col[o * 3] = Math.min(1, _c.r * tint * j);
      col[o * 3 + 1] = Math.min(1, _c.g * tint * j);
      col[o * 3 + 2] = Math.min(1, _c.b * tint * j);
      o++;
    }
    if (g !== p.geo) g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

export function xform(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _v.set(x, y, z);
  _s.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
  return new THREE.Matrix4().compose(_v.clone(), _q.clone(), _s.clone());
}

/** Jitter the vertices of a geometry so primitives do not look machined. */
export function jitter(geo, amount, seed = 1) {
  const p = geo.attributes.position;
  let h = seed * 2654435761 >>> 0;
  for (let i = 0; i < p.count; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const a = ((h >>> 8) / 8388608 - 1) * amount;
    h = (h * 1664525 + 1013904223) >>> 0;
    const b = ((h >>> 8) / 8388608 - 1) * amount;
    h = (h * 1664525 + 1013904223) >>> 0;
    const c = ((h >>> 8) / 8388608 - 1) * amount;
    p.setXYZ(i, p.getX(i) + a, p.getY(i) + b, p.getZ(i) + c);
  }
  geo.computeVertexNormals();
  return geo;
}

export function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
export function cyl(rt, rb, h, seg = 8) { return new THREE.CylinderGeometry(rt, rb, h, seg); }
export function cone(r, h, seg = 8) { return new THREE.ConeGeometry(r, h, seg); }
export function sphere(r, seg = 8) { return new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1)); }
export function ico(r, detail = 0) { return new THREE.IcosahedronGeometry(r, detail); }
export function plane(w, d) { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); return g; }

/** Cross-quad used for grass, ferns and flowers. */
export function crossQuad(w, h, blades = 2) {
  const parts = [];
  for (let i = 0; i < blades; i++) {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h * 0.5, 0);
    parts.push({ geo: g, matrix: xform(0, 0, 0, (i / blades) * Math.PI) });
  }
  return parts;
}

export { _c as tmpColor };
