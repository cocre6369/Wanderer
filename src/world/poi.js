/**
 * WANDERER — Points of interest
 * -----------------------------
 * Structures are placed by rule, not scattered at random (spec 39): villages
 * need flat ground and water, mines sit on ore, temples sit in jungle,
 * shipwrecks sit in shallow water, monasteries sit on peaks.
 *
 * Every structure is then assembled from a small vocabulary of parts by a
 * modular grammar driven by its own RNG, so no two ruins are alike and the
 * same one is identical on every visit.
 */

import { cellRng, hash2, hash3 } from '../core/rng.js';
import { clamp01, smoothstep, noise2, fbm2 } from '../core/noise.js';
import { settlementName, landmarkName, npcIdentity } from '../core/names.js';

export const POI_CELL = 512;

/** type -> { label, icon, big, underground, tags } */
export const POI_TYPES = {
  village:      { label: 'Village',            icon: 'village',  big: 2, tags: ['settlement'] },
  ruin:         { label: 'Ruins',              icon: 'ruin',     tags: ['ruin'] },
  oldruin:      { label: 'Ancient Ruins',      icon: 'ruin',     tags: ['ruin', 'ancient'] },
  sunkenruin:   { label: 'Sunken Ruins',       icon: 'ruin',     tags: ['ruin', 'wet'] },
  cabin:        { label: 'Abandoned Cabin',    icon: 'cabin',    tags: ['shelter'] },
  shack:        { label: 'Swamp Shack',        icon: 'cabin',    tags: ['shelter'] },
  camp:         { label: 'Camp',               icon: 'camp',     tags: ['camp'] },
  banditcamp:   { label: 'Bandit Camp',        icon: 'camp',     tags: ['camp', 'hostile'] },
  watchtower:   { label: 'Watchtower',         icon: 'tower',    tags: ['tower'] },
  mine:         { label: 'Mine',               icon: 'mine',     tags: ['resource'] },
  farm:         { label: 'Farmstead',          icon: 'farm',     tags: ['settlement'] },
  temple:       { label: 'Temple',             icon: 'temple',   big: 2, tags: ['ancient'] },
  pyramid:      { label: 'Desert Pyramid',     icon: 'pyramid',  big: 2, tags: ['ancient'] },
  monastery:    { label: 'Mountain Monastery', icon: 'temple',   big: 2, tags: ['ancient'] },
  forge_temple: { label: 'Forge Temple',       icon: 'temple',   big: 2, tags: ['ancient', 'hot'] },
  dungeon:      { label: 'Dungeon',            icon: 'dungeon',  underground: true, tags: ['dungeon'] },
  cave:         { label: 'Cave',               icon: 'cave',     underground: true, tags: ['cave'] },
  icecave:      { label: 'Ice Cave',           icon: 'cave',     underground: true, tags: ['cave', 'cold'] },
  crystal_cavern:{ label: 'Crystal Cavern',     icon: 'cave',     underground: true, big: 2, tags: ['cave', 'rare'] },
  bunker:       { label: 'Buried Bunker',      icon: 'dungeon',  underground: true, tags: ['dungeon'] },
  shipwreck:    { label: 'Shipwreck',          icon: 'wreck',    tags: ['wreck'] },
  oasis:        { label: 'Oasis',              icon: 'oasis',    tags: ['water'] },
  shrine:       { label: 'Shrine',             icon: 'shrine',   tags: ['ancient'] },
  barrow:       { label: 'Barrow',             icon: 'shrine',   tags: ['ancient'] },
  fossil:       { label: 'Fossil Bed',         icon: 'fossil',   tags: ['rare'] },
  buried:       { label: 'Buried Structure',   icon: 'ruin',     tags: ['ruin'] },
  hollowspire:  { label: 'Hollow Spire',       icon: 'spire',    big: 2, tags: ['mystery'] },
  arch:         { label: 'Natural Arch',       icon: 'arch',     big: 2, tags: ['landmark'] },
  spire:        { label: 'Stone Spire',        icon: 'spire',    big: 2, tags: ['landmark'] },
  statue:       { label: 'Ancient Statue',     icon: 'statue',   big: 2, tags: ['landmark', 'ancient'] },
  crater:       { label: 'Meteor Crater',      icon: 'crater',   big: 2, tags: ['landmark'] },
  observatory:  { label: 'Observatory',        icon: 'tower',    big: 2, tags: ['landmark', 'ancient'] },
  castle:       { label: 'Ruined Castle',      icon: 'castle',   big: 2, tags: ['landmark', 'ancient'] },
  gianttree:    { label: 'Giant Tree',         icon: 'tree',     big: 2, tags: ['landmark'] },
  bridge:       { label: 'Canyon Bridge',      icon: 'bridge',   big: 2, tags: ['landmark'] },
  floatingisle: { label: 'Floating Island',    icon: 'isle',     big: 2, tags: ['landmark', 'rare'] },
  waterfall:    { label: 'Great Falls',        icon: 'falls',    big: 2, tags: ['landmark'] },
};

const HABITABLE = new Set(['plains', 'temperate', 'hills', 'coast', 'ancient', 'taiga', 'jungle', 'desert', 'tundra', 'canyon', 'swamp', 'badlands']);

export class PoiSystem {
  constructor(world) {
    this.world = world;
    this.cells = new Map();       // "i,j" -> poi[] (or null)
    this.queue = [];
    this.queued = new Set();
    this.blueprints = new Map();  // poi id -> blueprint
    this.roads = new Map();
    this.list = [];               // every generated poi
  }

  cellKey(i, j) { return i * 100000 + j; }

