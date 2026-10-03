/**
 * WANDERER — World generator
 * --------------------------
 * The whole surface of the world is a pure function of (seed, settings, x, z).
 * Nothing is stored, so any point on an infinite world can be recomputed
 * exactly, at any resolution, in any order (spec 4, 40).
 *
 * Layers, coarse to fine:
 *   continentalness -> erosion -> ridged ranges -> mesas -> hills -> detail
 * plus independent climate fields (temperature, humidity, aridity, volcanic
 * activity, old growth, anomaly) that drive biome selection.
 *
 * Geography is causal: mountains come from long warped ridges, rivers follow
 * the low-frequency surface downhill, snow follows the lapse rate and
 * latitude, deserts follow the aridity field, swamps need low + wet ground.
 */

import { fbm2, ridged2, warped2, noise2, smoothstep, clamp, clamp01, terrace } from '../core/noise.js';
import { normalizeSeed } from '../core/rng.js';
import { selectBiome, blendField, blendColor } from './biomes.js';
import { clampGen, worldSizeMeters } from './config.js';

const S = 1; // metres per world unit

/**
 * Bilinear cache over a regular lattice.
 * The climate fields vary over kilometres, so evaluating them once per 100 m
 * and interpolating is free next to running the noise stack per vertex.
 */
class Lattice {
  constructor(cell, max = 60000) {
    this.cell = cell; this.max = max; this.map = new Map();
  }
  _k(i, j) { return (i & 0xfffff) * 0x100000 + (j & 0xfffff); }
  _c(i, j, fn) {
    const k = this._k(i, j);
    let v = this.map.get(k);
    if (v === undefined) {
      v = fn(i * this.cell, j * this.cell);
      if (this.map.size > this.max) this.map.clear();
      this.map.set(k, v);
    }
    return v;
  }
  get(x, z, fn) {
    const c = this.cell, fx = x / c, fz = z / c;
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const a = this._c(i, j, fn) + (this._c(i + 1, j, fn) - this._c(i, j, fn)) * tx;
    const b = this._c(i, j + 1, fn) + (this._c(i + 1, j + 1, fn) - this._c(i, j + 1, fn)) * tx;
    return a + (b - a) * tz;
  }
  clear() { this.map.clear(); }
}

export class WorldGen {
  /** desc: { seed, size, type, gen } */
  constructor(desc) {
    this.desc = desc;
    this.seed = normalizeSeed(desc.seed) || 1337;
    this.gen = clampGen(desc.gen || {});
    this.sizeMeters = worldSizeMeters(desc.size);
    this.infinite = desc.size === 'infinite' || !this.sizeMeters;
    this.type = desc.type || 'normal';

    const g = this.gen;
    const n = v => v / 100;
    this.p = {
      ocean: n(g.oceanSize),
      island: n(g.islandFrequency),
      mFreq: n(g.mountainFrequency),
      mHeight: 150 + n(g.mountainHeight) * 780,     // max peak altitude
      canyon: n(g.canyonFrequency),
      plateau: n(g.plateauFrequency),
      river: n(g.riverFrequency),
      lake: n(g.lakeFrequency),
      swamp: n(g.swampFrequency),
      forest: n(g.forestDensity),
      desert: n(g.desertFrequency),
      snow: n(g.snowFrequency),
      jungle: n(g.jungleFrequency),
      cave: n(g.caveFrequency),
      caveSize: n(g.caveSize),
      dungeon: n(g.dungeonFrequency),
      resource: n(g.resourceAbundance),
      wildlife: n(g.wildlifeDensity),
      enemy: n(g.enemyDensity),
      ruin: n(g.ruinFrequency),
      village: n(g.villageFrequency),
      landmark: n(g.landmarkFrequency),
      mystery: n(g.mysteryFrequency),
      weather: n(g.weatherIntensity),
    };
    this.seaCut = 0.30 + this.p.ocean * 0.36;       // continentalness cut-off
    this.s = this.seed;

    // Gradient noise is exactly zero on its integer lattice, so without an
    // offset every seed would share the same zero-crossing grid (and the same
    // value at the origin). Shift the whole field set by a seed-derived,
    // non-integer amount to break that alignment.
    const r0 = ((this.seed * 2654435761) >>> 0) / 4294967296;
    const r1 = ((this.seed * 40503) >>> 0) / 4294967296;
    this.ox = r0 * 7919.3 + 0.371;
    this.oz = r1 * 6151.7 - 0.917;

    // Coarse-field cache (the low frequency surface is smooth, so a 32 m
    // lattice with bilinear interpolation is visually identical and ~13x
    // cheaper than re-running the noise stack per vertex).
    this._coarse = new Map();
    this._coarseMax = 90000;
    this.COARSE = 32;

    this._lat = {
      temp: new Lattice(128), humid: new Lattice(96), volc: new Lattice(160),
      old: new Lattice(160), canyon: new Lattice(40), lake: new Lattice(48),
    };
  }

