/**
 * WANDERER — Structure streaming
 * ------------------------------
 * Turns POI blueprints into real geometry near the player, feeds their
 * terrain carves back into the mesher, spawns the people who live there, and
 * exposes the things you can interact with (chests, benches, forges, beds).
 */

import * as THREE from '../three.js';
import { buildPoiGeometry, propGeometry, applyCarves, registerTreeModule, MATS } from '../render/structs.js';
import * as veg from '../render/veg.js';

registerTreeModule(veg);

export const STRUCT_RADIUS = 420;

/** Blueprint props that are stations / containers / furniture. */
export const INTERACTABLE = {
  chest: { kind: 'container', label: 'Open Chest' },
  storage: { kind: 'container', label: 'Open Storage' },
  workbench: { kind: 'station', station: 'workbench', label: 'Use Workbench' },
  forge: { kind: 'station', station: 'forge', label: 'Use Forge' },
  anvil: { kind: 'station', station: 'anvil', label: 'Use Anvil' },
  campfire: { kind: 'station', station: 'campfire', label: 'Use Campfire', fire: true },
  bonfire: { kind: 'station', station: 'campfire', label: 'Use Bonfire', fire: true },
  bed: { kind: 'bed', label: 'Sleep Until Morning' },
  altar: { kind: 'resonance', label: 'Touch the Altar' },
  monolith: { kind: 'resonance', label: 'Touch the Standing Stone' },
  glyph: { kind: 'resonance', label: 'Read the Glyph' },
  orrery: { kind: 'resonance', label: 'Turn the Orrery' },
  shrine_lantern: { kind: 'resonance', label: 'Light the Shrine' },
  meteor: { kind: 'resonance', label: 'Examine the Fallen Star' },
  skull_post: { kind: 'lore', label: 'Examine the Post' },
  statue: { kind: 'lore', label: 'Examine the Statue' },
  sign: { kind: 'lore', label: 'Read the Sign' },
  target: { kind: 'lore', label: 'Archery Target' },
};

