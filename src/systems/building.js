/**
 * WANDERER — Building & Farming
 * -----------------------------
 * Modular construction with two placement modes:
 *   SNAP  — the piece locks to the 2 m lattice and to the edges of pieces you
 *           have already placed, so a hut goes up fast and square.
 *   FREE  — hold the modifier and place it anywhere, at any rotation.
 * Every piece is data: a shape, a material, a cost, a health pool. Nothing is
 * baked, so a base can be edited, repaired, salvaged and saved.
 */

import * as THREE from '../three.js';
import { box, mergeParts, xform } from '../render/geom.js';
import { MATS } from '../render/structs.js';
import { propGeometry } from '../render/structs.js';

export const GRID = 2;            // metres per snap cell
export const WALL_H = 3;

export const MATERIALS = {
  wood:    { id: 'wood',    name: 'Timber',  cost: { plank: 2 }, hp: 120, tint: '#8a6a45', tool: 'axe' },
  stone:   { id: 'stone',   name: 'Stone',   cost: { stone: 3 }, hp: 260, tint: '#8b8779', tool: 'pick' },
  brick:   { id: 'brick',   name: 'Brick',   cost: { brick: 2, mortar: 1 }, hp: 420, tint: '#a0705a', tool: 'pick' },
  metal:   { id: 'metal',   name: 'Iron',    cost: { iron_ingot: 2 }, hp: 700, tint: '#9aa0a6', tool: 'pick' },
};

export const PIECES = {
  foundation: { id: 'foundation', name: 'Foundation', size: [GRID, 0.3, GRID], cost: 1, snap: 'ground', desc: 'Everything stands on these.' },
  wall:       { id: 'wall', name: 'Wall', size: [GRID, WALL_H, 0.24], cost: 1, snap: 'edge', desc: 'Encloses a room.' },
  doorway:    { id: 'doorway', name: 'Doorway', size: [GRID, WALL_H, 0.24], cost: 1, snap: 'edge', hole: [1.0, 2.1], desc: 'Walk through it.' },
  window:     { id: 'window', name: 'Window Wall', size: [GRID, WALL_H, 0.24], cost: 1, snap: 'edge', hole: [1.0, 1.0, 1.1], desc: 'Light, and a way to shoot out.' },
  pillar:     { id: 'pillar', name: 'Pillar', size: [0.34, WALL_H, 0.34], cost: 1, snap: 'corner', desc: 'Corners and supports.' },
  roof:       { id: 'roof', name: 'Roof Slab', size: [GRID, 0.22, GRID], cost: 1, snap: 'top', desc: 'Keeps the rain off.' },
  ramp:       { id: 'ramp', name: 'Roof Ramp', size: [GRID, 0.22, GRID * 1.42], cost: 1, snap: 'top', tilt: 0.7854, desc: 'Walk up to the roof.' },
  stairs:     { id: 'stairs', name: 'Stairs', size: [GRID, 0.2, GRID * 1.6], cost: 1, snap: 'free', tilt: 0.6, desc: 'Between floors.' },
  floor:      { id: 'floor', name: 'Upper Floor', size: [GRID, 0.2, GRID], cost: 1, snap: 'top', y: WALL_H, desc: 'A second storey.' },
  fence:      { id: 'fence', name: 'Fence', size: [GRID, 1.2, 0.14], cost: 1, snap: 'edge', desc: 'Keeps animals in.' },
  gate:       { id: 'gate', name: 'Gate', size: [GRID, 1.2, 0.14], cost: 1, snap: 'edge', door: true, desc: 'Opens for you.' },
  ladder:     { id: 'ladder', name: 'Ladder', size: [0.6, WALL_H, 0.16], cost: 1, snap: 'wall', desc: 'Climbable.' },
  platform:   { id: 'platform', name: 'Platform', size: [GRID * 2, 0.24, GRID * 2], cost: 4, snap: 'ground', desc: 'A wide base.' },
};

/* ── farming ───────────────────────────────────────────────────────── */

