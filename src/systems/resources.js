/**
 * WANDERER — Harvestable resources
 * --------------------------------
 * Nodes are placed with exactly the same hashing the vegetation renderer
 * uses, so the tree you can chop is the tree you can see. Only the nodes
 * within reach get real objects; everything further away stays a cheap
 * instanced scatter. Depletion is remembered per cell and regrows on a
 * timer measured in in-game days.
 */

import * as THREE from '../three.js';
import { SPECIES, SPECIES_SET, PLANT_BY_BIOME, windMaterial } from '../render/veg.js';
import { RESOURCE_NODE, itemById } from './items.js';
import { hash2 } from '../core/rng.js';

export const NODE_RADIUS = 46;
export const REACH = 3.6;
export const GRID = 6;

/**
 * Which rendered species can actually be harvested. `node` is a key into
 * RESOURCE_NODE (items.js), which owns the tool, the hit count and the yield.
 */
export const HARVESTABLE = {
  pine:           { node: 'tree',            label: 'Chop Pine' },
  pine_snow:      { node: 'tree',            label: 'Chop Pine' },
  oak:            { node: 'tree',            label: 'Chop Oak' },
  birch:          { node: 'tree',            label: 'Chop Birch' },
  palm:           { node: 'tree',            label: 'Chop Palm' },
  deadpine:       { node: 'tree',            label: 'Chop Dead Pine' },
  deadtree:       { node: 'tree',            label: 'Chop Dead Tree' },
  jungle:         { node: 'tree',            label: 'Chop Jungle Tree' },
  mangrove:       { node: 'tree',            label: 'Chop Mangrove' },
  giant_oak:      { node: 'ancient_tree',    label: 'Chop Ancient Oak' },
  frosted_jungle: { node: 'tree',            label: 'Chop Frosted Tree' },
  crystal_tree:   { node: 'crystal_node',    label: 'Mine Crystal Tree' },
  giant_mushroom: { node: 'mushroom_cluster',label: 'Cut Giant Mushroom' },
  cactus:         { node: 'cactus',          label: 'Cut Cactus' },
  bush:           { node: 'bush',            label: 'Forage Bush' },
  mushroom:       { node: 'mushroom_cluster',label: 'Pick Mushrooms' },
  glowcap:        { node: 'mushroom_cluster',label: 'Pick Glowcaps' },
  flower:         { node: 'plant',           label: 'Pick Flowers' },
  reed:           { node: 'plant',           label: 'Cut Reeds' },
  fern:           { node: 'plant',           label: 'Cut Ferns' },
  rock:           { node: 'rock',            label: 'Mine Rock' },
  boulder:        { node: 'rock',            label: 'Mine Boulder' },
  ore_rock:       { node: 'ore_iron',        label: 'Mine Iron' },
  copper_rock:    { node: 'ore_copper',      label: 'Mine Copper' },
  crystal_rock:   { node: 'crystal_node',    label: 'Mine Crystal' },
  crystal_cluster:{ node: 'crystal_node',    label: 'Mine Crystal' },
};