  ensureRegion(minX, minZ, maxX, maxZ) {
    const i0 = Math.floor(minX / POI_CELL) - 1, i1 = Math.floor(maxX / POI_CELL) + 1;
    const j0 = Math.floor(minZ / POI_CELL) - 1, j1 = Math.floor(maxZ / POI_CELL) + 1;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = this.cellKey(i, j);
        if (this.cells.has(k) || this.queued.has(k)) continue;
        this.queued.add(k);
        this.queue.push([i, j]);
      }
    }
  }

  process(ms = 3) {
    const t0 = now();
    while (this.queue.length) {
      const [i, j] = this.queue.pop();
      this.queued.delete(this.cellKey(i, j));
      this._generateCell(i, j);
      if (now() - t0 > ms) break;
    }
  }

  processAll(max = 200000) {
    let n = 0;
    while (this.queue.length && n < max) {
      const [i, j] = this.queue.pop();
      this.queued.delete(this.cellKey(i, j));
      this._generateCell(i, j);
      n++;
    }
  }

  get pending() { return this.queue.length; }

  /* ── placement ───────────────────────────────────────────────────── */

  _generateCell(i, j) {
    const key = this.cellKey(i, j);
    if (this.cells.has(key)) return;
    const world = this.world;
    const gen = world.gen;
    const rng = cellRng(world.seed, i, j, 31337);
    const out = [];
    this.cells.set(key, out);

    // Sample the cell to learn what kind of ground this is.
    const cx = (i + 0.5) * POI_CELL, cz = (j + 0.5) * POI_CELL;
    const spot = this._bestSpot(rng, cx, cz, POI_CELL * 0.42);
    if (!spot) return;
    const col = gen.sample(spot.x, spot.z, {});
    const water = world.waterAt(spot.x, spot.z, col.h);
    spot.y = col.h;

    const g = gen.p;
    const density = (0.35 + g.ruin * 0.65) * (world.desc.type === 'explorer' ? 1.5 : 1);
    if (rng.float() > 0.56 * density + 0.2) {
      // empty cell — but still allow a landmark
      const lm = this._tryLandmark(i, j, rng, spot, col);
      if (lm) out.push(lm);
      return;
    }

    const candidates = this._candidates(col, water, spot, rng, g);
    if (!candidates.length) {
      const lm = this._tryLandmark(i, j, rng, spot, col);
      if (lm) out.push(lm);
      return;
    }

    const type = rng.weighted(candidates);
    const poi = this._makePoi(type, i, j, rng, spot, col, water);
    if (poi) out.push(poi);

    // A second, smaller thing sometimes shares the cell.
    if (rng.chance(0.22 * density)) {
      const spot2 = this._bestSpot(rng, cx, cz, POI_CELL * 0.42, spot);
      if (spot2 && Math.hypot(spot2.x - spot.x, spot2.z - spot.z) > 90) {
        const col2 = gen.sample(spot2.x, spot2.z, {});
        const water2 = world.waterAt(spot2.x, spot2.z, col2.h);
        const c2 = this._candidates(col2, water2, spot2, rng, g, type);
        if (c2.length) {
          const p2 = this._makePoi(rng.weighted(c2), i, j, rng.fork(2), spot2, col2, water2);
          if (p2) out.push(p2);
        }
      }
    }
  }

  /** Find flat, dry, in-bounds ground inside a cell. */
  _bestSpot(rng, cx, cz, rad, avoid) {
    const gen = this.world.gen;
    let best = null, bestScore = -1e9;
    for (let t = 0; t < 14; t++) {
      const a = rng.float() * Math.PI * 2;
      const r = Math.sqrt(rng.float()) * rad;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!this.world.inBounds(x, z)) continue;
      if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < 70) continue;
      const h = gen.height(x, z);
      if (h < -1) continue;
      const e = 8;
      const dh = Math.max(
        Math.abs(gen.height(x + e, z) - h), Math.abs(gen.height(x - e, z) - h),
        Math.abs(gen.height(x, z + e) - h), Math.abs(gen.height(x, z - e) - h),
      );
      const score = 30 - dh * 3 - Math.max(0, h - 700) * 0.05;
      if (score > bestScore) { bestScore = score; best = { x, z, y: h, slope: dh / e }; }
    }
    return bestScore > 4 ? best : null;
  }

  /** Weighted candidate list for this ground (spec 39 — contextual logic). */
  _candidates(col, water, spot, rng, g, exclude) {
    const world = this.world;
    const out = [];
    const add = (type, w) => { if (type !== exclude && w > 0) out.push([type, w]); };
    const b = col.biome;
    const flat = 1 - clamp01(col.slope / 0.5);
    const nearWater = water !== null || this._waterNear(spot.x, spot.z, 260);

    // Villages: flat, water, habitable, and spaced out on a coarse grid.
    if (HABITABLE.has(b) && flat > 0.45 && nearWater && col.h > 2 && col.h < 400) {
      if (this._clusterWinner(spot.x, spot.z, 4, 9001)) add('village', 2.2 + g.village * 7);
    }
    if (b === 'plains' && flat > 0.6 && col.h > 3) add('farm', 1.0 + g.village * 2.4);

    // Ruins follow the biome's own table plus the global ruin dial.
    add('ruin', 1.3 + g.ruin * 2.6);
    if (b === 'ancient' || b === 'jungle' || b === 'desert' || b === 'canyon') add('oldruin', 1.2 + g.ruin * 3.4);
    if (b === 'swamp') add('sunkenruin', 2.4 + g.ruin * 3);
    if (b === 'temperate' || b === 'taiga' || b === 'tundra') add('cabin', 1.8 + g.ruin * 2);
    if (b === 'swamp') add('shack', 2.0);
    add('camp', 1.2 + g.ruin * 1.6);
    if (b === 'badlands' || b === 'desert' || b === 'canyon' || b === 'hills') add('banditcamp', 0.8 + g.enemy * 2);

    if (col.slope > 0.22 || col.h > 120) add('watchtower', 1.1);
    if (col.h > 60 && this._oreNear(spot.x, spot.z)) add('mine', 1.6 + g.resource * 3);
    if (b === 'jungle') add('temple', 1.0 + g.ruin * 2.2);
    if (b === 'desert') add('pyramid', 0.9 + g.ruin * 2.2);
    if (b === 'alpine' && col.h > 260) add('monastery', 0.8 + g.ruin * 1.8);
    if (b === 'volcanic' || b === 'ashfield') add('forge_temple', 1.0 + g.ruin * 2);
    if (b === 'desert') add('buried', 1.2 + g.ruin * 2);
    if (b === 'badlands') add('fossil', 1.2);
    add('shrine', 0.7 + g.mystery * 2);
    if (b === 'dead_forest' || b === 'tundra' || b === 'ancient') add('barrow', 1.0 + g.ruin * 1.4);

    // Underground
    const caveP = 0.9 + g.cave * 4.5;
    if (col.slope > 0.16 && col.h > 4) add('cave', caveP);
    if ((b === 'tundra' || b === 'glacier' || b === 'taiga') && col.h > 20) add('icecave', caveP * 0.8);
    if (col.h > 40 && this._clusterWinner(spot.x, spot.z, 3, 4242)) add('dungeon', 0.7 + g.dungeon * 4.2);
    if (col.h > 20 && this._clusterWinner(spot.x, spot.z, 4, 8181)) add('bunker', 0.5 + g.dungeon * 2);
    if (this._clusterWinner(spot.x, spot.z, 6, 6060) && g.caveSize > 0.35) add('crystal_cavern', 0.35 + g.caveSize * 1.6);

    if (b === 'coast' && water !== null) add('shipwreck', 2.2);
    if (water === null && col.h > 0.5 && col.h < 60 && (b === 'desert' || col.humid < 0.3)) add('oasis', 1.6);

    // Mystery layer — rare by design
    if (this._clusterWinner(spot.x, spot.z, 7, 2222)) add('hollowspire', 0.25 + g.mystery * 2.2);

    return out;
  }

  _tryLandmark(i, j, rng, spot, col) {
    const g = this.world.gen.p;
    if (!this._clusterWinner(spot.x, spot.z, 6, 5150)) return null;
    if (rng.float() > 0.35 + g.landmark * 0.6) return null;
    const options = [
      ['arch', col.slope > 0.2 || col.h > 90 ? 3 : 0.4],
      ['spire', 2.2],
      ['statue', 1.6],
      ['crater', 1.2],
      ['observatory', col.h > 150 ? 2 : 0.4],
      ['castle', col.h > 80 && col.slope < 0.4 ? 1.8 : 0.3],
      ['gianttree', col.biome === 'ancient' || col.biome === 'temperate' || col.biome === 'jungle' ? 2.6 : 0.2],
      ['bridge', col.biome === 'canyon' || col.slope > 0.35 ? 2.2 : 0.1],
      ['floatingisle', 0.6 + g.mystery],
      ['waterfall', col.h > 120 && this._waterNear(spot.x, spot.z, 200) ? 2.4 : 0.1],
    ].filter(o => o[1] > 0);
    if (!options.length) return null;
    return this._makePoi(rng.weighted(options), i, j, rng.fork(9), spot, col, null, true);
  }

  /** Deterministic spacing: only the lowest-hash cell of a span×span block wins. */
  _clusterWinner(x, z, span, tag) {
    const i = Math.floor(x / POI_CELL), j = Math.floor(z / POI_CELL);
    const bi = Math.floor(i / span), bj = Math.floor(j / span);
    const mine = hash3(i, j, tag, this.world.seed);
    for (let a = bi * span; a < bi * span + span; a++) {
      for (let b = bj * span; b < bj * span + span; b++) {
        if (a === i && b === j) continue;
        if (hash3(a, b, tag, this.world.seed) < mine) return false;
      }
    }
    return true;
  }

  _waterNear(x, z, r) {
    const w = this.world;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      if (w.waterAt(x + Math.cos(a) * r, z + Math.sin(a) * r) !== null) return true;
    }
    return w.rivers.waterAt(x, z, r * 0.7) !== null;
  }

  /** Ore bodies are 3D noise; a mine only appears where one breaks the surface. */
  _oreNear(x, z) {
    const gen = this.world.gen;
    for (let y = -8; y > -90; y -= 22) {
      const v = fbm2((x + y * 3.1) * 0.004, (z - y * 1.7) * 0.004, this.world.seed + 991, 2);
      if (v > 0.34 - gen.p.resource * 0.2) return true;
    }
    return false;
  }

  _makePoi(type, i, j, rng, spot, col, water, isLandmark = false) {
    const def = POI_TYPES[type];
    if (!def) return null;
    const id = `${type}@${i},${j}`;
    const poi = {
      id, type,
      label: def.label,
      x: spot.x, z: spot.z, y: spot.y,
      rot: rng.float() * Math.PI * 2,
      scale: def.big === 2 ? rng.range(1.15, 1.9) : rng.range(0.85, 1.25),
      biome: col.biome,
      tags: def.tags ? def.tags.slice() : [],
      underground: !!def.underground,
      landmark: isLandmark || !!def.big,
      radius: (def.big === 2 ? 60 : 26) * (def.big === 2 ? 1.4 : 1),
      icon: def.icon,
      seed: hash2(i, j, this.world.seed + 17),
      name: null,
      discovered: false,
      lootTaken: false,
      npcs: 0,
    };
    if (type === 'village') { poi.name = settlementName(rng); poi.label = poi.name; poi.npcs = 3 + rng.int(0, 5); poi.radius = 95; }
    else if (def.big) { poi.name = landmarkName(rng); poi.label = poi.name; }
    if (type === 'hollowspire') poi.tags.push('resonant');
    this.list.push(poi);
    return poi;
  }

  /* ── queries ─────────────────────────────────────────────────────── */

  cellAt(i, j) {
    const k = this.cellKey(i, j);
    if (!this.cells.has(k)) { this.ensureRegion(i * POI_CELL, j * POI_CELL, i * POI_CELL + 1, j * POI_CELL + 1); this.processAll(); }
    return this.cells.get(k) || [];
  }

  poisNear(x, z, radius) {
    this.ensureRegion(x - radius, z - radius, x + radius, z + radius);
    const out = [];
    const i0 = Math.floor((x - radius) / POI_CELL), i1 = Math.floor((x + radius) / POI_CELL);
    const j0 = Math.floor((z - radius) / POI_CELL), j1 = Math.floor((z + radius) / POI_CELL);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const arr = this.cells.get(this.cellKey(i, j));
        if (!arr) continue;
        for (const p of arr) {
          if (Math.hypot(p.x - x, p.z - z) <= radius) out.push(p);
        }
      }
    }
    return out;
  }

  villagesNear(x, z, radius) {
    return this.poisNear(x, z, radius).filter(p => p.type === 'village');
  }

  nearestPoi(x, z, filter) {
    let best = null, bd = Infinity;
    for (const p of this.poisNear(x, z, 4000)) {
      if (filter && !filter(p)) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { poi: best, dist: bd } : null;
  }

  byId(id) { return this.list.find(p => p.id === id) || null; }
}

