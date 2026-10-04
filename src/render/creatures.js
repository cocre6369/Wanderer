/**
 * WANDERER — Creatures
 * --------------------
 * Every animal, monster and person is assembled from primitives into a small
 * hierarchy and animated procedurally: legs swing from a phase accumulator,
 * bodies bob, heads track, attacks lunge, hits flash, deaths topple.
 * No skeleton, no keyframes, no assets — and it reads clearly at a distance,
 * which is what matters when something is charging you out of the fog.
 */

import * as THREE from '../three.js';
import { mergeParts, xform, jitter, box, cyl, cone, sphere, ico } from './geom.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = `${color}:${opts.emissive || 0}:${opts.flat ? 1 : 0}:${opts.opacity || 1}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshLambertMaterial({
    color, flatShading: !!opts.flat,
    emissive: opts.emissive || 0x000000,
    transparent: (opts.opacity || 1) < 1,
    opacity: opts.opacity === undefined ? 1 : opts.opacity,
    side: opts.side || THREE.FrontSide,
  });
  matCache.set(key, m);
  return m;
}

function part(parent, geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, color);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  m.castShadow = false;
  parent.add(m);
  return m;
}

/* ── archetypes ───────────────────────────────────────────────────── */

function quadruped(g, o) {
  const body = new THREE.Group(); g.add(body); g.userData.body = body;
  part(body, jitter(box(o.len, o.hgt, o.wid), 0.04 * o.len, 3), mat(o.color, { flat: true }), 0, o.legH + o.hgt * 0.5, 0);
  // belly shade
  part(body, box(o.len * 0.86, o.hgt * 0.5, o.wid * 0.9), mat(o.belly || shade(o.color, -0.18), { flat: true }), 0, o.legH + o.hgt * 0.28, 0);
  const neck = new THREE.Group();
  neck.position.set(o.len * 0.42, o.legH + o.hgt * 0.85, 0);
  body.add(neck); g.userData.neck = neck;
  part(neck, cyl(o.wid * 0.28, o.wid * 0.36, o.neck || o.hgt * 0.9, 6), mat(o.color, { flat: true }), 0, (o.neck || o.hgt * 0.9) * 0.4, 0, 0, 0, -0.5);
  const head = new THREE.Group();
  head.position.set((o.neck || o.hgt * 0.9) * 0.42, (o.neck || o.hgt * 0.9) * 0.78, 0);
  neck.add(head); g.userData.head = head;
  part(head, jitter(box(o.headLen || o.hgt * 0.7, o.hgt * 0.5, o.wid * 0.62), 0.02, 7), mat(o.headColor || o.color, { flat: true }), (o.headLen || o.hgt * 0.7) * 0.4, 0, 0);
  if (o.snout) part(head, box(o.hgt * 0.42, o.hgt * 0.26, o.wid * 0.34), mat(shade(o.color, -0.1), { flat: true }), (o.headLen || o.hgt * 0.7) * 0.85, -o.hgt * 0.06, 0);
  if (o.ears) {
    part(head, cone(o.wid * 0.16, o.hgt * 0.42, 4), mat(o.color, { flat: true }), 0, o.hgt * 0.34, o.wid * 0.24, 0, 0, 0.2);
    part(head, cone(o.wid * 0.16, o.hgt * 0.42, 4), mat(o.color, { flat: true }), 0, o.hgt * 0.34, -o.wid * 0.24, 0, 0, -0.2);
  }
  if (o.antlers) {
    for (const s of [1, -1]) {
      part(head, cyl(0.05, 0.08, o.hgt * 0.7, 5), mat(0xcfc0a0, { flat: true }), 0.1, o.hgt * 0.6, s * o.wid * 0.2, s * 0.3, 0, s * 0.35);
      part(head, cyl(0.04, 0.06, o.hgt * 0.4, 5), mat(0xcfc0a0, { flat: true }), 0.2, o.hgt * 0.9, s * o.wid * 0.34, s * 0.5, 0, s * 0.7);
    }
  }
  if (o.horns) {
    for (const s of [1, -1]) part(head, cone(o.wid * 0.14, o.hgt * 0.5, 5), mat(0xe0d6c0, { flat: true }), 0.05, o.hgt * 0.3, s * o.wid * 0.3, s * 0.9, 0, s * 0.4);
  }
  if (o.tail) {
    const t = new THREE.Group(); t.position.set(-o.len * 0.5, o.legH + o.hgt * 0.8, 0); body.add(t);
    part(t, cyl(0.05 * o.wid, 0.1 * o.wid, o.len * 0.5, 5), mat(o.tailColor || o.color, { flat: true }), -o.len * 0.22, 0, 0, 0, 0, 1.1);
    g.userData.tail = t;
  }
  // legs
  g.userData.legs = [];
  const lx = o.len * 0.32, lz = o.wid * 0.34;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const hip = new THREE.Group();
    hip.position.set(sx * lx, o.legH, sz * lz);
    body.add(hip);
    part(hip, cyl(o.wid * 0.11, o.wid * 0.14, o.legH, 5), mat(shade(o.color, -0.12), { flat: true }), 0, -o.legH * 0.5, 0);
    if (o.hooves) part(hip, cyl(o.wid * 0.1, o.wid * 0.12, o.legH * 0.2, 5), mat(0x3a322c, { flat: true }), 0, -o.legH * 0.92, 0);
    g.userData.legs.push(hip);
  }
  return g;
}

