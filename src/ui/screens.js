/**
 * WANDERER — Title, world creation and loading screens
 * ---------------------------------------------------
 * The world-creation screen is the one place the game shows its working:
 * a live 3D preview of the actual generator output, draggable, zoomable,
 * and hoverable for real column data (biome, elevation, temperature,
 * what grows there, what is near it).
 */

import * as THREE from '../three.js';
import { el, clear, show } from './dom.js';
import {
  WORLD_SIZES, WORLD_TYPES, GEN_FIELDS, defaultGen, genForType, applyType,
  randomizeGen, clampGen, genSignature, worldSizeMeters, VERSION,
} from '../world/config.js';
import { WorldGen } from '../world/gen.js';
import { Rng, randomSeedText, seedToDisplay, normalizeSeed } from '../core/rng.js';
import { BIOMES, resourceTable, creatureTable, biomeName } from '../world/biomes.js';

export class Screens {
  constructor(root, canvas) {
    this.root = root;
    this.previewCanvas = canvas;
    this.desc = {
      name: 'The Drifting Lands',
      seed: randomSeedText(),
      size: 'medium',
      type: 'normal',
      gen: Object.assign(defaultGen(), genForType('normal')),
    };
    this._preview = null;
    this.onStart = null;
  }

  /* ── title ───────────────────────────────────────────────────────── */

  title({ onNew, onContinue, onSettings, slots }) {
    clear(this.root);
    const wrap = el('div', { class: 'screen title' });
    wrap.appendChild(el('div', { class: 'title-art' },
      el('h1', { class: 'logo', text: 'WANDERER' }),
      el('div', { class: 'subtitle', text: 'The Drifting Lands' }),
      el('div', { class: 'ver', text: `v${VERSION.game} · world schema ${VERSION.schema}` })));
    const menu = el('div', { class: 'title-menu' });
    menu.appendChild(el('button', { class: 'btn big primary', text: 'New World', onclick: onNew }));
    if (slots && slots.length) {
      for (const s of slots) {
        menu.appendChild(el('button', {
          class: 'btn big', text: `${s.name} — Day ${s.day}`,
          onclick: () => onContinue(s.slot),
        }));
      }
    }
    menu.appendChild(el('button', { class: 'btn big', text: 'Settings', onclick: onSettings }));
    wrap.appendChild(menu);
    wrap.appendChild(el('div', { class: 'title-foot', text: 'Procedural world · nothing is placed twice · WASD to walk, E to use, B to build' }));
    this.root.appendChild(wrap);
  }

  /* ── world creation ──────────────────────────────────────────────── */

