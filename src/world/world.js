/**
 * WANDERER — World facade
 * -----------------------
 * One object the whole game talks to. Owns the generator, the river system,
 * the point-of-interest grid, the cave system and the exploration record.
 * Everything is derived from the world description, so a world can be
 * rebuilt byte-identically from { name, seed, size, type, gen }.
 */

import { WorldGen } from './gen.js';
import { RiverSystem } from './rivers.js';
import { clamp01, smoothstep } from '../core/noise.js';
import { PoiSystem, buildBlueprint, POI_TYPES, POI_CELL } from './poi.js';
import { cellRng, hash2, normalizeSeed } from '../core/rng.js';
import { SEA_LEVEL, TILE_METERS } from './config.js';

export const REGION_CELL = 512;   // POI / spawn decision grid

export class World {
  constructor(desc) {
    this.desc = desc;
    this.name = desc.name || 'Unnamed World';
    this.seed = normalizeSeed(desc.seed);
    this.gen = new WorldGen(desc);
    this.rivers = new RiverSystem(this.gen);
    this.poiSystem = new PoiSystem(this);
    this._blueprints = new Map();

    // exploration record (saved)
    this.discovered = new Set();    // biome ids seen
    this.visitedCells = new Set();  // map reveal, REGION_CELL buckets
    this.markers = [];              // player placed
    this.knownPois = new Set();     // poi ids the player has found
    this.timeOfDay = 0.28;          // 0..1 (0.25 = sunrise)
    this.day = 1;

    this._col = {};                 // reusable sample object
    this._stats = null;
  }

  get infinite() { return this.gen.infinite; }
  get sizeMeters() { return this.gen.sizeMeters; }

  /* ── surface queries ─────────────────────────────────────────────── */

  /** Terrain height (dry). */
  heightAt(x, z) { return this.gen.height(x, z); }

  /** Water surface height here, or null. */
  waterAt(x, z, h) {
    const hh = h === undefined ? this.gen.height(x, z) : h;
    if (hh < -0.35) return SEA_LEVEL;
    const lake = this.gen.lakeLevel(x, z);
    if (lake !== null && hh < lake) return lake;
    const r = this.rivers.waterAt(x, z, 30);
    if (r) return r.y;
    return null;
  }

  /**
   * The height an entity should stand on: terrain, or the bed under shallow
   * water (walking in a river is allowed; deep water means swimming).
   */
  surfaceAt(x, z) {
    const h = this.gen.height(x, z);
    const w = this.waterAt(x, z, h);
    return { ground: h, water: w, depth: w === null ? 0 : w - h };
  }

  /** Full column sample (biome, climate...). Pass `out` in hot loops. */
  columnAt(x, z, out) {
    return this.gen.sample(x, z, out || this._col);
  }

  /** Cheap biome id without the full sample. */
  biomeAt(x, z) { return this.gen.sample(x, z, this._col).biome; }

  /* ── streaming helpers ───────────────────────────────────────────── */

  /** Make sure everything needed to render/simulate this bbox is queued. */
  ensure(x, z, radius) {
    this.rivers.ensureRegion(x - radius, z - radius, x + radius, z + radius);
    this.poiSystem.ensureRegion(x - radius, z - radius, x + radius, z + radius);
  }

  /** Work the background generation queues for up to `ms` milliseconds. */
  tickGeneration(ms = 3) {
    this.rivers.process(ms * 0.6);
    this.poiSystem.process(ms * 0.4);
  }

  /** Nothing left queued — the chunk manager may mesh. */
  generationIdle() { return this.rivers.pending === 0 && this.poiSystem.pending === 0; }

  /* ── points of interest ─────────────────────────────────────────── */

  ensurePois(minX, minZ, maxX, maxZ) { this.poiSystem.ensureRegion(minX, minZ, maxX, maxZ); }
  processPois(ms = 3) { this.poiSystem.process(ms); }
  poisNear(x, z, r) { return this.poiSystem.poisNear(x, z, r); }
  poiById(id) { return this.poiSystem.byId(id); }