function biped(g, o) {
  const body = new THREE.Group(); g.add(body); g.userData.body = body;
  const hipY = o.legH;
  part(body, box(o.wid, o.torso, o.wid * 0.62), mat(o.color, { flat: true }), 0, hipY + o.torso * 0.5, 0);
  if (o.cloak) part(body, box(o.wid * 1.2, o.torso * 1.3, o.wid * 0.3), mat(o.cloak, { flat: true }), 0, hipY + o.torso * 0.5, -o.wid * 0.42);
  const head = new THREE.Group();
  head.position.set(0, hipY + o.torso + o.head * 0.55, 0);
  body.add(head); g.userData.head = head;
  part(head, box(o.head * 0.82, o.head, o.head * 0.8), mat(o.skin || 0xd8a882, { flat: true }), 0, 0, 0);
  if (o.hair) part(head, box(o.head * 0.9, o.head * 0.42, o.head * 0.88), mat(o.hair, { flat: true }), 0, o.head * 0.36, -o.head * 0.04);
  if (o.hood) part(head, cone(o.head * 0.75, o.head * 1.1, 6), mat(o.cloak || 0x4a4a55, { flat: true }), 0, o.head * 0.2, -o.head * 0.1);
  if (o.eyes) {
    part(head, box(o.head * 0.5, o.head * 0.1, 0.04), mat(o.eyes, { emissive: o.eyes }), 0, o.head * 0.05, o.head * 0.42);
  }
  // arms
  g.userData.arms = [];
  for (const s of [1, -1]) {
    const sh = new THREE.Group();
    sh.position.set(s * o.wid * 0.62, hipY + o.torso * 0.88, 0);
    body.add(sh);
    part(sh, cyl(o.wid * 0.14, o.wid * 0.16, o.torso * 0.85, 5), mat(o.skin || o.color, { flat: true }), 0, -o.torso * 0.42, 0);
    g.userData.arms.push(sh);
    const hand = new THREE.Group();
    hand.position.set(0, -o.torso * 0.85, 0);
    sh.add(hand);
    g.userData['hand' + (s > 0 ? 'R' : 'L')] = hand;
  }
  // legs
  g.userData.legs = [];
  for (const s of [1, -1]) {
    const hip = new THREE.Group();
    hip.position.set(s * o.wid * 0.26, hipY, 0);
    body.add(hip);
    part(hip, cyl(o.wid * 0.16, o.wid * 0.18, o.legH, 5), mat(o.legsColor || 0x4a4a52, { flat: true }), 0, -o.legH * 0.5, 0);
    part(hip, box(o.wid * 0.24, o.wid * 0.14, o.wid * 0.4), mat(0x3a322c, { flat: true }), 0, -o.legH * 0.96, o.wid * 0.08);
    g.userData.legs.push(hip);
  }
  return g;
}

