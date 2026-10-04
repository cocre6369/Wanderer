/**
 * WANDERER — River system
 * -----------------------
 * Rivers are not painted on: they are *walked*. A deterministic grid of
 * candidate sources sits over the world; each one that lands on high ground
 * walks downhill along the gradient of the smooth surface, accumulating flow
 * as it goes, and stops when it reaches the sea or a lake.
 *
 * Because the walk only depends on the (cached) height field and the cell
 * hash, every river is identical forever, and neighbouring tiles always agree
 * on where the water is. Walks are generated lazily inside a time budget so
 * streaming never hitches.
 */

import { noise2, smoothstep, clamp, clamp01 } from '../core/noise.js';
import { cellRng } from '../core/rng.js';

export const RIVER_CELL = 256;      // source grid spacing (m)
export const INDEX_CELL = 192;      // spatial index bucket (m)
const MAX_STEPS = 150;
const STEP = 18;

export class RiverSystem {
  constructor(gen) {
    this.gen = gen;
    this.walks = new Map();         // "i,j" -> { pts, flow, key } | null
    this.index = new Map();         // bucket key -> [walk,...]
    this.queue = [];
    this.queued = new Set();
    this.generated = 0;
    this.totalSegments = 0;
  }

  key(i, j) { return i * 100000 + j; }

