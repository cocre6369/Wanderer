/**
 * WANDERER — Noise library
 * ------------------------
 * Seeded gradient (Perlin style) noise in 2D and 3D plus the composite
 * helpers the world generator is built from: fBm, ridged multifractal,
 * domain warping, terracing and analytic derivatives.
 *
 * Pure functions of (seed, coordinates) — no state, no allocation.
 */

import { hash2, hash3, mix32, normalizeSeed } from './rng.js';

const GRAD2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + (b - a) * t; }

/** Classic 2D gradient noise in [-1,1]. */
export function noise2(x, z, seed = 0) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = fade(xf), v = fade(zf);

  const h00 = hash2(xi, zi, seed) & 7;
  const h10 = hash2(xi + 1, zi, seed) & 7;
  const h01 = hash2(xi, zi + 1, seed) & 7;
  const h11 = hash2(xi + 1, zi + 1, seed) & 7;

  const g00 = GRAD2[h00], g10 = GRAD2[h10], g01 = GRAD2[h01], g11 = GRAD2[h11];

  const n00 = g00[0] * xf + g00[1] * zf;
  const n10 = g10[0] * (xf - 1) + g10[1] * zf;
  const n01 = g01[0] * xf + g01[1] * (zf - 1);
  const n11 = g11[0] * (xf - 1) + g11[1] * (zf - 1);

  const nx0 = lerp(n00, n10, u);
  const nx1 = lerp(n01, n11, u);
  return lerp(nx0, nx1, v) * 1.42; // ~[-1,1]
}

/** Classic 3D gradient noise in [-1,1]. */
export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);

  let n000 = 0, n100 = 0, n010 = 0, n110 = 0, n001 = 0, n101 = 0, n011 = 0, n111 = 0;
  {
    let g = GRAD3[hash3(xi, yi, zi, seed) % 12];
    n000 = g[0] * xf + g[1] * yf + g[2] * zf;
    g = GRAD3[hash3(xi + 1, yi, zi, seed) % 12];
    n100 = g[0] * (xf - 1) + g[1] * yf + g[2] * zf;
    g = GRAD3[hash3(xi, yi + 1, zi, seed) % 12];
    n010 = g[0] * xf + g[1] * (yf - 1) + g[2] * zf;
    g = GRAD3[hash3(xi + 1, yi + 1, zi, seed) % 12];
    n110 = g[0] * (xf - 1) + g[1] * (yf - 1) + g[2] * zf;
    g = GRAD3[hash3(xi, yi, zi + 1, seed) % 12];
    n001 = g[0] * xf + g[1] * yf + g[2] * (zf - 1);
    g = GRAD3[hash3(xi + 1, yi, zi + 1, seed) % 12];
    n101 = g[0] * (xf - 1) + g[1] * yf + g[2] * (zf - 1);
    g = GRAD3[hash3(xi, yi + 1, zi + 1, seed) % 12];
    n011 = g[0] * xf + g[1] * (yf - 1) + g[2] * (zf - 1);
    g = GRAD3[hash3(xi + 1, yi + 1, zi + 1, seed) % 12];
    n111 = g[0] * (xf - 1) + g[1] * (yf - 1) + g[2] * (zf - 1);
  }

  const nx00 = lerp(n000, n100, u);
  const nx10 = lerp(n010, n110, u);
  const nx01 = lerp(n001, n101, u);
  const nx11 = lerp(n011, n111, u);
  const nxy0 = lerp(nx00, nx10, v);
  const nxy1 = lerp(nx01, nx11, v);
  return lerp(nxy0, nxy1, w) * 1.15;
}

// ---------- composites ------------------------------------------------------

/** Fractal Brownian motion, output roughly [-1,1]. */
export function fbm2(x, z, seed, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(x * freq, z * freq, seed + i * 1013);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function fbm3(x, y, z, seed, octaves = 3, lacunarity = 2.03, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * freq, y * freq, z * freq, seed + i * 7717);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal — sharp mountain crests. Output [0,1]. */
export function ridged2(x, z, seed, octaves = 4, lacunarity = 2.07, gain = 0.5, offset = 1.0) {
  let amp = 1, freq = 1, sum = 0, norm = 0, prev = 1;
  for (let i = 0; i < octaves; i++) {
    let n = offset - Math.abs(noise2(x * freq, z * freq, seed + i * 313));
    n = n * n;
    sum += n * amp * prev;
    prev = n;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return Math.min(1, Math.max(0, sum / norm));
}

/** Domain warped fBm — breaks up repetition, creates winding valleys. */
export function warped2(x, z, seed, octaves = 3, warpAmount = 0.6) {
  const wx = fbm2(x + 5.2, z + 1.3, seed + 9001, octaves);
  const wz = fbm2(x - 3.7, z + 8.1, seed + 4127, octaves);
  return fbm2(x + warpAmount * wx, z + warpAmount * wz, seed, octaves);
}

/** Terrace / plateau shaping. amount 0..1 */
export function terrace(v, steps, amount = 1) {
  const s = Math.max(2, steps | 0);
  const q = Math.round(v * s) / s;
  return lerp(v, q, amount);
}

export function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/** Finite-difference gradient of a scalar field f(x,z). */
export function gradient2(f, x, z, eps = 1.0) {
  const dx = (f(x + eps, z) - f(x - eps, z)) / (2 * eps);
  const dz = (f(x, z + eps) - f(x, z - eps)) / (2 * eps);
  return [dx, dz];
}

/** A cached, seeded noise sampler — the world generator's workhorse. */
export class NoiseField {
  constructor(seed) {
    this.seed = normalizeSeed(seed);
  }
  n2(x, z, scale, octaves = 1, tag = 0) {
    return fbm2(x * scale, z * scale, this.seed + tag * 131, octaves);
  }
  ridged(x, z, scale, octaves = 4, tag = 0) {
    return ridged2(x * scale, z * scale, this.seed + tag * 131, octaves);
  }
  warped(x, z, scale, octaves = 3, tag = 0) {
    return warped2(x * scale, z * scale, this.seed + tag * 131, octaves);
  }
  n3(x, y, z, scale, octaves = 2, tag = 0) {
    return fbm3(x * scale, y * scale, z * scale, this.seed + tag * 131, octaves);
  }
}

/** Small helper for cheap 1D value noise (wind, animation offsets). */
export function vnoise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const a = (mix32(hash2(i, 0, seed)) >>> 8) / 8388608 - 1;
  const b = (mix32(hash2(i + 1, 0, seed)) >>> 8) / 8388608 - 1;
  return lerp(a, b, fade(f));
}

export default NoiseField;
