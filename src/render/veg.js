/**
 * WANDERER — Vegetation, rocks and scatter
 * ----------------------------------------
 * One InstancedMesh per species for the whole visible world (so draw calls
 * stay flat no matter how big the view distance is). Placement is decided by
 * the column's biome, climate and slope, hashed so it is stable, and thinned
 * around structures so nothing grows through a building.
 *
 * Wind is injected into the standard material's vertex shader, so grass bends
 * and trees sway without a custom shader per species.
 */

import * as THREE from '../three.js';
import { ENV } from './env.js';
import { mergeParts, xform, jitter, box, cyl, cone, sphere, ico, crossQuad } from './geom.js';
import { hash2, hash3 } from '../core/rng.js';
import { clamp01 } from '../core/noise.js';

/* ── shared wind material ─────────────────────────────────────────── */

const WIND_VERT = /* glsl */`
#include <common>
uniform float uTime;
uniform float uWind;
uniform float uSway;
` ;

export function windMaterial(color, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    side: opts.side || THREE.FrontSide,
    transparent: !!opts.transparent,
    alphaTest: opts.alphaTest || 0,
    flatShading: !!opts.flat,
  });
  const sway = opts.sway === undefined ? 1 : opts.sway;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = ENV.uTime;
    shader.uniforms.uWind = ENV.uWind;
    shader.uniforms.uSway = { value: sway };
    shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\nuniform float uSway;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 iPos = vec3(modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2]);
      #endif
      float phase = iPos.x * 0.31 + iPos.z * 0.27;
      float hgt = max(transformed.y, 0.0);
      float amt = uSway * uWind * hgt * hgt * 0.014;
      transformed.x += sin(uTime * 1.7 + phase) * amt;
      transformed.z += cos(uTime * 1.31 + phase * 1.37) * amt * 0.75;
    `);
  };
  mat.customProgramCacheKey = () => `wind${sway}${opts.alphaTest || 0}${opts.side === THREE.DoubleSide ? 'd' : 's'}`;
  return mat;
}

/* ── species geometry library ─────────────────────────────────────── */

const C = {
  trunk: 0x6b4a30, trunkDark: 0x4a3320, bark: 0x57402c, birch: 0xd8d2c4,
  leaf: 0x4d7a34, leafDark: 0x38602a, leafPine: 0x2f5738, leafSnow: 0x3b5f4a,
  leafJungle: 0x3f8a3a, leafDead: 0x6a5a44, leafGold: 0xa8893c,
  crystal: 0x8fd8e8, cap: 0xb0553f, capGlow: 0x7fd8c0, stem: 0xd9cdb4,
  grass: 0x6f9a44, grassDry: 0xa89a52, flower: 0xd86a8a, fern: 0x4f8a4a,
  rock: 0x7d7a72, rockDark: 0x5c5a54, ore: 0xb08a4a, copperOre: 0x9c6a44,
  sand: 0xd6c08a, dead: 0x55493a,
};

function treePine(snow) {
  const parts = [
    { geo: cyl(0.16, 0.34, 2.4, 6), matrix: xform(0, 1.2, 0), color: C.trunk },
    { geo: cone(1.5, 2.6, 7), matrix: xform(0, 2.6, 0), color: snow ? C.leafSnow : C.leafPine },
    { geo: cone(1.15, 2.3, 7), matrix: xform(0, 4.0, 0), color: snow ? C.leafSnow : C.leafPine },
    { geo: cone(0.75, 1.9, 7), matrix: xform(0, 5.2, 0), color: snow ? C.leafSnow : C.leafPine },
  ];
  if (snow) parts.push({ geo: cone(1.2, 0.5, 7), matrix: xform(0, 4.4, 0), color: 0xe8f0f4 });
  return mergeParts(parts);
}

function treeOak(big) {
  const s = big ? 2.6 : 1;
  return mergeParts([
    { geo: cyl(0.3 * s, 0.6 * s, 4 * s, 7), matrix: xform(0, 2 * s, 0), color: C.trunk },
    { geo: jitter(ico(2.5 * s, 1), 0.42 * s, 3), matrix: xform(0, 5.4 * s, 0), color: C.leaf },
    { geo: jitter(ico(1.7 * s, 1), 0.35 * s, 9), matrix: xform(1.6 * s, 4.6 * s, 0.6 * s), color: C.leafDark },
    { geo: jitter(ico(1.4 * s, 1), 0.3 * s, 17), matrix: xform(-1.3 * s, 5.0 * s, -0.9 * s), color: C.leaf },
  ]);
}

function treeBirch() {
  return mergeParts([
    { geo: cyl(0.13, 0.22, 6.4, 6), matrix: xform(0, 3.2, 0), color: C.birch },
    { geo: jitter(ico(1.5, 1), 0.3, 5), matrix: xform(0, 6.6, 0), color: 0x86a84a },
    { geo: jitter(ico(1.1, 1), 0.25, 11), matrix: xform(0.8, 5.8, 0.3), color: 0x9cba52 },
  ]);
}

function treePalm() {
  const parts = [{ geo: cyl(0.16, 0.3, 6.5, 6), matrix: xform(0, 3.2, 0, 0, 1, 1, 1, 0, 0.06), color: C.bark }];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push({ geo: box(0.42, 0.1, 3.0), matrix: xform(Math.cos(a) * 1.3, 6.5, Math.sin(a) * 1.3, -a, 1, 1, 1, 0.42), color: C.leafJungle });
  }
  parts.push({ geo: sphere(0.32, 6), matrix: xform(0, 6.35, 0), color: 0x7a5a2a });
  return mergeParts(parts);
}

function treeDead(fallen) {
  const parts = [{ geo: cyl(0.18, 0.42, 6, 6), matrix: xform(0, 3, 0, 0, 1, 1, 1, 0, 0.04), color: C.dead }];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    parts.push({ geo: cyl(0.06, 0.13, 2.4, 5), matrix: xform(Math.cos(a) * 0.9, 4.6 + i * 0.2, Math.sin(a) * 0.9, -a, 1, 1, 1, 0.9), color: C.dead });
  }
  return mergeParts(parts);
}

function treeJungle() {
  return mergeParts([
    { geo: cyl(0.4, 0.8, 11, 7), matrix: xform(0, 5.5, 0), color: C.trunkDark },
    { geo: jitter(ico(3.4, 1), 0.6, 21), matrix: xform(0, 12.4, 0), color: C.leafJungle },
    { geo: jitter(ico(2.2, 1), 0.5, 33), matrix: xform(2.2, 10.8, 1.0), color: 0x2f7a35 },
    { geo: jitter(ico(1.8, 1), 0.4, 41), matrix: xform(-1.8, 11.4, -1.6), color: 0x46913c },
  ]);
}

function treeCrystal() {
  return mergeParts([
    { geo: cyl(0.25, 0.5, 3.4, 6), matrix: xform(0, 1.7, 0), color: 0x6a7a92 },
    { geo: cone(1.1, 4.2, 5), matrix: xform(0, 4.6, 0), color: C.crystal, tint: 1 },
    { geo: cone(0.6, 2.6, 5), matrix: xform(1.1, 3.4, 0.4, 0.6, 1, 1, 1, 0.3), color: 0xa8ecf4 },
    { geo: cone(0.5, 2.1, 5), matrix: xform(-0.9, 3.0, -0.6, -0.4, 1, 1, 1, -0.35), color: 0x9fdcec },
  ]);
}

function treeMushroom(big) {
  const s = big ? 4 : 1;
  return mergeParts([
    { geo: cyl(0.5 * s, 0.8 * s, 4.5 * s, 8), matrix: xform(0, 2.25 * s, 0), color: C.stem },
    { geo: sphere(2.6 * s, 10), matrix: xform(0, 5.0 * s, 0, 0, 1, 0.55, 1), color: big ? C.capGlow : C.cap },
    { geo: cyl(2.55 * s, 2.55 * s, 0.12 * s, 10), matrix: xform(0, 4.5 * s, 0), color: 0xe8dcc4 },
  ]);
}

function treeFrostedJungle() {
  return mergeParts([
    { geo: cyl(0.35, 0.7, 9, 7), matrix: xform(0, 4.5, 0), color: 0x8a8f96 },
    { geo: jitter(ico(2.8, 1), 0.5, 51), matrix: xform(0, 10.2, 0), color: 0xc6dce2 },
    { geo: jitter(ico(1.8, 1), 0.4, 61), matrix: xform(1.8, 9.0, 0.8), color: 0xdceef2 },
  ]);
}

function treeMangrove() {
  const parts = [{ geo: jitter(ico(1.9, 1), 0.35, 71), matrix: xform(0, 3.4, 0), color: 0x4a6b3a }];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push({ geo: cyl(0.1, 0.16, 3.4, 5), matrix: xform(Math.cos(a) * 0.9, 1.6, Math.sin(a) * 0.9, -a, 1, 1, 1, 0.35), color: C.trunkDark });
  }
  return mergeParts(parts);
}

function plantGrass(dry) {
  return mergeParts(crossQuad(0.5, 0.85, 2).map(p => ({ ...p, color: dry ? C.grassDry : C.grass })));
}
function plantFern() {
  return mergeParts(crossQuad(0.85, 0.7, 3).map(p => ({ ...p, color: C.fern })));
}
function plantFlower() {
  return mergeParts([
    ...crossQuad(0.45, 0.6, 2).map(p => ({ ...p, color: 0x5f8a3a })),
    { geo: sphere(0.13, 5), matrix: xform(0, 0.62, 0), color: C.flower },
  ]);
}
function plantMushroom() {
  return mergeParts([
    { geo: cyl(0.06, 0.08, 0.3, 5), matrix: xform(0, 0.15, 0), color: C.stem },
    { geo: sphere(0.2, 6), matrix: xform(0, 0.32, 0, 0, 1, 0.6, 1), color: C.cap },
  ]);
}
function plantGlowcap() {
  return mergeParts([
    { geo: cyl(0.08, 0.1, 0.4, 5), matrix: xform(0, 0.2, 0), color: 0xcfe8d8 },
    { geo: sphere(0.26, 6), matrix: xform(0, 0.42, 0, 0, 1, 0.6, 1), color: C.capGlow },
  ]);
}
function plantBush() {
  return mergeParts([
    { geo: jitter(ico(0.7, 1), 0.16, 81), matrix: xform(0, 0.5, 0), color: 0x4a7238 },
    { geo: jitter(ico(0.5, 1), 0.12, 91), matrix: xform(0.45, 0.38, 0.2), color: 0x578040 },
  ]);
}
function plantReed() {
  return mergeParts(crossQuad(0.4, 1.5, 3).map(p => ({ ...p, color: 0x7a8f4a })));
}
function plantCactus() {
  return mergeParts([
    { geo: cyl(0.34, 0.4, 2.6, 7), matrix: xform(0, 1.3, 0), color: 0x4f7a45 },
    { geo: cyl(0.2, 0.24, 1.2, 6), matrix: xform(0.5, 1.7, 0, 0, 1, 1, 1, 0, 0.5), color: 0x4f7a45 },
  ]);
}
function rockMesh(ore, big) {
  const r = big ? 1.9 : 0.9;
  const parts = [{ geo: jitter(ico(r, 0), r * 0.28, 101), matrix: xform(0, r * 0.5, 0), color: big ? C.rockDark : C.rock }];
  if (ore) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      parts.push({ geo: ico(r * 0.22, 0), matrix: xform(Math.cos(a) * r * 0.7, r * 0.55, Math.sin(a) * r * 0.7), color: ore === 'crystal' ? C.crystal : (ore === 'copper' ? C.copperOre : C.ore) });
    }
  }
  return mergeParts(parts);
}
function crystalCluster() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, d = i === 0 ? 0 : 0.5;
    parts.push({ geo: cone(0.24, 1.4 + (i % 3) * 0.5, 5), matrix: xform(Math.cos(a) * d, 0.7, Math.sin(a) * d, a, 1, 1, 1, (i % 2 ? 0.2 : -0.15)), color: i % 2 ? 0xa8ecf4 : C.crystal });
  }
  return mergeParts(parts);
}

export const SPECIES = {
  pine:            { geo: () => treePine(false), scale: [0.8, 1.5], sway: 0.5, kind: 'tree' },
  pine_snow:       { geo: () => treePine(true), scale: [0.8, 1.5], sway: 0.4, kind: 'tree' },
  oak:             { geo: () => treeOak(false), scale: [0.8, 1.4], sway: 0.7, kind: 'tree' },
  giant_oak:       { geo: () => treeOak(true), scale: [0.9, 1.35], sway: 0.35, kind: 'tree' },
  birch:           { geo: () => treeBirch(), scale: [0.8, 1.3], sway: 0.9, kind: 'tree' },
  palm:            { geo: () => treePalm(), scale: [0.8, 1.2], sway: 0.8, kind: 'tree' },
  deadpine:        { geo: () => treeDead(), scale: [0.7, 1.2], sway: 0.25, kind: 'tree' },
  deadtree:        { geo: () => treeDead(), scale: [0.9, 1.5], sway: 0.25, kind: 'tree' },
  jungle:          { geo: () => treeJungle(), scale: [0.8, 1.3], sway: 0.5, kind: 'tree' },
  mangrove:        { geo: () => treeMangrove(), scale: [0.8, 1.3], sway: 0.6, kind: 'tree' },
  crystal_tree:    { geo: () => treeCrystal(), scale: [0.8, 1.5], sway: 0.3, kind: 'tree' },
  frosted_jungle:  { geo: () => treeFrostedJungle(), scale: [0.8, 1.3], sway: 0.4, kind: 'tree' },
  giant_mushroom:  { geo: () => treeMushroom(true), scale: [0.8, 1.3], sway: 0.25, kind: 'tree' },
  cactus:          { geo: () => plantCactus(), scale: [0.7, 1.4], sway: 0.05, kind: 'tree' },
  grass:           { geo: () => plantGrass(false), scale: [0.7, 1.5], sway: 2.2, kind: 'plant', double: true },
  grass_dry:       { geo: () => plantGrass(true), scale: [0.7, 1.5], sway: 2.2, kind: 'plant', double: true },
  fern:            { geo: () => plantFern(), scale: [0.7, 1.4], sway: 1.8, kind: 'plant', double: true },
  flower:          { geo: () => plantFlower(), scale: [0.7, 1.3], sway: 2.0, kind: 'plant', double: true },
  reed:            { geo: () => plantReed(), scale: [0.8, 1.4], sway: 2.4, kind: 'plant', double: true },
  mushroom:        { geo: () => plantMushroom(), scale: [0.7, 1.5], sway: 0.4, kind: 'plant' },
  glowcap:         { geo: () => plantGlowcap(), scale: [0.8, 1.6], sway: 0.4, kind: 'plant', emissive: 0x2a6a5a },
  bush:            { geo: () => plantBush(), scale: [0.7, 1.5], sway: 1.1, kind: 'plant' },
  rock:            { geo: () => rockMesh(null, false), scale: [0.6, 1.8], sway: 0, kind: 'rock' },
  boulder:         { geo: () => rockMesh(null, true), scale: [0.7, 1.7], sway: 0, kind: 'rock' },
  ore_rock:        { geo: () => rockMesh('iron', false), scale: [0.7, 1.4], sway: 0, kind: 'rock', harvest: 'iron' },
  copper_rock:     { geo: () => rockMesh('copper', false), scale: [0.7, 1.4], sway: 0, kind: 'rock', harvest: 'copper' },
  crystal_rock:    { geo: () => rockMesh('crystal', false), scale: [0.8, 1.5], sway: 0, kind: 'rock', harvest: 'crystal' },
  crystal_cluster: { geo: () => crystalCluster(), scale: [0.8, 1.8], sway: 0, kind: 'rock', harvest: 'crystal', emissive: 0x1c4a52 },
};

const PLANT_BY_BIOME = {
  temperate: ['grass', 'fern', 'flower', 'mushroom', 'bush'],
  ancient: ['fern', 'mushroom', 'bush', 'grass', 'glowcap'],
  plains: ['grass', 'flower', 'bush'],
  hills: ['grass', 'flower', 'bush'],
  desert: ['grass_dry', 'cactus'],
  flooded_desert: ['grass_dry', 'reed'],
  canyon: ['grass_dry'],
  badlands: ['grass_dry'],
  tundra: ['grass', 'mushroom'],
  taiga: ['grass', 'mushroom', 'bush'],
  alpine: ['grass'],
  glacier: [],
  swamp: ['reed', 'grass', 'mushroom', 'bush'],
  jungle: ['fern', 'grass', 'flower', 'bush'],
  volcanic: ['grass_dry'],
  ashfield: [],
  coast: ['grass', 'reed'],
  dead_forest: ['mushroom', 'grass_dry'],
  crystal_forest: ['glowcap', 'crystal_cluster', 'grass'],
  mushroom_valley: ['mushroom', 'glowcap', 'fern'],
  frozen_jungle: ['grass', 'mushroom'],
  red_snow: ['grass'],
  volcanic_swamp: ['reed', 'mushroom'],
  ocean: [], deep_ocean: [],
};

export class VegetationSystem {
  constructor(world, scene, opts = {}) {
    this.world = world;
    this.scene = scene;
    this.opts = Object.assign({ density: 1, grass: true }, opts);
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    scene.add(this.group);

    this.geos = {};
    this.materials = {};
    this.meshes = {};
    this.capacity = { tree: 9000, plant: 22000, rock: 6000 };
    this.dirty = true;
    this.counts = {};
    this._initSpecies();
  }

  _initSpecies() {
    for (const name in SPECIES) {
      const def = SPECIES[name];
      const geo = def.geo();
      this.geos[name] = geo;
      const mat = windMaterial(0xffffff, {
        sway: def.sway,
        side: def.double ? THREE.DoubleSide : THREE.FrontSide,
        flat: def.kind === 'rock',
      });
      if (def.emissive) { mat.emissive = new THREE.Color(def.emissive); }
      this.materials[name] = mat;
      const cap = this.capacity[def.kind] || 4000;
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;      // we manage visibility by rebuilding
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.meshes[name] = mesh;
      this.counts[name] = 0;
      this.group.add(mesh);
    }
  }

  setDensity(d) {
    this.opts.density = d;
    this.dirty = true;
  }

  /** Compute scatter for a freshly built chunk (called once per chunk). */
  populate(chunk) {
    if (chunk.lod > 1) { chunk.veg = null; return; }
    const world = this.world;
    const gen = world.gen;
    const step = this.opts.grass ? 6 : 12;
    const out = {};
    const col = {};
    const pois = world.poisNear(chunk.minX + 64, chunk.minZ + 64, 220);

    for (let z = chunk.minZ + 2; z < chunk.maxZ; z += step) {
      for (let x = chunk.minX + 2; x < chunk.maxX; x += step) {
        const h1 = hash2(Math.round(x * 3), Math.round(z * 3), world.seed + 11) / 4294967296;
        const h2 = hash2(Math.round(x * 3), Math.round(z * 3), world.seed + 29) / 4294967296;
        const jx = x + (h1 - 0.5) * step * 0.9;
        const jz = z + (h2 - 0.5) * step * 0.9;
        const c = gen.sample(jx, jz, col);
        if (c.h < 0.5) continue;

        const gd = gen.grassDensity(c) * this.opts.density;
        const td = gen.treeDensity(c) * this.opts.density;
        const rd = gen.rockDensity(c) * this.opts.density;
        const wantPlant = gd > 0.02 && h1 < gd * 0.85;
        const wantTree = td > 0.02 && h2 < td * 0.5;
        const wantRock = h1 > 0.988 - rd * 0.06;
        if (!wantPlant && !wantTree && !wantRock) continue;
        if (world.waterAt(jx, jz, c.h) !== null) continue;
        if (this._nearPoi(pois, jx, jz, 10)) continue;

        if (wantPlant) {
          const list = PLANT_BY_BIOME[c.biome];
          if (list && list.length) {
            const sp = list[(h2 * list.length) | 0] || list[0];
            if (SPECIES[sp]) (out[sp] || (out[sp] = [])).push({ x: jx, z: jz, s: 0.7 + h2 * 0.8, ry: h1 * 6.28 });
          }
        }
        if (wantTree) {
          const dom = c.weights && c.weights[0] ? c.weights[0].id : c.biome;
          const set = SPECIES_SET[dom] || SPECIES_SET[c.biome] || ['oak'];
          if (set.length) {
            const sp = set[(h1 * set.length) | 0] || set[0];
            if (SPECIES[sp]) (out[sp] || (out[sp] = [])).push({ x: jx, z: jz, s: 0.75 + h1 * 0.7, ry: h2 * 6.28 });
          }
        }
        if (wantRock) {
          const r = h2 < 0.22 ? 'boulder' : (c.h > 30 && h2 < 0.42 ? 'ore_rock' : 'rock');
          (out[r] || (out[r] = [])).push({ x: jx, z: jz, s: 0.6 + h2 * 1.2, ry: h1 * 6.28 });
        }
      }
    }
    chunk.veg = out;
    this.dirty = true;
  }

  _nearPoi(pois, x, z, r) {
    for (const p of pois) {
      const rr = (p.radius || 20) + r;
      if (Math.abs(p.x - x) < rr && Math.abs(p.z - z) < rr) return true;
    }
    return false;
  }

  /** Rebuild the instance buffers from all populated chunks near the camera. */
  rebuild(camPos, radius = 420) {
    const mats = {};
    for (const name in this.meshes) mats[name] = { n: 0 };
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();
    const col = new THREE.Color();

    for (const chunk of this._chunks()) {
      if (!chunk.veg) continue;
      const cx = chunk.minX + 64, cz = chunk.minZ + 64;
      if (camPos && Math.abs(cx - camPos.x) > radius + 90 && Math.abs(cz - camPos.z) > radius + 90) continue;
      for (const name in chunk.veg) {
        const mesh = this.meshes[name];
        if (!mesh) continue;
        const st = mats[name];
        const def = SPECIES[name];
        const arr = chunk.veg[name];
        for (let i = 0; i < arr.length; i++) {
          if (st.n >= mesh.instanceMatrix.count) break;
          const it = arr[i];
          const y = this.world.gen.height(it.x, it.z);
          const sc = it.s * (def.scale ? (def.scale[0] + def.scale[1]) * 0.5 : 1);
          e.set(0, it.ry, 0);
          q.setFromEuler(e);
          v.set(it.x, y - 0.06, it.z);
          s.set(sc, sc * (0.85 + ((i * 17) % 10) / 33), sc);
          m.compose(v, q, s);
          mesh.setMatrixAt(st.n, m);
          const t = 0.86 + ((i * 31) % 13) / 46;
          col.setRGB(t, t * (0.98 + ((i * 7) % 5) / 100), t * 0.97);
          mesh.setColorAt(st.n, col);
          st.n++;
        }
      }
    }
    for (const name in this.meshes) {
      const mesh = this.meshes[name];
      mesh.count = mats[name].n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.visible = mesh.count > 0;
      this.counts[name] = mats[name].n;
    }
    this.dirty = false;
  }

  _chunks() {
    const sys = this.terrain;
    return sys ? sys.chunks.values() : [];
  }

  attachTerrain(terrain) { this.terrain = terrain; }

  update(camPos) {
    if (this.dirty) this.rebuild(camPos);
  }

  dispose() {
    for (const name in this.meshes) {
      this.group.remove(this.meshes[name]);
      this.geos[name].dispose();
      this.materials[name].dispose();
    }
  }
}

/** Which tree species a biome grows. */
const SPECIES_SET = {
  temperate: ['oak', 'birch', 'pine'],
  ancient: ['giant_oak', 'oak', 'pine'],
  plains: ['oak', 'birch'],
  hills: ['oak', 'pine', 'birch'],
  desert: ['cactus', 'palm'],
  canyon: ['deadpine'],
  badlands: ['deadpine'],
  tundra: ['pine_snow'],
  taiga: ['pine_snow', 'pine'],
  alpine: ['pine_snow'],
  glacier: [],
  swamp: ['mangrove', 'deadpine'],
  jungle: ['jungle', 'palm', 'giant_oak'],
  volcanic: ['deadpine'],
  ashfield: ['deadpine'],
  coast: ['palm', 'pine'],
  dead_forest: ['deadtree'],
  crystal_forest: ['crystal_tree'],
  mushroom_valley: ['giant_mushroom'],
  frozen_jungle: ['frosted_jungle'],
  red_snow: ['pine_snow'],
  volcanic_swamp: ['deadpine', 'mangrove'],
  flooded_desert: ['palm'],
  ocean: [], deep_ocean: [],
};

export { SPECIES_SET, PLANT_BY_BIOME };
export default VegetationSystem;