  /* ── continental shape ───────────────────────────────────────────── */

  /** Continentalness 0..1 (very long wavelength). */
  continental(x, z) {
    x += this.ox; z += this.oz;
    return fbm2(x * 0.00033, z * 0.00033, this.s + 11, 3) * 0.5 + 0.5;
  }

  /** Long warped ridges -> mountain *ranges*, not scattered peaks. */
  rangeField(x, z) {
    x += this.ox; z += this.oz;
    const wx = fbm2(x * 0.00045 + 3.1, z * 0.00045 - 1.7, this.s + 9011, 2);
    const wz = fbm2(x * 0.00045 - 5.3, z * 0.00045 + 8.9, this.s + 4127, 2);
    return ridged2((x + wx * 900) * 0.00062, (z + wz * 900) * 0.00062, this.s + 313, 4);
  }

  /** Canyon / ravine field. */
  canyonField(x, z) {
    x += this.ox; z += this.oz;
    return ridged2(x * 0.0016 + 12.4, z * 0.0016 - 4.2, this.s + 7717, 3);
  }

  /** Volcanic province mask (rare, clustered). */
  volcanicField(x, z) {
    x += this.ox; z += this.oz;
    const v = fbm2(x * 0.00055 + 40.2, z * 0.00055 + 12.8, this.s + 2027, 2) * 0.5 + 0.5;
    const gate = fbm2(x * 0.00018 - 9.1, z * 0.00018 + 3.4, this.s + 8803, 2) * 0.5 + 0.5;
    return clamp01(smoothstep(0.60, 0.80, v) * smoothstep(0.42, 0.72, gate) * 1.5);
  }

  /** Old-growth / ancient forest mask. */
  oldGrowthField(x, z) {
    x += this.ox; z += this.oz;
    return clamp01(fbm2(x * 0.00042 - 21.7, z * 0.00042 + 17.3, this.s + 5150, 2) * 0.5 + 0.5);
  }

  /**
   * Anomaly field — gates the rare biome variants. Deliberately extreme:
   * only a few tenths of a percent of the world ever crosses the threshold,
   * so finding a Crystal Forest is an event, not a commute.
   */
  anomalyField(x, z) {
    x += this.ox; z += this.oz;
    const a = noise2(x * 0.0011 + 3.3, z * 0.0011 - 7.7, this.s + 404) * 0.5 + 0.5;
    return smoothstep(0.80 - this.p.mystery * 0.14, 0.95, a);
  }
  anomalyKind(x, z) {
    x += this.ox; z += this.oz;
    return (noise2(x * 0.0004 - 55.2, z * 0.0004 + 31.9, this.s + 909) * 0.5 + 0.5) * 997 | 0;
  }

  /* ── climate ─────────────────────────────────────────────────────── */