export class ResourceSystem {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'resources';
    scene.add(this.group);
    this.nodes = new Map();          // key -> { key, species, x, y, z, s, ry, mesh, hp, maxHp }
    this.depleted = new Map();       // key -> regrow day
    this.mats = {};
    this.geos = {};
    this.pool = [];
    this.progress = 0;
    this.target = null;
    this.day = 1;
    this._col = {};
    this.listeners = [];
  }

  onChange(fn) { this.listeners.push(fn); }
  _emit(e) { for (const f of this.listeners) f(e); }

  _geo(species) {
    if (!this.geos[species]) this.geos[species] = SPECIES[species].geo();
    return this.geos[species];
  }
  _mat(species) {
    if (!this.mats[species]) {
      const def = SPECIES[species];
      const m = windMaterial(0xffffff, {
        sway: def.sway,
        side: def.double ? THREE.DoubleSide : THREE.FrontSide,
        flat: def.kind === 'rock',
      });
      if (def.emissive) m.emissive = new THREE.Color(def.emissive);
      this.mats[species] = m;
    }
    return this.mats[species];
  }

  keyAt(x, z) { return `${Math.round(x * 3)}:${Math.round(z * 3)}`; }
  isDepleted(key) {
    const d = this.depleted.get(key);
    if (d === undefined) return false;
    if (this.day >= d) { this.depleted.delete(key); return false; }
    return true;
  }

  /** Deterministic node scan around a position. Mirrors VegetationSystem.populate. */
  update(px, pz, radius = NODE_RADIUS) {
    const world = this.world, gen = world.gen;
    const x0 = Math.floor((px - radius) / GRID) * GRID;
    const x1 = Math.ceil((px + radius) / GRID) * GRID;
    const z0 = Math.floor((pz - radius) / GRID) * GRID;
    const z1 = Math.ceil((pz + radius) / GRID) * GRID;
    const seen = new Set();
    const pois = world.poisNear(px, pz, radius + 120);

    for (let z = z0; z < z1; z += GRID) {
      for (let x = x0; x < x1; x += GRID) {
        const h1 = hash2(Math.round(x * 3), Math.round(z * 3), world.seed + 11) / 4294967296;
        const h2 = hash2(Math.round(x * 3), Math.round(z * 3), world.seed + 29) / 4294967296;
        const jx = x + (h1 - 0.5) * GRID * 0.9;
        const jz = z + (h2 - 0.5) * GRID * 0.9;
        if (Math.hypot(jx - px, jz - pz) > radius) continue;
        const c = gen.sample(jx, jz, this._col);
        if (c.h < 0.5) continue;
        if (world.waterAt(jx, jz, c.h) !== null) continue;
        if (this._nearPoi(pois, jx, jz, 10)) continue;

        const gd = gen.grassDensity(c), td = gen.treeDensity(c), rd = gen.rockDensity(c);
        const wantTree = td > 0.02 && h2 < td * 0.5;
        const wantPlant = gd > 0.02 && h1 < gd * 0.85;
        const wantRock = h1 > 0.988 - rd * 0.06;
        let species = null;
        if (wantTree) {
          const dom = c.weights && c.weights[0] ? c.weights[0].id : c.biome;
          const set = SPECIES_SET[dom] || SPECIES_SET[c.biome] || ['oak'];
          species = set[(h1 * set.length) | 0] || set[0];
        } else if (wantRock) {
          species = h2 < 0.22 ? 'boulder' : (c.h > 30 && h2 < 0.42 ? 'ore_rock' : 'rock');
          if (c.biome === 'crystal_forest' || c.biome === 'crystal_cavern') species = h2 < 0.5 ? 'crystal_rock' : 'crystal_cluster';
          else if (c.biome === 'desert' || c.biome === 'canyonlands') species = h2 < 0.5 ? 'copper_rock' : 'rock';
        } else if (wantPlant) {
          const list = PLANT_BY_BIOME[c.biome] || ['grass'];
          species = list[(h2 * list.length) | 0] || list[0];
        }
        if (!species || !SPECIES[species] || !HARVESTABLE[species]) continue;

        const key = this.keyAt(jx, jz);
        seen.add(key);
        if (this.isDepleted(key)) continue;
        if (this.nodes.has(key)) continue;
        this._add(key, species, jx, c.h, jz, 0.7 + h2 * 0.8, h1 * 6.28);
      }
    }

    // retire anything that wandered out of range
    for (const [key, n] of this.nodes) {
      if (seen.has(key)) continue;
      if (Math.hypot(n.x - px, n.z - pz) > radius + 24) this._release(key);
    }
  }

  _add(key, species, x, y, z, s, ry) {
    const def = SPECIES[species];
    let mesh = this.pool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(this._geo(species), this._mat(species));
    } else {
      mesh.geometry = this._geo(species);
      mesh.material = this._mat(species);
      mesh.scale.setScalar(1);
      mesh.rotation.set(0, 0, 0);
    }
    const sc = s * (def.scale ? (def.scale[0] + def.scale[1]) * 0.5 : 1);
    mesh.position.set(x, y - 0.06, z);
    mesh.rotation.y = ry;
    mesh.scale.setScalar(sc);
    mesh.userData.nodeKey = key;
    mesh.visible = true;
    this.group.add(mesh);
    const kind = HARVESTABLE[species].node;
    const info = RESOURCE_NODE[kind] || RESOURCE_NODE.rock;
    const rec = {
      key, species, x, y, z, mesh, info, kind,
      hp: info.hits, maxHp: info.hits,
      tool: info.tool || null,              // null means bare hands work
      label: HARVESTABLE[species].label,
      item: info.item,
    };
    this.nodes.set(key, rec);
    return rec;
  }

  _release(key) {
    const n = this.nodes.get(key);
    if (!n) return;
    this.group.remove(n.mesh);
    n.mesh.visible = false;
    if (this.pool.length < 240) this.pool.push(n.mesh);
    this.nodes.delete(key);
    if (this.target === n) { this.target = null; this.progress = 0; }
  }

  _nearPoi(pois, x, z, r) {
    for (const p of pois) {
      const rr = (p.radius || 20) + r;
      if (Math.abs(p.x - x) < rr && Math.abs(p.z - z) < rr) return true;
    }
    return false;
  }

  /** Closest node in front of the camera, within reach. */
  pick(origin, dir, reach = REACH) {
    let best = null, bd = reach * reach;
    for (const n of this.nodes.values()) {
      const dx = n.x - origin.x, dy = (n.y + 1) - origin.y, dz = n.z - origin.z;
      const d2 = dx * dx + dy * dy * 0.35 + dz * dz;
      if (d2 > bd) continue;
      const d = Math.sqrt(d2);
      const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / Math.max(0.001, d);
      if (dot < 0.55) continue;
      bd = d2; best = n;
    }
    this.target = best;
    if (!best) this.progress = 0;
    return best;
  }

  /**
   * Strike the current target. `tool` is the held item (or null for hands).
   * Returns { done, yields } — yields is null until the node breaks.
   */
  strike(node, tool, rng) {
    if (!node) return null;
    const rightTool = !node.tool || (tool && tool.tool === node.tool);
    const power = rightTool ? ((tool && tool.stats && tool.stats.power) || 1) : 0.3;
    node.hp -= power;
    this.progress = Math.min(1, 1 - node.hp / node.maxHp);
    // visible feedback: the node shudders and sinks as it gives way
    node.shake = 0.22;
    this._emit({ type: 'strike', node, rightTool, power });
    if (node.hp > 0) return { done: false, yields: null, rightTool, progress: this.progress };

    const yields = [];
    const [lo, hi] = node.info.amount || [1, 2];
    const primary = node.info.item && itemById(node.info.item) ? node.info.item : null;
    if (primary) {
      const n = lo + rng.int(0, Math.max(0, hi - lo));
      if (n > 0) yields.push([primary, n]);
    }
    for (const a of (node.info.also || [])) {
      const [id, chance] = a;
      if (!itemById(id)) continue;
      if (rng.float() < chance) yields.push([id, 1]);
    }
    const regrow = node.kind === 'tree' || node.kind === 'ancient_tree' ? 6
      : node.kind.startsWith('ore') || node.kind === 'crystal_node' ? 20 : 3;
    this.depleted.set(node.key, this.day + regrow);
    this._release(node.key);
    this._emit({ type: 'harvested', yields });
    return { done: true, yields, rightTool, progress: 1 };
  }

  /** Per-frame cosmetic update: shake feedback on struck nodes. */
  tick(dt) {
    for (const n of this.nodes.values()) {
      if (!n.shake) continue;
      n.shake -= dt;
      const k = Math.max(0, n.shake) * 0.35;
      n.mesh.rotation.z = Math.sin(this._t * 60) * k;
      n.mesh.position.y = n.y - 0.06 - (1 - n.hp / n.maxHp) * 0.12;
      if (n.shake <= 0) { n.mesh.rotation.z = 0; }
    }
    this._t = (this._t || 0) + dt;
  }

  setDay(d) {
    this.day = d;
    for (const [k, day] of [...this.depleted]) if (d >= day) this.depleted.delete(k);
  }

  serialize() { return { depleted: [...this.depleted.entries()] }; }
  restore(s) { this.depleted = new Map((s && s.depleted) || []); }

  clear() {
    for (const key of [...this.nodes.keys()]) this._release(key);
    this.scene.remove(this.group);
  }
}

export default ResourceSystem;