function arachnid(g, o) {
  const body = new THREE.Group(); g.add(body); g.userData.body = body;
  part(body, jitter(sphere(o.size, 8), o.size * 0.1, 5), mat(o.color, { flat: true }), 0, o.size * 1.1, 0, 0, 0, 0, 1.2, 0.8, 1);
  part(body, jitter(sphere(o.size * 0.6, 7), o.size * 0.06, 9), mat(o.color2 || shade(o.color, 0.15), { flat: true }), o.size * 1.0, o.size * 1.0, 0);
  const head = new THREE.Group(); head.position.set(o.size * 1.5, o.size * 1.05, 0); body.add(head); g.userData.head = head;
  part(head, box(o.size * 0.5, o.size * 0.4, o.size * 0.6), mat(o.color, { flat: true }), 0, 0, 0);
  part(head, box(o.size * 0.4, o.size * 0.1, 0.05), mat(0xff4a3a, { emissive: 0x661a12 }), 0, o.size * 0.08, o.size * 0.3);
  for (const s of [1, -1]) {
    part(head, cyl(0.03 * o.size, 0.05 * o.size, o.size * 0.7, 4), mat(0x2a2420, { flat: true }), o.size * 0.3, -o.size * 0.2, s * o.size * 0.2, 0, 0, 0.7);
  }
  g.userData.legs = [];
  for (let i = 0; i < 8; i++) {
    const s = i < 4 ? 1 : -1;
    const k = i % 4;
    const hip = new THREE.Group();
    hip.position.set((k - 1.5) * o.size * 0.42, o.size * 1.1, s * o.size * 0.5);
    body.add(hip);
    part(hip, cyl(0.04 * o.size, 0.06 * o.size, o.size * 1.1, 4), mat(0x2f2a26, { flat: true }), 0, 0, s * o.size * 0.5, s * 0.9, 0, 0);
    part(hip, cyl(0.03 * o.size, 0.05 * o.size, o.size * 1.0, 4), mat(0x2f2a26, { flat: true }), 0, -o.size * 0.4, s * o.size * 1.0, -s * 0.5, 0, 0);
    g.userData.legs.push(hip);
  }
  return g;
}

function flyer(g, o) {
  const body = new THREE.Group(); g.add(body); g.userData.body = body;
  part(body, jitter(sphere(o.size, 8), o.size * 0.08, 5), mat(o.color, { flat: true }), 0, 0, 0, 0, 0, 0, 1.4, 0.85, 0.85);
  const head = new THREE.Group(); head.position.set(o.size * 1.2, o.size * 0.3, 0); body.add(head); g.userData.head = head;
  part(head, sphere(o.size * 0.45, 7), mat(o.headColor || o.color, { flat: true }), 0, 0, 0);
  part(head, cone(o.size * 0.22, o.size * 0.6, 5), mat(0xe0b050, { flat: true }), o.size * 0.5, -o.size * 0.05, 0, 0, 0, -1.4);
  part(head, box(o.size * 0.3, o.size * 0.08, 0.04), mat(0x221a12), o.size * 0.2, o.size * 0.12, o.size * 0.2);
  g.userData.wings = [];
  for (const s of [1, -1]) {
    const w = new THREE.Group(); w.position.set(0, o.size * 0.2, s * o.size * 0.4); body.add(w);
    part(w, box(o.size * 1.9, 0.06, o.size * 1.1), mat(o.wingColor || shade(o.color, 0.12), { flat: true, side: THREE.DoubleSide }), -o.size * 0.2, 0, s * o.size * 0.6, s * 0.1);
    g.userData.wings.push(w);
  }
  part(body, cone(o.size * 0.3, o.size * 1.2, 5), mat(o.color, { flat: true }), -o.size * 1.2, 0, 0, 0, 0, 1.4);
  g.userData.legs = [];
  return g;
}