  /**
   * Latitude-ish -1..1. Infinite worlds get repeating climate belts; finite
   * worlds only span as much latitude as their size justifies, so a small
   * world is not half tundra.
   */
  latitude(z) {
    if (this.infinite) return 0.92 * Math.sin(z * 0.00042 + 0.6);
    const half = Math.max(512, this.sizeMeters * 0.5);
    const span = clamp(this.sizeMeters / 20000, 0.26, 1.2);
    return clamp(z / half, -1, 1) * span;
  }

  /**
   * Cached climate fields. Each of these varies over kilometres, so they are
   * evaluated on a lattice and interpolated instead of running the noise
   * stack for every terrain vertex.
   */
  tempSea(x, z) {
    return this._lat.temp.get(x + this.ox, z + this.oz, (lx, lz) => {
      const cold = fbm2(lx * 0.00026 - 33.3, lz * 0.00026 + 11.1, this.s + 1515, 2) * 0.5 + 0.5;
      const polar = smoothstep(0.60 - this.p.snow * 0.20, 0.82 - this.p.snow * 0.20, cold);
      return 30 - polar * 48 + noise2(lx * 0.0009 + 5.5, lz * 0.0009 - 2.2, this.s + 616) * 3.2;
    });
  }

  humidityAt(x, z) {
    return this._lat.humid.get(x + this.ox, z + this.oz, (lx, lz) => {
      let h = fbm2(lx * 0.00062 + 71.1, lz * 0.00062 - 33.4, this.s + 3030, 3) * 0.5 + 0.5;
      // Aridity belt: a whole region can be robbed of rain, which is what
      // makes a desert a place rather than a texture.
      const arid = fbm2(lx * 0.00048 - 18.4, lz * 0.00048 + 62.1, this.s + 7070, 2) * 0.5 + 0.5;
      const dry = smoothstep(0.54 - this.p.desert * 0.16, 0.74 - this.p.desert * 0.12, arid);
      h = h * 0.78 + 0.10 - dry * 0.92;
      h += (this.p.swamp - 0.4) * 0.22 + (this.p.jungle - 0.4) * 0.12;
      return clamp01(h);
    });
  }

  volcanicAt(x, z) {
    return this._lat.volc.get(x + this.ox, z + this.oz, (lx, lz) => {
      const v = fbm2(lx * 0.00055 + 40.2, lz * 0.00055 + 12.8, this.s + 2027, 2) * 0.5 + 0.5;
      const gate = fbm2(lx * 0.00018 - 9.1, lz * 0.00018 + 3.4, this.s + 8803, 2) * 0.5 + 0.5;
      return clamp01(smoothstep(0.60, 0.80, v) * smoothstep(0.42, 0.72, gate) * 1.5);
    });
  }

  oldGrowthAt(x, z) {
    return this._lat.old.get(x + this.ox, z + this.oz, (lx, lz) =>
      clamp01(fbm2(lx * 0.00042 - 21.7, lz * 0.00042 + 17.3, this.s + 5150, 2) * 0.5 + 0.5));
  }

  canyonAt(x, z) {
    return this._lat.canyon.get(x + this.ox, z + this.oz, (lx, lz) =>
      clamp01(smoothstep(0.62, 0.90, ridged2(lx * 0.0016 + 12.4, lz * 0.0016 - 4.2, this.s + 7717, 3))));
  }

  lakeMaskAt(x, z) {
    return this._lat.lake.get(x + this.ox, z + this.oz, (lx, lz) =>
      fbm2(lx * 0.00075 - 61.3, lz * 0.00075 + 27.7, this.s + 1212, 2) * 0.5 + 0.5);
  }
  /**
   * Temperature at altitude h (deg C).
   * Latitude sets the baseline, the cached "cold current" field gives whole
   * regions their own climate (so tundra is not just map edges), and the
   * exaggerated lapse rate puts snow on high ground anywhere.
   */
  temperature(x, z, h) {
    const lat = Math.abs(this.latitude(z));
    let t = this.tempSea(x, z) - 40 * lat;
    t -= h * 0.019;
    t += this.volcanicAt(x, z) * 26;
    return t;
  }

