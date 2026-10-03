/**
 * WANDERER — Audio
 * ----------------
 * Everything here is synthesised at runtime: no sample packs, no downloads.
 * Noise buffers are generated once, instruments are small oscillator graphs,
 * and the soundtrack is a generative pad/arpeggio engine that re-harmonises
 * itself from the world (biome, time of day, danger).
 *
 * Positional sound uses PannerNodes so a wolf behind you is behind you.
 */

const MODES = {
  wanderer: [0, 2, 4, 7, 9],      // major pentatonic — daytime, open ground
  dusk:     [0, 3, 5, 7, 10],     // minor pentatonic — evening
  hollow:   [0, 1, 6, 7, 11],     // dissonant — ruins, caves, the Choir
  calm:     [0, 4, 7, 11, 14],    // lydian — safe camps, villages
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.volumes = { master: 0.8, music: 0.45, sfx: 0.85, ambient: 0.6 };
    this.listener = null;
    this.mode = 'wanderer';
    this.tension = 0;
    this._noise = null;
    this._pads = [];
    this._arpT = 0;
    this._nextArp = 0;
    this._ambient = {};
    this._root = 110;
  }

  /* ── lifecycle ───────────────────────────────────────────────────── */

  async init() {
    if (this.ready) return true;
    const AC = typeof AudioContext !== 'undefined' ? AudioContext : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
    if (!AC) return false;
    try {
      this.ctx = new AC();
    } catch (e) { return false; }
    const c = this.ctx;

    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.volumes.master;
    this.master.connect(c.destination);

    this.busMusic = c.createGain(); this.busMusic.gain.value = this.volumes.music; this.busMusic.connect(this.master);
    this.busSfx = c.createGain(); this.busSfx.gain.value = this.volumes.sfx; this.busSfx.connect(this.master);
    this.busAmb = c.createGain(); this.busAmb.gain.value = this.volumes.ambient; this.busAmb.connect(this.master);

    // gentle bus compression so a storm + combat never clips
    if (c.createDynamicsCompressor) {
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.ratio.value = 6; this.comp.attack.value = 0.004; this.comp.release.value = 0.22;
      this.master.disconnect(); this.master.connect(this.comp); this.comp.connect(c.destination);
    }

    this.listener = c.listener;
    this._makeNoise();
    this._startPads();
    this._startAmbient();
    this.ready = true;
    return true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }

  setVolume(bus, v) {
    this.volumes[bus] = Math.max(0, Math.min(1, v));
    if (!this.ready) return;
    const g = bus === 'master' ? this.master : bus === 'music' ? this.busMusic : bus === 'sfx' ? this.busSfx : this.busAmb;
    if (g) g.gain.setTargetAtTime(bus === 'master' && this.muted ? 0 : this.volumes[bus], this.ctx.currentTime, 0.05);
  }
  setMuted(m) { this.muted = m; if (this.ready) this.master.gain.setTargetAtTime(m ? 0 : this.volumes.master, this.ctx.currentTime, 0.05); }

  /* ── primitives ──────────────────────────────────────────────────── */

  _makeNoise() {
    const c = this.ctx, len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      d[i] = w;
      last = last * 0.5 + w * 0.5;
    }
    this._noise = buf;
    // a brown-ish variant for wind and rumble
    const buf2 = c.createBuffer(1, len, c.sampleRate);
    const d2 = buf2.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
      d2[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
    }
    this._brown = buf2;
  }

  _src(buffer, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer; s.loop = loop;
    return s;
  }

  _env(dest, t0, a, d, peak, sustain = 0) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, sustain || 0.0001), t0 + a + d);
    g.connect(dest);
    return g;
  }

  _filter(type, freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    return f;
  }

  /** Stereo position from a world offset relative to the listener. */
  _panner(x, y, z) {
    const c = this.ctx;
    if (!c.createPanner) return this.busSfx;
    const p = c.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 6; p.maxDistance = 160; p.rolloffFactor = 1.1;
    p.positionX ? (p.positionX.value = x, p.positionY.value = y, p.positionZ.value = z)
                : p.setPosition(x, y, z);
    p.connect(this.busSfx);
    return p;
  }

  setListener(pos, fwd, up) {
    if (!this.ready || !this.listener) return;
    const l = this.listener;
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.setTargetAtTime(up.x, t, 0.02);
      l.upY.setTargetAtTime(up.y, t, 0.02);
      l.upZ.setTargetAtTime(up.z, t, 0.02);
    } else if (l.setPosition) {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  /* ── one-shots ───────────────────────────────────────────────────── */

  /** A filtered noise burst — the workhorse for impacts and steps. */
  burst(opts) {
    if (!this.ready || this.muted) return;
    const c = this.ctx, t = c.currentTime + (opts.delay || 0);
    const dur = opts.dur || 0.12;
    const s = this._src(this._noise);
    s.playbackRate.value = opts.rate || 1;
    const f = this._filter(opts.filter || 'bandpass', opts.freq || 900, opts.q || 1.2);
    const g = this._env(opts.dest || this.busSfx, t, opts.attack || 0.004, dur, opts.gain === undefined ? 0.4 : opts.gain);
    s.connect(f); f.connect(g);
    if (opts.dest2) { const g2 = this._env(opts.dest2, t, 0.004, dur, (opts.gain || 0.4) * 0.6); f.connect(g2); }
    s.start(t); s.stop(t + dur + 0.05);
  }

  tone(opts) {
    if (!this.ready || this.muted) return;
    const c = this.ctx, t = c.currentTime + (opts.delay || 0);
    const o = c.createOscillator();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(opts.freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + (opts.dur || 0.2));
    const g = this._env(opts.dest || this.busSfx, t, opts.attack || 0.006, opts.dur || 0.2, opts.gain === undefined ? 0.2 : opts.gain);
    let node = o;
    if (opts.filter) { const f = this._filter(opts.filter, opts.freq, opts.q || 1); o.connect(f); node = f; }
    node.connect(g);
    o.start(t); o.stop(t + (opts.dur || 0.2) + 0.08);
  }

  /* ── game events ─────────────────────────────────────────────────── */

  footstep(kind = 'dirt', pos = null, gain = 1) {
    const table = {
      dirt:  { freq: 320, q: 0.9, dur: 0.10, rate: 1.0 },
      grass: { freq: 900, q: 0.7, dur: 0.09, rate: 1.4 },
      sand:  { freq: 240, q: 0.6, dur: 0.14, rate: 0.7 },
      snow:  { freq: 1800, q: 0.5, dur: 0.13, rate: 1.7 },
      stone: { freq: 1500, q: 2.2, dur: 0.08, rate: 1.2 },
      wood:  { freq: 620, q: 3.0, dur: 0.10, rate: 1.0 },
      mud:   { freq: 150, q: 0.8, dur: 0.18, rate: 0.55 },
      water: { freq: 2200, q: 1.4, dur: 0.12, rate: 1.6 },
      ice:   { freq: 3200, q: 6.0, dur: 0.09, rate: 1.9 },
    };
    const p = table[kind] || table.dirt;
    const dest = pos ? this._panner(pos.x, pos.y, pos.z) : this.busSfx;
    this.burst({ ...p, gain: 0.3 * gain, dest });
    if (kind === 'stone' || kind === 'wood') this.tone({ freq: p.freq * 0.5, to: p.freq * 0.35, dur: 0.07, gain: 0.08 * gain, dest });
  }

  swing(arch = 'sword', kind = 'light') {
    const heavy = kind === 'heavy';
    this.burst({
      filter: 'bandpass', freq: heavy ? 380 : 720, q: 1.1,
      dur: heavy ? 0.26 : 0.16, rate: heavy ? 0.7 : 1.3,
      gain: heavy ? 0.28 : 0.16,
    });
    if (arch === 'hammer' || arch === 'axe') this.tone({ freq: 90, to: 50, dur: 0.2, gain: 0.1, type: 'triangle' });
  }

  impact(material = 'flesh', hits = 1) {
    for (let i = 0; i < Math.min(3, hits); i++) {
      const d = i * 0.035;
      if (material === 'flesh') {
        this.burst({ freq: 220 + Math.random() * 90, q: 0.8, dur: 0.16, gain: 0.4, delay: d, rate: 0.8 });
        this.tone({ freq: 130, to: 60, dur: 0.14, gain: 0.22, type: 'triangle', delay: d });
      } else if (material === 'metal') {
        this.tone({ freq: 2100 + Math.random() * 900, to: 900, dur: 0.3, gain: 0.2, type: 'square', delay: d });
        this.burst({ freq: 3000, q: 4, dur: 0.12, gain: 0.22, delay: d });
      } else if (material === 'wood') {
        this.burst({ freq: 500, q: 2.5, dur: 0.14, gain: 0.3, delay: d, rate: 0.9 });
        this.tone({ freq: 210, to: 90, dur: 0.16, gain: 0.16, type: 'triangle', delay: d });
      } else if (material === 'stone') {
        this.burst({ freq: 1800, q: 3, dur: 0.1, gain: 0.3, delay: d });
        this.tone({ freq: 160, to: 70, dur: 0.2, gain: 0.2, type: 'sawtooth', delay: d });
      } else {
        this.burst({ freq: 900, q: 1, dur: 0.08, gain: 0.1, delay: d });
      }
    }
  }

  hit(crit = false, kind = 'light') { this.impact('flesh', crit ? 2 : 1); if (crit) this.tone({ freq: 1600, to: 2400, dur: 0.18, gain: 0.16, type: 'sine' }); }
  block() { this.impact('metal', 1); this.tone({ freq: 320, to: 180, dur: 0.16, gain: 0.16, type: 'square' }); }
  parry() {
    this.tone({ freq: 2400, to: 3600, dur: 0.3, gain: 0.22, type: 'sine' });
    this.impact('metal', 2);
    this.tone({ freq: 660, to: 990, dur: 0.4, gain: 0.12, type: 'triangle', delay: 0.03 });
  }
  dodge() { this.burst({ freq: 1400, q: 0.8, dur: 0.2, gain: 0.18, rate: 1.6 }); }
  hurt() { this.tone({ freq: 260, to: 120, dur: 0.3, gain: 0.24, type: 'sawtooth' }); this.burst({ freq: 400, q: 0.7, dur: 0.2, gain: 0.24 }); }
  death() { this.tone({ freq: 220, to: 55, dur: 1.6, gain: 0.3, type: 'sawtooth' }); this.burst({ freq: 120, q: 0.5, dur: 1.2, gain: 0.2 }); }

  chop() { this.impact('wood', 1); }
  mine() { this.impact('stone', 1); }
  pickup() { this.tone({ freq: 880, to: 1320, dur: 0.12, gain: 0.14, type: 'sine' }); }
  craft() { this.tone({ freq: 520, to: 780, dur: 0.16, gain: 0.14, type: 'triangle' }); this.tone({ freq: 780, to: 1040, dur: 0.2, gain: 0.1, type: 'sine', delay: 0.08 }); }
  ui(kind = 'click') {
    if (kind === 'click') this.tone({ freq: 1400, dur: 0.05, gain: 0.08, type: 'square' });
    else if (kind === 'open') this.tone({ freq: 500, to: 900, dur: 0.16, gain: 0.1, type: 'sine' });
    else if (kind === 'close') this.tone({ freq: 800, to: 420, dur: 0.14, gain: 0.09, type: 'sine' });
    else if (kind === 'error') this.tone({ freq: 180, to: 120, dur: 0.18, gain: 0.12, type: 'square' });
  }
  discover() {
    const scale = MODES.wanderer;
    [0, 2, 4].forEach((n, i) => this.tone({ freq: this._root * 2 * Math.pow(2, scale[n] / 12), dur: 0.5, gain: 0.1, type: 'sine', delay: i * 0.11 }));
  }
  resonance(pos) {
    const dest = pos ? this._panner(pos.x, pos.y, pos.z) : this.busSfx;
    this.tone({ freq: 196, dur: 1.4, gain: 0.1, type: 'sine', dest });
    this.tone({ freq: 294.5, dur: 1.2, gain: 0.07, type: 'sine', dest, delay: 0.05 });
    this.tone({ freq: 587, dur: 0.9, gain: 0.05, type: 'triangle', dest, delay: 0.1 });
  }
  thunder(gain = 1) {
    this.burst({ filter: 'lowpass', freq: 220, q: 0.6, dur: 1.8, gain: 0.5 * gain, rate: 0.4 });
    this.tone({ freq: 70, to: 32, dur: 1.6, gain: 0.28 * gain, type: 'sawtooth' });
  }

  /* ── generative soundtrack ───────────────────────────────────────── */

  _startPads() {
    const c = this.ctx;
    this.padGain = c.createGain(); this.padGain.gain.value = 0.0; this.padGain.connect(this.busMusic);
    const filt = this._filter('lowpass', 900, 0.8); filt.connect(this.padGain);
    this.padFilter = filt;
    for (let i = 0; i < 3; i++) {
      const o = c.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = this._root * (i === 0 ? 1 : i === 1 ? 1.5 : 2);
      o.detune.value = (i - 1) * 7;
      const g = c.createGain(); g.gain.value = i === 2 ? 0.18 : 0.3;
      o.connect(g); g.connect(filt);
      o.start();
      this._pads.push({ osc: o, gain: g });
    }
    // slow amplitude breathing so the pad is never static
    this._lfo = c.createOscillator(); this._lfo.frequency.value = 0.07;
    this._lfoGain = c.createGain(); this._lfoGain.gain.value = 0.09;
    this._lfo.connect(this._lfoGain); this._lfoGain.connect(this.padGain.gain);
    this._lfo.start();
  }

  /** Re-tune the soundtrack to the moment. mode: key of MODES. */
  setMood(mode, tension = 0) {
    this.mode = MODES[mode] ? mode : this.mode;
    this.tension = Math.max(0, Math.min(1, tension));
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.padGain.gain.setTargetAtTime(0.10 + this.tension * 0.10, t, 1.2);
    this.padFilter.frequency.setTargetAtTime(600 + this.tension * 1600, t, 1.5);
    const scale = MODES[this.mode];
    this._pads.forEach((p, i) => {
      const deg = i === 0 ? 0 : (this.tension > 0.55 ? 3 : 2);
      p.osc.frequency.setTargetAtTime(this._root * Math.pow(2, scale[deg] / 12) * (i === 2 ? 2 : 1), t, 1.5);
      p.osc.detune.setTargetAtTime((i - 1) * (7 + this.tension * 18), t, 1.0);
    });
    this._nextArp = Math.min(this._nextArp, 0.3);
  }

  update(dt) {
    if (!this.ready) return;
    this._arpT += dt;
    if (this._arpT < this._nextArp) return;
    const scale = MODES[this.mode];
    const interval = 1.9 - this.tension * 1.25;
    this._arpT = 0;
    this._nextArp = interval * (0.7 + Math.random() * 0.7);
    if (Math.random() > 0.35 + this.tension * 0.5) return;
    const deg = scale[Math.floor(Math.random() * scale.length)];
    const oct = Math.random() < 0.3 ? 4 : 2;
    this.tone({
      freq: this._root * oct * Math.pow(2, deg / 12),
      dur: 0.9 + Math.random() * 1.4, gain: 0.045 + this.tension * 0.03,
      type: 'sine', dest: this.busMusic, attack: 0.08,
    });
    if (this.tension > 0.5 && Math.random() < 0.4) {
      this.tone({
        freq: this._root * 0.5 * Math.pow(2, scale[(deg + 2) % scale.length] / 12),
        dur: 1.6, gain: 0.05, type: 'triangle', dest: this.busMusic, attack: 0.2,
      });
    }
  }

  /* ── ambient bed ─────────────────────────────────────────────────── */

  _startAmbient() {
    const c = this.ctx;
    // wind
    const w = this._src(this._brown, true);
    const wf = this._filter('bandpass', 420, 0.7);
    const wg = c.createGain(); wg.gain.value = 0.0;
    w.connect(wf); wf.connect(wg); wg.connect(this.busAmb);
    w.start();
    this._ambient.wind = { gain: wg, filter: wf };

    // water
    const s = this._src(this._noise, true);
    const sf = this._filter('bandpass', 900, 0.5);
    const sg = c.createGain(); sg.gain.value = 0.0;
    s.connect(sf); sf.connect(sg); sg.connect(this.busAmb);
    s.start();
    this._ambient.water = { gain: sg, filter: sf };

    // cave / interior rumble
    const r = this._src(this._brown, true);
    const rf = this._filter('lowpass', 180, 0.8);
    const rg = c.createGain(); rg.gain.value = 0.0;
    r.connect(rf); rf.connect(rg); rg.connect(this.busAmb);
    r.start();
    this._ambient.rumble = { gain: rg, filter: rf };

    this._birdT = 2;
    this._insectT = 1;
  }

  /** levels: { wind, water, rumble, birds, insects, rain } each 0..1 */
  setAmbient(l) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const set = (k, v, f) => {
      const a = this._ambient[k];
      if (!a) return;
      a.gain.gain.setTargetAtTime(v * 0.32, t, 0.6);
      if (f && a.filter) a.filter.frequency.setTargetAtTime(f, t, 0.8);
    };
    set('wind', l.wind || 0, 300 + (l.wind || 0) * 900);
    set('water', l.water || 0, 700 + (l.water || 0) * 900);
    set('rumble', l.rumble || 0);
    this._levels = l;
  }

  updateAmbient(dt) {
    if (!this.ready) return;
    const l = this._levels || {};
    // birds: daytime, forests
    this._birdT -= dt;
    if (this._birdT <= 0) {
      this._birdT = 1.2 + Math.random() * 5 / Math.max(0.05, l.birds || 0);
      if ((l.birds || 0) > 0.05 && Math.random() < (l.birds || 0)) this._chirp();
    }
    this._insectT -= dt;
    if (this._insectT <= 0) {
      this._insectT = 0.6 + Math.random() * 2;
      if ((l.insects || 0) > 0.05 && Math.random() < (l.insects || 0) * 0.6) this._insect();
    }
  }

  _chirp() {
    const base = 1800 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      this.tone({
        freq: base * (1 + i * 0.18), to: base * (1.4 + i * 0.1),
        dur: 0.07 + Math.random() * 0.06, gain: 0.035 + Math.random() * 0.02,
        type: 'sine', dest: this.busAmb, delay: i * (0.09 + Math.random() * 0.06), attack: 0.01,
      });
    }
  }

  _insect() {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.value = 3600 + Math.random() * 2200;
    const g = this._env(this.busAmb, t, 0.05, 0.25 + Math.random() * 0.4, 0.012);
    const f = this._filter('bandpass', 4200, 8);
    o.connect(f); f.connect(g);
    o.start(t); o.stop(t + 0.9);
  }

  dispose() {
    if (!this.ready) return;
    try { this.ctx.close(); } catch (e) { /* ignore */ }
    this.ready = false;
  }
}

export { MODES };
export default AudioEngine;
