/**
 * WANDERER — Player character model
 * ---------------------------------
 * Modular by design: hair, skin, clothing, armour, backpack and headgear are
 * separate meshes on named sockets, so equipping an item changes what you
 * actually see (spec 10).
 */

import * as THREE from '../three.js';
import { mat, part, shade } from './creatures.js';
import { box, cyl, sphere, cone, jitter } from './geom.js';

export const SKIN_TONES = [0xf2d3b8, 0xe0b48f, 0xc68f63, 0xa06a42, 0x7a4c2c, 0x54331d, 0x8fb0a0, 0xc0a8d0];
export const HAIR_COLORS = [0x2a2118, 0x4a3524, 0x8a6a3a, 0xc8a45a, 0xd8d2c4, 0x9a3a2a, 0x3a5a8a, 0x6a4a8a, 0xe0e0e8];
export const HAIR_STYLES = ['short', 'long', 'braid', 'bald', 'hood', 'topknot'];
export const CLOTH_COLORS = [0x5a6a4a, 0x6a5a4a, 0x4a5a6a, 0x6a4a4a, 0x4a4a52, 0x7a6a3a, 0x3a6a5a, 0x8a7a6a];
export const FACES = ['plain', 'scar', 'freckles', 'painted', 'glow'];

export function defaultLook() {
  return {
    skin: 1, hair: 0, hairStyle: 0, hairColor: 0, cloth: 0, face: 0,
    height: 1.0, build: 1.0,
  };
}