function serpent(g, o) {
  const body = new THREE.Group(); g.add(body); g.userData.body = body;
  g.userData.segments = [];
  const n = o.segments || 6;
  for (let i = 0; i < n; i++) {
    const s = o.size * (1 - i / (n + 2));
    const seg = new THREE.Group();
    seg.position.set(-i * o.size * 1.1, o.size * 0.9, 0);
    body.add(seg);
    part(seg, jitter(sphere(s, 7), s * 0.12, i + 2), mat(i % 2 ? o.color : shade(o.color, 0.1), { flat: true }), 0, 0, 0, 0, 0, 0, 1.2, 0.9, 1);
    g.userData.segments.push(seg);
  }
  const head = new THREE.Group(); head.position.set(o.size * 1.1, o.size * 1.0, 0); body.add(head); g.userData.head = head;
  part(head, box(o.size * 1.1, o.size * 0.7, o.size * 0.8), mat(o.color, { flat: true }), 0, 0, 0);
  part(head, box(o.size * 0.5, o.size * 0.12, 0.05), mat(0xffcc33, { emissive: 0x664d00 }), o.size * 0.4, o.size * 0.15, o.size * 0.28);
  part(head, box(o.size * 0.5, o.size * 0.12, 0.05), mat(0xffcc33, { emissive: 0x664d00 }), o.size * 0.4, o.size * 0.15, -o.size * 0.28);
  g.userData.legs = [];
  return g;
}

function blobby(g, o) {
  const body = new THREE.Group(); g.add(body); g.userData.body = body;
  part(body, jitter(ico(o.size, 1), o.size * 0.16, 5), mat(o.color, { flat: true, emissive: o.glow || 0 }), 0, o.size * 0.8, 0);
  const head = new THREE.Group(); head.position.set(o.size * 0.7, o.size * 1.2, 0); body.add(head); g.userData.head = head;
  part(head, box(o.size * 0.5, o.size * 0.1, 0.04), mat(o.eyes || 0xffe08a, { emissive: o.eyes || 0x665522 }), 0, 0, o.size * 0.3);
  g.userData.legs = [];
  return g;
}

function fish(g, o) {
  const body = new THREE.Group(); g.add(body); g.userData.body = body;
  part(body, sphere(o.size, 7), mat(o.color, { flat: true }), 0, 0, 0, 0, 0, 0, 1.8, 0.8, 0.6);
  part(body, cone(o.size * 0.6, o.size * 0.9, 4), mat(shade(o.color, -0.1), { flat: true, side: THREE.DoubleSide }), -o.size * 1.5, 0, 0, 0, 0, 1.57);
  g.userData.head = body; g.userData.legs = [];
  return g;
}

/* ── creature table ───────────────────────────────────────────────── */

