/**
 * WANDERER — Structures
 * ---------------------
 * Turns a POI blueprint into geometry. Every part is a primitive; a whole
 * settlement merges into a handful of meshes so draw calls stay low.
 * Terrain deformation (craters, cave mouths) is applied to the heightfield
 * by the terrain mesher through `applyCarves`.
 */

import * as THREE from '../three.js';
import { mergeParts, xform, jitter, box, cyl, cone, sphere, ico, plane } from './geom.js';

export const MATS = {
  wood:      0x8a6a45,
  wood_dark: 0x5c452c,
  stone:     0x8b8779,
  brick:     0x9c6a52,
  metal:     0x7d838c,
  glass:     0xa8d8e0,
  crystal:   0x8fd8e8,
  bone:      0xded3b8,
  mud:       0x6b5b45,
  obsidian:  0x2f2a35,
  ancient:   0xa8a088,
  sand:      0xd8c496,
  cloth:     0xb9a684,
  leaf:      0x4d7a34,
  iron:      0x6a6f76,
  ember:     0xff7a3c,
};

const propCache = new Map();

/** Geometry for a named prop, built once and shared. */
export function propGeometry(id, seed = 1) {
  const key = id + ':' + seed;
  if (propCache.has(key)) return propCache.get(key);
  const g = buildProp(id, seed);
  propCache.set(key, g);
  return g;
}