/* ── blueprint grammar ─────────────────────────────────────────────── */

const MATS = ['wood', 'stone', 'brick', 'metal', 'glass', 'crystal', 'bone', 'mud', 'obsidian', 'ancient', 'sand'];

/**
 * Build the part list for a POI. Pure function of the POI's seed, so the
 * structure is stable across sessions and identical for every player.
 */
export function buildBlueprint(world, poi) {
  const rng = cellRng(world.seed, hash2(Math.floor(poi.x), Math.floor(poi.z), 7), poi.type.length * 13 + 5);
  const bp = { parts: [], npcs: [], loot: [], lights: [], carves: [], waters: [], trees: [], roads: [], poi };
  const P = (p) => { bp.parts.push(p); return p; };
  const mat = pickMat(rng, poi);
  const ruin = ruinAmount(rng, poi);

  switch (poi.type) {
    case 'village':      buildVillage(world, poi, rng, bp, P, mat, ruin); break;
    case 'farm':         buildFarm(world, poi, rng, bp, P, mat); break;
    case 'ruin':
    case 'oldruin':
    case 'sunkenruin':
    case 'buried':       buildRuins(world, poi, rng, bp, P, mat, ruin); break;
    case 'cabin':
    case 'shack':        buildCabin(world, poi, rng, bp, P, mat, ruin); break;
    case 'camp':
    case 'banditcamp':   buildCamp(world, poi, rng, bp, P, mat, poi.type === 'banditcamp'); break;
    case 'watchtower':
    case 'observatory':  buildTower(world, poi, rng, bp, P, mat, poi.type === 'observatory'); break;
    case 'mine':         buildMine(world, poi, rng, bp, P, mat); break;
    case 'temple':
    case 'pyramid':
    case 'monastery':
    case 'forge_temple': buildTemple(world, poi, rng, bp, P, mat, poi.type); break;
    case 'dungeon':
    case 'bunker':       buildDungeon(world, poi, rng, bp, P, mat, poi.type === 'bunker'); break;
    case 'cave':
    case 'icecave':
    case 'crystal_cavern': buildCave(world, poi, rng, bp, P, poi.type); break;
    case 'shipwreck':    buildWreck(world, poi, rng, bp, P); break;
    case 'oasis':        buildOasis(world, poi, rng, bp, P); break;
    case 'shrine':
    case 'barrow':       buildShrine(world, poi, rng, bp, P, mat, poi.type === 'barrow'); break;
    case 'fossil':       buildFossil(world, poi, rng, bp, P); break;
    case 'hollowspire':  buildSpireMystery(world, poi, rng, bp, P); break;
    case 'arch':         buildArch(world, poi, rng, bp, P, mat); break;
    case 'spire':        buildStoneSpire(world, poi, rng, bp, P); break;
    case 'statue':       buildStatue(world, poi, rng, bp, P); break;
    case 'crater':       buildCrater(world, poi, rng, bp, P); break;
    case 'castle':       buildCastle(world, poi, rng, bp, P, mat, ruin); break;
    case 'gianttree':    buildGiantTree(world, poi, rng, bp, P); break;
    case 'bridge':       buildBridge(world, poi, rng, bp, P, mat); break;
    case 'floatingisle': buildFloatingIsle(world, poi, rng, bp, P); break;
    case 'waterfall':    buildWaterfall(world, poi, rng, bp, P); break;
    default:             buildRuins(world, poi, rng, bp, P, mat, ruin);
  }
  return bp;
}

