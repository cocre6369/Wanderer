/**
 * WANDERER — Weather
 * ------------------
 * A weather front drifts across the world on a seeded path, so the sky you
 * see at (x, z) is a property of the world, not of a random roll. Fronts
 * respect latitude and biome: blizzards need cold, sandstorms need sand,
 * ashfall only happens downwind of volcanic ground.
 */


export const WEATHERS = {
  clear:     { id: 'clear',     name: 'Clear',        vis: 2400, wind: 0.6, cloud: 0.18, precip: 0,    tempMod: 0,    dark: 0 },
  cloudy:    { id: 'cloudy',    name: 'Overcast',     vis: 1400, wind: 1.2, cloud: 0.72, precip: 0,    tempMod: -2,   dark: 0.25 },
  rain:      { id: 'rain',      name: 'Rain',         vis: 700,  wind: 1.6, cloud: 0.95, precip: 0.7,  tempMod: -4,   dark: 0.45, wet: 1 },
  storm:     { id: 'storm',     name: 'Storm',        vis: 420,  wind: 3.0, cloud: 1.0,  precip: 1.0,  tempMod: -6,   dark: 0.65, wet: 1, lightning: 1 },
  snow:      { id: 'snow',      name: 'Snowfall',     vis: 620,  wind: 1.1, cloud: 0.9,  precip: 0.7,  tempMod: -3,   dark: 0.35, snow: 1 },
  blizzard:  { id: 'blizzard',  name: 'Blizzard',     vis: 180,  wind: 3.4, cloud: 1.0,  precip: 1.0,  tempMod: -12,  dark: 0.6, snow: 1 },
  fog:       { id: 'fog',       name: 'Fog',          vis: 160,  wind: 0.3, cloud: 0.6,  precip: 0,    tempMod: -1,   dark: 0.2, fog: 1 },
  sandstorm: { id: 'sandstorm', name: 'Sandstorm',    vis: 220,  wind: 3.2, cloud: 0.5,  precip: 0.85, tempMod: 3,    dark: 0.5, sand: 1 },
  ashfall:   { id: 'ashfall',   name: 'Ashfall',      vis: 480,  wind: 1.4, cloud: 0.85, precip: 0.6,  tempMod: 4,    dark: 0.55, ash: 1 },
};

export class WeatherSystem {
  constructor(world, gen) {
    this.world = world;
    this.gen = gen;
    this.fronts = [];
    this.type = 'clear';
    this.intensity = 0;
    this.time = 0;
    this.lightning = 0;
    this._wind = { x: 0.7, z: 0.3 };
    this.nextSpawn = 60;
    this.maxFronts = 4;
    this.frequency = 1;
  }

  /** Fronts are seeded, so a given world always has the same weather history. */
  update(dt, camX, camZ, dayTime) {
    this.time += dt;
    this.nextSpawn -= dt * this.frequency;
    if (this.nextSpawn <= 0 && this.fronts.length < this.maxFronts) {
      this.nextSpawn = 90 + Math.random() * 240;
      this._spawnFront(camX, camZ, dayTime);
    }
    for (let i = this.fronts.length - 1; i >= 0; i--) {
      const f = this.fronts[i];
      f.x += f.vx * dt; f.z += f.vz * dt;
      f.life -= dt;
      f.r = Math.min(f.rMax, f.r + dt * 26);
      if (f.life <= 0 || Math.hypot(f.x - camX, f.z - camZ) > 9000) this.fronts.splice(i, 1);
    }
    this._sample(camX, camZ, dayTime);
    if (this.lightning > 0) this.lightning = Math.max(0, this.lightning - dt * 3);
    else if (WEATHERS[this.type] && WEATHERS[this.type].lightning && Math.random() < dt * 0.16) this.lightning = 1;
    return this;
  }