function buildProp(id, seed) {
  const M = MATS;
  switch (id) {
    case 'barrel': return mergeParts([
      { geo: cyl(0.42, 0.42, 1.0, 10), matrix: xform(0, 0.5, 0), color: M.wood },
      { geo: cyl(0.45, 0.45, 0.1, 10), matrix: xform(0, 0.28, 0), color: M.iron },
      { geo: cyl(0.45, 0.45, 0.1, 10), matrix: xform(0, 0.74, 0), color: M.iron },
    ]);
    case 'crate': return mergeParts([
      { geo: box(0.9, 0.9, 0.9), matrix: xform(0, 0.45, 0), color: M.wood },
      { geo: box(0.95, 0.1, 0.95), matrix: xform(0, 0.86, 0), color: M.wood_dark },
    ]);
    case 'pot': return mergeParts([
      { geo: sphere(0.45, 8), matrix: xform(0, 0.4, 0, 0, 1, 1.1, 1), color: 0x9c6a4a },
      { geo: cyl(0.24, 0.3, 0.22, 8), matrix: xform(0, 0.82, 0), color: 0x8a5c3e },
    ]);
    case 'cart': return mergeParts([
      { geo: box(2.4, 0.5, 1.3), matrix: xform(0, 0.75, 0), color: M.wood },
      { geo: cyl(0.5, 0.5, 0.14, 8), matrix: xform(0.8, 0.5, 0.72, Math.PI / 2), color: M.wood_dark },
      { geo: cyl(0.5, 0.5, 0.14, 8), matrix: xform(0.8, 0.5, -0.72, Math.PI / 2), color: M.wood_dark },
      { geo: cyl(0.5, 0.5, 0.14, 8), matrix: xform(-0.8, 0.5, 0.72, Math.PI / 2), color: M.wood_dark },
      { geo: cyl(0.5, 0.5, 0.14, 8), matrix: xform(-0.8, 0.5, -0.72, Math.PI / 2), color: M.wood_dark },
      { geo: cyl(0.08, 0.08, 1.8, 5), matrix: xform(-1.9, 0.7, 0, 0, 1, 1, 1, 0, 0.3), color: M.wood_dark },
    ]);
    case 'well': return mergeParts([
      { geo: cyl(1.3, 1.4, 1.1, 12), matrix: xform(0, 0.55, 0), color: M.stone },
      { geo: cyl(0.12, 0.12, 2.4, 6), matrix: xform(1.0, 1.7, 0), color: M.wood_dark },
      { geo: cyl(0.12, 0.12, 2.4, 6), matrix: xform(-1.0, 1.7, 0), color: M.wood_dark },
      { geo: cone(1.7, 0.9, 4), matrix: xform(0, 3.2, 0, Math.PI / 4), color: M.wood },
      { geo: cyl(0.1, 0.1, 1.4, 5), matrix: xform(0, 2.6, 0, 0, 1, 1, 1, 0, Math.PI / 2), color: M.wood_dark },
    ]);
    case 'bonfire': return mergeParts([
      { geo: cyl(1.1, 1.2, 0.3, 10), matrix: xform(0, 0.15, 0), color: M.stone },
      { geo: cone(0.5, 1.1, 6), matrix: xform(0, 0.7, 0), color: M.wood_dark },
      { geo: cone(0.32, 0.8, 6), matrix: xform(0.2, 0.6, 0.1), color: M.ember },
    ]);
    case 'tent': return mergeParts([
      { geo: cone(1.7, 2.2, 4), matrix: xform(0, 1.1, 0, Math.PI / 4), color: M.cloth },
      { geo: box(0.12, 2.3, 0.12), matrix: xform(0, 1.15, 0), color: M.wood_dark },
    ]);
    case 'statue_small': return mergeParts([
      { geo: box(1.1, 0.5, 1.1), matrix: xform(0, 0.25, 0), color: M.stone },
      { geo: cyl(0.35, 0.45, 2.2, 8), matrix: xform(0, 1.6, 0), color: M.ancient },
      { geo: sphere(0.34, 8), matrix: xform(0, 2.9, 0), color: M.ancient },
    ]);
    case 'statue': return mergeParts([
      { geo: cyl(0.9, 1.2, 4.0, 8), matrix: xform(0, 2, 0), color: M.ancient },
      { geo: box(2.0, 2.6, 1.1), matrix: xform(0, 5.2, 0), color: M.ancient },
      { geo: sphere(0.72, 8), matrix: xform(0, 7.0, 0), color: M.ancient },
      { geo: box(0.5, 2.4, 0.5), matrix: xform(1.2, 5.0, 0, 0, 1, 1, 1, 0, 0.2), color: M.ancient },
    ]);
    case 'altar': return mergeParts([
      { geo: box(2.2, 0.9, 1.3), matrix: xform(0, 0.45, 0), color: M.stone },
      { geo: box(1.8, 0.22, 1.0), matrix: xform(0, 1.0, 0), color: M.ancient },
      { geo: ico(0.28, 0), matrix: xform(0, 1.35, 0), color: MATS.crystal },
    ]);
    case 'monolith': return mergeParts([
      { geo: box(1.0, 4.2, 0.7), matrix: xform(0, 2.1, 0, 0, 1, 1, 1, 0, 0.05), color: M.stone },
      { geo: box(0.6, 0.12, 0.12), matrix: xform(0, 3.0, 0.4), color: MATS.crystal },
      { geo: box(0.4, 0.12, 0.12), matrix: xform(0, 2.6, 0.4), color: MATS.crystal },
    ]);
    case 'arch_small': return mergeParts([
      { geo: box(0.6, 3.0, 0.6), matrix: xform(-1.5, 1.5, 0), color: M.stone },
      { geo: box(0.6, 3.0, 0.6), matrix: xform(1.5, 1.5, 0), color: M.stone },
      { geo: box(3.8, 0.6, 0.7), matrix: xform(0, 3.2, 0), color: M.stone },
    ]);
    case 'glyph': return mergeParts([
      { geo: new THREE.RingGeometry(0.9, 1.2, 6), matrix: xform(0, 0.05, 0, 0, 1, 1, 1, -Math.PI / 2), color: MATS.crystal },
      { geo: new THREE.RingGeometry(0.3, 0.5, 6), matrix: xform(0, 0.06, 0, 0, 1, 1, 1, -Math.PI / 2), color: MATS.crystal },
    ]);
    case 'bone': return mergeParts([
      { geo: cyl(0.16, 0.16, 2.2, 6), matrix: xform(0, 0.2, 0, 0, 1, 1, 1, 0, Math.PI / 2), color: M.bone },
      { geo: sphere(0.26, 6), matrix: xform(1.1, 0.2, 0), color: M.bone },
      { geo: sphere(0.26, 6), matrix: xform(-1.1, 0.2, 0), color: M.bone },
    ]);
    case 'skull': return mergeParts([
      { geo: jitter(sphere(0.9, 8), 0.1, 5), matrix: xform(0, 0.7, 0, 0, 1, 0.9, 1.1), color: M.bone },
      { geo: box(0.7, 0.35, 0.6), matrix: xform(0, 0.25, 0.5), color: M.bone },
    ]);
    case 'rail': return mergeParts([
      { geo: box(3.0, 0.1, 0.12), matrix: xform(0, 0.22, 0.5), color: M.iron },
      { geo: box(3.0, 0.1, 0.12), matrix: xform(0, 0.22, -0.5), color: M.iron },
      { geo: box(0.16, 0.24, 1.3), matrix: xform(1.1, 0.12, 0), color: M.wood_dark },
      { geo: box(0.16, 0.24, 1.3), matrix: xform(-1.1, 0.12, 0), color: M.wood_dark },
    ]);
    case 'target': return mergeParts([
      { geo: box(0.12, 2.0, 0.12), matrix: xform(0, 1, 0), color: M.wood_dark },
      { geo: cyl(0.6, 0.6, 0.16, 12), matrix: xform(0, 1.7, 0.1, Math.PI / 2), color: M.cloth },
      { geo: cyl(0.28, 0.28, 0.2, 12), matrix: xform(0, 1.7, 0.14, Math.PI / 2), color: 0xb04a3a },
    ]);
    case 'logpile': return mergeParts([0, 1, 2, 3, 4].map(i => ({
      geo: cyl(0.22, 0.22, 2.2, 6), matrix: xform(0, 0.24 + Math.floor(i / 3) * 0.42, (i % 3 - 1) * 0.46, 0, 1, 1, 1, 0, Math.PI / 2), color: M.wood,
    })));
    case 'lantern': return mergeParts([
      { geo: box(0.3, 0.44, 0.3), matrix: xform(0, 0, 0), color: M.iron },
      { geo: box(0.2, 0.28, 0.2), matrix: xform(0, 0, 0), color: 0xffc46a },
      { geo: cyl(0.04, 0.04, 0.3, 5), matrix: xform(0, 0.34, 0), color: M.iron },
    ]);
    case 'shrine_lantern': return mergeParts([
      { geo: cyl(0.14, 0.18, 2.6, 6), matrix: xform(0, 1.3, 0), color: M.wood_dark },
      { geo: box(0.5, 0.6, 0.5), matrix: xform(0, 2.8, 0), color: 0xffcf87 },
      { geo: cone(0.55, 0.4, 4), matrix: xform(0, 3.25, 0, Math.PI / 4), color: M.wood_dark },
    ]);
    case 'orrery': return mergeParts([
      { geo: cyl(0.5, 0.7, 0.5, 8), matrix: xform(0, 0.25, 0), color: M.metal },
      { geo: new THREE.TorusGeometry(1.3, 0.06, 6, 20), matrix: xform(0, 1.1, 0, 0, 1, 1, 1, Math.PI / 2.4), color: M.metal },
      { geo: new THREE.TorusGeometry(0.9, 0.05, 6, 18), matrix: xform(0, 1.1, 0, 0, 1, 1, 1, Math.PI / 1.8), color: M.metal },
      { geo: sphere(0.3, 8), matrix: xform(0, 1.1, 0), color: MATS.crystal },
    ]);
    case 'meteor': return mergeParts([
      { geo: jitter(ico(1.6, 1), 0.4, 3), matrix: xform(0, 0.6, 0), color: 0x3a3340 },
      { geo: jitter(ico(0.7, 0), 0.2, 7), matrix: xform(1.1, 1.3, 0.3), color: 0xff8a4a },
    ]);
    case 'pool': return mergeParts([
      { geo: cyl(2.2, 2.4, 0.4, 14), matrix: xform(0, 0.1, 0), color: M.stone },
    ]);
    case 'fence': return mergeParts([
      { geo: box(4.0, 0.14, 0.12), matrix: xform(0, 1.0, 0), color: M.wood },
      { geo: box(4.0, 0.14, 0.12), matrix: xform(0, 0.55, 0), color: M.wood },
      { geo: box(0.16, 1.3, 0.16), matrix: xform(-1.9, 0.65, 0), color: M.wood_dark },
      { geo: box(0.16, 1.3, 0.16), matrix: xform(1.9, 0.65, 0), color: M.wood_dark },
    ]);
    case 'door': return mergeParts([{ geo: box(1.0, 2.1, 0.14), matrix: xform(0, 0, 0), color: M.wood_dark }]);
    case 'window': return mergeParts([{ geo: box(1.0, 1.0, 0.12), matrix: xform(0, 0, 0), color: M.glass }]);
    case 'ladder': return mergeParts([
      { geo: box(0.1, 1, 0.1), matrix: xform(-0.3, 0, 0), color: M.wood },
      { geo: box(0.1, 1, 0.1), matrix: xform(0.3, 0, 0), color: M.wood },
      ...[0, 1, 2, 3, 4, 5, 6].map(i => ({ geo: box(0.7, 0.08, 0.08), matrix: xform(0, -0.42 + i * 0.14, 0), color: M.wood_dark })),
    ]);
    case 'chest': return mergeParts([
      { geo: box(1.1, 0.6, 0.7), matrix: xform(0, 0.3, 0), color: M.wood },
      { geo: cyl(0.35, 0.35, 1.1, 8, 1, false, 0, Math.PI), matrix: xform(0, 0.6, 0, 0, 1, 1, 1, 0, Math.PI / 2), color: M.wood_dark },
      { geo: box(0.2, 0.24, 0.1), matrix: xform(0, 0.55, 0.38), color: M.iron },
    ]);
    case 'workbench': return mergeParts([
      { geo: box(2.0, 0.24, 1.1), matrix: xform(0, 0.95, 0), color: M.wood },
      { geo: box(0.2, 0.95, 0.2), matrix: xform(-0.85, 0.47, -0.4), color: M.wood_dark },
      { geo: box(0.2, 0.95, 0.2), matrix: xform(0.85, 0.47, -0.4), color: M.wood_dark },
      { geo: box(0.2, 0.95, 0.2), matrix: xform(-0.85, 0.47, 0.4), color: M.wood_dark },
      { geo: box(0.2, 0.95, 0.2), matrix: xform(0.85, 0.47, 0.4), color: M.wood_dark },
      { geo: box(0.5, 0.16, 0.2), matrix: xform(-0.5, 1.15, 0.1), color: M.iron },
    ]);
    case 'forge': return mergeParts([
      { geo: box(1.8, 1.1, 1.4), matrix: xform(0, 0.55, 0), color: M.stone },
      { geo: cyl(0.34, 0.4, 1.8, 8), matrix: xform(0.5, 1.9, -0.2), color: M.stone },
      { geo: box(0.9, 0.2, 0.9), matrix: xform(-0.3, 1.16, 0.1), color: M.ember },
    ]);
    case 'bed': return mergeParts([
      { geo: box(1.1, 0.35, 2.1), matrix: xform(0, 0.28, 0), color: M.wood },
      { geo: box(1.0, 0.24, 1.9), matrix: xform(0, 0.55, 0), color: 0x9c5a4a },
      { geo: box(1.0, 0.16, 0.5), matrix: xform(0, 0.7, -0.7), color: 0xe0d8c8 },
    ]);
    case 'campfire': return buildProp('bonfire', seed);
    case 'torch': return mergeParts([
      { geo: cyl(0.06, 0.08, 1.1, 5), matrix: xform(0, 0.55, 0), color: M.wood_dark },
      { geo: cone(0.16, 0.4, 6), matrix: xform(0, 1.2, 0), color: 0xffb35c },
    ]);
    case 'storage': return buildProp('chest', seed);
    case 'anvil': return mergeParts([
      { geo: box(0.5, 0.5, 0.4), matrix: xform(0, 0.25, 0), color: M.wood_dark },
      { geo: box(1.2, 0.35, 0.5), matrix: xform(0, 0.7, 0), color: M.iron },
      { geo: cone(0.3, 0.6, 6), matrix: xform(0.75, 0.7, 0, 0, 1, 1, 1, 0, -Math.PI / 2), color: M.iron },
    ]);
    case 'sign': return mergeParts([
      { geo: box(0.14, 2.2, 0.14), matrix: xform(0, 1.1, 0), color: M.wood_dark },
      { geo: box(1.5, 0.6, 0.1), matrix: xform(0.4, 1.8, 0), color: M.wood },
    ]);
    case 'banner': return mergeParts([
      { geo: cyl(0.06, 0.06, 4, 5), matrix: xform(0, 2, 0), color: M.wood_dark },
      { geo: box(1.1, 1.8, 0.06), matrix: xform(0.6, 3.0, 0), color: 0x8a4a4a },
    ]);
    case 'skull_post': return mergeParts([
      { geo: cyl(0.1, 0.12, 2.6, 5), matrix: xform(0, 1.3, 0), color: M.wood_dark },
      { geo: sphere(0.36, 7), matrix: xform(0, 2.7, 0), color: M.bone },
    ]);
    default: return mergeParts([{ geo: box(0.8, 0.8, 0.8), matrix: xform(0, 0.4, 0), color: M.stone }]);
  }
}

