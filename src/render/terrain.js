/**
 * WANDERER — Terrain streaming + meshing
 * --------------------------------------
 * Concentric LOD rings of tiles around the viewer. Every ring doubles both
 * the tile size and the cell size, so vertex density stays constant while
 * coverage grows geometrically — you can see a mountain 6 km off for the
 * price of a 2-triangle tile.
 *
 * Cracks between rings are avoided by snapping the boundary vertices of the
 * finer tile onto the coarser tile's lattice before sampling height.
 */

import * as THREE from '../three.js';
import { ENV } from './env.js';
import { createWaterMaterial } from './water.js';

export const CELLS = 32;

/** cell = metres between height samples, radius = ring extent in tile units */
export const LOD_DEFS = [
  { cell: 4, radius: 1 },
  { cell: 8, radius: 2 },
  { cell: 16, radius: 3 },
  { cell: 32, radius: 3 },
  { cell: 64, radius: 3 },
];

const TERRAIN_VERT = /* glsl */`
attribute vec3 color;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vColor = color;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const TERRAIN_FRAG = /* glsl */`
precision highp float;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
uniform vec3 uSunDir, uSunColor, uAmbient, uFogColor, uCamPos;
uniform float uFogNear, uFogFar, uNight;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 alb = vColor;

  float dist = length(uCamPos - vWorld);
  // procedural micro-detail keeps large flat areas from looking painted on;
  // skipped beyond ~260 m where it could not be resolved anyway.
  if (dist < 260.0) {
    float d = vnoise(vWorld.xz * 0.32) * 0.55 + vnoise(vWorld.xz * 1.9) * 0.28;
    float fade = 1.0 - smoothstep(150.0, 260.0, dist);
    alb *= 1.0 + (d - 0.42) * 0.34 * fade;
    // tiny per-pixel grain so snow and sand do not band
    alb += (vnoise(vWorld.xz * 14.0) - 0.5) * 0.022 * fade;
  }

  float diff = max(dot(N, uSunDir), 0.0);
  float wrap = clamp(dot(N, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = alb * (uAmbient + uSunColor * diff * 1.02);
  col += alb * uSunColor * pow(wrap, 4.0) * 0.10;
  // slopes facing away from the sun pick up skylight
  col += alb * vec3(0.10, 0.13, 0.18) * (1.0 - N.y) * (1.0 - uNight * 0.5);

  float f = smoothstep(uFogNear, uFogFar, dist);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, 1.0);
}`;

export class TerrainSystem {
  constructor(world, scene, opts = {}) {
    this.world = world;
    this.scene = scene;
    this.opts = Object.assign({ quality: 1, viewScale: 1, detail: true }, opts);
    this.chunks = new Map();
    this.queue = [];
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);

    this.material = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_VERT,
      fragmentShader: TERRAIN_FRAG,
      uniforms: {
        uSunDir: ENV.uSunDir, uSunColor: ENV.uSunColor, uAmbient: ENV.uAmbient,
        uFogColor: ENV.uFogColor, uCamPos: ENV.uCamPos,
        uFogNear: ENV.uFogNear, uFogFar: ENV.uFogFar, uNight: ENV.uNight,
      },
    });
    this.waterMaterial = createWaterMaterial();
    this.stats = { chunks: 0, tris: 0, built: 0, ms: 0 };
    this._scale = new THREE.Vector3();
  }

  get radii() {
    const s = this.opts.viewScale || 1;
    return LOD_DEFS.map((d, i) => Math.max(1, Math.round(d.radius * (i === 0 ? Math.min(1.6, Math.max(0.7, s)) : s))));
  }

  tileIndex(x, z, lod) {
    const T = LOD_DEFS[lod].cell * CELLS;
    return [Math.floor(x / T), Math.floor(z / T)];
  }

  lodForRing(ring, radii) {
    for (let l = 0; l < LOD_DEFS.length; l++) if (ring <= radii[l]) return l;
    return -1;
  }

  /* ── streaming ───────────────────────────────────────────────────── */

  update(camera, budgetMs = 3.5) {
    const t0 = nowMs();
    const radii = this.radii;
    const cx = camera.position.x, cz = camera.position.z;
    this.setCameraForLod(cx, cz);

    // desired set
    const want = new Set();
    for (let lod = 0; lod < LOD_DEFS.length; lod++) {
      const T = LOD_DEFS[lod].cell * CELLS;
      const [pi, pj] = this.tileIndex(cx, cz, lod);
      const inner = lod === 0 ? 0 : radii[lod - 1] / 2;
      for (let di = -radii[lod]; di <= radii[lod]; di++) {
        for (let dj = -radii[lod]; dj <= radii[lod]; dj++) {
          const ring = Math.max(Math.abs(di), Math.abs(dj));
          if (ring > radii[lod] || ring <= inner - 0.001) continue;
          const i = pi + di, j = pj + dj;
          const key = keyOf(lod, i, j);
          want.add(key);
          if (!this.chunks.has(key) && !this._queued(key)) this.queue.push({ key, lod, i, j, d: ring * T });
        }
      }
    }

    // drop what is no longer wanted
    for (const [key, chunk] of this.chunks) {
      if (!want.has(key)) { this._dispose(chunk); this.chunks.delete(key); }
    }

    // build closest-first inside the frame budget
    if (this.queue.length) {
      this.queue.sort((a, b) => a.d - b.d);
      while (this.queue.length && nowMs() - t0 < budgetMs) {
        const item = this.queue.shift();
        if (!want.has(item.key) || this.chunks.has(item.key)) continue;
        const built = this._build(item.lod, item.i, item.j);
        if (built) this.chunks.set(item.key, built);
      }
    }

    let tris = 0;
    for (const c of this.chunks.values()) tris += c.tris;
    this.stats.chunks = this.chunks.size;
    this.stats.tris = tris;
    this.stats.queued = this.queue.length;
    this.stats.ms = nowMs() - t0;
  }

  _queued(key) {
    for (const q of this.queue) if (q.key === key) return true;
    return false;
  }

  /** Force-build everything currently wanted (used by the loading screen). */
  buildAll(camera, maxTiles = 400) {
    this.setCameraForLod(camera.position.x, camera.position.z);
    let n = 0;
    const radii = this.radii;
    for (let lod = 0; lod < LOD_DEFS.length && n < maxTiles; lod++) {
      const T = LOD_DEFS[lod].cell * CELLS;
      const [pi, pj] = this.tileIndex(camera.position.x, camera.position.z, lod);
      const inner = lod === 0 ? 0 : radii[lod - 1] / 2;
      for (let di = -radii[lod]; di <= radii[lod] && n < maxTiles; di++) {
        for (let dj = -radii[lod]; dj <= radii[lod] && n < maxTiles; dj++) {
          const ring = Math.max(Math.abs(di), Math.abs(dj));
          if (ring > radii[lod] || ring <= inner - 0.001) continue;
          const key = keyOf(lod, pi + di, pj + dj);
          if (this.chunks.has(key)) continue;
          const built = this._build(lod, pi + di, pj + dj);
          if (built) { this.chunks.set(key, built); n++; }
        }
      }
    }
    this.queue.length = 0;
    return n;
  }

  /* ── meshing ─────────────────────────────────────────────────────── */

  _build(lod, ti, tj) {
    const world = this.world;
    const gen = world.gen;
    const def = LOD_DEFS[lod];
    const cell = def.cell;
    const T = cell * CELLS;
    const n = CELLS + 1;
    const x0 = ti * T, z0 = tj * T;
    const radii = this.radii;

    // boundary snapping: find the LOD of each neighbour tile
    const nb = (dx, dz) => {
      const l2 = this._lodOfTile(ti + dx, tj + dz, lod);
      // nothing rendered beyond the outermost ring: match the coarsest level
      return l2 < 0 ? LOD_DEFS[LOD_DEFS.length - 1].cell : LOD_DEFS[l2].cell;
    };
    const snapL = Math.max(cell, nb(-1, 0));
    const snapR = Math.max(cell, nb(1, 0));
    const snapD = Math.max(cell, nb(0, -1));
    const snapU = Math.max(cell, nb(0, 1));

    const count = n * n;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const nrm = new Float32Array(count * 3);
    const hgt = new Float32Array(count);
    const wat = new Float32Array(count).fill(NaN);
    const xs = new Float32Array(count), zs = new Float32Array(count);

    const colObj = {};
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        let x = x0 + i * cell, z = z0 + j * cell;
        if (i === 0) z = Math.round(z / snapL) * snapL;
        else if (i === CELLS) z = Math.round(z / snapR) * snapR;
        if (j === 0) x = Math.round(x / snapD) * snapD;
        else if (j === CELLS) x = Math.round(x / snapU) * snapU;
        const k = j * n + i;
        const h = gen.height(x, z);
        hgt[k] = h; xs[k] = x; zs[k] = z;
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        const w = gen.waterLevel(x, z, h);
        if (w !== null) wat[k] = w;
      }
    }

    // rivers carve channels and leave their water level behind
    const grid = { h: hgt, waterY: wat, minX: x0, minZ: z0, maxX: x0 + T, maxZ: z0 + T, n, step: cell, xs, zs };
    world.rivers.carve(grid);
    // POIs can deform the ground too (craters, cave mouths, sunken ruins)
    if (this.carveHook) this.carveHook(grid);

    // slope from the grid, then biome colour per vertex
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const hl = hgt[j * n + Math.max(0, i - 1)];
        const hr = hgt[j * n + Math.min(CELLS, i + 1)];
        const hd = hgt[Math.max(0, j - 1) * n + i];
        const hu = hgt[Math.min(CELLS, j + 1) * n + i];
        const dx = (hr - hl) / (2 * cell), dz = (hu - hd) / (2 * cell);
        const inv = 1 / Math.sqrt(dx * dx + dz * dz + 1);
        nrm[k * 3] = -dx * inv; nrm[k * 3 + 1] = inv; nrm[k * 3 + 2] = -dz * inv;

        const slope = Math.min(1, Math.sqrt(dx * dx + dz * dz) / 1.5);
        const col3 = gen.sample(xs[k], zs[k], colObj, slope);
        const rgb = this._vertexColor(gen, colObj, slope);
        col[k * 3] = rgb[0]; col[k * 3 + 1] = rgb[1]; col[k * 3 + 2] = rgb[2];
      }
    }

    // indices
    const idx = new Uint32Array(CELLS * CELLS * 6);
    let p = 0;
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx[p++] = a; idx[p++] = c; idx[p++] = b;
        idx[p++] = b; idx[p++] = c; idx[p++] = d;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.group.add(mesh);

    // water sheet
    let waterMesh = null;
    if (lod <= 2) waterMesh = this._buildWater(x0, z0, cell, n, hgt, wat, xs, zs);

    const chunk = {
      key: keyOf(lod, ti, tj), lod, ti, tj, mesh, waterMesh,
      minX: x0, minZ: z0, maxX: x0 + T, maxZ: z0 + T,
      tris: CELLS * CELLS * 2, heights: lod === 0 ? hgt : null, cell, n,
      veg: null, pois: null,
    };
    if (waterMesh) chunk.waterMesh = waterMesh;
    this.stats.built++;
    return chunk;
  }

  _vertexColor(gen, col, slope) {
    let [r, g, b] = gen.groundColor(col);
    // snow cover: blends in above the snowline and on flat ground
    const snow = col.snow * (1 - Math.max(0, slope - 0.32) * 1.8);
    if (snow > 0.02) {
      const s = Math.min(1, snow) * 0.92;
      r = r * (1 - s) + 236 * s;
      g = g * (1 - s) + 242 * s;
      b = b * (1 - s) + 248 * s;
    }
    // wet ground darkens near the water line
    if (col.h > -1 && col.h < 2.2 && col.humid > 0.4) {
      const w = 1 - Math.min(1, (col.h + 1) / 3.2);
      r *= 1 - 0.28 * w; g *= 1 - 0.24 * w; b *= 1 - 0.16 * w;
    }
    // volcanic glow cracks
    if (col.volcanic > 0.55 && col.h > 0) {
      const v = (col.volcanic - 0.55) * 1.4;
      r = Math.min(255, r + 40 * v); g = Math.min(255, g + 12 * v);
    }
    const j = 0.94 + ((Math.sin(col.x * 0.7) * Math.cos(col.z * 0.63) + 1) * 0.5) * 0.12;
    return [
      Math.max(0, Math.min(1, (r / 255) * j)),
      Math.max(0, Math.min(1, (g / 255) * j)),
      Math.max(0, Math.min(1, (b / 255) * j)),
    ];
  }

  _buildWater(x0, z0, cell, n, hgt, wat, xs, zs) {
    const quads = [];
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        const wa = wat[a], wb = wat[b], wc = wat[c], wd = wat[d];
        let hit = 0;
        if (!isNaN(wa)) hit++;
        if (!isNaN(wb)) hit++;
        if (!isNaN(wc)) hit++;
        if (!isNaN(wd)) hit++;
        if (!hit) continue;
        quads.push([a, b, c, d]);
      }
    }
    if (!quads.length) return null;

    const verts = quads.length * 6;
    const pos = new Float32Array(verts * 3);
    const dep = new Float32Array(verts);
    let v = 0;
    const push = (k) => {
      const lvl = isNaN(wat[k]) ? Math.max(hgt[k], 0) + 0.05 : wat[k];
      pos[v * 3] = xs[k]; pos[v * 3 + 1] = lvl; pos[v * 3 + 2] = zs[k];
      dep[v] = Math.max(0, lvl - hgt[k]);
      v++;
    };
    for (const [a, b, c, d] of quads) { push(a); push(c); push(b); push(b); push(c); push(d); }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.waterMaterial);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.renderOrder = 4;
    this.group.add(mesh);
    return mesh;
  }

  /**
   * Which LOD the neighbouring tile is rendered at. The neighbour is probed
   * by *world position* (a cell of our own size just outside the shared
   * edge) because tile indices are meaningless across LODs — each level has
   * its own tile size.
   */
  _lodOfTile(ti, tj, selfLod) {
    const radii = this.radii;
    const cx = this._camX, cz = this._camZ;
    if (cx === undefined) return selfLod;
    const Ts = LOD_DEFS[selfLod].cell * CELLS;
    const wx = (ti + 0.5) * Ts, wz = (tj + 0.5) * Ts;
    for (let l = 0; l < LOD_DEFS.length; l++) {
      const T = LOD_DEFS[l].cell * CELLS;
      const ring = Math.max(
        Math.abs(Math.floor(wx / T) - Math.floor(cx / T)),
        Math.abs(Math.floor(wz / T) - Math.floor(cz / T)),
      );
      const inner = l === 0 ? 0 : radii[l - 1] / 2;
      if (ring <= radii[l] && ring > inner - 0.001) return l;
    }
    return -1;
  }

  setCameraForLod(x, z) { this._camX = x; this._camZ = z; }

  _dispose(chunk) {
    this.group.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    if (chunk.waterMesh) { this.group.remove(chunk.waterMesh); chunk.waterMesh.geometry.dispose(); }
    if (chunk.onDispose) chunk.onDispose(chunk);
  }

  dispose() {
    for (const c of this.chunks.values()) this._dispose(c);
    this.chunks.clear();
    this.queue.length = 0;
  }

  /** Height at a world position from the finest loaded chunk (fast path). */
  heightAt(x, z) { return this.world.gen.height(x, z); }
}

function keyOf(lod, i, j) { return `${lod}:${i}:${j}`; }
function nowMs() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); }

export default TerrainSystem;