export class StructureSystem {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'structures';
    scene.add(this.group);
    this.built = new Map();          // poi.id -> { poi, out, mesh, lights, carves, interactables }
    this.materials = {};
    this.interactables = [];         // flat list for picking
    this.looted = new Set();         // containers already opened (saved)
    this.listeners = [];
    this._m4 = new THREE.Matrix4();
  }

  onChange(fn) { this.listeners.push(fn); }
  _emit(e) { for (const f of this.listeners) f(e); }

  mat(name) {
    if (!this.materials[name]) {
      const hex = MATS[name] === undefined ? MATS.stone : MATS[name];
      this.materials[name] = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) });
    }
    return this.materials[name];
  }

  /** Build (or reuse) the mesh for one POI. */
  buildFor(poi) {
    if (this.built.has(poi.id)) return this.built.get(poi.id);
    const bp = this.world.blueprint(poi);
    if (!bp) return null;
    const out = buildPoiGeometry(bp, poi);
    if (!out || !out.geometry) return null;
    const mesh = new THREE.Mesh(out.geometry, this.mat('stone'));
    mesh.position.set(poi.x, poi.y !== undefined ? poi.y : 0, poi.z);
    mesh.userData.poiId = poi.id;
    this.group.add(mesh);

    const lights = [];
    for (const l of (out.lights || []).slice(0, 4)) {
      const pl = new THREE.PointLight(new THREE.Color(l.color === undefined ? 0xffa64a : l.color), l.intensity || 1.1, l.radius || 22, 2);
      pl.position.set(poi.x + (l.x || 0), (poi.y || 0) + (l.y || 2), poi.z + (l.z || 0));
      this.group.add(pl);
      lights.push(pl);
    }

    // interactable props from the blueprint part list
    const inter = [];
    for (const p of (bp.parts || [])) {
      if (p.k !== 'prop' || !p.id) continue;
      const def = INTERACTABLE[p.id];
      if (!def) continue;
      inter.push({
        ...def, poiId: poi.id, poiType: poi.type,
        x: poi.x + (p.x || 0), y: (poi.y || 0) + (p.y || 0), z: poi.z + (p.z || 0),
        id: `${poi.id}:${p.id}:${Math.round(p.x)}:${Math.round(p.z)}`,
      });
    }
    // underground entrances count as interactable too
    if (out.underground) {
      inter.push({ kind: 'descent', label: 'Descend', poiId: poi.id, poiType: poi.type, x: poi.x, y: poi.y || 0, z: poi.z, id: poi.id + ':down', underground: out.underground });
    }

    const rec = { poi, out, mesh, lights, interactables: inter, carves: out.carves || [], npcs: out.npcs || [], loot: out.loot || [], resonant: out.resonant };
    this.built.set(poi.id, rec);
    this.interactables.push(...inter);
    this._emit({ type: 'built', poi, rec });
    return rec;
  }

  update(px, pz, radius = STRUCT_RADIUS) {
    const pois = this.world.poisNear(px, pz, radius);
    const seen = new Set();
    for (const poi of pois) {
      if (this.built.has(poi.id)) { seen.add(poi.id); continue; }
      const rec = this.buildFor(poi);
      if (rec) seen.add(poi.id);
    }
    for (const [id, rec] of this.built) {
      if (seen.has(id)) continue;
      const d = Math.hypot(rec.poi.x - px, rec.poi.z - pz);
      if (d < radius + 200) continue;
      this._release(id);
    }
    return pois;
  }

  _release(id) {
    const rec = this.built.get(id);
    if (!rec) return;
    this.group.remove(rec.mesh);
    rec.mesh.geometry.dispose && rec.mesh.geometry.dispose();
    for (const l of rec.lights) this.group.remove(l);
    this.interactables = this.interactables.filter(i => i.poiId !== id);
    this.built.delete(id);
  }

  /** Terrain hook: deform chunk heights for every carved POI it overlaps. */
  carveHook(grid) {
    const pois = this.world.poisNear((grid.minX + grid.maxX) / 2, (grid.minZ + grid.maxZ) / 2, (grid.maxX - grid.minX) + 260);
    for (const poi of pois) {
      const rec = this.built.get(poi.id) || this.buildFor(poi);
      if (!rec || !rec.carves.length) continue;
      // only bother if the carve actually overlaps this tile
      let hit = false;
      for (const c of rec.carves) {
        if (poi.x + c.r < grid.minX || poi.x - c.r > grid.maxX) continue;
        if (poi.z + c.r < grid.minZ || poi.z - c.r > grid.maxZ) continue;
        hit = true; break;
      }
      if (hit) applyCarves(rec.carves, poi, grid.xs, grid.zs, grid.h, grid.n);
    }
  }

  /** Nearest interactable in front of the camera. */
  pick(origin, dir, reach = 3.4) {
    let best = null, bd = reach * reach;
    for (const it of this.interactables) {
      const dx = it.x - origin.x, dy = (it.y + 1) - origin.y, dz = it.z - origin.z;
      const d2 = dx * dx + dy * dy * 0.5 + dz * dz;
      if (d2 > bd) continue;
      const d = Math.sqrt(d2) || 0.001;
      if ((dx * dir.x + dy * dir.y + dz * dir.z) / d < 0.4) continue;
      bd = d2; best = it;
    }
    return best;
  }

  /** Loot a container the first time it is opened (deterministic per world). */
  rollLoot(id, rng) {
    for (const rec of this.built.values()) {
      if (rec.poi.id !== id) continue;
      const out = [];
      for (const l of rec.loot) {
        const tier = l.tier || 1;
        const table = LOOT_BY_TIER[Math.min(4, tier)];
        const n = 1 + rng.int(0, 2 + tier);
        for (let i = 0; i < n; i++) {
          const entry = rng.weighted(table);
          if (entry) out.push([entry, 1 + rng.int(0, 2)]);
        }
      }
      return out;
    }
    return [];
  }

  serialize() { return { looted: this.looted ? [...this.looted] : [] }; }
  restore(d) { this.looted = new Set((d && d.looted) || []); }

  clear() {
    for (const id of [...this.built.keys()]) this._release(id);
    this.scene.remove(this.group);
  }
}

const LOOT_BY_TIER = [
  [['bread', 6], ['bandage', 6], ['torch', 6], ['coin', 8], ['rope', 4]],
  [['bread', 4], ['bandage', 5], ['torch', 4], ['coin', 10], ['iron_ingot', 3], ['potion_minor', 3], ['arrow', 5]],
  [['coin', 10], ['iron_ingot', 6], ['steel_ingot', 3], ['potion_major', 4], ['scroll', 3], ['lantern', 2], ['crystal', 3]],
  [['coin', 10], ['steel_ingot', 6], ['crystal', 6], ['echo_shard', 4], ['potion_major', 5], ['relic', 2], ['gold_ingot', 4]],
  [['echo_shard', 8], ['crystal', 8], ['relic', 5], ['gold_ingot', 6], ['ancient_wood', 5], ['scroll', 4]],
];

export { propGeometry };
export default StructureSystem;