  /** Humidity 0..1. */
  humidity(x, z) {
    return this.humidityAt(x, z);
  }

  /* ── terrain ─────────────────────────────────────────────────────── */

  /** Lattice corner value (cached). */
  _corner(gx, gz) {
    const key = (gx & 0xfffff) * 0x100000 + (gz & 0xfffff);
    let v = this._coarse.get(key);
    if (v === undefined) {
      const C = this.COARSE;
      v = this._lowRaw(gx * C, gz * C);
      if (this._coarse.size > this._coarseMax) this._coarse.clear();
      this._coarse.set(key, v);
    }
    return v;
  }

  /**
   * Low frequency surface: continents, ranges, mesas, hills.
   * Evaluated on a 32 m lattice and bilinearly interpolated — visually
   * identical (the field's own wavelength is >400 m) and ~13x cheaper.
   * This is what rivers flow down and lakes sit in.
   */
  lowHeight(x, z) {
    const C = this.COARSE;
    const fx = x / C, fz = z / C;
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const h00 = this._corner(i, j), h10 = this._corner(i + 1, j);
    const h01 = this._corner(i, j + 1), h11 = this._corner(i + 1, j + 1);
    const a = h00 + (h10 - h00) * tx;
    const b = h01 + (h11 - h01) * tx;
    return a + (b - a) * tz;
  }

  /** Analytic gradient of the interpolated low surface (dh/dx, dh/dz). */
  gradLow(x, z) {
    const C = this.COARSE;
    const fx = x / C, fz = z / C;
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const h00 = this._corner(i, j), h10 = this._corner(i + 1, j);
    const h01 = this._corner(i, j + 1), h11 = this._corner(i + 1, j + 1);
    return [
      ((h10 - h00) * (1 - tz) + (h11 - h01) * tz) / C,
      ((h01 - h00) * (1 - tx) + (h11 - h10) * tx) / C,
    ];
  }

  _lowRaw(x, z) {
    const s = this.s, p = this.p;
    const ox = x + this.ox, oz = z + this.oz;
    const c = this.continental(x, z);
    const land = smoothstep(this.seaCut - 0.075, this.seaCut + 0.13, c);

    if (land < 0.004) {
      // Ocean floor, with islands poking up.
      const depth = clamp(this.seaCut - c, 0, 1);
      let h = -6 - depth * 300;
      if (p.island > 0.02) {
        const isl = ridged2(ox * 0.0013 + 4.4, oz * 0.0013 + 9.9, s + 5511, 3);
        const m = smoothstep(0.70 - p.island * 0.16, 0.86, isl) * p.island * 2.2;
        h += m * (60 + 150 * isl);
        if (h > -1.2) h = Math.min(h, 4 + isl * 90);   // cap island height
      }
      // seamounts / shelves
      h += fbm2(ox * 0.004, oz * 0.004, s + 4242, 2) * 5 * (1 - land);
      return h;
    }

    // ── land ──
    const hills = fbm2(ox * 0.0023, oz * 0.0023, s + 900, 3);
    const rolling = fbm2(ox * 0.00075, oz * 0.00075, s + 2020, 2);

    let h = 6 + land * 26 + hills * (16 + 26 * (1 - p.ocean)) + rolling * 34;

    // Mountain ranges
    const range = this.rangeField(x, z);
    const mThresh = 0.72 - p.mFreq * 0.34;
    const mMask = smoothstep(mThresh, mThresh + 0.20, range);
    if (mMask > 0) {
      const sharp = Math.pow(range, 1.7);
      h += mMask * p.mHeight * (0.35 + 0.65 * sharp) * (0.55 + 0.45 * land);
    }

    // Mesas / plateaus — terraced flat tops
    if (p.plateau > 0.05) {
      const pm = fbm2(ox * 0.00062 + 55.5, oz * 0.00062 - 21.2, s + 6060, 2) * 0.5 + 0.5;
      const mask = smoothstep(0.58, 0.74, pm) * p.plateau;
      if (mask > 0.001) {
        const th = terrace(h / 90, 5, 0.92) * 90 + 12;
        h = h + (th - h) * mask * 0.85;
      }
    }

    // Canyons: carve a V where the field peaks, keep steep walls.
    if (p.canyon > 0.04) {
      const cf = this.canyonField(x, z);
      const cm = smoothstep(0.78 - p.canyon * 0.2, 0.93, cf) * clamp01(land * 1.4);
      if (cm > 0) {
        const floor = Math.max(2, h - (45 + 105 * p.canyon));
        h = h + (floor - h) * cm;
      }
    }

    // Valleys should be gentle where it is wet, rugged where it is dry.
    const humid = this.humidity(x, z);
    h += (0.5 - humid) * 8 * fbm2(ox * 0.006, oz * 0.006, s + 8181, 2);

    // Volcanic cones
    const vol = this.volcanicField(x, z);
    if (vol > 0.02) h += vol * vol * 260;

    // Finite worlds fade out into open ocean at the rim so the map edge
    // reads as "the sea goes on", never as a wall.
    if (!this.infinite) {
      const half = this.sizeMeters * 0.5;
      const m = this.sizeMeters * 0.085;
      const e = Math.min(
        smoothstep(half, half - m, Math.abs(x)),
        smoothstep(half, half - m, Math.abs(z)),
      );
      if (e < 1) h = -22 + (h + 22) * e;
    }

    return h;
  }