/** Build a whole POI blueprint into { geometry, lights, npcs, loot, carves }. */
export function buildPoiGeometry(bp, poi) {
  const parts = [];
  const P = (geo, x, y, z, ry, sx, sy, sz, color, rx, rz) =>
    parts.push({ geo, matrix: xform(x, y, z, ry || 0, sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz, rx || 0, rz || 0), color: color === undefined ? MATS.stone : color });

  for (const p of bp.parts) {
    const mat = MATS[p.mat] === undefined ? MATS.stone : MATS[p.mat];
    const dmg = p.dmg || 0;
    switch (p.k) {
      case 'box':
        P(box(p.w, p.h, p.d), p.x, p.y, p.z, p.ry, 1, 1, 1, mat);
        if (dmg > 0.35) P(box(p.w * 0.5, p.h * 0.3, p.d * 0.8), p.x + p.w * 0.4, p.h * 0.15, p.z + p.d * 0.3, p.ry + 0.3, 1, 1, 1, mat);
        break;
      case 'wall':
        P(box(p.w, p.h, p.d), p.x, p.y, p.z, p.ry, 1, 1, 1, mat);
        if (dmg > 0.5) {
          P(box(p.w * 0.3, p.h * 0.25, p.d * 1.1), p.x + Math.cos(p.ry) * p.w * 0.45, p.h * 0.12, p.z + Math.sin(p.ry) * p.w * 0.45, p.ry, 1, 1, 1, mat);
        }
        break;
      case 'cyl':
        P(cyl(p.r * (p.taper || 1), p.r, p.h, p.seg || 8), p.x, p.y, p.z, p.ry || 0, 1, 1, 1, mat, p.tilt || 0, 0);
        break;
      case 'cone':
        P(cone(p.r, p.h, 6), p.x, p.y, p.z, p.ry || 0, 1, 1, 1, mat);
        break;
      case 'pyramid':
        P(cone(p.r, p.h, 4), p.x, p.y, p.z, (p.ry || 0) + Math.PI / 4, 1, 1, 1, mat);
        break;
      case 'roof': {
        const g = new THREE.CylinderGeometry(0.001, p.w * 0.72, p.h, 3, 1);
        P(g, p.x, p.y + p.h * 0.5, p.z, (p.ry || 0) + Math.PI / 2, 1, 1, p.d / (p.w * 0.72), mat);
        break;
      }
      case 'stairs': {
        const steps = Math.max(3, Math.round(p.h / 0.5));
        for (let i = 0; i < steps; i++) {
          P(box(p.w, 0.4, p.d / steps), p.x, (i + 0.5) * (p.h / steps), p.z - p.d * 0.5 + (i + 0.5) * (p.d / steps), p.ry, 1, 1, 1, mat);
        }
        break;
      }
      case 'stairs_down':
        for (let i = 0; i < 8; i++) P(box(p.w, 0.3, 0.7), p.x, -i * 0.45, p.z - i * 0.7, p.ry, 1, 1, 1, mat);
        break;
      case 'ladder':
        P(propGeometry('ladder'), p.x, p.y, p.z, p.ry || 0, 1, p.h, 1, mat);
        break;
      case 'debris':
        P(jitter(ico(p.s * 0.5, 0), p.s * 0.16, (p.x * 7 + p.z * 3) | 0), p.x, p.s * 0.2, p.z, p.ry, 1, 0.7, 1, mat);
        break;
      case 'door': P(propGeometry('door'), p.x, p.y, p.z, p.ry, p.w, p.h / 2.1, 1, MATS.wood_dark); break;
      case 'window': P(propGeometry('window'), p.x, p.y, p.z, p.ry, p.w, p.h, 1, MATS.glass); break;
      case 'cave_mouth':
        P(new THREE.SphereGeometry(p.w * 0.62, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), p.x, 0.1, p.z, p.ry || 0, 1, p.h / (p.w * 0.62), 1, 0x14110f);
        break;
      case 'mound':
        P(jitter(sphere(p.r, 12), 0.3, 11), p.x, p.h * 0.2, p.z, 0, 1, p.h / p.r, 1, MATS.mud);
        break;
      case 'spire':
        P(cone(p.r, p.h, 6), p.x, p.y, p.z, p.ry || 0, 1, 1, 1, mat, p.tilt || 0, 0);
        P(cone(p.r * 0.5, p.h * 0.3, 5), p.x + p.r * 0.8, p.h * 0.16, p.z, 0, 1, 1, 1, mat, 0.1, 0);
        break;
      case 'arch_top': {
        const g = new THREE.TorusGeometry(p.w * 0.5, p.h * 0.5, 6, 16, Math.PI);
        P(g, p.x, p.y, p.z, p.ry || 0, 1, 1, p.d / p.h, mat);
        break;
      }
      case 'statue': {
        const g = propGeometry('statue');
        P(g, p.x, p.y - p.h * 0.5, p.z, p.ry || 0, p.h / 8, p.h / 8 * (p.broken ? 0.62 : 1), p.h / 8, mat);
        break;
      }
      case 'hull': {
        const g = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
        P(g, p.x, p.y, p.z, p.ry || 0, p.w * 0.5, p.h * 0.42, p.d * 0.5, MATS.wood);
        if (p.dmg < 0.7) P(box(p.w * 0.9, 0.3, p.d * 0.9), p.x, p.y + p.h * 0.4, p.z, p.ry, 1, 1, 1, MATS.wood_dark);
        break;
      }
      case 'isle': {
        const g = jitter(new THREE.SphereGeometry(p.r, 14, 10, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58), p.r * 0.16, 13);
        P(g, p.x, p.y, p.z, p.ry || 0, 1, p.h / p.r, 1, MATS.stone);
        P(cyl(p.r * 0.98, p.r * 0.98, 0.6, 14), p.x, p.y + 0.2, p.z, 0, 1, 1, 1, 0x4a7238);
        break;
      }
      case 'plot': {
        P(plane(p.w, p.d), p.x, 0.06, p.z, p.ry || 0, 1, 1, 1, 0x5a4430);
        const rows = 4;
        for (let i = 0; i < rows; i++) {
          const off = (i / (rows - 1) - 0.5) * p.d * 0.7;
          P(box(p.w * 0.9, 0.28, 0.3), p.x - Math.sin(p.ry || 0) * off, 0.2, p.z + Math.cos(p.ry || 0) * off, p.ry || 0, 1, 1, 1, cropColor(p.crop));
        }
        break;
      }
      case 'cellar':
        P(box(p.w, 0.5, p.d), p.x, 0.25, p.z, p.ry, 1, 1, 1, MATS.stone);
        P(propGeometry('chest'), p.x, 0.6, p.z, p.ry, 1, 1, 1, MATS.wood);
        break;
      case 'prop': {
        const g = propGeometry(p.id, (p.x * 13 + p.z * 7) | 0);
        const s = p.s || 1;
        P(g, p.x, p.y, p.z, p.ry || 0, s, s, s, mat);
        break;
      }
      default: break;
    }
  }

  // trees requested by the blueprint (oasis palms, giant trees...)
  if (bp.trees && bp.trees.length) {
    for (const t of bp.trees) {
      const geo = treeGeometryFor(t.species);
      if (geo) P(geo, t.x, (t.y || 0) - 0.1, t.z, (t.x * 3.1) % 6.28, t.scale, t.scale, t.scale, 0xffffff);
    }
  }

  const geometry = parts.length ? mergeParts(parts) : null;
  if (geometry) geometry.computeBoundingSphere();
  return {
    geometry,
    lights: (bp.lights || []).slice(0, 6),
    npcs: bp.npcs || [],
    loot: bp.loot || [],
    carves: bp.carves || [],
    waters: bp.waters || [],
    roads: bp.roads || [],
    resonant: !!bp.resonant,
    underground: bp.underground || null,
  };
}