export function buildPlayer(look = defaultLook()) {
  const l = Object.assign(defaultLook(), look);
  const skin = SKIN_TONES[l.skin % SKIN_TONES.length];
  const hairCol = HAIR_COLORS[l.hairColor % HAIR_COLORS.length];
  const cloth = CLOTH_COLORS[l.cloth % CLOTH_COLORS.length];
  const g = new THREE.Group();
  const H = 1.78 * l.height;
  const legH = H * 0.48, torsoH = H * 0.30, headR = H * 0.115;
  const wide = 0.30 * l.build;

  const body = new THREE.Group(); g.add(body); g.userData.body = body;

  // torso
  const torso = part(body, box(wide * 1.7, torsoH, wide * 1.0), mat(cloth, { flat: true }), 0, legH + torsoH * 0.5, 0);
  g.userData.torso = torso;
  part(body, box(wide * 1.74, torsoH * 0.28, wide * 1.04), mat(shade(cloth, -0.14), { flat: true }), 0, legH + torsoH * 0.16, 0);
  // hips
  part(body, box(wide * 1.5, H * 0.08, wide * 0.95), mat(shade(cloth, -0.2), { flat: true }), 0, legH - H * 0.02, 0);

  // head
  const head = new THREE.Group();
  head.position.set(0, legH + torsoH + headR * 0.95, 0);
  body.add(head); g.userData.head = head;
  part(head, box(headR * 1.7, headR * 2.0, headR * 1.6), mat(skin, { flat: true }), 0, 0, 0);
  part(head, box(headR * 0.5, headR * 0.28, headR * 0.3), mat(shade(skin, -0.1), { flat: true }), 0, -headR * 0.35, headR * 0.82);
  // eyes
  part(head, box(headR * 0.28, headR * 0.16, 0.02), mat(0x2a2a2a), -headR * 0.4, headR * 0.15, headR * 0.82);
  part(head, box(headR * 0.28, headR * 0.16, 0.02), mat(0x2a2a2a), headR * 0.4, headR * 0.15, headR * 0.82);
  if (l.face === 1) part(head, box(headR * 0.1, headR * 1.1, 0.02), mat(0x8a4a3a), headR * 0.7, 0, headR * 0.83);
  if (l.face === 3) part(head, box(headR * 1.5, headR * 0.22, 0.02), mat(0x6a8a7a), 0, headR * 0.6, headR * 0.83);
  if (l.face === 4) part(head, box(headR * 1.2, headR * 0.1, 0.02), mat(0x9fe8ff, { emissive: 0x2a5a66 }), 0, headR * 0.2, headR * 0.84);

  // hair
  const hairGroup = new THREE.Group(); head.add(hairGroup); g.userData.hair = hairGroup;
  const style = HAIR_STYLES[l.hairStyle % HAIR_STYLES.length];
  if (style === 'short') {
    part(hairGroup, box(headR * 1.82, headR * 0.85, headR * 1.72), mat(hairCol, { flat: true }), 0, headR * 0.66, -headR * 0.05);
  } else if (style === 'long') {
    part(hairGroup, box(headR * 1.86, headR * 0.9, headR * 1.78), mat(hairCol, { flat: true }), 0, headR * 0.62, -headR * 0.05);
    part(hairGroup, box(headR * 1.7, headR * 2.4, headR * 0.5), mat(hairCol, { flat: true }), 0, -headR * 0.5, -headR * 0.75);
  } else if (style === 'braid') {
    part(hairGroup, box(headR * 1.84, headR * 0.88, headR * 1.76), mat(hairCol, { flat: true }), 0, headR * 0.64, -headR * 0.05);
    for (let i = 0; i < 4; i++) part(hairGroup, sphere(headR * 0.26, 5), mat(hairCol, { flat: true }), 0, -headR * (0.4 + i * 0.5), -headR * 0.8);
  } else if (style === 'topknot') {
    part(hairGroup, box(headR * 1.8, headR * 0.7, headR * 1.7), mat(hairCol, { flat: true }), 0, headR * 0.7, -headR * 0.06);
    part(hairGroup, sphere(headR * 0.42, 6), mat(hairCol, { flat: true }), 0, headR * 1.25, -headR * 0.2);
  }

  // arms with hand sockets
  g.userData.arms = [];
  for (const s of [1, -1]) {
    const sh = new THREE.Group();
    sh.position.set(s * wide * 1.05, legH + torsoH * 0.86, 0);
    body.add(sh);
    part(sh, cyl(wide * 0.24, wide * 0.28, torsoH * 0.95, 6), mat(cloth, { flat: true }), 0, -torsoH * 0.45, 0);
    const fore = new THREE.Group(); fore.position.set(0, -torsoH * 0.9, 0); sh.add(fore);
    part(fore, cyl(wide * 0.2, wide * 0.24, torsoH * 0.8, 6), mat(skin, { flat: true }), 0, -torsoH * 0.4, 0);
    const hand = new THREE.Group(); hand.position.set(0, -torsoH * 0.85, 0); fore.add(hand);
    part(hand, box(wide * 0.36, wide * 0.4, wide * 0.3), mat(skin, { flat: true }), 0, 0, 0);
    g.userData['hand' + (s > 0 ? 'R' : 'L')] = hand;
    g.userData.arms.push({ shoulder: sh, fore, hand, side: s });
  }

  // legs
  g.userData.legs = [];
  for (const s of [1, -1]) {
    const hip = new THREE.Group();
    hip.position.set(s * wide * 0.52, legH, 0);
    body.add(hip);
    part(hip, cyl(wide * 0.3, wide * 0.34, legH * 0.55, 6), mat(shade(cloth, -0.1), { flat: true }), 0, -legH * 0.28, 0);
    const knee = new THREE.Group(); knee.position.set(0, -legH * 0.55, 0); hip.add(knee);
    part(knee, cyl(wide * 0.24, wide * 0.28, legH * 0.45, 6), mat(shade(cloth, -0.16), { flat: true }), 0, -legH * 0.22, 0);
    part(knee, box(wide * 0.36, wide * 0.2, wide * 0.6), mat(0x3a322c, { flat: true }), 0, -legH * 0.45, wide * 0.12);
    g.userData.legs.push({ hip, knee, side: s });
  }

  // equipment sockets
  const back = new THREE.Group(); back.position.set(0, legH + torsoH * 0.6, -wide * 0.72); body.add(back);
  g.userData.back = back;
  const headS = new THREE.Group(); headS.position.set(0, headR * 1.0, 0); head.add(headS);
  g.userData.headgear = headS;
  const chest = new THREE.Group(); chest.position.set(0, legH + torsoH * 0.55, 0); body.add(chest);
  g.userData.chest = chest;

  // default backpack
  const pack = new THREE.Group(); back.add(pack); g.userData.pack = pack;
  part(pack, box(wide * 1.3, torsoH * 0.95, wide * 0.7), mat(0x6a5238, { flat: true }), 0, 0, -wide * 0.35);
  part(pack, box(wide * 1.1, torsoH * 0.2, wide * 0.2), mat(0x4a3a28, { flat: true }), 0, torsoH * 0.3, -wide * 0.72);
  part(pack, cyl(wide * 0.2, wide * 0.2, torsoH * 0.7, 6), mat(0x8a8272, { flat: true }), wide * 0.5, -torsoH * 0.1, -wide * 0.6, 0.2);

  g.userData.look = l;
  g.userData.H = H;
  g.userData.phase = 0;
  return g;
}

