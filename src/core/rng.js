/**
 * WANDERER — Deterministic randomness
 * -----------------------------------
 * Every procedurally generated thing in the world is derived from integer
 * hashing of world coordinates plus the world seed. That guarantees the same
 * seed + settings always produces exactly the same world (spec 40), on any
 * machine, in any order, forever.
 */

// ---------- integer hashing -------------------------------------------------

export function mix32(a) {
  a |= 0;
  a = (a ^ 61) ^ (a >>> 16);
  a = (a + (a << 3)) | 0;
  a = a ^ (a >>> 4);
  a = Math.imul(a, 0x27d4eb2d);
  a = a ^ (a >>> 15);
  return a >>> 0;
}

/** Hash two integers -> unsigned 32 bit. */
export function hash2(x, y, seed = 0) {
  let h = seed | 0;
  h = Math.imul(h ^ (x | 0), 0x9e3779b1);
  h = Math.imul(h ^ (y | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash three integers -> unsigned 32 bit. */
export function hash3(x, y, z, seed = 0) {
  let h = seed | 0;
  h = Math.imul(h ^ (x | 0), 0x9e3779b1);
  h = Math.imul(h ^ (y | 0), 0x85ebca6b);
  h = Math.imul(h ^ (z | 0), 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash a string -> unsigned 32 bit (used for textual seeds). */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Normalise any user supplied seed (string or number) into a 32 bit int. */
export function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return Math.abs(Math.trunc(seed)) >>> 0;
  if (typeof seed === 'string') {
    const t = seed.trim();
    if (t === '') return 0;
    if (/^-?\d+$/.test(t)) return Math.abs(parseInt(t, 10)) >>> 0;
    return hashString(t);
  }
  return 0;
}

/** Human readable seed string (what the player sees / copies). */
export function seedToDisplay(seed) {
  return String(normalizeSeed(seed));
}

export function randomSeedText() {
  // A short evocative seed reads better than 10 digits.
  const A = ['ash', 'tide', 'hollow', 'ember', 'glass', 'salt', 'nine', 'dusk', 'iron', 'moss',
    'quiet', 'long', 'broken', 'silver', 'winter', 'crow', 'stone', 'amber', 'drift', 'vale'];
  const B = ['reach', 'spire', 'marsh', 'ford', 'light', 'gate', 'song', 'fall', 'watch', 'deep',
    'crest', 'hollow', 'march', 'barrow', 'shard', 'well', 'coast', 'pyre', 'road', 'echo'];
  const a = A[(Math.random() * A.length) | 0];
  const b = B[(Math.random() * B.length) | 0];
  return `${a}-${b}-${(Math.random() * 900000 + 100000) | 0}`;
}

// ---------- streams ---------------------------------------------------------

/**
 * Small, fast, high quality PRNG (sfc32). Seeded, reseedable, and stable
 * across platforms because it only uses 32 bit integer arithmetic.
 */
export class Rng {
  constructor(seed = 1) {
    this.seed = normalizeSeed(seed) || 1;
    this.a = 0; this.b = this.seed; this.c = this.b; this.d = 0x9e3779b9;
    for (let i = 0; i < 12; i++) this.next();
  }

  /** Raw unsigned 32 bit. */
  next() {
    let { a, b, c, d } = this;
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return t >>> 0;
  }

  /** [0,1) */
  float() { return this.next() / 4294967296; }
  /** [min,max) */
  range(min, max) { return min + this.float() * (max - min); }
  /** inclusive integer */
  int(min, max) { return min + ((this.next() % (max - min + 1)) >>> 0); }
  chance(p) { return this.float() < p; }
  sign() { return this.float() < 0.5 ? -1 : 1; }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }

  /** Weighted pick: entries are [value, weight]. */
  weighted(entries) {
    let total = 0;
    for (const e of entries) total += e[1];
    if (total <= 0) return entries[0][0];
    let r = this.float() * total;
    for (const e of entries) {
      r -= e[1];
      if (r <= 0) return e[0];
    }
    return entries[entries.length - 1][0];
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /** Deterministic gaussian-ish (sum of uniforms). */
  bell(spread = 1) {
    return (this.float() + this.float() + this.float() - 1.5) * (2 / 3) * spread;
  }

  /** Fork a stable child stream without disturbing this one. */
  fork(tag) {
    return new Rng(hash2(this.seed, typeof tag === 'number' ? tag : hashString(String(tag)), 0x51ab));
  }

  static fromCoord(x, y, seed, tag = 0) {
    return new Rng(hash3(x | 0, y | 0, tag | 0, seed));
  }
}

/** Convenience: a fresh stream for a world cell. */
export function cellRng(seed, cx, cz, tag = 0) {
  return new Rng(hash3(cx | 0, cz | 0, tag | 0, normalizeSeed(seed)));
}

export default Rng;