  worldCreate({ onBack, onStart }) {
    clear(this.root);
    const wrap = el('div', { class: 'screen create' });

    /* left: form */
    const form = el('div', { class: 'create-form' });
    form.appendChild(el('h2', { text: 'New World' }));

    form.appendChild(this._field('World name',
      el('input', { class: 'input', value: this.desc.name, oninput: e => { this.desc.name = e.target.value; } })));

    /* seed row */
    const seedInput = el('input', { class: 'input mono', value: this.desc.seed, oninput: e => { this.desc.seed = e.target.value; this._rebuild(); } });
    form.appendChild(el('div', { class: 'field' }, el('label', { text: 'Seed' }), el('div', { class: 'row' },
      seedInput,
      el('button', { class: 'btn icon', title: 'Random seed', text: '⟳', onclick: () => { this.desc.seed = randomSeedText(); seedInput.value = this.desc.seed; this._rebuild(); } }),
      el('button', { class: 'btn icon', title: 'Copy seed', text: '⧉', onclick: () => { this._copy(this.desc.seed); } }))));

    form.appendChild(this._field('Size', this._choice(WORLD_SIZES, this.desc.size, v => { this.desc.size = v; this._rebuild(); }, k => `${WORLD_SIZES[k].name}`)));
    form.appendChild(this._field('Type', this._choice(WORLD_TYPES, this.desc.type, v => {
      this.desc.type = v;
      if (v !== 'custom') this.desc.gen = Object.assign(defaultGen(), genForType(v));
      this._rebuild(); this._syncSliders();
    }, k => WORLD_TYPES[k].name)));

    /* sliders */
    const sliders = el('div', { class: 'sliders' });
    this._sliderNodes = {};
    for (const f of GEN_FIELDS) {
      const out = el('b', { class: 'set-val', text: String(this.desc.gen[f.key]) });
      const input = el('input', {
        type: 'range', min: f.min, max: f.max, step: f.step || 1, value: this.desc.gen[f.key],
        oninput: e => {
          this.desc.gen[f.key] = parseFloat(e.target.value);
          out.textContent = String(this.desc.gen[f.key]);
          this.desc.type = 'custom';
          this._rebuild(true);
        },
      });
      this._sliderNodes[f.key] = input;
      sliders.appendChild(el('label', { class: 'set-row', title: f.desc || '' },
        el('span', { text: f.label }), input, out));
    }
    const sliderBox = el('details', { class: 'slider-box' }, el('summary', { text: `Generation sliders (${GEN_FIELDS.length})` }), sliders);
    form.appendChild(sliderBox);

    form.appendChild(el('div', { class: 'row wrap' },
      el('button', { class: 'btn', text: 'Randomize everything', onclick: () => {
        const rng = new Rng(Date.now() & 0x7fffffff);
        this.desc.seed = randomSeedText();
        seedInput.value = this.desc.seed;
        this.desc.size = rng.pick(Object.keys(WORLD_SIZES));
        this.desc.gen = randomizeGen(rng);
        this.desc.type = 'custom';
        this._syncAll(seedInput);
        this._rebuild();
      } }),
      el('button', { class: 'btn', text: 'Reset', onclick: () => {
        this.desc.gen = Object.assign(defaultGen(), genForType('normal'));
        this.desc.type = 'normal'; this.desc.size = 'medium';
        this._syncAll(seedInput); this._rebuild();
      } })));

    this.sigEl = el('div', { class: 'sig muted' });
    form.appendChild(this.sigEl);

    form.appendChild(el('div', { class: 'row grow-end' },
      el('button', { class: 'btn', text: 'Back', onclick: onBack }),
      el('button', { class: 'btn big primary', text: 'Generate World', onclick: () => onStart(this.desc) })));

    /* right: preview */
    const right = el('div', { class: 'create-preview' });
    right.appendChild(el('div', { class: 'preview-head' },
      el('b', { text: 'Live preview' }),
      el('span', { class: 'muted', text: 'drag to orbit · wheel to zoom · hover for ground truth' })));
    this.previewHost = el('div', { class: 'preview-host' });
    right.appendChild(this.previewHost);
    this.previewInfo = el('div', { class: 'preview-info' });
    right.appendChild(this.previewInfo);

    wrap.append(form, right);
    this.root.appendChild(wrap);
    this._rebuild();
  }

  _field(label, node) { return el('div', { class: 'field' }, el('label', { text: label }), node); }

  _choice(table, value, onchange, labelFn) {
    const row = el('div', { class: 'choice' });
    for (const k in table) {
      row.appendChild(el('button', {
        class: 'chipbtn' + (k === value ? ' on' : ''), text: labelFn(k),
        title: table[k].desc || '',
        onclick: () => { [...row.children].forEach(c => c.classList.remove('on')); onchange(k); },
      }));
    }
    // mark the initial state
    setTimeout(() => {
      const keys = Object.keys(table);
      const i = keys.indexOf(value);
      if (i >= 0 && row.children[i]) row.children[i].classList.add('on');
    }, 0);
    return row;
  }

  _syncSliders() {
    for (const k in this._sliderNodes) {
      const n = this._sliderNodes[k];
      n.value = this.desc.gen[k];
      n.parentElement.querySelector('.set-val').textContent = String(this.desc.gen[k]);
    }
  }
  _syncAll(seedInput) {
    seedInput.value = this.desc.seed;
    this._syncSliders();
    const rows = this.root.querySelectorAll('.choice');
    if (rows[0]) [...rows[0].children].forEach((c, i) => c.classList.toggle('on', Object.keys(WORLD_SIZES)[i] === this.desc.size));
    if (rows[1]) [...rows[1].children].forEach((c, i) => c.classList.toggle('on', Object.keys(WORLD_TYPES)[i] === this.desc.type));
  }

  _copy(text) {
    try {
      if (navigator.clipboard) navigator.clipboard.writeText(text);
      else {
        const t = document.createElement('textarea');
        t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
      }
    } catch (e) { /* ignore */ }
  }

  /** Rebuild the preview world (debounced while dragging sliders). */
  _rebuild(debounce) {
    const run = () => {
      try {
        const gen = new WorldGen({ seed: normalizeSeed(this.desc.seed), size: this.desc.size, type: this.desc.type, gen: clampGen(this.desc.gen) });
        if (!this._preview) this._preview = new Preview(this.previewHost, this.previewCanvas);
        this._preview.setGen(gen, this.desc);
        this.sigEl.textContent = `signature ${genSignature(this.desc.gen)} · ${worldSizeMeters(this.desc.size) ? (worldSizeMeters(this.desc.size) / 1000) + ' km' : 'endless'} · ${this.desc.type}`;
        this._gen = gen;
      } catch (e) {
        this.sigEl.textContent = 'preview failed: ' + e.message;
      }
    };
    clearTimeout(this._rebuildT);
    if (debounce) this._rebuildT = setTimeout(run, 180);
    else run();
  }