  _spawnFront(camX, camZ, dayTime) {
    const a = Math.random() * Math.PI * 2;
    const dist = 1400 + Math.random() * 900;
    const x = camX + Math.cos(a) * dist, z = camZ + Math.sin(a) * dist;
    const col = this.world.columnAt(x, z, {});
    const kind = this._pickKind(col, dayTime);
    if (!kind) return;
    const speed = 6 + Math.random() * 10;
    this.fronts.push({
      kind, x, z, r: 240, rMax: 700 + Math.random() * 1200,
      vx: -Math.cos(a) * speed, vz: -Math.sin(a) * speed,
      life: 240 + Math.random() * 600, strength: 0.5 + Math.random() * 0.5,
    });
    this._wind.x = -Math.cos(a); this._wind.z = -Math.sin(a);
  }

  /** Contextual: what weather is even possible on this ground right now. */
  _pickKind(col, dayTime) {
    const night = dayTime < 0.22 || dayTime > 0.80;
    const cold = col.temp < 1;
    const sand = (col.sand || 0) > 0.5 && col.h > 1;
    const volcanic = (col.volcanic || 0) > 0.45;
    const humid = col.humid;
    const pool = [];
    const add = (k, w) => { if (w > 0) pool.push([k, w]); };
    if (cold && col.snow > 0.35) { add('snow', 5); add('blizzard', humid > 0.5 ? 2.4 : 0.6); }
    if (sand) add('sandstorm', 3.2);
    if (volcanic) add('ashfall', 4);
    if (!sand && !cold && humid > 0.34) { add('rain', 4 + humid * 3); add('storm', humid > 0.62 ? 2.2 : 0.5); }
    if (humid > 0.55 && col.temp > 4 && col.temp < 20) add('fog', night ? 3.4 : 1.2);
    add('cloudy', 3.5);
    if (!pool.length) return 'cloudy';
    let total = 0; for (const [, w] of pool) total += w;
    let r = Math.random() * total;
    for (const [k, w] of pool) { r -= w; if (r <= 0) return k; }
    return pool[0][0];
  }

  _sample(x, z, dayTime) {
    let best = null, bestW = 0;
    for (const f of this.fronts) {
      const d = Math.hypot(f.x - x, f.z - z);
      if (d > f.r) continue;
      const w = (1 - d / f.r) * f.strength;
      if (w > bestW) { bestW = w; best = f; }
    }
    if (!best) {
      this.type = 'clear';
      this.intensity = 0;
      return;
    }
    this.type = best.kind;
    this.intensity = Math.min(1, bestW * 1.6);
  }

  /** Everything the renderer and survival tick need, right now. */
  get def() { return WEATHERS[this.type] || WEATHERS.clear; }
  get visibility() { const d = this.def; return d.vis * (1 - this.intensity * 0.55); }
  get wind() { return this.def.wind * (0.4 + this.intensity); }
  get temperatureMod() { return this.def.tempMod * this.intensity; }
  get wetness() { return (this.def.wet || 0) * this.intensity; }
  get snowfall() { return (this.def.snow || 0) * this.intensity; }
  get fxKind() {
    const d = this.def;
    if (d.snow) return this.intensity > 0.6 ? 'blizzard' : 'snow';
    if (d.sand) return 'sandstorm';
    if (d.ash) return 'ashfall';
    if (d.precip) return this.intensity > 0.65 ? 'storm' : 'rain';
    if (d.fog) return 'fog';
    if (d.cloud > 0.5) return 'clouds';
    return 'clear';
  }
  get windVec() { return this._wind; }

  serialize() {
    return {
      time: this.time, type: this.type, intensity: this.intensity,
      wind: [this._wind.x, this._wind.z],
      fronts: this.fronts.map(f => ({ kind: f.kind, x: f.x, z: f.z, r: f.r, rMax: f.rMax, vx: f.vx, vz: f.vz, life: f.life, strength: f.strength })),
    };
  }
  restore(s) {
    if (!s) return;
    this.time = s.time || 0; this.type = s.type || 'clear'; this.intensity = s.intensity || 0;
    this._wind = { x: s.wind[0], z: s.wind[1] };
    this.fronts = s.fronts || [];
  }
}

export default WeatherSystem;