/** Swap a hair style / colour without rebuilding the whole body. */
export function restyle(model, look) {
  const l = Object.assign(model.userData.look, look);
  const hairCol = HAIR_COLORS[l.hairColor % HAIR_COLORS.length];
  const hg = model.userData.hair;
  while (hg.children.length) {
    const c = hg.children.pop();
    c.geometry.dispose();
  }
  const headR = model.userData.H * 0.115;
  const style = HAIR_STYLES[l.hairStyle % HAIR_STYLES.length];
  if (style === 'short') part(hg, box(headR * 1.82, headR * 0.85, headR * 1.72), mat(hairCol, { flat: true }), 0, headR * 0.66, -headR * 0.05);
  else if (style === 'long') {
    part(hg, box(headR * 1.86, headR * 0.9, headR * 1.78), mat(hairCol, { flat: true }), 0, headR * 0.62, -headR * 0.05);
    part(hg, box(headR * 1.7, headR * 2.4, headR * 0.5), mat(hairCol, { flat: true }), 0, -headR * 0.5, -headR * 0.75);
  } else if (style === 'braid') {
    part(hg, box(headR * 1.84, headR * 0.88, headR * 1.76), mat(hairCol, { flat: true }), 0, headR * 0.64, -headR * 0.05);
    for (let i = 0; i < 4; i++) part(hg, sphere(headR * 0.26, 5), mat(hairCol, { flat: true }), 0, -headR * (0.4 + i * 0.5), -headR * 0.8);
  } else if (style === 'topknot') {
    part(hg, box(headR * 1.8, headR * 0.7, headR * 1.7), mat(hairCol, { flat: true }), 0, headR * 0.7, -headR * 0.06);
    part(hg, sphere(headR * 0.42, 6), mat(hairCol, { flat: true }), 0, headR * 1.25, -headR * 0.2);
  }
}

/** Attach a visible item mesh to a socket (weapon, shield, headgear...). */
export function attachItem(model, socketName, obj) {
  const socket = model.userData[socketName];
  if (!socket) return null;
  const old = socket.userData.attached;
  if (old) socket.remove(old);
  if (obj) {
    socket.add(obj);
    socket.userData.attached = obj;
  } else socket.userData.attached = null;
  return obj;
}

/** Animate: walk cycle, sprint lean, crouch, swim, climb, glide, attack. */
export function animatePlayer(model, dt, st) {
  const u = model.userData;
  const speed = st.speed || 0;
  const moving = speed > 0.2;
  u.phase += dt * (moving ? 3.4 + speed * 0.85 : 1.2);
  const p = u.phase;
  const amp = Math.min(1, speed / 4.5);
  const crouch = st.crouch ? 1 : 0;
  u.crouchT = (u.crouchT || 0) + (crouch - (u.crouchT || 0)) * Math.min(1, dt * 10);
  const c = u.crouchT || 0;

  if (st.swim) {
    for (const l of u.legs) { l.hip.rotation.x = Math.sin(p * 1.2 + l.side) * 0.5; l.knee.rotation.x = 0.2; }
    for (const a of u.arms) { a.shoulder.rotation.x = Math.sin(p * 1.2 + a.side * 2) * 1.4 - 1.2; a.fore.rotation.x = -0.4; }
    u.body.rotation.x = 0.9;
    u.body.position.y = 0;
    return;
  }
  if (st.climb) {
    for (const a of u.arms) { a.shoulder.rotation.x = -2.4 + Math.sin(p * 2 + a.side) * 0.5; a.fore.rotation.x = -0.7; }
    for (const l of u.legs) { l.hip.rotation.x = Math.sin(p * 2 + l.side) * 0.6; l.knee.rotation.x = 0.5; }
    u.body.rotation.x = 0.12;
    u.body.position.y = -0.12 * c;
    return;
  }
  if (st.glide) {
    for (const a of u.arms) { a.shoulder.rotation.x = -1.5; a.shoulder.rotation.z = a.side * 1.1; a.fore.rotation.x = -0.2; }
    for (const l of u.legs) { l.hip.rotation.x = 0.25; l.knee.rotation.x = 0.5; }
    u.body.rotation.x = 0.35;
    u.body.position.y = 0;
    return;
  }

  u.body.rotation.x = (0.16 * amp + (st.sprint ? 0.1 : 0)) * (1 - c) + 0.35 * c;
  u.body.position.y = -0.3 * c + Math.abs(Math.sin(p)) * 0.045 * amp;
  u.body.rotation.z = Math.sin(p) * 0.035 * amp;

  for (const l of u.legs) {
    const off = l.side > 0 ? 0 : Math.PI;
    l.hip.rotation.x = Math.sin(p + off) * 0.9 * amp - 0.1 * c;
    l.knee.rotation.x = Math.max(0, Math.sin(p + off + 1.1)) * 0.9 * amp + 0.7 * c;
  }
  const atk = st.attack || 0;
  for (const a of u.arms) {
    const off = a.side > 0 ? Math.PI : 0;
    let swing = Math.sin(p + off) * 0.75 * amp;
    if (atk > 0 && a.side > 0) swing = -2.3 * atk + 0.4;
    if (st.block && a.side < 0) swing = -1.35;
    a.shoulder.rotation.x = swing - 0.5 * c;
    a.shoulder.rotation.z = a.side * (0.08 + (st.block && a.side < 0 ? 0.5 : 0));
    a.fore.rotation.x = st.block && a.side < 0 ? -1.5 : -0.25 - atk * 0.6;
  }
  if (u.head) {
    u.head.rotation.x = -u.body.rotation.x * 0.65 + (st.lookPitch || 0) * 0.35;
    u.head.rotation.y = (st.lookYaw || 0) * 0.25;
  }
}

export default buildPlayer;