export const CREATURES = {
  // wildlife
  deer:       { arch: 'quad', size: 1.0, len: 1.5, hgt: 0.7, wid: 0.6, legH: 1.0, color: 0xa8763f, belly: 0xd8c4a0, snout: 1, ears: 1, tail: 1, antlers: 0, speed: 6.5, mass: 60 },
  stag:       { arch: 'quad', size: 1.3, len: 1.8, hgt: 0.85, wid: 0.7, legH: 1.2, color: 0x8f6535, snout: 1, ears: 1, tail: 1, antlers: 1, speed: 7, mass: 90 },
  boar:       { arch: 'quad', size: 0.9, len: 1.3, hgt: 0.65, wid: 0.62, legH: 0.55, color: 0x5a4a3c, snout: 1, ears: 1, tail: 1, speed: 5.5, mass: 70 },
  rabbit:     { arch: 'quad', size: 0.4, len: 0.5, hgt: 0.3, wid: 0.28, legH: 0.22, color: 0xb0a08a, ears: 1, tail: 1, speed: 5, mass: 4 },
  hare_snow:  { arch: 'quad', size: 0.45, len: 0.55, hgt: 0.32, wid: 0.3, legH: 0.24, color: 0xe6ecef, ears: 1, tail: 1, speed: 5.5, mass: 5 },
  fox:        { arch: 'quad', size: 0.6, len: 0.8, hgt: 0.36, wid: 0.32, legH: 0.4, color: 0xc06a2a, belly: 0xe8dcc8, snout: 1, ears: 1, tail: 1, tailColor: 0xe8dcc8, speed: 7, mass: 8 },
  goat:       { arch: 'quad', size: 0.8, len: 1.1, hgt: 0.6, wid: 0.5, legH: 0.7, color: 0x9a8f80, horns: 1, ears: 1, tail: 1, hooves: 1, speed: 5, mass: 45 },
  goat_feral: { arch: 'quad', size: 0.95, len: 1.25, hgt: 0.7, wid: 0.55, legH: 0.8, color: 0x6a6157, horns: 1, ears: 1, hooves: 1, speed: 6, mass: 55, hostile: true },
  camel_wild: { arch: 'quad', size: 1.4, len: 2.0, hgt: 1.0, wid: 0.8, legH: 1.3, color: 0xc2a06a, ears: 1, tail: 1, hooves: 1, speed: 5.5, mass: 200 },
  lizard:     { arch: 'quad', size: 0.35, len: 0.6, hgt: 0.2, wid: 0.2, legH: 0.16, color: 0x7a8a4a, tail: 1, speed: 4, mass: 1 },
  frog:       { arch: 'quad', size: 0.25, len: 0.3, hgt: 0.22, wid: 0.26, legH: 0.12, color: 0x4f7a3a, speed: 2.5, mass: 0.3 },
  monkey:     { arch: 'biped', size: 0.8, legH: 0.5, torso: 0.7, wid: 0.42, head: 0.4, color: 0x7a5a3a, skin: 0x8a6a44, hair: 0x4a3524, speed: 5, mass: 20 },
  crab:       { arch: 'arach', size: 0.3, color: 0xc05a3a, color2: 0xe07a4a, speed: 2, mass: 1 },
  bird:       { arch: 'fly', size: 0.22, color: 0x5a6a7a, speed: 9, mass: 0.4, flying: true },
  gull:       { arch: 'fly', size: 0.34, color: 0xe8e8e4, wingColor: 0xb8bcc0, headColor: 0xf2f2ee, speed: 10, mass: 1, flying: true },
  owl:        { arch: 'fly', size: 0.32, color: 0x8a7a5a, headColor: 0xc8b894, speed: 8, mass: 1.2, flying: true },
  vulture:    { arch: 'fly', size: 0.5, color: 0x3a3530, headColor: 0xc0564a, speed: 9, mass: 3, flying: true },
  crow:       { arch: 'fly', size: 0.26, color: 0x1c1c22, speed: 9, mass: 0.6, flying: true },
  fish:       { arch: 'fish', size: 0.3, color: 0x6a9ab0, speed: 3, mass: 1, aquatic: true },
  insect:     { arch: 'blob', size: 0.06, color: 0x2a2a22, speed: 2, mass: 0.01, flying: true },

  // hostile
  wolf:        { arch: 'quad', size: 1.0, len: 1.4, hgt: 0.62, wid: 0.5, legH: 0.75, color: 0x6a6258, belly: 0xa89a86, snout: 1, ears: 1, tail: 1, speed: 7.5, mass: 45, hostile: true, hp: 46, dmg: 9 },
  wolf_white:  { arch: 'quad', size: 1.1, len: 1.5, hgt: 0.66, wid: 0.54, legH: 0.8, color: 0xdfe6e8, belly: 0xf2f6f7, snout: 1, ears: 1, tail: 1, speed: 8, mass: 50, hostile: true, hp: 58, dmg: 11 },
  bloodhound:  { arch: 'quad', size: 1.15, len: 1.6, hgt: 0.7, wid: 0.56, legH: 0.85, color: 0x6a2a2a, belly: 0x8a3a34, snout: 1, ears: 1, tail: 1, eyes: 0xff4a3a, speed: 8.5, mass: 60, hostile: true, hp: 70, dmg: 14 },
  icestalker:  { arch: 'quad', size: 1.3, len: 1.9, hgt: 0.8, wid: 0.66, legH: 0.95, color: 0xbcd8e4, belly: 0xe4f2f8, snout: 1, ears: 1, tail: 1, horns: 1, speed: 8, mass: 90, hostile: true, hp: 95, dmg: 17 },
  panther:     { arch: 'quad', size: 1.15, len: 1.8, hgt: 0.62, wid: 0.5, legH: 0.85, color: 0x2a2a30, belly: 0x3a3a44, snout: 1, ears: 1, tail: 1, speed: 9, mass: 60, hostile: true, hp: 74, dmg: 15 },
  bear:        { arch: 'quad', size: 1.6, len: 2.1, hgt: 1.1, wid: 1.0, legH: 0.8, color: 0x4a3a2c, belly: 0x6a5540, snout: 1, ears: 1, speed: 6.5, mass: 260, hostile: true, hp: 160, dmg: 24 },
  scorpion:    { arch: 'arach', size: 0.7, color: 0x8a6a3a, color2: 0xa8834a, speed: 4, mass: 20, hostile: true, hp: 40, dmg: 10 },
  crawler:     { arch: 'arach', size: 0.55, color: 0x4a5a3a, color2: 0x6a7a4a, speed: 5, mass: 15, hostile: true, hp: 34, dmg: 8 },
  lurker:      { arch: 'quad', size: 1.2, len: 1.7, hgt: 0.8, wid: 0.8, legH: 0.6, color: 0x3f4a35, belly: 0x55603f, snout: 1, ears: 0, tail: 1, speed: 5, mass: 110, hostile: true, hp: 88, dmg: 16 },
  infected:    { arch: 'biped', size: 1.0, legH: 0.85, torso: 0.9, wid: 0.55, head: 0.42, color: 0x5a6a4a, skin: 0x8a9a6a, hair: 0x3a3a2a, eyes: 0xc8ff6a, speed: 4.2, mass: 70, hostile: true, hp: 62, dmg: 12 },
  bandit:      { arch: 'biped', size: 1.0, legH: 0.9, torso: 0.95, wid: 0.56, head: 0.42, color: 0x5a4a3a, skin: 0xd0a07a, hair: 0x2a2118, cloak: 0x4a3a2c, speed: 4.6, mass: 75, hostile: true, hp: 70, dmg: 13, armed: true },
  hollow:      { arch: 'biped', size: 1.1, legH: 0.95, torso: 1.0, wid: 0.5, head: 0.44, color: 0x3a3a42, skin: 0x9aa0a8, hair: 0x22222a, eyes: 0x9fe8ff, cloak: 0x2a2a34, speed: 4.4, mass: 70, hostile: true, hp: 80, dmg: 15 },
  stonegolem:  { arch: 'biped', size: 1.7, legH: 1.0, torso: 1.5, wid: 1.1, head: 0.6, color: 0x7a766c, skin: 0x8a867c, legsColor: 0x6a665c, speed: 2.8, mass: 600, hostile: true, hp: 220, dmg: 30 },
  harpy:       { arch: 'fly', size: 0.8, color: 0x8a6a5a, wingColor: 0xb08a6a, headColor: 0xd8b090, speed: 11, mass: 40, hostile: true, hp: 55, dmg: 12, flying: true },
  sandworm:    { arch: 'serp', size: 0.8, color: 0xb08a5a, segments: 7, speed: 5, mass: 300, hostile: true, hp: 180, dmg: 26 },
  ashbeast:    { arch: 'quad', size: 1.4, len: 2.0, hgt: 0.9, wid: 0.8, legH: 0.9, color: 0x3a3230, belly: 0x5a3a2a, snout: 1, ears: 1, eyes: 0xff7a3a, speed: 6, mass: 180, hostile: true, hp: 130, dmg: 20 },
  lavaling:    { arch: 'blob', size: 0.7, color: 0x6a2a1a, glow: 0x8a2a08, eyes: 0xffb03a, speed: 3, mass: 40, hostile: true, hp: 48, dmg: 11 },
  magmite:     { arch: 'blob', size: 1.1, color: 0x4a3a3a, glow: 0x6a2208, eyes: 0xff8a3a, speed: 2.2, mass: 200, hostile: true, hp: 120, dmg: 18 },
  shardling:   { arch: 'blob', size: 0.8, color: 0x7ac8d8, glow: 0x2a6a78, eyes: 0xd8ffff, speed: 4.5, mass: 30, hostile: true, hp: 52, dmg: 10 },
  spitter:     { arch: 'quad', size: 0.9, len: 1.1, hgt: 0.6, wid: 0.6, legH: 0.5, color: 0x6a4a7a, belly: 0x8a6a9a, snout: 1, speed: 4.5, mass: 40, hostile: true, hp: 44, dmg: 9, ranged: true },
  wisp:        { arch: 'blob', size: 0.4, color: 0xbfe8e0, glow: 0x3a8a80, eyes: 0xffffff, speed: 3.5, mass: 1, hostile: true, hp: 26, dmg: 6, flying: true },
  guardian:    { arch: 'biped', size: 1.9, legH: 1.2, torso: 1.6, wid: 1.0, head: 0.55, color: 0x4a6a5a, skin: 0x6a8a72, hair: 0x2a3a30, eyes: 0x9fffe0, speed: 4.0, mass: 400, hostile: true, hp: 260, dmg: 32 },
  drowned:     { arch: 'biped', size: 1.0, legH: 0.85, torso: 0.9, wid: 0.52, head: 0.42, color: 0x3a5a5a, skin: 0x7aa0a0, hair: 0x22302e, speed: 3.2, mass: 70, hostile: true, hp: 55, dmg: 11, aquatic: true },
  crow_swarm:  { arch: 'fly', size: 0.24, color: 0x181820, speed: 10, mass: 0.5, hostile: true, hp: 12, dmg: 4, flying: true },
};