function pickMat(rng, poi) {
  const b = poi.biome;
  if (b === 'desert' || b === 'flooded_desert') return rng.chance(0.7) ? 'sand' : 'brick';
  if (b === 'volcanic' || b === 'ashfield' || b === 'volcanic_swamp') return 'obsidian';
  if (b === 'crystal_forest') return 'crystal';
  if (b === 'dead_forest') return rng.chance(0.5) ? 'bone' : 'wood';
  if (b === 'swamp') return rng.chance(0.6) ? 'mud' : 'wood';
  if (b === 'tundra' || b === 'glacier' || b === 'taiga') return rng.chance(0.5) ? 'stone' : 'wood';
  if (poi.tags.includes('ancient')) return rng.chance(0.6) ? 'ancient' : 'stone';
  return rng.weighted([['wood', 5], ['stone', 4], ['brick', 2], ['metal', 1]]);
}

function ruinAmount(rng, poi) {
  if (poi.tags.includes('ancient')) return rng.range(0.55, 0.92);
  return rng.range(0.15, 0.75);
}

/* ── individual builders ─────────────────────────────────────────── */

function buildVillage(world, poi, rng, bp, P, mat, ruin) {
  const layout = rng.weighted([['ring', 3], ['road', 3], ['scatter', 2]]);
  const n = 4 + rng.int(0, 5);
  const centre = { k: 'prop', id: rng.chance(0.5) ? 'well' : 'bonfire', x: 0, y: 0, z: 0, ry: 0, mat: 'stone' };
  bp.parts.push(centre);
  bp.lights.push({ x: 0, y: 2.4, z: 0, color: '#ffb35c', intensity: 1.4, radius: 22 });

  for (let b = 0; b < n; b++) {
    const a = (b / n) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const r = layout === 'ring' ? rng.range(18, 30) : layout === 'road' ? rng.range(10, 20) + (b % 2) * 16 : rng.range(12, 38);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const w = rng.range(5, 9), d = rng.range(5, 10), h = rng.range(3.4, 5.2);
    const ry = layout === 'road' ? a + Math.PI / 2 : a + Math.PI;
    building(bp, P, x, z, w, d, h, ry, rng.chance(0.6) ? 'wood' : mat, rng.range(0, 0.35), rng, {
      chimney: rng.chance(0.45), porch: rng.chance(0.3), second: rng.chance(0.22),
    });
    bp.parts.push({ k: 'prop', id: rng.pick(['barrel', 'crate', 'pot', 'rack', 'cart']), x: x + rng.range(-5, 5), y: 0, z: z + rng.range(-5, 5), ry: rng.float() * 6.28, mat: 'wood' });
    if (rng.chance(0.3)) bp.parts.push({ k: 'prop', id: 'fence', x: x + rng.range(-8, 8), y: 0, z: z + rng.range(-8, 8), ry: rng.float() * 6.28, mat: 'wood' });
  }

  // fields
  const fa = rng.float() * Math.PI * 2;
  for (let f = 0; f < 3; f++) {
    const fx = Math.cos(fa) * (34 + f * 9), fz = Math.sin(fa) * (34 + f * 9);
    bp.parts.push({ k: 'plot', x: fx, y: 0, z: fz, w: 9, d: 9, ry: fa, crop: rng.pick(['wheat', 'root', 'gourd', 'herb']) });
  }

  // people
  for (let p = 0; p < poi.npcs; p++) {
    const a = rng.float() * Math.PI * 2, r = rng.range(4, 30);
    bp.npcs.push({
      ...npcIdentity(rng),
      x: Math.cos(a) * r, z: Math.sin(a) * r,
      homeX: Math.cos(a) * r, homeZ: Math.sin(a) * r,
      stock: rng.int(4, 9),
    });
  }

  // a road out of the village
  const ra = rng.float() * Math.PI * 2;
  bp.roads.push({ x: 0, z: 0, dir: ra, length: rng.range(120, 260) });
  bp.loot.push({ tier: 1, x: rng.range(-20, 20), z: rng.range(-20, 20), container: true });
}

function building(bp, P, x, z, w, d, h, ry, mat, dmg, rng, opts = {}) {
  P({ k: 'box', x, y: h * 0.5 * (1 - dmg * 0.25), z, w, h: h * (1 - dmg * 0.4), d, ry, mat, dmg });
  P({ k: 'roof', x, y: h * (1 - dmg * 0.3), z, w: w * 1.18, d: d * 1.18, h: rng.range(2, 3.4), ry, mat: dmg > 0.6 ? 'wood' : (mat === 'wood' ? 'wood_dark' : 'stone'), dmg });
  if (opts.chimney && dmg < 0.5) P({ k: 'box', x: x + Math.cos(ry) * w * 0.3, y: h * 0.9, z: z + Math.sin(ry) * w * 0.3, w: 0.9, h: h * 0.7, d: 0.9, ry, mat: 'stone', dmg: dmg * 0.5 });
  if (opts.porch && dmg < 0.6) P({ k: 'box', x: x - Math.sin(ry) * d * 0.55, y: 1.2, z: z + Math.cos(ry) * d * 0.55, w: w * 0.9, h: 0.25, d: 2.2, ry, mat: 'wood', dmg });
  if (opts.second && dmg < 0.4) P({ k: 'box', x, y: h * 1.35, z, w: w * 0.82, h: h * 0.6, d: d * 0.82, ry, mat, dmg });
  if (dmg < 0.7) P({ k: 'door', x: x - Math.sin(ry) * (d * 0.5 + 0.1), y: 1.1, z: z + Math.cos(ry) * (d * 0.5 + 0.1), w: 1.2, h: 2.2, ry, mat: 'wood' });
  if (dmg < 0.5) {
    P({ k: 'window', x: x + Math.cos(ry) * (w * 0.5 + 0.1), y: h * 0.55, z: z + Math.sin(ry) * (w * 0.5 + 0.1), w: 1.1, h: 1.1, ry, mat: 'glass' });
    bp.lights.push({ x: x + Math.cos(ry) * (w * 0.5 + 1), y: h * 0.55, z: z + Math.sin(ry) * (w * 0.5 + 1), color: '#ffca7a', intensity: 0.7, radius: 12 });
  }
}