  /** Final terrain height (before river carving). */
  height(x, z) {
    let h = this.lowHeight(x, z);
    if (h < -3) {
      // sea floor detail
      return h + noise2((x + this.ox) * 0.05, (z + this.oz) * 0.05, this.s + 1717) * 2.2;
    }
    const s = this.s;
    const ox = x + this.ox, oz = z + this.oz;
    h += fbm2(ox * 0.011, oz * 0.011, s + 51, 2) * 5.2;
    h += noise2(ox * 0.045, oz * 0.045, s + 1313) * 1.35;
    // beaches: flatten just above the water line
    if (h > -1 && h < 5) {
      const t = smoothstep(-1, 5, h);
      h = -1 + t * t * 6 + (h - (-1 + t * 6)) * 0.35;
    }
    return h;
  }

  /** Slope 0..1 measured on the *final* surface (used by gameplay). */
  slopeAt(x, z) {
    const e = 3.5;
    const dx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    const dz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    return clamp01(Math.sqrt(dx * dx + dz * dz) / 1.5);
  }

  /** Cheap slope from the smooth field only. */
  slopeLow(x, z) {
    const [dx, dz] = this.gradLow(x, z);
    return clamp01(Math.sqrt(dx * dx + dz * dz) / 1.5);
  }

  /* ── composite column sample ─────────────────────────────────────── */

  /**
   * Everything the mesher / gameplay needs for one column.
   * Pass `out` to avoid allocation in hot loops.
   */
  sample(x, z, out, slopeOpt) {
    const o = out || {};
    const h = this.height(x, z);
    const slope = slopeOpt === undefined ? this.slopeAt(x, z) : slopeOpt;
    const temp = this.temperature(x, z, h);
    const humid = this.humidityAt(x, z);
    const vol = this.volcanicAt(x, z);
    const can = this.canyonAt(x, z);
    const old = this.oldGrowthAt(x, z);
    const anom = this.anomalyField(x, z);

    const nearCoast = h < 10 && this.lowHeight(x, z) < 18;
    const sel = selectBiome({
      temp, humid, h, slope,
      canyon: can,
      volcanic: vol,
      oldGrowth: smoothstep(0.50, 0.70, old) * clamp01((humid - 0.25) / 0.45) * clamp01((h + 10) / 60),
      nearCoast: nearCoast ? 1 : 0,
      anomaly: anom,
      anomalyKind: this.anomalyKind(x, z),
    });

    o.x = x; o.z = z;
    o.h = h;
    o.slope = slope;
    o.temp = temp;
    o.humid = humid;
    o.biome = sel.id;
    o.weights = sel.weights;
    o.volcanic = vol;
    o.canyon = can;
    o.old = old;
    o.anomaly = anom;
    o.snow = clamp01(smoothstep(2.5, -3.5, temp));
    o.sand = clamp01(smoothstep(0.34, 0.16, humid)) * clamp01(smoothstep(-4, 6, temp / 6));
    o.lat = this.latitude(z);
    return o;
  }