  /** Blueprint (part list) for a POI, built once and cached. */
  blueprint(poi) {
    let bp = this._blueprints.get(poi.id);
    if (!bp) { bp = buildBlueprint(this, poi); this._blueprints.set(poi.id, bp); }
    return bp;
  }

  /** Finite worlds have an edge; the ocean takes over beyond it. */
  inBounds(x, z) {
    if (this.infinite) return true;
    const half = this.sizeMeters * 0.5 - 40;
    return Math.abs(x) < half && Math.abs(z) < half;
  }

  /* ── exploration record ──────────────────────────────────────────── */

  noteVisit(x, z) {
    const i = Math.floor(x / REGION_CELL), j = Math.floor(z / REGION_CELL);
    this.visitedCells.add(i * 100000 + j);
  }

  isVisited(x, z) {
    const i = Math.floor(x / REGION_CELL), j = Math.floor(z / REGION_CELL);
    return this.visitedCells.has(i * 100000 + j);
  }

  visitedFraction(sampleStep = 512) {
    if (this.infinite) return 0;
    const half = this.sizeMeters / 2;
    let total = 0, seen = 0;
    for (let x = -half; x < half; x += sampleStep) {
      for (let z = -half; z < half; z += sampleStep) {
        total++;
        if (this.isVisited(x, z)) seen++;
      }
    }
    return total ? seen / total : 0;
  }

  /* ── map / preview sampling ──────────────────────────────────────── */