  /** Ask for every river that could possibly cross this bbox. */
  ensureRegion(minX, minZ, maxX, maxZ, margin = MAX_STEPS * STEP) {
    const c = RIVER_CELL;
    const i0 = Math.floor((minX - margin) / c), i1 = Math.floor((maxX + margin) / c);
    const j0 = Math.floor((minZ - margin) / c), j1 = Math.floor((maxZ + margin) / c);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = this.key(i, j);
        if (this.walks.has(k) || this.queued.has(k)) continue;
        this.queued.add(k);
        this.queue.push([i, j]);
      }
    }
  }

  get pending() { return this.queue.length; }

  /** Generate queued sources until the time budget runs out. */
  process(ms = 4) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    while (this.queue.length) {
      const [i, j] = this.queue.pop();
      this.queued.delete(this.key(i, j));
      this._generate(i, j);
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (now - t0 > ms) break;
    }
  }

  /** Force everything queued to finish (used during world creation). */
  processAll(maxCells = 100000) {
    let n = 0;
    while (this.queue.length && n < maxCells) {
      const [i, j] = this.queue.pop();
      this.queued.delete(this.key(i, j));
      this._generate(i, j);
      n++;
    }
  }

  _generate(i, j) {
    const k = this.key(i, j);
    if (this.walks.has(k)) return;
    this.walks.set(k, null);

    const gen = this.gen;
    const rng = cellRng(gen.seed, i, j, 771);
    const chance = 0.06 + gen.p.river * 0.62;
    if (!rng.chance(chance)) return;

    // Pick the highest of a few jittered candidates so rivers start on ridges.
    let bx = 0, bz = 0, bh = -1e9;
    for (let t = 0; t < 4; t++) {
      const x = (i + rng.float()) * RIVER_CELL;
      const z = (j + rng.float()) * RIVER_CELL;
      const h = gen.lowHeight(x, z);
      if (h > bh) { bh = h; bx = x; bz = z; }
    }
    if (bh < 14) return;

    const pts = [];
    let x = bx, z = bz;
    let y = bh;
    let wy = y - 0.25;
    let flow = 3 + rng.range(0, 9) + gen.p.river * 6;
    const seed = gen.seed;
    const eps = 9;

    for (let step = 0; step < MAX_STEPS; step++) {
      const width = clamp(2.2 + Math.sqrt(flow) * 1.35, 2.2, 30);
      pts.push({ x, z, y, wy, flow, width, fall: 0 });

      if (y < 2.2) break;                                   // reached the sea
      const lake = gen.lakeLevel(x, z);
      if (lake !== null && y < lake + 1.2) { wy = lake; pts[pts.length - 1].wy = lake; break; }

      // gradient of the smooth surface (analytic — finite differences on a
      // cached lattice would return zero inside a cell)
      const g = gen.gradLow(x, z);
      const gx = g[0], gz = g[1];
      let len = Math.hypot(gx, gz);
      if (len < 5e-4) break;                                // dead flat
      let dx = -gx / len, dz = -gz / len;

      // meander: rotate the flow direction with a noise field
      const a = noise2(x * 0.0035, z * 0.0035, seed + 8808) * 0.75
              + noise2(x * 0.0009, z * 0.0009, seed + 3131) * 0.45;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = dx * ca - dz * sa;
      const nz = dx * sa + dz * ca;
      dx = nx; dz = nz;

      const sx = x + dx * STEP;
      const sz = z + dz * STEP;
      const sy = gen.lowHeight(sx, sz);
      const prevY = y;
      x = sx; z = sz;
      y = sy;

      // water never flows uphill — if the walk climbed, pin it back down
      if (y > prevY) y = prevY - 0.02;

      const drop = prevY - y;
      const prev = pts[pts.length - 1];
      prev.fall = drop;
      wy = Math.min(y - 0.2, wy - 0.045);
      prev.wy = Math.min(prev.wy, wy + drop * 0.5);

      // catchment accumulation — tributaries join without being modelled
      const catchment = noise2(x * 0.0013, z * 0.0013, seed + 5252) * 0.5 + 0.5;
      flow += 0.35 + catchment * 1.25;
    }

    if (pts.length < 5) return;

    const walk = { pts, i, j, flow, key: k };
    this.walks.set(k, walk);
    this.totalSegments += pts.length;
    this._index(walk);
  }

  _index(walk) {
    const pts = walk.pts;
    for (let n = 0; n < pts.length; n++) {
      const p = pts[n];
      const bk = Math.floor(p.x / INDEX_CELL);
      const bj = Math.floor(p.z / INDEX_CELL);
      const key = bk * 100000 + bj;
      let arr = this.index.get(key);
      if (!arr) { arr = []; this.index.set(key, arr); }
      const last = arr[arr.length - 1];
      if (last !== walk) arr.push(walk);
    }
  }

  /** Walks whose segments may be inside this bbox. */
  walksIn(minX, minZ, maxX, maxZ, pad = 40) {
    const out = [];
    const seen = new Set();
    const b0 = Math.floor((minX - pad) / INDEX_CELL), b1 = Math.floor((maxX + pad) / INDEX_CELL);
    const c0 = Math.floor((minZ - pad) / INDEX_CELL), c1 = Math.floor((maxZ + pad) / INDEX_CELL);
    for (let b = b0; b <= b1; b++) {
      for (let c = c0; c <= c1; c++) {
        const arr = this.index.get(b * 100000 + c);
        if (!arr) continue;
        for (const w of arr) if (!seen.has(w.key)) { seen.add(w.key); out.push(w); }
      }
    }
    return out;
  }

  /** Nearest river water surface at a point, or null. */
  waterAt(x, z, radius = 48) {
    const pad = radius + 8;
    const b0 = Math.floor((x - pad) / INDEX_CELL), b1 = Math.floor((x + pad) / INDEX_CELL);
    const c0 = Math.floor((z - pad) / INDEX_CELL), c1 = Math.floor((z + pad) / INDEX_CELL);
    let best = null, bestD = radius;
    for (let b = b0; b <= b1; b++) {
      for (let c = c0; c <= c1; c++) {
        const arr = this.index.get(b * 100000 + c);
        if (!arr) continue;
        for (const w of arr) {
          const pts = w.pts;
          for (let n = 0; n < pts.length - 1; n++) {
            const a = pts[n], bp = pts[n + 1];
            const d = distToSeg(x, z, a.x, a.z, bp.x, bp.z);
            const half = (a.width + bp.width) * 0.5;
            if (d < half && d < bestD) { bestD = d; best = { y: (a.wy + bp.wy) * 0.5, flow: a.flow, width: half * 2, walk: w, index: n }; }
          }
        }
      }
    }
    return best;
  }

  /**
   * Carve rivers into a height array.
   * grid(x,z) -> index, h array, and the world-space origin/step of the tile.
   */
  carve(grid) {
    const walks = this.walksIn(grid.minX, grid.minZ, grid.maxX, grid.maxZ, 48);
    if (!walks.length) return 0;
    let touched = 0;
    for (const w of walks) {
      const pts = w.pts;
      for (let n = 0; n < pts.length - 1; n++) {
        const a = pts[n], b = pts[n + 1];
        if (Math.max(a.x, b.x) < grid.minX - 40 || Math.min(a.x, b.x) > grid.maxX + 40) continue;
        if (Math.max(a.z, b.z) < grid.minZ - 40 || Math.min(a.z, b.z) > grid.maxZ + 40) continue;
        touched += this._stamp(grid, a, b);
      }
    }
    return touched;
  }

  _stamp(grid, a, b) {
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const steps = Math.max(1, Math.ceil(len / (grid.step * 0.6)));
    let touched = 0;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = a.x + (b.x - a.x) * t;
      const pz = a.z + (b.z - a.z) * t;
      const wy = a.wy + (b.wy - a.wy) * t;
      const width = a.width + (b.width - a.width) * t;
      const depth = 0.9 + Math.min(4.2, a.flow * 0.055);
      const bank = width * 1.55;

      const i0 = Math.max(0, Math.floor((px - grid.minX - bank) / grid.step));
      const i1 = Math.min(grid.n - 1, Math.ceil((px - grid.minX + bank) / grid.step));
      const j0 = Math.max(0, Math.floor((pz - grid.minZ - bank) / grid.step));
      const j1 = Math.min(grid.n - 1, Math.ceil((pz - grid.minZ + bank) / grid.step));
      if (i1 < 0 || j1 < 0 || i0 > grid.n - 1 || j0 > grid.n - 1) continue;

      for (let j = j0; j <= j1; j++) {
        const wz = grid.minZ + j * grid.step;
        for (let i = i0; i <= i1; i++) {
          const wx = grid.minX + i * grid.step;
          const d = Math.hypot(wx - px, wz - pz);
          if (d > bank) continue;
          const k = j * grid.n + i;
          const bed = wy - depth;
          let h = grid.h[k];
          let nh;
          if (d <= width * 0.55) nh = bed;
          else {
            const t = smoothstep(width * 0.55, bank, d);
            nh = bed + (h - bed) * t;
          }
          if (nh < h) { grid.h[k] = nh; touched++; }
          if (wy > (grid.waterY[k] === undefined ? -1e9 : grid.waterY[k])) {
            if (grid.h[k] < wy - 0.06) grid.waterY[k] = wy;
          }
        }
      }
    }
    return touched;
  }

  /** Rivers that end in the sea within this bbox (good village/beach spots). */
  mouthsIn(minX, minZ, maxX, maxZ) {
    const out = [];
    for (const w of this.walks.values()) {
      if (!w) continue;
      const last = w.pts[w.pts.length - 1];
      if (last.x < minX || last.x > maxX || last.z < minZ || last.z > maxZ) continue;
      if (last.y < 4) out.push({ x: last.x, z: last.z, flow: last.flow });
    }
    return out;
  }

  clear() {
    this.walks.clear();
    this.index.clear();
    this.queue.length = 0;
    this.queued.clear();
  }
}

function distToSeg(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const wx = px - ax, wz = pz - az;
  const len2 = vx * vx + vz * vz;
  let t = len2 > 0 ? (wx * vx + wz * vz) / len2 : 0;
  t = clamp01(t);
  const dx = px - (ax + vx * t), dz = pz - (az + vz * t);
  return Math.hypot(dx, dz);
}

export default RiverSystem;