export const CROPS = {
  wheat:  { id: 'wheat',  name: 'Wheat',   seed: 'seed_wheat',  yield: ['wheat', 2, 3], days: 3, water: 1.0, temp: [2, 32], icon: 'wheat' },
  root:   { id: 'root',   name: 'Roots',   seed: 'seed_root',   yield: ['root_veg', 2, 4], days: 2, water: 0.8, temp: [-4, 26], icon: 'mushroom' },
  gourd:  { id: 'gourd',  name: 'Gourd',   seed: 'seed_gourd',  yield: ['gourd', 1, 2], days: 4, water: 1.2, temp: [8, 38], icon: 'misc' },
  herb:   { id: 'herb',   name: 'Herbs',   seed: 'seed_herb',   yield: ['herb', 2, 3], days: 2, water: 0.9, temp: [0, 30], icon: 'herb' },
  berry:  { id: 'berry',  name: 'Berries', seed: 'seed_berry',  yield: ['berry', 3, 5], days: 3, water: 1.1, temp: [-2, 30], icon: 'berry' },
  fiber:  { id: 'fiber',  name: 'Flax',    seed: 'seed_flax',   yield: ['fiber', 3, 5], days: 2, water: 0.7, temp: [-6, 34], icon: 'fiber' },
};

/* ── geometry cache ────────────────────────────────────────────────── */

const _geoCache = new Map();

export function pieceGeometry(pieceId, materialId) {
  const key = `${pieceId}|${materialId}`;
  if (_geoCache.has(key)) return _geoCache.get(key);
  const def = PIECES[pieceId] || PIECES.wall;
  const mat = MATERIALS[materialId] || MATERIALS.wood;
  const col = parseInt(mat.tint.slice(1), 16);
  const [w, h, d] = def.size;
  let g;
  if (def.hole) {
    const [hw, hh, hy = 0] = def.hole;
    const parts = [];
    const sideW = (w - hw) / 2;
    parts.push({ geo: box(sideW, h, d), matrix: xform(-(hw + sideW) / 2, 0, 0), color: col });
    parts.push({ geo: box(sideW, h, d), matrix: xform((hw + sideW) / 2, 0, 0), color: col });
    if (hy > 0) parts.push({ geo: box(hw, hy, d), matrix: xform(0, -(h - hy) / 2, 0), color: col });
    parts.push({ geo: box(hw, h - hh - hy, d), matrix: xform(0, (hh + hy) / 2, 0), color: col });
    g = mergeParts(parts);
  } else if (pieceId === 'pillar') {
    g = mergeParts([
      { geo: box(w, h, d), matrix: xform(0, 0, 0), color: col },
      { geo: box(w * 1.5, 0.16, d * 1.5), matrix: xform(0, h / 2, 0), color: col },
      { geo: box(w * 1.5, 0.16, d * 1.5), matrix: xform(0, -h / 2, 0), color: col },
    ]);
  } else if (pieceId === 'fence' || pieceId === 'gate') {
    const parts = [
      { geo: box(w, 0.1, d), matrix: xform(0, 0.35, 0), color: col },
      { geo: box(w, 0.1, d), matrix: xform(0, -0.2, 0), color: col },
      { geo: box(0.14, h, 0.14), matrix: xform(-w / 2 + 0.07, 0, 0), color: col },
      { geo: box(0.14, h, 0.14), matrix: xform(w / 2 - 0.07, 0, 0), color: col },
    ];
    g = mergeParts(parts);
  } else if (pieceId === 'stairs' || pieceId === 'ramp') {
    const steps = 6, parts = [];
    for (let i = 0; i < steps; i++) {
      parts.push({ geo: box(w, 0.14, d / steps), matrix: xform(0, -h / 2 + (i + 0.5) * (h / steps) * 1.6, -d / 2 + (i + 0.5) * (d / steps)), color: col });
    }
    g = mergeParts(parts);
  } else if (pieceId === 'ladder') {
    const parts = [
      { geo: box(0.08, h, 0.08), matrix: xform(-w / 2 + 0.05, 0, 0), color: col },
      { geo: box(0.08, h, 0.08), matrix: xform(w / 2 - 0.05, 0, 0), color: col },
    ];
    for (let i = 0; i < 8; i++) parts.push({ geo: box(w, 0.07, 0.07), matrix: xform(0, -h / 2 + (i + 0.5) * (h / 8), 0), color: col });
    g = mergeParts(parts);
  } else {
    g = mergeParts([{ geo: box(w, h, d), matrix: xform(0, 0, 0), color: col }]);
  }
  g.computeBoundingSphere();
  _geoCache.set(key, g);
  return g;
}

export function materialFor(materialId) {
  const mat = MATERIALS[materialId] || MATERIALS.wood;
  return new THREE.MeshLambertMaterial({
    color: new THREE.Color(mat.tint),
    flatShading: materialId === 'stone' || materialId === 'brick',
  });
}