export function buildCreature(type, opts = {}) {
  const def = CREATURES[type] || CREATURES.deer;
  const g = new THREE.Group();
  g.userData.type = type;
  g.userData.def = def;
  const o = Object.assign({}, def, opts);
  switch (def.arch) {
    case 'quad': quadruped(g, o); break;
    case 'biped': biped(g, o); break;
    case 'arach': arachnid(g, o); break;
    case 'fly': flyer(g, o); break;
    case 'serp': serpent(g, o); break;
    case 'blob': blobby(g, o); break;
    case 'fish': fish(g, o); break;
    default: quadruped(g, o);
  }
  const s = opts.scale || 1;
  g.scale.setScalar(s);
  g.userData.phase = Math.random() * 6.28;
  g.userData.flash = 0;
  return g;
}

/** Per-frame procedural animation. state: {speed, attack, hit, dying, yaw} */
export function animateCreature(g, dt, state = {}) {
  const u = g.userData;
  const def = u.def || {};
  const speed = state.speed || 0;
  u.phase += dt * (2.2 + speed * 1.5);
  const p = u.phase;
  const amp = Math.min(1, speed / 4);

  if (u.legs) {
    for (let i = 0; i < u.legs.length; i++) {
      const off = (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI * 0.5 : 0);
      u.legs[i].rotation.x = Math.sin(p + off) * 0.85 * amp;
      if (def.arch === 'arach') u.legs[i].rotation.z = Math.sin(p * 0.5 + off) * 0.12;
    }
  }
  if (u.arms) {
    const a = state.attack || 0;
    for (let i = 0; i < u.arms.length; i++) {
      const off = i ? Math.PI : 0;
      u.arms[i].rotation.x = Math.sin(p + off) * 0.7 * amp - a * (i === 0 ? 2.2 : 0.3);
    }
  }
  if (u.wings) {
    for (let i = 0; i < u.wings.length; i++) {
      u.wings[i].rotation.x = (i ? -1 : 1) * (0.35 + Math.sin(p * 2.4) * 0.75);
    }
  }
  if (u.segments) {
    for (let i = 0; i < u.segments.length; i++) {
      u.segments[i].position.z = Math.sin(p * 1.6 - i * 0.7) * 0.35 * (0.3 + amp);
      u.segments[i].position.y = 0.9 * (u.def.size || 0.8) + Math.sin(p * 1.2 - i * 0.5) * 0.12;
    }
  }
  if (u.body) {
    u.body.position.y = Math.abs(Math.sin(p)) * 0.09 * amp;
    u.body.rotation.z = Math.sin(p * 0.5) * 0.03 * amp;
  }
  if (u.head) {
    u.head.rotation.y = state.look === undefined ? Math.sin(p * 0.3) * 0.25 : state.look;
    u.head.rotation.x = state.attack ? -0.3 * state.attack : 0;
  }
  if (u.tail) u.tail.rotation.y = Math.sin(p * 0.9) * 0.4;
  if (u.flash > 0) u.flash = Math.max(0, u.flash - dt * 4);
  if (state.dying) {
    g.rotation.z = Math.min(Math.PI / 2, g.rotation.z + dt * 3.2);
    g.position.y = Math.max(-0.4, g.position.y - dt * 0.5);
  } else if (g.rotation.z > 0) g.rotation.z = Math.max(0, g.rotation.z - dt * 3);
}

function shade(hex, amt) {
  const r = Math.max(0, Math.min(255, ((hex >> 16) & 255) + amt * 255));
  const g = Math.max(0, Math.min(255, ((hex >> 8) & 255) + amt * 255));
  const b = Math.max(0, Math.min(255, (hex & 255) + amt * 255));
  return (r << 16) | (g << 8) | b;
}

export { shade, part };
export default buildCreature;