  /* ── derived surface properties ──────────────────────────────────── */

  /** Blended ground colour for a column, 0..255 rgb. */
  groundColor(col) {
    const w = col.weights;
    const c = blendColor(w, 'color');
    const r = blendColor(w, 'rock');
    const t = clamp01((col.slope - 0.32) / 0.5);
    return [
      c[0] * (1 - t) + r[0] * t,
      c[1] * (1 - t) + r[1] * t,
      c[2] * (1 - t) + r[2] * t,
    ];
  }

  treeDensity(col) {
    const base = blendField(col.weights, 'tree');
    const climate = clamp01((col.humid - 0.12) / 0.5) * clamp01((col.temp + 6) / 12);
    const steep = 1 - clamp01((col.slope - 0.45) / 0.4);
    return clamp01(base * (0.35 + 0.9 * this.p.forest) * (0.4 + 0.9 * climate) * steep * 1.25);
  }

  grassDensity(col) {
    const base = blendField(col.weights, 'grassD');
    const climate = clamp01((col.humid - 0.08) / 0.42) * clamp01((col.temp + 4) / 10);
    return clamp01(base * climate * (1 - clamp01((col.slope - 0.4) / 0.45)));
  }

  rockDensity(col) {
    return clamp01(blendField(col.weights, 'rocks') * (0.4 + col.slope * 1.5) * (0.6 + this.p.resource * 0.8));
  }

  /** Movement modifier for the surface (spec 11). */
  moveModifier(col) {
    let m = blendField(col.weights, 'move') || 1;
    if (col.snow > 0.55) m *= 0.82;
    if (col.h < 1.2 && col.h > -1.5 && col.humid > 0.6) m *= 0.8;   // shoreline mud
    return m;
  }

  /** Is this column ice (slippery)? */
  icy(col) {
    return col.temp < -1.5 && (col.biome === 'glacier' || col.biome === 'tundra' || col.biome === 'red_snow' || col.biome === 'frozen_jungle');
  }

  /* ── lakes ───────────────────────────────────────────────────────── */

  /**
   * Basin lakes: wherever the true surface dips below its own smoothed
   * version and the lake mask allows it, the depression floods.
   */
  lakeLevel(x, z) {
    const low = this.lowHeight(x, z);
    if (low < 0.5) return null;
    const mask = this.lakeMaskAt(x, z);
    const th = 0.62 - this.p.lake * 0.2;
    if (mask < th) return null;
    const fill = low - 1.4 - (mask - th) * 22;
    if (fill < 0.4) return null;
    return fill;
  }

  /** Water surface height at a column, or null if dry. */
  waterLevel(x, z, h) {
    const hh = h === undefined ? this.height(x, z) : h;
    if (hh < -0.35) return 0;                         // ocean
    const lake = this.lakeLevel(x, z);
    if (lake !== null && hh < lake) return lake;
    return null;
  }

  clearCache() {
    this._coarse.clear();
    for (const k in this._lat) this._lat[k].clear();
  }
}

/** Convenience factory. */
export function createGen(desc) { return new WorldGen(desc); }

/** World edge handling for finite worlds: fade the land into ocean. */
export function edgeFalloff(gen, x, z) {
  if (gen.infinite) return 1;
  const half = gen.sizeMeters * 0.5;
  const m = gen.sizeMeters * 0.09;
  const fx = smoothstep(half, half - m, Math.abs(x));
  const fz = smoothstep(half, half - m, Math.abs(z));
  return Math.min(fx, fz);
}