  /**
   * Low resolution heightfield + biome map used by the creation preview and
   * the in-game cartography view.
   */
  sampleRegion(cx, cz, span, res, genRivers = true) {
    const h = new Float32Array(res * res);
    const water = new Float32Array(res * res);
    const biome = new Uint8Array(res * res);
    const ids = [];
    const idIndex = new Map();
    const step = span / (res - 1);
    const min = cx - span / 2, minz = cz - span / 2;

    if (genRivers) {
      this.rivers.ensureRegion(min, minz, min + span, minz + span, 400);
      this.rivers.processAll();
    }

    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const x = min + i * step, z = minz + j * step;
        const k = j * res + i;
        const hh = this.gen.height(x, z);
        h[k] = hh;
        const col = this.gen.sample(x, z, this._col);
        let id = idIndex.get(col.biome);
        if (id === undefined) { id = ids.length; ids.push(col.biome); idIndex.set(col.biome, id); }
        biome[k] = id;
        const w = this.waterAt(x, z, hh);
        water[k] = w === null ? 0 : w;
      }
    }
    return { h, water, biome, ids, res, span, minX: min, minZ: minz, step };
  }

  /* ── spawn point ─────────────────────────────────────────────────── */

  /**
   * Spec 42: the player never starts in a random hole. Search outward from
   * the world centre for ground that is flat, dry, above the water, near
   * trees and stone, with something interesting within a kilometre.
   */
  findSpawn() {
    const gen = this.gen;
    const candidates = [];
    const rng = cellRng(this.seed, 7, 7, 4242);
    const spread = this.infinite ? 4000 : Math.min(3500, this.sizeMeters * 0.42);

    this.rivers.ensureRegion(-spread, -spread, spread, spread, 600);
    this.rivers.processAll();
    this.ensurePois(-spread, -spread, spread, spread);
    this.processPois(1000);

    for (let ring = 0; ring < 26; ring++) {
      const r = ring * (spread / 26);
      const n = ring === 0 ? 6 : 18;
      for (let t = 0; t < n; t++) {
        const a = (t / n) * Math.PI * 2 + ring * 0.7;
        const x = Math.cos(a) * r + rng.range(-60, 60);
        const z = Math.sin(a) * r + rng.range(-60, 60);
        const score = this.spawnScore(x, z);
        if (score.score > 0) candidates.push(score);
      }
      if (candidates.length > 24) break;
    }
    if (!candidates.length) return { x: 0, z: 0, y: Math.max(3, gen.height(0, 0)), score: 0, reason: 'fallback' };
    candidates.sort((a, b) => b.score - a.score);
    const pick = candidates[Math.min(2, (rng.float() * 3) | 0)];
    return { x: pick.x, z: pick.z, y: Math.max(gen.height(pick.x, pick.z) + 0.2, 1), score: pick.score, biome: this.biomeAt(pick.x, pick.z) };
  }

  spawnScore(x, z) {
    const gen = this.gen;
    const h = gen.height(x, z);
    if (h < 2.5 || h > 420) return { x, z, score: 0 };
    const w = this.waterAt(x, z, h);
    if (w !== null && w - h > 0.4) return { x, z, score: 0 };

    // flatness
    const e = 7;
    const dh = Math.max(
      Math.abs(gen.height(x + e, z) - h), Math.abs(gen.height(x - e, z) - h),
      Math.abs(gen.height(x, z + e) - h), Math.abs(gen.height(x, z - e) - h),
    );
    if (dh > 4.5) return { x, z, score: 0 };

    const col = gen.sample(x, z, this._col);
    let score = 20 - dh * 2.2;
    score += Math.min(18, (h - 2) * 0.35);
    if (col.temp > 2 && col.temp < 30) score += 12;         // survivable climate
    if (col.biome === 'glacier' || col.biome === 'volcanic' || col.biome === 'ashfield') score -= 40;
    if (col.biome === 'deep_ocean' || col.biome === 'ocean') return { x, z, score: 0 };

    // trees + stone nearby
    let trees = 0, rocks = 0, waterNear = 0, poi = 0;
    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        const sx = x + i * 34, sz = z + j * 34;
        const c = gen.sample(sx, sz, {});
        trees += gen.treeDensity(c);
        rocks += gen.rockDensity(c);
        const sw = this.waterAt(sx, sz, c.h);
        if (sw !== null) waterNear++;
      }
    }
    score += Math.min(16, trees * 1.4);
    score += Math.min(10, rocks * 2.2);
    score += waterNear > 2 ? 12 : waterNear > 0 ? 6 : -8;

    const near = this.poisNear(x, z, 900);
    poi = near.length;
    score += Math.min(22, poi * 9) - (poi ? 0 : 7);
    // mild preference for staying reasonably close to the middle of the map
    if (!this.infinite) score -= (Math.hypot(x, z) / this.sizeMeters) * 26;

    return { x, z, score, trees, rocks, waterNear, poi };
  }

  /* ── world statistics (used by the world info panel) ─────────────── */

  statistics() {
    if (this._stats) return this._stats;
    const res = 160;
    const span = this.infinite ? 12000 : this.sizeMeters;
    const counts = {};
    let land = 0, maxH = -1e9, minH = 1e9, water = 0;
    for (let i = 0; i < res; i++) {
      for (let j = 0; j < res; j++) {
        const x = -span / 2 + (i / (res - 1)) * span;
        const z = -span / 2 + (j / (res - 1)) * span;
        const h = this.gen.height(x, z);
        if (h > maxH) maxH = h;
        if (h < minH) minH = h;
        const b = this.gen.sample(x, z, this._col).biome;
        counts[b] = (counts[b] || 0) + 1;
        if (h > 0) land++;
        if (this.waterAt(x, z, h) !== null) water++;
      }
    }
    const n = res * res;
    this._stats = {
      landFraction: land / n,
      waterFraction: water / n,
      peak: maxH,
      deepest: minH,
      biomes: Object.entries(counts).map(([id, c]) => ({ id, fraction: c / n })).sort((a, b) => b.fraction - a.fraction),
      rivers: [...this.rivers.walks.values()].filter(Boolean).length,
    };
    return this._stats;
  }
}

export { SEA_LEVEL, TILE_METERS, POI_TYPES, POI_CELL, clamp01, smoothstep };
