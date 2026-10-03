/**
 * WANDERER — Particles and small world details
 * --------------------------------------------
 * One pooled point system drives rain, snow, ash, sparks, blood, dust,
 * fireflies and falling leaves. Footprints are a separate pool of decals so
 * the ground remembers you walked there (spec 47).
 */

import * as THREE from '../three.js';

const VERT = /* glsl */`
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
uniform float uScale;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.001, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
precision mediump float;
varying vec3 vColor;
varying float vAlpha;
uniform float uStreak;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  // rain/ash streak downwards, everything else is a soft dot
  c.y *= mix(1.0, 0.32, uStreak);
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.06, d) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}`;

export class FX {
  constructor(scene, max = 6000) {
    this.scene = scene;
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.streak = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uScale: { value: 420 }, uStreak: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    scene.add(this.points);
    this.geo = geo;

    this.weather = { type: 'clear', intensity: 0 };
    this._weatherTimer = 0;
    this.footprints = this._makeFootprints(scene);
    this._streakMix = 0;
  }

  _makeFootprints(scene) {
    const group = new THREE.Group();
    scene.add(group);
    const pool = [];
    const geo = new THREE.PlaneGeometry(0.28, 0.5);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      m.renderOrder = 3;
      group.add(m);
      pool.push({ mesh: m, t: 0, life: 0 });
    }
    return { group, pool, i: 0 };
  }

  spawn(o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx || 0; this.vel[i * 3 + 1] = o.vy || 0; this.vel[i * 3 + 2] = o.vz || 0;
    const c = o.color === undefined ? 0xffffff : o.color;
    this.col[i * 3] = ((c >> 16) & 255) / 255;
    this.col[i * 3 + 1] = ((c >> 8) & 255) / 255;
    this.col[i * 3 + 2] = (c & 255) / 255;
    this.size[i] = o.size || 0.1;
    this.alpha[i] = o.alpha === undefined ? 1 : o.alpha;
    this.life[i] = o.life || 1;
    this.maxLife[i] = this.life[i];
    this.grav[i] = o.gravity === undefined ? -9 : o.gravity;
    this.drag[i] = o.drag === undefined ? 0.2 : o.drag;
    this.streak[i] = o.streak ? 1 : 0;
  }

  burst(x, y, z, count, o = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * Math.PI * 0.6;
      const sp = (o.speed || 3) * (0.4 + Math.random() * 0.9);
      this.spawn({
        x, y, z,
        vx: Math.cos(a) * Math.cos(e) * sp + (o.vx || 0),
        vy: Math.sin(e) * sp + (o.vy || 1),
        vz: Math.sin(a) * Math.cos(e) * sp + (o.vz || 0),
        life: (o.life || 0.6) * (0.6 + Math.random() * 0.8),
        size: (o.size || 0.12) * (0.6 + Math.random() * 0.8),
        color: o.color === undefined ? 0xffffff : (Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : o.color),
        gravity: o.gravity, drag: o.drag, alpha: o.alpha, streak: o.streak,
      });
    }
  }

  /** Weather particles that follow the camera. */
  setWeather(type, intensity) {
    this.weather.type = type;
    this.weather.intensity = intensity;
    this._streakMix = (type === 'rain' || type === 'storm') ? 1 : 0;
    this.material.uniforms.uStreak.value = this._streakMix;
  }

  _emitWeather(dt, cam) {
    const w = this.weather;
    if (!w.type || w.type === 'clear' || w.intensity <= 0) return;
    this._weatherTimer -= dt;
    if (this._weatherTimer > 0) return;
    const rate = { rain: 0.012, storm: 0.008, snow: 0.03, blizzard: 0.018, ashfall: 0.05, sandstorm: 0.02, fog: 0.12 }[w.type] || 0.05;
    this._weatherTimer = rate / Math.max(0.15, w.intensity);
    const R = w.type === 'fog' ? 34 : 26;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * R;
    const x = cam.x + Math.cos(a) * r;
    const z = cam.z + Math.sin(a) * r;
    const y = cam.y + (w.type === 'fog' ? (Math.random() - 0.5) * 8 : 16 + Math.random() * 10);
    switch (w.type) {
      case 'rain':
      case 'storm':
        this.spawn({ x, y, z, vx: -2.2, vy: -26 - Math.random() * 8, vz: -1.1, life: 1.6, size: 0.5, color: 0xbcd4e4, gravity: -6, drag: 0, alpha: 0.5, streak: 1 });
        break;
      case 'snow':
      case 'blizzard':
        this.spawn({ x, y, z, vx: (w.type === 'blizzard' ? -7 : -0.8) + Math.random(), vy: -1.6 - Math.random(), vz: Math.random() * 0.8, life: 9, size: 0.34, color: 0xffffff, gravity: -0.1, drag: 0.4, alpha: 0.9 });
        break;
      case 'ashfall':
        this.spawn({ x, y, z, vx: Math.random() - 0.5, vy: -1.1 - Math.random(), vz: Math.random() - 0.5, life: 11, size: 0.3, color: 0x6a6058, gravity: -0.05, drag: 0.5, alpha: 0.8 });
        break;
      case 'sandstorm':
        this.spawn({ x, y: cam.y + Math.random() * 6, z, vx: -13 - Math.random() * 6, vy: Math.random() * 1.5, vz: Math.random() * 3 - 1.5, life: 3, size: 0.5, color: 0xd8c090, gravity: -0.4, drag: 0.2, alpha: 0.55 });
        break;
      case 'fog':
        this.spawn({ x, y, z, vx: 0.3, vy: 0.05, vz: 0.2, life: 12, size: 9, color: 0xc8d4d8, gravity: 0, drag: 0.6, alpha: 0.045 });
        break;
      default: break;
    }
  }

  /** A temporary mark on the ground where the player stepped. */
  footprint(x, y, z, yaw, kind) {
    const fp = this.footprints;
    const e = fp.pool[fp.i % fp.pool.length];
    fp.i++;
    e.mesh.position.set(x, y + 0.035, z);
    e.mesh.rotation.y = yaw;
    e.mesh.visible = true;
    e.life = kind === 'snow' ? 26 : kind === 'mud' ? 20 : 12;
    e.t = e.life;
    const c = kind === 'snow' ? 0x8fa8c0 : kind === 'mud' ? 0x2a2018 : 0x3a3028;
    e.mesh.material.color.setHex(c);
    e.mesh.material.opacity = kind === 'sand' ? 0.18 : 0.34;
    e.baseOpacity = e.mesh.material.opacity;
  }

  update(dt, cam, groundFn) {
    this._emitWeather(dt, cam);
    const pos = this.pos, vel = this.vel;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      vel[i * 3] *= d; vel[i * 3 + 1] = vel[i * 3 + 1] * d + this.grav[i] * dt; vel[i * 3 + 2] *= d;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      // ground collision for falling things
      if (this.grav[i] < -1 && groundFn) {
        const g = groundFn(pos[i * 3], pos[i * 3 + 2]);
        if (pos[i * 3 + 1] < g + 0.05) { this.life[i] = 0; continue; }
      }
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, t * 2.2) * (this.streak[i] ? 0.55 : 1);
      // compact: move the last live particle into this slot
      if (w !== i) this._move(w, i);
      w++;
    }
    this.n = w;
    this.geo.setDrawRange(0, this.n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;

    for (const e of this.footprints.pool) {
      if (e.t > 0) {
        e.t -= dt;
        e.mesh.material.opacity = e.baseOpacity * Math.min(1, e.t / (e.life * 0.35));
        if (e.t <= 0) e.mesh.visible = false;
      }
    }
  }

  _move(dst, src) {
    this.pos[dst * 3] = this.pos[src * 3];
    this.pos[dst * 3 + 1] = this.pos[src * 3 + 1];
    this.pos[dst * 3 + 2] = this.pos[src * 3 + 2];
    this.vel[dst * 3] = this.vel[src * 3];
    this.vel[dst * 3 + 1] = this.vel[src * 3 + 1];
    this.vel[dst * 3 + 2] = this.vel[src * 3 + 2];
    this.col[dst * 3] = this.col[src * 3];
    this.col[dst * 3 + 1] = this.col[src * 3 + 1];
    this.col[dst * 3 + 2] = this.col[src * 3 + 2];
    this.size[dst] = this.size[src];
    this.alpha[dst] = this.alpha[src];
    this.life[dst] = this.life[src];
    this.maxLife[dst] = this.maxLife[src];
    this.grav[dst] = this.grav[src];
    this.drag[dst] = this.drag[src];
    this.streak[dst] = this.streak[src];
  }

  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
  dispose() {
    this.scene.remove(this.points);
    this.geo.dispose();
    this.material.dispose();
  }
}

export default FX;