  /** Hover readout, driven by the preview's raycast. */
  showPreviewInfo(info) {
    if (!this.previewInfo) return;
    if (!info) { this.previewInfo.textContent = ''; return; }
    clear(this.previewInfo);
    this.previewInfo.appendChild(el('div', { class: 'pi-row' }, el('b', { text: info.biomeName }), el('span', { text: `${Math.round(info.x)}, ${Math.round(info.z)}` })));
    this.previewInfo.appendChild(el('div', { class: 'pi-row' }, el('span', { text: 'Elevation' }), el('b', { text: Math.round(info.h) + ' m' })));
    this.previewInfo.appendChild(el('div', { class: 'pi-row' }, el('span', { text: 'Temperature' }), el('b', { text: info.temp.toFixed(1) + ' °C' })));
    this.previewInfo.appendChild(el('div', { class: 'pi-row' }, el('span', { text: 'Humidity' }), el('b', { text: Math.round(info.humid * 100) + '%' })));
    if (info.water) this.previewInfo.appendChild(el('div', { class: 'pi-row' }, el('span', { text: 'Water' }), el('b', { text: 'yes' })));
    if (info.resources.length) this.previewInfo.appendChild(el('div', { class: 'pi-row res' }, el('span', { text: 'Resources' }), el('b', { text: info.resources.slice(0, 6).join(', ') })));
    if (info.creatures.length) this.previewInfo.appendChild(el('div', { class: 'pi-row res' }, el('span', { text: 'Fauna' }), el('b', { text: info.creatures.slice(0, 5).join(', ') })));
    if (info.nearby) this.previewInfo.appendChild(el('div', { class: 'pi-row res' }, el('span', { text: 'Nearby' }), el('b', { text: info.nearby })));
    if (info.rare) this.previewInfo.appendChild(el('div', { class: 'pi-row rare' }, el('b', { text: 'Rare biome' })));
  }

  /* ── loading ─────────────────────────────────────────────────────── */

  loading() {
    clear(this.root);
    const wrap = el('div', { class: 'screen loading' });
    this.loadLabel = el('div', { class: 'load-label', text: 'Preparing…' });
    const track = el('div', { class: 'load-track' }, this.loadBar = el('div', { class: 'load-bar' }));
    this.loadPct = el('div', { class: 'load-pct', text: '0%' });
    wrap.append(el('h2', { class: 'logo small', text: 'WANDERER' }), this.loadLabel, track, this.loadPct);
    this.root.appendChild(wrap);
  }

  progress(p, label) {
    if (this.loadBar) this.loadBar.style.width = Math.round(p * 100) + '%';
    if (this.loadLabel && label) this.loadLabel.textContent = label;
    if (this.loadPct) this.loadPct.textContent = Math.round(p * 100) + '%';
  }

  error(msg, onRetry) {
    clear(this.root);
    this.root.appendChild(el('div', { class: 'screen loading' },
      el('h2', { text: 'Could not build that world' }),
      el('p', { text: msg }),
      el('button', { class: 'btn primary', text: 'Back', onclick: onRetry })));
  }
}

/* ── the interactive 3D preview ────────────────────────────────────── */