function buildFarm(world, poi, rng, bp, P, mat) {
  building(bp, P, rng.range(-6, 6), rng.range(-6, 6), 7, 6, 3.6, rng.float() * 6.28, 'wood', rng.range(0, 0.3), rng, { chimney: true });
  for (let i = 0; i < 4; i++) {
    bp.parts.push({ k: 'plot', x: rng.range(-24, 24), y: 0, z: rng.range(-24, 24), w: 10, d: 8, ry: rng.float() * 0.6, crop: rng.pick(['wheat', 'root', 'gourd', 'herb', 'berry']) });
  }
  P({ k: 'prop', id: 'fence', x: 0, y: 0, z: 18, ry: 0, mat: 'wood' });
  bp.npcs.push({ ...npcIdentity(rng), x: 0, z: 0, homeX: 0, homeZ: 0, stock: rng.int(3, 7) });
}

function buildRuins(world, poi, rng, bp, P, mat, ruin) {
  const shape = rng.weighted([['ring', 3], ['hall', 2], ['courtyard', 2], ['scatter', 2]]);
  const n = 5 + rng.int(0, 8);
  const R = rng.range(8, 18);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    let x, z, ry;
    if (shape === 'ring') { x = Math.cos(a) * R; z = Math.sin(a) * R; ry = a + Math.PI / 2; }
    else if (shape === 'hall') { x = (i - n / 2) * 3.4; z = (i % 2 ? 1 : -1) * rng.range(4, 6); ry = 0; }
    else if (shape === 'courtyard') { x = (i % 2 ? 1 : -1) * R * 0.8; z = (i - n / 2) * 3.2; ry = Math.PI / 2; }
    else { x = rng.range(-R, R); z = rng.range(-R, R); ry = rng.float() * 6.28; }
    const h = rng.range(2, 7) * (1 - ruin * 0.5);
    P({ k: 'wall', x, y: h * 0.5, z, w: rng.range(2.5, 5.5), h, d: rng.range(0.5, 1.1), ry, mat, dmg: ruin });
    if (rng.chance(0.3)) P({ k: 'box', x: x + rng.range(-2, 2), y: 0.4, z: z + rng.range(-2, 2), w: rng.range(1, 3), h: 0.8, d: rng.range(1, 3), ry: rng.float() * 6.28, mat, dmg: 0.9 });
  }
  if (rng.chance(0.6)) {
    const a = rng.float() * 6.28;
    P({ k: 'prop', id: rng.pick(['statue_small', 'altar', 'monolith', 'arch_small']), x: Math.cos(a) * R * 0.4, y: 0, z: Math.sin(a) * R * 0.4, ry: a, mat: poi.tags.includes('ancient') ? 'ancient' : 'stone' });
  }
  if (poi.tags.includes('ancient') && rng.chance(0.5)) {
    P({ k: 'prop', id: 'glyph', x: rng.range(-6, 6), y: 0.1, z: rng.range(-6, 6), ry: rng.float() * 6.28, mat: 'crystal' });
    bp.lights.push({ x: 0, y: 1.6, z: 0, color: '#7fe9d8', intensity: 0.8, radius: 16 });
  }
  // rubble + overgrowth + a hidden cellar
  for (let i = 0; i < 8; i++) bp.parts.push({ k: 'debris', x: rng.range(-R, R), y: 0, z: rng.range(-R, R), s: rng.range(0.4, 1.6), ry: rng.float() * 6.28, mat });
  if (rng.chance(0.55)) {
    bp.parts.push({ k: 'cellar', x: rng.range(-6, 6), y: 0, z: rng.range(-6, 6), w: 5, d: 5, ry: rng.float() * 6.28, mat: 'stone' });
    bp.loot.push({ tier: 2, x: 0, z: 0, container: true });
  } else {
    bp.loot.push({ tier: 1, x: rng.range(-8, 8), z: rng.range(-8, 8), container: true });
  }
}

function buildCabin(world, poi, rng, bp, P, mat, ruin) {
  const w = rng.range(5, 7.5), d = rng.range(5, 8), h = rng.range(3, 4.2);
  building(bp, P, 0, 0, w, d, h, rng.float() * 6.28, 'wood', ruin * 0.7, rng, { chimney: true, porch: true });
  P({ k: 'prop', id: 'logpile', x: rng.range(4, 7), y: 0, z: rng.range(-4, 4), ry: rng.float() * 6.28, mat: 'wood' });
  if (rng.chance(0.5)) { P({ k: 'prop', id: 'bonfire', x: rng.range(5, 9), y: 0, z: rng.range(-6, 6), ry: 0, mat: 'stone' }); bp.lights.push({ x: 6, y: 1.2, z: 0, color: '#ff9a4d', intensity: 1.1, radius: 18 }); }
  bp.loot.push({ tier: 1, x: 0, z: 0, container: true });
}

function buildCamp(world, poi, rng, bp, P, mat, hostile) {
  const n = 2 + rng.int(0, 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + rng.range(-0.3, 0.3), r = rng.range(4, 9);
    P({ k: 'prop', id: 'tent', x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r, ry: a + Math.PI, mat: hostile ? 'bone' : 'wood' });
  }
  P({ k: 'prop', id: 'bonfire', x: 0, y: 0, z: 0, ry: 0, mat: 'stone' });
  bp.lights.push({ x: 0, y: 1.1, z: 0, color: '#ff9a4d', intensity: 1.2, radius: 20 });
  for (let i = 0; i < 3; i++) bp.parts.push({ k: 'prop', id: rng.pick(['barrel', 'crate', 'pot', 'rack']), x: rng.range(-8, 8), y: 0, z: rng.range(-8, 8), ry: rng.float() * 6.28, mat: 'wood' });
  if (hostile) {
    for (let i = 0; i < 2 + rng.int(0, 2); i++) bp.parts.push({ k: 'prop', id: 'target', x: rng.range(-12, 12), y: 0, z: rng.range(-12, 12), ry: rng.float() * 6.28, mat: 'wood' });
    bp.loot.push({ tier: 2, x: rng.range(-6, 6), z: rng.range(-6, 6), container: true });
  } else {
    bp.loot.push({ tier: 1, x: rng.range(-6, 6), z: rng.range(-6, 6), container: true });
  }
}