function cropColor(crop) {
  switch (crop) {
    case 'wheat': return 0xc9b458;
    case 'root': return 0x8a9a44;
    case 'gourd': return 0x6a8a3a;
    case 'herb': return 0x5f9a5a;
    case 'berry': return 0x8a4a5a;
    default: return 0x6a8a3a;
  }
}

let treeGeoCache = null;
function treeGeometryFor(species) {
  if (!treeGeoCache) {
    // lazily require the vegetation species table (avoids a circular import
    // at module load time)
    treeGeoCache = {};
  }
  if (treeGeoCache[species] !== undefined) return treeGeoCache[species];
  let g = null;
  try {
    const mod = treeModule();
    const def = mod.SPECIES[species];
    if (def) g = def.geo();
  } catch (e) { g = null; }
  treeGeoCache[species] = g;
  return g;
}

let _treeMod = null;
function treeModule() {
  if (!_treeMod) throw new Error('tree module not registered');
  return _treeMod;
}
export function registerTreeModule(mod) { _treeMod = mod; }

/**
 * Deform a chunk's height array for craters, cave mouths and other carved
 * POIs, so the terrain itself changes rather than a mesh sitting on top.
 */
export function applyCarves(carves, poi, xs, zs, hgt, n) {
  if (!carves || !carves.length) return 0;
  let touched = 0;
  for (const c of carves) {
    const cx = poi.x + c.x, cz = poi.z + c.z;
    const r = c.r;
    for (let k = 0; k < n * n; k++) {
      const dx = xs[k] - cx, dz = zs[k] - cz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > r * 1.25) continue;
      const t = d / r;
      let dy;
      if (c.rim) {
        dy = t < 0.85 ? -c.depth * (1 - (t / 0.85) * (t / 0.85)) : c.depth * 0.35 * Math.min(1, (t - 0.85) / 0.4) * (1 - Math.min(1, (t - 0.85) / 0.4));
      } else {
        dy = -c.depth * Math.max(0, 1 - t * t);
      }
      hgt[k] += dy;
      touched++;
    }
  }
  return touched;
}

export default buildPoiGeometry;