class Preview {
  constructor(host, canvas) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, typeof devicePixelRatio === 'undefined' ? 1 : devicePixelRatio));
    THREE.ColorManagement.enabled = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1418);
    this.scene.fog = new THREE.Fog(0x0d1418, 300, 900);
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.5, 4000);
    this.yaw = 0.7; this.pitch = 0.9; this.dist = 420;
    this.sun = new THREE.DirectionalLight(0xfff0d8, 1.15);
    this.sun.position.set(200, 400, 160);
    this.scene.add(this.sun);
    this.scene.add(new THREE.AmbientLight(0x8fb0c8, 0.55));
    this.marker = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2, 26, 8),
      new THREE.MeshBasicMaterial({ color: 0xf0a24a }));
    this.marker.visible = false;
    this.scene.add(this.marker);
    this._bind();
    this._loop();
  }

  _bind() {
    const c = this.renderer.domElement;
    c.addEventListener('mousedown', e => { this.drag = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('mouseup', () => { this.drag = null; });
    window.addEventListener('mousemove', e => {
      if (this.drag) {
        this.yaw += (e.clientX - this.drag.x) * 0.008;
        this.pitch = Math.max(0.15, Math.min(1.45, this.pitch - (e.clientY - this.drag.y) * 0.006));
        this.drag = { x: e.clientX, y: e.clientY };
      } else {
        this._hover(e);
      }
    });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.dist = Math.max(90, Math.min(1400, this.dist * (e.deltaY > 0 ? 1.12 : 0.9)));
    }, { passive: false });
    c.addEventListener('click', () => { if (this.onPick) this.onPick(this._hoverPt); });
    this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this._resize()) : null;
    if (this._ro) this._ro.observe(this.host);
    this._resize();
  }

  _resize() {
    const w = this.host.clientWidth || 640, h = this.host.clientHeight || 420;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  setGen(gen, desc) {
    this.gen = gen;
    this.desc = desc;
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    const half = Math.min(1400, (gen.sizeMeters || 3000) * 0.16);
    const N = 190;
    const step = (half * 2) / N;
    const pos = new Float32Array((N + 1) * (N + 1) * 3);
    const col = new Float32Array((N + 1) * (N + 1) * 3);
    const idx = [];
    const c = {};
    const col3 = new THREE.Color();
    let k = 0;
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const x = -half + i * step, z = -half + j * step;
        const s = gen.sample(x, z, c);
        pos[k * 3] = x; pos[k * 3 + 1] = s.h * 0.35; pos[k * 3 + 2] = z;
        const [r, g, b] = gen.groundColor(c);
        const sh = Math.max(0.55, Math.min(1.5, 0.85 + s.h / 700));
        col3.setRGB(Math.min(1, r * sh), Math.min(1, g * sh), Math.min(1, b * sh));
        col[k * 3] = col3.r; col[k * 3 + 1] = col3.g; col[k * 3 + 2] = col3.b;
        k++;
      }
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + 1, cc = a + N + 1, d = cc + 1;
        idx.push(a, cc, b, b, cc, d);
      }
    }
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g2.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g2.setIndex(idx);
    g2.computeVertexNormals();
    this.mesh = new THREE.Mesh(g2, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(this.mesh);

    // water sheet
    if (this.water) { this.scene.remove(this.water); this.water = null; }
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2.2, half * 2.2),
      new THREE.MeshLambertMaterial({ color: 0x2a6a86, transparent: true, opacity: 0.72 }));
    this.water.rotation.x = -Math.PI / 2;
    this.scene.add(this.water);

    this.half = half;
    this.N = N;
    this.step = step;
    this._resize();
    if (this.onGen) this.onGen();
  }

  _hover(e) {
    if (!this.gen || !this.mesh) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const hits = rc.intersectObject(this.mesh);
    if (!hits.length) { this.marker.visible = false; if (this.onHover) this.onHover(null); return; }
    const p = hits[0].point;
    this._hoverPt = { x: p.x, z: p.z };
    this.marker.position.set(p.x, p.y + 12, p.z);
    this.marker.visible = true;
    const c = this.gen.sample(p.x, p.z, {});
    const res = resourceTable(c.weights || [{ id: c.biome, w: 1 }]).sort((a, b) => b[1] - a[1]).map(e => e[0]);
    const wild = creatureTable(c.weights || [{ id: c.biome, w: 1 }], 'wildlife').sort((a, b) => b[1] - a[1]).map(e => e[0]);
    const foes = creatureTable(c.weights || [{ id: c.biome, w: 1 }], 'enemies').sort((a, b) => b[1] - a[1]).map(e => e[0]);
    const info = {
      x: p.x, z: p.z, h: c.h, temp: c.temp, humid: c.humid,
      biomeName: biomeName(c.biome),
      water: this.gen.waterLevel(p.x, p.z, c.h) !== null,
      resources: res, creatures: [...wild, ...foes.map(f => f + ' (hostile)')],
      rare: !!(BIOMES[c.biome] && BIOMES[c.biome].rare),
      nearby: null,
    };
    if (this.onHover) this.onHover(info);
  }

  _loop() {
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      if (!this.host.isConnected) { cancelAnimationFrame(this._raf); return; }
      const cy = Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist;
      const cx = Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist;
      const cz = Math.sin(this.pitch) * this.dist;
      this.camera.position.set(cx, cz + 40, cy);
      this.camera.lookAt(0, 0, 0);
      if (this.water) this.water.position.y = Math.sin(performance.now() * 0.0004) * 0.6;
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    if (this._ro) this._ro.disconnect();
    this.renderer.dispose();
  }
}

export { Preview };
export default Screens;