function buildTower(world, poi, rng, bp, P, mat, isObservatory) {
  const h = rng.range(9, 18) * poi.scale;
  const r = rng.range(2.2, 3.4);
  P({ k: 'cyl', x: 0, y: h * 0.5, z: 0, r, h, seg: 8, mat: isObservatory ? 'ancient' : mat, taper: 0.82, dmg: isObservatory ? 0.2 : rng.range(0.1, 0.5) });
  P({ k: 'box', x: 0, y: h + 0.4, z: 0, w: r * 2.6, h: 0.8, d: r * 2.6, ry: 0, mat: 'wood', dmg: 0.2 });
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * 6.28;
    P({ k: 'box', x: Math.cos(a) * r * 1.25, y: h + 1.4, z: Math.sin(a) * r * 1.25, w: 0.4, h: 1.6, d: 0.4, ry: a, mat: 'wood', dmg: 0.3 });
  }
  P({ k: 'ladder', x: r + 0.3, y: h * 0.5, z: 0, h, ry: 0, mat: 'wood' });
  if (isObservatory) {
    P({ k: 'prop', id: 'orrery', x: 0, y: h + 1, z: 0, ry: 0, mat: 'metal' });
    bp.lights.push({ x: 0, y: h + 2.5, z: 0, color: '#9fd8ff', intensity: 1.2, radius: 26 });
  } else {
    bp.lights.push({ x: 0, y: h + 1.4, z: 0, color: '#ffc06a', intensity: 1.3, radius: 34 });
  }
  bp.loot.push({ tier: 2, x: 0, z: 0, container: true });
}

function buildMine(world, poi, rng, bp, P, mat) {
  P({ k: 'box', x: 0, y: 1.6, z: 0, w: 4.4, h: 3.2, d: 1.2, ry: 0, mat: 'wood', dmg: 0.3 });
  P({ k: 'cave_mouth', x: 0, y: 0, z: 0, w: 3.2, h: 2.6, ry: 0 });
  bp.carves.push({ x: 0, z: 0, r: 6, depth: 5 });
  for (let i = 0; i < 5; i++) bp.parts.push({ k: 'prop', id: 'rail', x: rng.range(-10, 10), y: 0, z: rng.range(2, 12), ry: rng.range(-0.3, 0.3), mat: 'metal' });
  P({ k: 'prop', id: 'cart', x: rng.range(3, 8), y: 0, z: rng.range(4, 10), ry: rng.float() * 6.28, mat: 'metal' });
  for (let i = 0; i < 4; i++) bp.parts.push({ k: 'debris', x: rng.range(-12, 12), y: 0, z: rng.range(-6, 12), s: rng.range(0.6, 2), ry: rng.float() * 6.28, mat: 'stone' });
  bp.loot.push({ tier: 2, x: rng.range(-6, 6), z: rng.range(-6, 6), container: true });
  bp.parts.push({ k: 'prop', id: 'lantern', x: 2.4, y: 2.6, z: 0.4, ry: 0, mat: 'metal' });
  bp.lights.push({ x: 2.4, y: 2.6, z: 0.4, color: '#ffcc77', intensity: 0.9, radius: 14 });
}

function buildTemple(world, poi, rng, bp, P, mat, kind) {
  const tiers = 3 + rng.int(0, 3);
  const base = rng.range(16, 26) * poi.scale;
  for (let t = 0; t < tiers; t++) {
    const s = base * (1 - t / (tiers + 0.5));
    P({ k: 'box', x: 0, y: t * 2.6 + 1.3, z: 0, w: s, h: 2.6, d: s, ry: poi.rot, mat: kind === 'pyramid' ? 'sand' : (kind === 'forge_temple' ? 'obsidian' : 'ancient'), dmg: rng.range(0.05, 0.35) });
  }
  const top = tiers * 2.6;
  if (kind === 'pyramid') {
    P({ k: 'pyramid', x: 0, y: top + 3, z: 0, r: base * 0.28, h: 6, ry: poi.rot, mat: 'sand' });
  } else {
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * 6.28;
      P({ k: 'cyl', x: Math.cos(a) * base * 0.3, y: top + 3, z: Math.sin(a) * base * 0.3, r: 0.6, h: 6, seg: 6, mat: 'ancient', dmg: rng.range(0, 0.6) });
    }
    P({ k: 'prop', id: 'altar', x: 0, y: top + 0.4, z: 0, ry: poi.rot, mat: 'ancient' });
    bp.lights.push({ x: 0, y: top + 3, z: 0, color: kind === 'forge_temple' ? '#ff7a3c' : '#8fe6d0', intensity: 1.5, radius: 34 });
  }
  P({ k: 'stairs', x: 0, y: 1, z: base * 0.5, w: 6, h: top, d: base * 0.4, ry: 0, mat: 'stone' });
  for (let i = 0; i < 4; i++) bp.parts.push({ k: 'prop', id: 'statue_small', x: rng.range(-base * 0.6, base * 0.6), y: 0, z: base * 0.6 + rng.range(0, 6), ry: rng.float() * 6.28, mat: 'ancient' });
  bp.loot.push({ tier: 3, x: 0, z: 0, container: true });
  bp.loot.push({ tier: 2, x: rng.range(-10, 10), z: rng.range(-10, 10), container: true });
}

function buildDungeon(world, poi, rng, bp, P, mat, isBunker) {
  P({ k: 'box', x: 0, y: 1.4, z: 0, w: 6, h: 2.8, d: 4, ry: 0, mat: isBunker ? 'metal' : 'stone', dmg: 0.3 });
  P({ k: 'stairs_down', x: 0, y: -1, z: 0, w: 3, h: 4, d: 6, ry: 0, mat: 'stone' });
  bp.carves.push({ x: 0, z: 0, r: 7, depth: 6 });
  bp.underground = {
    kind: isBunker ? 'bunker' : 'dungeon',
    depth: 18 + rng.range(0, 40),
    rooms: 4 + rng.int(0, 5),
    seed: poi.seed,
  };
  bp.loot.push({ tier: 3, x: 0, z: 0, container: true });
  bp.lights.push({ x: 0, y: 2, z: 0, color: '#ff9a4d', intensity: 0.9, radius: 16 });
}

function buildCave(world, poi, rng, bp, P, kind) {
  P({ k: 'cave_mouth', x: 0, y: 0, z: 0, w: rng.range(3, 6), h: rng.range(2.6, 5), ry: rng.float() * 6.28 });
  bp.carves.push({ x: 0, z: 0, r: rng.range(7, 12), depth: rng.range(6, 12) });
  bp.underground = {
    kind,
    depth: kind === 'crystal_cavern' ? 60 + rng.range(0, 80) : 20 + rng.range(0, 70),
    rooms: kind === 'crystal_cavern' ? 6 + rng.int(0, 5) : 3 + rng.int(0, 5),
    seed: poi.seed,
  };
}