/**
 * Flat pieces come in two layers so a floor and its ceiling can share a cell:
 * exactly one 'floor' piece and one 'ceiling' piece per cell per storey.
 */
const LAYER = {
  foundation: 'floor', floor: 'floor', platform: 'floor',
  roof: 'ceiling', ramp: 'ceiling', stairs: 'ceiling',
};
const FLAT = new Set(Object.keys(LAYER));

/** Smallest angle between two headings, folded so 0 = parallel, PI/2 = square. */
function angleDelta(a, b) {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

/* ── the built world ───────────────────────────────────────────────── */

export class BuildSystem {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.pieces = [];                 // { id, piece, material, x, y, z, ry, hp, maxHp, mesh }
    this.byId = new Map();
    this.root = new THREE.Group();
    this.root.name = 'build';
    scene.add(this.root);
    this.ghost = null;
    this.cursor = { piece: 'foundation', material: 'wood', snap: true, ry: 0 };
    this._nextId = 1;
    this.listeners = [];
  }

  onChange(fn) { this.listeners.push(fn); }
  _emit() { for (const f of this.listeners) f(this); }

  setCursor(patch) { Object.assign(this.cursor, patch); }
  cyclePiece(dir = 1) {
    const ids = Object.keys(PIECES);
    const i = ids.indexOf(this.cursor.piece);
    this.cursor.piece = ids[(i + dir + ids.length) % ids.length];
    this._emit();
  }
  cycleMaterial(dir = 1) {
    const ids = Object.keys(MATERIALS);
    const i = ids.indexOf(this.cursor.material);
    this.cursor.material = ids[(i + dir + ids.length) % ids.length];
    this._emit();
  }

  costOf(pieceId, materialId) {
    const p = PIECES[pieceId] || PIECES.wall;
    const m = MATERIALS[materialId] || MATERIALS.wood;
    const out = {};
    for (const k in m.cost) out[k] = m.cost[k] * p.cost;
    return out;
  }

  /** Snap a raw cursor position to the lattice and to existing edges. */
  snapPoint(x, z, pieceId, free) {
    if (free) return { x, z, y: this.world.heightAt(x, z), snapped: false };
    const gx = Math.round(x / GRID) * GRID;
    const gz = Math.round(z / GRID) * GRID;
    const def = PIECES[pieceId] || PIECES.wall;
    // walls and fences sit on cell edges, everything else on cell centres
    if (def.snap === 'edge') {
      const cx = Math.round(x / GRID) * GRID;
      const cz = Math.round(z / GRID) * GRID;
      const dx = Math.abs(x - cx), dz = Math.abs(z - cz);
      return dx < dz ? { x: cx, z: cz + GRID / 2, y: 0, snapped: true, axis: 'x' }
                     : { x: cx + GRID / 2, z: cz, y: 0, snapped: true, axis: 'z' };
    }
    return { x: gx, z: gz, y: 0, snapped: true };
  }

  /** Ground height a foundation should sit on (averaged over its footprint). */
  baseY(x, z, pieceId) {
    const def = PIECES[pieceId] || PIECES.wall;
    const [w, , d] = def.size;
    let n = 0, sum = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      sum += this.world.heightAt(x + (i * w) / 2, z + (j * d) / 2); n++;
    }
    return sum / n;
  }

  /** Stack height: can this piece sit on top of an existing one? */
  stackY(x, z, pieceId) {
    const def = PIECES[pieceId] || PIECES.wall;
    let best = null;
    for (const p of this.pieces) {
      if (Math.abs(p.x - x) > GRID * 0.6 || Math.abs(p.z - z) > GRID * 0.6) continue;
      const pd = PIECES[p.piece];
      if (!pd) continue;
      const top = p.y + pd.size[1] / 2;
      if (def.snap === 'top' && (best === null || top > best)) best = top;
    }
    return best;
  }

  canAfford(inventory, pieceId, materialId) {
    const cost = this.costOf(pieceId, materialId);
    for (const k in cost) if (inventory.countOf(k) < cost[k]) return false;
    return true;
  }

  /**
   * Collision rules, by piece class:
   *   FLAT pieces (foundations, floors, roofs, ramps) — one per cell per storey.
   *     A roof over a foundation is fine; two roofs in the same cell are not.
   *   UPRIGHT pieces (walls, doors, fences, pillars, ladders) — collide only
   *     with another upright piece that runs the same way, so perpendicular
   *     walls can meet at a corner.
   */
  overlaps(x, y, z, pieceId, ry) {
    const def = PIECES[pieceId] || PIECES.wall;
    const aFlat = FLAT.has(pieceId);
    for (const p of this.pieces) {
      const bFlat = FLAT.has(p.piece);
      if (aFlat !== bFlat) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      const pd = PIECES[p.piece];
      const min = (def.size[0] + pd.size[0]) * 0.42;
      if (d >= min) continue;
      if (aFlat) {
        if (LAYER[p.piece] === LAYER[pieceId] &&
            Math.round(p.y / WALL_H) === Math.round(y / WALL_H)) return p;
        continue;
      }
      if (Math.abs(p.y - y) > 0.3) continue;
      if (angleDelta(p.ry || 0, ry || 0) < 0.35) return p;
    }
    return null;
  }

  /** Place at a world position. Returns the new piece or null. */
  place(inventory, x, z, opts = {}) {
    const { piece, material, snap, ry } = this.cursor;
    const def = PIECES[piece];
    if (!def) return null;
    const s = this.snapPoint(x, z, piece, !snap);
    const px = s.x, pz = s.z;
    const onTop = this.stackY(px, pz, piece);
    const py = (opts.y !== undefined ? opts.y
      : onTop !== null ? onTop + def.size[1] / 2
      : def.snap === 'top' ? this.baseY(px, pz, piece) + WALL_H + def.size[1] / 2
      : this.baseY(px, pz, piece) + def.size[1] / 2 + (def.y || 0));
    // the rotation the piece will actually be built at (snapped edges turn 90°)
    const appliedRy = (ry || 0) + (def.tilt || s.axis === 'z' ? (def.tilt ? 0 : Math.PI / 2) : 0);
    if (this.overlaps(px, py, pz, piece, appliedRy)) return null;
    if (!this.canAfford(inventory, piece, material)) return null;
    const cost = this.costOf(piece, material);
    for (const k in cost) inventory.remove(k, cost[k]);

    const hp = (MATERIALS[material] || MATERIALS.wood).hp;
    const rec = {
      id: this._nextId++, piece, material,
      x: px, y: py, z: pz, ry: appliedRy,
      hp, maxHp: hp, open: false,
    };
    if (def.tilt) rec.rx = def.tilt;
    this.pieces.push(rec);
    this.byId.set(rec.id, rec);
    this._mesh(rec);
    this._emit();
    return rec;
  }

  _mesh(rec) {
    const def = PIECES[rec.piece];
    const mesh = new THREE.Mesh(pieceGeometry(rec.piece, rec.material), materialFor(rec.material));
    mesh.position.set(rec.x, rec.y, rec.z);
    mesh.rotation.set(rec.rx || 0, rec.ry || 0, 0);
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.userData.pieceId = rec.id;
    rec.mesh = mesh;
    this.root.add(mesh);
    return mesh;
  }

  /** Damage a piece (combat, weather, decay). Removes it at 0. */
  damage(pieceId, amount) {
    const rec = this.byId.get(pieceId);
    if (!rec) return false;
    rec.hp -= amount;
    if (rec.mesh) {
      const t = Math.max(0, rec.hp / rec.maxHp);
      rec.mesh.material = rec.mesh.material.clone();
      rec.mesh.material.color.multiplyScalar(0.55 + t * 0.45);
    }
    if (rec.hp <= 0) this.remove(pieceId);
    return rec.hp <= 0;
  }

  repair(inventory, pieceId) {
    const rec = this.byId.get(pieceId);
    if (!rec || rec.hp >= rec.maxHp) return false;
    const cost = this.costOf(rec.piece, rec.material);
    for (const k in cost) if (inventory.countOf(k) < Math.ceil(cost[k] / 2)) return false;
    for (const k in cost) inventory.remove(k, Math.ceil(cost[k] / 2));
    rec.hp = rec.maxHp;
    if (rec.mesh) { this.root.remove(rec.mesh); this._mesh(rec); }
    this._emit();
    return true;
  }

  /** Salvage: get half the materials back. */
  salvage(inventory, pieceId) {
    const rec = this.byId.get(pieceId);
    if (!rec) return null;
    const cost = this.costOf(rec.piece, rec.material);
    const got = [];
    for (const k in cost) {
      const n = Math.max(1, Math.floor(cost[k] * 0.5));
      inventory.add(k, n);
      got.push([k, n]);
    }
    this.remove(pieceId);
    return got;
  }

  remove(pieceId) {
    const rec = this.byId.get(pieceId);
    if (!rec) return false;
    if (rec.mesh) { this.root.remove(rec.mesh); rec.mesh = null; }
    this.byId.delete(pieceId);
    const i = this.pieces.indexOf(rec);
    if (i >= 0) this.pieces.splice(i, 1);
    this._emit();
    return true;
  }

  toggleDoor(pieceId) {
    const rec = this.byId.get(pieceId);
    if (!rec || !PIECES[rec.piece].door) return false;
    rec.open = !rec.open;
    if (rec.mesh) rec.mesh.rotation.y = (rec.ry || 0) + (rec.open ? 1.9 : 0);
    return rec.open;
  }

  /* ── ghost preview ───────────────────────────────────────────────── */

  updateGhost(x, z, valid) {
    const { piece, material, ry } = this.cursor;
    const s = this.snapPoint(x, z, piece, !this.cursor.snap);
    const def = PIECES[piece] || PIECES.wall;
    const onTop = this.stackY(s.x, s.z, piece);
    const y = onTop !== null ? onTop + def.size[1] / 2 : this.baseY(s.x, s.z, piece) + def.size[1] / 2;
    if (!this.ghost) {
      this.ghost = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
        color: 0x6fe0c0, transparent: true, opacity: 0.42, depthWrite: false,
      }));
      this.ghost.renderOrder = 20;
      this.root.add(this.ghost);
    }
    if (this.ghost.userData.key !== piece + material) {
      this.ghost.geometry = pieceGeometry(piece, material);
      this.ghost.userData.key = piece + material;
    }
    this.ghost.position.set(s.x, y, s.z);
    this.ghost.rotation.set(0, (ry || 0) + (s.axis === 'z' ? Math.PI / 2 : 0), 0);
    this.ghost.userData.ry = (ry || 0) + (s.axis === 'z' ? Math.PI / 2 : 0);
    this.ghost.material.color.set(valid ? 0x6fe0c0 : 0xe05a4a);
    this.ghost.visible = true;
    return { x: s.x, y, z: s.z, valid };
  }

  hideGhost() { if (this.ghost) this.ghost.visible = false; }

  /* ── farms ───────────────────────────────────────────────────────── */

  /**
   * A plot is a 2×2 tilled square. `farms` are plain data so they survive a
   * save; the meshes are rebuilt on load.
   */
  initFarms() { if (!this.farms) this.farms = []; }

  till(x, z) {
    this.initFarms();
    for (const f of this.farms) if (Math.abs(f.x - x) < 2 && Math.abs(f.z - z) < 2) return f;
    const y = this.world.heightAt(x, z);
    const plot = { id: this._nextId++, x, y, z, crop: null, growth: 0, water: 0.4, tilled: true };
    this.farms.push(plot);
    this._farmMesh(plot);
    this._emit();
    return plot;
  }

  plant(x, z, cropId, inventory) {
    this.initFarms();
    const plot = this.farms.find(f => Math.abs(f.x - x) < 2 && Math.abs(f.z - z) < 2);
    if (!plot) return null;
    const crop = CROPS[cropId];
    if (!crop) return null;
    if (plot.crop) return null;
    if (!inventory.remove(crop.seed, 1)) return null;
    plot.crop = cropId; plot.growth = 0;
    this._farmMesh(plot);
    this._emit();
    return plot;
  }

  water(x, z) {
    this.initFarms();
    const plot = this.farms.find(f => Math.abs(f.x - x) < 2 && Math.abs(f.z - z) < 2);
    if (!plot) return false;
    plot.water = 1;
    return true;
  }

  harvest(x, z, inventory, rng) {
    this.initFarms();
    const plot = this.farms.find(f => Math.abs(f.x - x) < 2 && Math.abs(f.z - z) < 2);
    if (!plot || !plot.crop || plot.growth < 1) return null;
    const crop = CROPS[plot.crop];
    const [item, lo, hi] = crop.yield;
    const n = lo + rng.int(0, hi - lo);
    inventory.add(item, n);
    inventory.add(crop.seed, 1 + (rng.chance(0.5) ? 1 : 0));
    plot.crop = null; plot.growth = 0;
    this._farmMesh(plot);
    this._emit();
    return { item, n };
  }

  /** Called with in-game days; crops only grow when watered and in range. */
  growFarms(days, col) {
    this.initFarms();
    for (const p of this.farms) {
      if (!p.crop) continue;
      const crop = CROPS[p.crop];
      const temp = col ? col.temp : 15;
      const okTemp = temp >= crop.temp[0] && temp <= crop.temp[1];
      const okWater = p.water > 0.25;
      if (okTemp && okWater) p.growth = Math.min(1, p.growth + days / crop.days);
      p.water = Math.max(0, p.water - days * 0.45);
    }
  }

  _farmMesh(plot) {
    if (plot.mesh) { this.root.remove(plot.mesh); plot.mesh.geometry.dispose && plot.mesh.geometry.dispose(); }
    const parts = [{ geo: box(3.4, 0.12, 3.4), matrix: xform(0, 0.06, 0), color: 0x5a4530 }];
    for (let i = 0; i < 4; i++) parts.push({ geo: box(3.4, 0.22, 0.12), matrix: xform(0, 0.16, -1.2 + i * 0.8), color: 0x6a5338 });
    if (plot.crop) {
      const crop = CROPS[plot.crop];
      const g = Math.max(0.12, plot.growth);
      const tint = plot.growth >= 1 ? 0xc9b458 : 0x6a8a3a;
      for (let i = 0; i < 9; i++) {
        const ox = (i % 3 - 1) * 0.9, oz = (Math.floor(i / 3) - 1) * 0.9;
        parts.push({ geo: box(0.12, 0.7 * g, 0.12), matrix: xform(ox, 0.2 + 0.35 * g, oz), color: tint });
      }
    }
    const geo = mergeParts(parts);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.position.set(plot.x, plot.y, plot.z);
    mesh.userData.plotId = plot.id;
    plot.mesh = mesh;
    this.root.add(mesh);
  }

  rebuildMeshes() {
    for (const rec of this.pieces) if (!rec.mesh) this._mesh(rec);
    this.initFarms();
    for (const p of this.farms) if (!p.mesh) this._farmMesh(p);
  }

  /* ── collision: does the player stand on / bump into a piece? ─────── */

  /** Highest solid surface under (x, z) including built floors, or null. */
  floorAt(x, z, maxY) {
    let best = null;
    for (const p of this.pieces) {
      const def = PIECES[p.piece];
      if (!def) continue;
      if (!['foundation', 'roof', 'floor', 'platform', 'stairs', 'ramp'].includes(p.piece)) continue;
      const hw = def.size[0] / 2, hd = def.size[2] / 2;
      const dx = x - p.x, dz = z - p.z;
      const c = Math.cos(-p.ry), s = Math.sin(-p.ry);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) > hw || Math.abs(lz) > hd) continue;
      const top = p.y + def.size[1] / 2;
      if (maxY !== undefined && top > maxY) continue;
      if (best === null || top > best) best = top;
    }
    return best;
  }

  /** Ladder near a position (for climbing). */
  ladderAt(x, z, y) {
    for (const p of this.pieces) {
      if (p.piece !== 'ladder') continue;
      if (Math.hypot(p.x - x, p.z - z) < 0.8 && Math.abs(p.y - y) < WALL_H) return p;
    }
    return null;
  }

  serialize() {
    this.initFarms();
    return {
      nextId: this._nextId,
      pieces: this.pieces.map(p => ({ id: p.id, piece: p.piece, material: p.material, x: p.x, y: p.y, z: p.z, ry: p.ry, rx: p.rx || 0, hp: Math.round(p.hp), open: !!p.open })),
      farms: this.farms.map(f => ({ id: f.id, x: f.x, y: f.y, z: f.z, crop: f.crop, growth: f.growth, water: f.water })),
    };
  }

  restore(data) {
    this.clear();
    if (!data) return;
    this._nextId = data.nextId || 1;
    for (const p of (data.pieces || [])) {
      const rec = Object.assign({ maxHp: (MATERIALS[p.material] || MATERIALS.wood).hp }, p);
      this.pieces.push(rec);
      this.byId.set(rec.id, rec);
    }
    this.farms = (data.farms || []).map(f => Object.assign({}, f));
    this.rebuildMeshes();
    this._emit();
  }

  clear() {
    for (const p of this.pieces) if (p.mesh) this.root.remove(p.mesh);
    this.pieces.length = 0;
    this.byId.clear();
    if (this.farms) for (const f of this.farms) if (f.mesh) this.root.remove(f.mesh);
    this.farms = [];
  }

  dispose() { this.clear(); this.scene.remove(this.root); }
}

export { propGeometry, MATS };
export default BuildSystem;