function buildWreck(world, poi, rng, bp, P) {
  const len = rng.range(14, 26) * poi.scale;
  P({ k: 'hull', x: 0, y: rng.range(-1.5, 1.2), z: 0, w: len, h: 5, d: len * 0.28, ry: poi.rot, mat: 'wood', dmg: rng.range(0.4, 0.85) });
  for (let i = 0; i < 2 + rng.int(0, 2); i++) {
    P({ k: 'cyl', x: rng.range(-len * 0.3, len * 0.3), y: rng.range(3, 7), z: 0, r: 0.35, h: rng.range(5, 11), seg: 6, mat: 'wood', tilt: rng.range(-0.4, 0.4), dmg: 0.5 });
  }
  for (let i = 0; i < 6; i++) bp.parts.push({ k: 'debris', x: rng.range(-len * 0.6, len * 0.6), y: 0, z: rng.range(-8, 8), s: rng.range(0.5, 1.8), ry: rng.float() * 6.28, mat: 'wood' });
  bp.loot.push({ tier: 2, x: 0, z: 0, container: true });
}

function buildOasis(world, poi, rng, bp, P) {
  const r = rng.range(6, 14);
  bp.waters.push({ x: 0, z: 0, r, level: -0.4 });
  bp.carves.push({ x: 0, z: 0, r: r + 3, depth: 2.4 });
  for (let i = 0; i < 4 + rng.int(0, 6); i++) {
    const a = rng.float() * 6.28, d = r + rng.range(1, 9);
    bp.trees.push({ species: 'palm', x: Math.cos(a) * d, z: Math.sin(a) * d, scale: rng.range(0.8, 1.3) });
  }
  bp.loot.push({ tier: 1, x: rng.range(-r, r), z: rng.range(-r, r), container: false });
}

function buildShrine(world, poi, rng, bp, P, mat, isBarrow) {
  if (isBarrow) {
    P({ k: 'mound', x: 0, y: 0, z: 0, r: rng.range(6, 11), h: rng.range(2.5, 5), mat: 'mud' });
    P({ k: 'box', x: 0, y: 1.6, z: rng.range(4, 7), w: 1.6, h: 2.6, d: 0.6, ry: 0, mat: 'stone', dmg: 0.4 });
    bp.loot.push({ tier: 2, x: 0, z: 0, container: true });
    return;
  }
  const n = 5 + rng.int(0, 4), r = rng.range(4, 8);
  for (let i = 0; i < n; i++) {
    const a = i / n * 6.28;
    P({ k: 'box', x: Math.cos(a) * r, y: rng.range(1, 2.2), z: Math.sin(a) * r, w: 0.9, h: rng.range(2, 4.4), d: 0.9, ry: a, mat: 'stone', dmg: rng.range(0, 0.6) });
  }
  P({ k: 'prop', id: 'altar', x: 0, y: 0.4, z: 0, ry: rng.float() * 6.28, mat: 'stone' });
  if (rng.chance(0.5)) { bp.lights.push({ x: 0, y: 2, z: 0, color: '#a9e9ff', intensity: 0.9, radius: 18 }); P({ k: 'prop', id: 'glyph', x: 0, y: 0.1, z: 0, ry: 0, mat: 'crystal' }); }
  bp.loot.push({ tier: 2, x: 0, z: 0, container: true });
}

function buildFossil(world, poi, rng, bp, P) {
  const n = 6 + rng.int(0, 6);
  for (let i = 0; i < n; i++) {
    P({ k: 'prop', id: 'bone', x: i * rng.range(1.4, 2.6) - n, y: rng.range(0, 0.6), z: Math.sin(i * 0.7) * rng.range(1, 3), ry: rng.range(-0.4, 0.4), mat: 'bone', s: rng.range(0.8, 1.8) });
  }
  P({ k: 'prop', id: 'skull', x: -n - 2, y: 0.6, z: 0, ry: rng.float() * 6.28, mat: 'bone', s: rng.range(1.4, 2.4) });
  bp.loot.push({ tier: 2, x: 0, z: 0, container: false });
}

function buildSpireMystery(world, poi, rng, bp, P) {
  const h = rng.range(14, 30) * poi.scale;
  P({ k: 'spire', x: 0, y: h * 0.5, z: 0, r: rng.range(1.6, 3), h, ry: poi.rot, mat: 'crystal' });
  const n = 3 + rng.int(0, 3);
  for (let i = 0; i < n; i++) {
    const a = i / n * 6.28, d = rng.range(5, 11);
    P({ k: 'prop', id: 'monolith', x: Math.cos(a) * d, y: 0, z: Math.sin(a) * d, ry: a, mat: 'stone', s: rng.range(0.7, 1.3) });
  }
  P({ k: 'prop', id: 'glyph', x: 0, y: 0.1, z: 0, ry: 0, mat: 'crystal', s: 2.4 });
  bp.lights.push({ x: 0, y: h * 0.7, z: 0, color: '#8ef0e0', intensity: 2.0, radius: 46 });
  bp.resonant = true;
  bp.loot.push({ tier: 3, x: rng.range(-6, 6), z: rng.range(-6, 6), container: true });
}

function buildArch(world, poi, rng, bp, P, mat) {
  const span = rng.range(18, 40) * poi.scale;
  const h = rng.range(14, 34) * poi.scale;
  const t = rng.range(3, 6);
  P({ k: 'box', x: -span * 0.5, y: h * 0.5, z: 0, w: t, h, d: t * 1.4, ry: poi.rot, mat: 'stone', dmg: 0.15 });
  P({ k: 'box', x: span * 0.5, y: h * 0.5, z: 0, w: t, h, d: t * 1.4, ry: poi.rot, mat: 'stone', dmg: 0.15 });
  P({ k: 'arch_top', x: 0, y: h, z: 0, w: span, h: t * 1.6, d: t * 1.4, ry: poi.rot, mat: 'stone', dmg: 0.2 });
  for (let i = 0; i < 6; i++) bp.parts.push({ k: 'debris', x: rng.range(-span * 0.6, span * 0.6), y: 0, z: rng.range(-9, 9), s: rng.range(1, 3.5), ry: rng.float() * 6.28, mat: 'stone' });
}

function buildStoneSpire(world, poi, rng, bp, P) {
  const n = 2 + rng.int(0, 4);
  for (let i = 0; i < n; i++) {
    const a = rng.float() * 6.28, d = i === 0 ? 0 : rng.range(4, 16);
    const h = (i === 0 ? rng.range(22, 48) : rng.range(8, 22)) * poi.scale;
    P({ k: 'spire', x: Math.cos(a) * d, y: h * 0.5, z: Math.sin(a) * d, r: rng.range(1.4, 3.4), h, ry: rng.float() * 6.28, mat: 'stone', tilt: rng.range(-0.1, 0.1) });
  }
}

function buildStatue(world, poi, rng, bp, P) {
  const h = rng.range(16, 40) * poi.scale;
  P({ k: 'box', x: 0, y: 2, z: 0, w: h * 0.34, h: 4, d: h * 0.34, ry: poi.rot, mat: 'stone', dmg: 0.3 });
  P({ k: 'statue', x: 0, y: h * 0.5 + 3, z: 0, h, ry: poi.rot, mat: 'ancient', broken: rng.chance(0.45) });
  for (let i = 0; i < 8; i++) bp.parts.push({ k: 'debris', x: rng.range(-h * 0.4, h * 0.4), y: 0, z: rng.range(-h * 0.4, h * 0.4), s: rng.range(1, 3), ry: rng.float() * 6.28, mat: 'ancient' });
}

function buildCrater(world, poi, rng, bp, P) {
  const r = rng.range(20, 46) * poi.scale;
  bp.carves.push({ x: 0, z: 0, r, depth: r * 0.32, rim: true });
  P({ k: 'prop', id: 'meteor', x: 0, y: -r * 0.12, z: 0, ry: rng.float() * 6.28, mat: 'metal', s: rng.range(2, 5) });
  bp.lights.push({ x: 0, y: 1, z: 0, color: '#ff8a4a', intensity: 1.1, radius: 26 });
  bp.loot.push({ tier: 3, x: 0, z: 0, container: false });
}

function buildCastle(world, poi, rng, bp, P, mat, ruin) {
  const R = rng.range(16, 26) * poi.scale;
  const wallH = rng.range(7, 13);
  const segs = 10;
  for (let i = 0; i < segs; i++) {
    const a = i / segs * 6.28;
    const a2 = (i + 1) / segs * 6.28;
    const x = Math.cos((a + a2) / 2) * R, z = Math.sin((a + a2) / 2) * R;
    const len = Math.hypot(Math.cos(a2) - Math.cos(a), Math.sin(a2) - Math.sin(a)) * R;
    P({ k: 'wall', x, y: wallH * 0.5, z, w: len, h: wallH * (1 - ruin * rng.range(0, 0.6)), d: 1.6, ry: (a + a2) / 2 + Math.PI / 2, mat: 'stone', dmg: ruin });
  }
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * 6.28 + 0.4;
    P({ k: 'cyl', x: Math.cos(a) * R, y: wallH * 0.7, z: Math.sin(a) * R, r: 2.6, h: wallH * 1.5, seg: 8, mat: 'stone', dmg: ruin * 0.8 });
  }
  const keepH = rng.range(12, 22);
  P({ k: 'box', x: 0, y: keepH * 0.5, z: 0, w: R * 0.6, h: keepH, d: R * 0.5, ry: poi.rot, mat: 'stone', dmg: ruin * 0.7 });
  P({ k: 'roof', x: 0, y: keepH, z: 0, w: R * 0.66, d: R * 0.56, h: 5, ry: poi.rot, mat: 'stone', dmg: ruin });
  for (let i = 0; i < 10; i++) bp.parts.push({ k: 'debris', x: rng.range(-R, R), y: 0, z: rng.range(-R, R), s: rng.range(0.6, 2.4), ry: rng.float() * 6.28, mat: 'stone' });
  bp.loot.push({ tier: 3, x: 0, z: 0, container: true });
  bp.loot.push({ tier: 2, x: rng.range(-R * 0.6, R * 0.6), z: rng.range(-R * 0.6, R * 0.6), container: true });
}

function buildGiantTree(world, poi, rng, bp, P) {
  const h = rng.range(40, 80) * poi.scale;
  bp.trees.push({ species: 'giant_oak', x: 0, z: 0, scale: h / 14 });
  for (let i = 0; i < 5; i++) {
    const a = rng.float() * 6.28, d = rng.range(9, 20);
    bp.trees.push({ species: 'oak', x: Math.cos(a) * d, z: Math.sin(a) * d, scale: rng.range(0.9, 1.5) });
  }
  P({ k: 'prop', id: 'shrine_lantern', x: rng.range(4, 8), y: 1.2, z: rng.range(4, 8), ry: 0, mat: 'wood' });
  bp.lights.push({ x: 0, y: h * 0.35, z: 0, color: '#c8ff9a', intensity: 1.2, radius: 40 });
  bp.loot.push({ tier: 2, x: rng.range(-8, 8), z: rng.range(-8, 8), container: true });
}

function buildBridge(world, poi, rng, bp, P, mat) {
  const len = rng.range(26, 60) * poi.scale;
  P({ k: 'box', x: 0, y: 1, z: 0, w: 4.5, h: 0.7, d: len, ry: poi.rot, mat: 'wood', dmg: rng.range(0.1, 0.5) });
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    P({ k: 'box', x: Math.cos(poi.rot) * s * 2.2, y: 2.2, z: Math.sin(poi.rot) * s * 2.2, w: 0.4, h: 1.8, d: len, ry: poi.rot, mat: 'wood', dmg: 0.4 });
  }
  for (let i = 0; i < 6; i++) {
    const t = (i / 5 - 0.5) * len;
    P({ k: 'box', x: Math.sin(poi.rot) * t, y: 0.6, z: -Math.cos(poi.rot) * t, w: 0.5, h: 1.2, d: 0.5, ry: poi.rot, mat: 'wood', dmg: 0.5 });
  }
}

function buildFloatingIsle(world, poi, rng, bp, P) {
  const r = rng.range(14, 30) * poi.scale;
  const y = rng.range(45, 110);
  bp.float = { y };
  P({ k: 'isle', x: 0, y, z: 0, r, h: r * 0.8, ry: poi.rot, mat: 'stone' });
  for (let i = 0; i < 4 + rng.int(0, 5); i++) {
    const a = rng.float() * 6.28, d = rng.float() * r * 0.7;
    bp.trees.push({ species: rng.pick(['pine', 'oak', 'crystal_tree']), x: Math.cos(a) * d, z: Math.sin(a) * d, scale: rng.range(0.7, 1.3), y });
  }
  if (rng.chance(0.6)) P({ k: 'prop', id: 'monolith', x: 0, y: y + 0.5, z: 0, ry: 0, mat: 'ancient', s: 1.4 });
  bp.lights.push({ x: 0, y: y + 6, z: 0, color: '#a9d8ff', intensity: 1.3, radius: 60 });
  bp.loot.push({ tier: 3, x: 0, z: 0, container: true });
}

function buildWaterfall(world, poi, rng, bp, P) {
  const h = rng.range(20, 60) * poi.scale;
  bp.fall = { h, w: rng.range(4, 10) };
  P({ k: 'prop', id: 'pool', x: 0, y: 0, z: rng.range(6, 12), ry: 0, mat: 'stone', s: rng.range(1.2, 2.4) });
  bp.waters.push({ x: 0, z: rng.range(8, 14), r: rng.range(6, 12), level: -0.3 });
}

function now() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); }

export default PoiSystem;
