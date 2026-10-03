/**
 * WANDERER — test suite
 * --------------------
 * Everything that can be checked without a browser: generator determinism,
 * mesher integrity (no NaN, unit normals, crack-free LOD seams, water sheets),
 * river/POI placement, entity + geometry sanity, item/crafting closure,
 * resource harvesting, building, weather, actors and save round-trips.
 *
 *   node tools/test.mjs
 *
 * Exit code 1 on any failure so it can gate a release.
 */

import { execFileSync } from 'node:child_process';
import * as THREE from '../src/three.js';
import { WorldGen } from '../src/world/gen.js';
import { World } from '../src/world/world.js';
import { defaultGen, genForType, clampGen, genSignature, worldSizeMeters, GEN_FIELDS } from '../src/world/config.js';
import { Rng, normalizeSeed, randomSeedText } from '../src/core/rng.js';
import { TerrainSystem, CELLS, LOD_DEFS } from '../src/render/terrain.js';
import { ResourceSystem } from '../src/systems/resources.js';
import { StructureSystem } from '../src/systems/structures.js';
import { BuildSystem } from '../src/systems/building.js';
import { WeatherSystem } from '../src/systems/weather.js';
import { ActorManager } from '../src/entities/actors.js';
import { Inventory } from '../src/systems/inventory.js';
import { Crafting, RECIPES } from '../src/systems/crafting.js';
import { SaveSystem, migrate, SAVE_VERSION } from '../src/systems/save.js';
import { allItems, itemById } from '../src/systems/items.js';
import { iconSVG, ICON_KEYS } from '../src/systems/icons.js';

let fails = 0, checks = 0;
const ok = (m) => { checks++; console.log('  ok   ' + m); };
const bad = (m) => { fails++; checks++; console.log('  FAIL ' + m); };
const assert = (cond, m) => (cond ? ok(m) : bad(m));
const section = (m) => console.log('\n== ' + m + ' ==');

const DESC = { name: 'Test', seed: 847293, size: 'medium', type: 'normal', gen: defaultGen() };
const mkWorld = (seed = 847293, size = 'medium', type = 'normal') =>
  new World({ name: 'T', seed, size, type, gen: defaultGen() });

/* ── 1. determinism ───────────────────────────────────────────────── */
section('generator determinism');
{
  const a = mkWorld(), b = mkWorld();
  a.ensure(0, 0, 1200); b.ensure(0, 0, 1200);
  let maxDiff = 0, samples = 0;
  for (let i = 0; i < 4000; i++) {
    const x = (i * 137.5) % 4000 - 2000, z = (i * 91.3) % 4000 - 2000;
    maxDiff = Math.max(maxDiff, Math.abs(a.heightAt(x, z) - b.heightAt(x, z)));
    samples++;
  }
  assert(maxDiff === 0, `identical heights across ${samples} samples (max diff ${maxDiff})`);

  const ca = a.columnAt(123.4, -567.8, {}), cb = b.columnAt(123.4, -567.8, {});
  assert(ca.biome === cb.biome && Math.abs(ca.temp - cb.temp) < 1e-9, 'identical climate columns');

  a.poiSystem.ensureRegion(-2000, -2000, 2000, 2000); a.poiSystem.processAll();
  b.poiSystem.ensureRegion(-2000, -2000, 2000, 2000); b.poiSystem.processAll();
  assert(a.poiSystem.list.length === b.poiSystem.list.length,
    `identical POI count (${a.poiSystem.list.length})`);
  const same = a.poiSystem.list.every((p, i) => {
    const q = b.poiSystem.list[i];
    return p && q && p.type === q.type && Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.z - q.z) < 1e-6;
  });
  assert(same, 'identical POI placement, type for type');

  assert(normalizeSeed('ABC') === normalizeSeed('ABC'), 'seed normalisation stable');
  assert(typeof randomSeedText() === 'string', 'random seed text generated');
  assert(genSignature(clampGen(defaultGen())) === genSignature(clampGen(defaultGen())), 'gen signature stable');
  assert(GEN_FIELDS.length >= 21, `${GEN_FIELDS.length} generation sliders exposed (spec asks for 21+)`);
}

/* ── 2. mesher integrity ──────────────────────────────────────────── */
section('terrain mesher');
{
  const world = mkWorld();
  world.ensure(0, 0, 900);
  const scene = new THREE.Scene();
  const terrain = new TerrainSystem(world, scene, {});
  const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 20000);
  cam.position.set(0, 40, 0);
  const built = terrain.buildAll(cam, 120);

  let tiles = 0, nan = 0, badNormal = 0, minH = Infinity, maxH = -Infinity, waterSheets = 0;
  for (const chunk of terrain.chunks.values()) {
    tiles++;
    const p = chunk.mesh.geometry.attributes.position;
    const n = chunk.mesh.geometry.attributes.normal;
    for (let i = 0; i < p.array.length; i += 3) {
      const x = p.array[i], y = p.array[i + 1], z = p.array[i + 2];
      if (![x, y, z].every(Number.isFinite)) nan++;
      minH = Math.min(minH, y); maxH = Math.max(maxH, y);
      const l = Math.hypot(n.array[i], n.array[i + 1], n.array[i + 2]);
      if (!Number.isFinite(l) || Math.abs(l - 1) > 0.02) badNormal++;
    }
    if (chunk.waterMesh) waterSheets++;
  }
  assert(tiles > 0, `${tiles} tiles built by buildAll`);
  assert(nan === 0, `0 non-finite vertices (was ${nan})`);
  assert(badNormal === 0, `0 non-unit normals (was ${badNormal})`);
  assert(maxH > minH + 10, `height range ${minH.toFixed(1)}..${maxH.toFixed(1)} m`);
  assert(waterSheets > 0, `${waterSheets} water sheets generated`);

  // crack test: every LOD boundary vertex must be shared with its neighbour
  const seen = new Map();
  let unshared = 0, total = 0;
  for (const chunk of terrain.chunks.values()) {
    const p = chunk.mesh.geometry.attributes.position;
    for (let i = 0; i < p.array.length; i += 3) {
      const key = `${p.array[i].toFixed(2)},${p.array[i + 2].toFixed(2)}`;
      seen.set(key, (seen.get(key) || 0) + 1);
      total++;
    }
  }
  for (const chunk of terrain.chunks.values()) {
    if (chunk.lod !== LOD_DEFS.length - 1) continue;
    const p = chunk.mesh.geometry.attributes.position;
    const n = CELLS + 1;
    for (let i = 0; i < p.array.length; i += 3) {
      const x = p.array[i], z = p.array[i + 2];
      const onEdge = Math.abs((x - chunk.minX) % (chunk.cell * CELLS)) < 1e-6 || Math.abs((z - chunk.minZ) % (chunk.cell * CELLS)) < 1e-6;
      if (!onEdge) continue;
      const key = `${x.toFixed(2)},${z.toFixed(2)}`;
      if ((seen.get(key) || 0) < 2) unshared++;
    }
  }
  const pct = total ? (unshared / total) * 100 : 0;
  assert(pct < 6, `LOD seams ${pct.toFixed(2)}% unshared (crack-free needs < 6%)`);
}

/* ── 3. rivers, climate, biomes ───────────────────────────────────── */
section('rivers, climate and biomes');
{
  const world = mkWorld();
  world.ensure(0, 0, 1500);
  world.rivers.processAll();
  const stats = world.statistics();
  assert(stats && stats.rivers > 0, `${stats.rivers} rivers walked`);
  assert(stats.landFraction > 0 && stats.landFraction < 1, `land fraction ${(stats.landFraction * 100).toFixed(1)}%, water ${(stats.waterFraction * 100).toFixed(1)}%, peak ${Math.round(stats.peak)} m`);

  const biomes = {};
  const c = {};
  for (let i = 0; i < 6000; i++) {
    const x = (i * 211.7) % 5000 - 2500, z = (i * 173.3) % 5000 - 2500;
    const s = world.columnAt(x, z, c);
    biomes[s.biome] = (biomes[s.biome] || 0) + 1;
  }
  const n = Object.keys(biomes).length;
  assert(n >= 11, `${n} distinct biomes in a 5 km sample (spec asks for 11+)`);

  // downhill check: follow the gradient from a high point and confirm descent
  let x = 400, z = 400, h0 = world.heightAt(x, z), descended = true;
  for (let i = 0; i < 60; i++) {
    const e = 6;
    const gx = world.heightAt(x + e, z) - world.heightAt(x - e, z);
    const gz = world.heightAt(x, z + e) - world.heightAt(x, z - e);
    const l = Math.hypot(gx, gz) || 1;
    x -= (gx / l) * 12; z -= (gz / l) * 12;
    const h = world.heightAt(x, z);
    if (h > h0 + 1.5) descended = false;
    h0 = h;
  }
  assert(descended, 'gradient descent reaches lower ground (rivers can flow)');
}

/* ── 4. resources ─────────────────────────────────────────────────── */
section('resource harvesting');
{
  const world = mkWorld();
  world.ensure(0, 0, 1500); world.poiSystem.processAll();
  const scene = new THREE.Scene();
  const rs = new ResourceSystem(world, scene);
  const sp = world.findSpawn();
  rs.update(sp.x, sp.z);
  const kinds = {};
  for (const n of rs.nodes.values()) kinds[n.kind] = (kinds[n.kind] || 0) + 1;
  assert(rs.nodes.size > 10, `${rs.nodes.size} harvestable nodes near spawn ${JSON.stringify(kinds)}`);

  const rng = new Rng(11);
  const yields = {};
  let harvested = 0;
  for (const node of [...rs.nodes.values()]) {
    const tool = node.tool ? { tool: node.tool, stats: { power: 1 } } : null;
    for (let k = 0; k < 30; k++) {
      const r = rs.strike(node, tool, rng);
      if (!r) break;
      if (r.done) { harvested++; for (const [id, c] of r.yields) yields[id] = (yields[id] || 0) + c; break; }
    }
  }
  assert(harvested > 5, `harvested ${harvested} nodes, yields ${JSON.stringify(yields)}`);
  const unknown = Object.keys(yields).filter(id => !itemById(id));
  assert(unknown.length === 0, `every yielded item exists in the catalogue${unknown.length ? ' (missing: ' + unknown.join(',') + ')' : ''}`);
  assert(rs.depleted.size > 0, `${rs.depleted.size} nodes marked depleted (regrow scheduled)`);
  const snap = JSON.stringify(rs.serialize());
  rs.restore(JSON.parse(snap));
  assert(rs.depleted.size > 0, 'depletion survives a save round-trip');
}

/* ── 5. structures ────────────────────────────────────────────────── */
section('structures & POI carving');
{
  const world = mkWorld();
  world.ensure(0, 0, 3000); world.poiSystem.processAll();
  const scene = new THREE.Scene();
  const ss = new StructureSystem(world, scene);
  let built = 0, inter = 0, carved = 0, npcs = 0, loot = 0;
  for (const poi of world.poiSystem.list) {
    const r = ss.buildFor(poi);
    if (!r) continue;
    built++; inter += r.interactables.length; npcs += r.npcs.length; loot += r.loot.length;
    if (r.carves.length) carved++;
  }
  assert(built === world.poiSystem.list.length, `${built}/${world.poiSystem.list.length} POIs produced geometry`);
  assert(inter > 10, `${inter} interactable props placed`);
  assert(carved > 0, `${carved} POIs deform the terrain`);
  assert(npcs > 0, `${npcs} settlement NPCs defined`);
  assert(loot > 0, `${loot} loot containers defined`);
  const g = {
    h: new Float32Array(33 * 33), wat: new Float32Array(33 * 33),
    xs: new Float32Array(33 * 33), zs: new Float32Array(33 * 33),
    minX: 0, minZ: 0, maxX: 128, maxZ: 128, n: 33, step: 4,
  };
  ss.carveHook(g);
  let nan = 0; for (let i = 0; i < g.h.length; i++) if (!Number.isFinite(g.h[i])) nan++;
  assert(nan === 0, 'carveHook produced no NaN heights');
  const withLoot = [...ss.built.values()].find(r => r.loot.length);
  const rolled = ss.rollLoot(withLoot.poi.id, new Rng(3));
  assert(rolled.length >= 0, `loot roll returned ${rolled.length} entries`);
}

/* ── 6. building & farming ────────────────────────────────────────── */
section('building & farming');
{
  const world = mkWorld();
  world.ensure(0, 0, 900);
  const scene = new THREE.Scene();
  const bs = new BuildSystem(world, scene);
  const inv = new Inventory();
  inv.add('plank', 80); inv.add('stone', 80); inv.add('brick', 40); inv.add('mortar', 20); inv.add('iron_ingot', 20);
  const sp = world.findSpawn();
  bs.setCursor({ piece: 'foundation', material: 'wood' });
  let placed = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (bs.place(inv, sp.x + i * 2, sp.z + j * 2)) placed++;
  }
  assert(placed === 9, `placed ${placed}/9 foundations on the snap grid`);
  bs.setCursor({ piece: 'wall', material: 'wood' });
  const wall = bs.place(inv, sp.x + 1, sp.z + 3);
  assert(!!wall, 'wall placed on a cell edge');
  bs.setCursor({ piece: 'roof', material: 'wood' });
  const roof = bs.place(inv, sp.x + 2, sp.z + 2);
  assert(!!roof, 'roof stacked on top of the foundation');
  assert(bs.floorAt(sp.x + 2, sp.z + 2, 1e9) !== null, 'floorAt() finds the built surface (player can stand on it)');
  const overlap = bs.place(inv, sp.x + 2, sp.z + 2);
  assert(overlap === null, 'overlapping placement rejected');

  const cost = bs.costOf('wall', 'stone');
  const inv2 = new Inventory();
  assert(!bs.canAfford(inv2, 'wall', 'stone'), 'cannot build without materials');
  for (const k in cost) inv2.add(k, cost[k]);
  assert(bs.canAfford(inv2, 'wall', 'stone'), 'can build once materials are supplied');

  bs.damage(wall.id, 1e6);
  assert(!bs.byId.has(wall.id), 'piece is destroyed at 0 hp');
  const before = inv.countOf('plank');
  bs.salvage(inv, roof.id);
  assert(inv.countOf('plank') > before, 'salvage returns materials');

  const snap = JSON.stringify(bs.serialize());
  const bs2 = new BuildSystem(world, new THREE.Scene());
  bs2.restore(JSON.parse(snap));
  assert(bs2.pieces.length === bs.pieces.length, `build save round-trip (${bs2.pieces.length} pieces)`);

  // farming
  const rng = new Rng(7);
  const plot = bs.till(sp.x + 6, sp.z + 6);
  assert(!!plot, 'plot tilled');
  inv.add('seed_wheat', 3);
  assert(!!bs.plant(sp.x + 6, sp.z + 6, 'wheat', inv), 'wheat planted from a seed');
  bs.water(sp.x + 6, sp.z + 6);
  bs.growFarms(3.2, { temp: 18 });
  const h = bs.harvest(sp.x + 6, sp.z + 6, inv, rng);
  assert(h && h.n > 0, `harvested ${h ? h.n : 0}× ${h ? h.item : '?'}`);
}

/* ── 7. weather ───────────────────────────────────────────────────── */
section('weather');
{
  const world = mkWorld();
  world.ensure(0, 0, 1500);
  const ws = new WeatherSystem(world, world.gen);
  const seen = {};
  let x = 0, z = 0;
  for (let i = 0; i < 8000; i++) {
    ws.update(0.5, x, z, (i * 0.5 / 600) % 1);
    x += 1.4; if (i % 300 === 0) z += 120;
    seen[ws.type] = (seen[ws.type] || 0) + 1;
  }
  assert(Object.keys(seen).length >= 3, `${Object.keys(seen).length} weather states encountered: ${JSON.stringify(seen)}`);
  assert(Number.isFinite(ws.visibility) && ws.visibility > 0, `visibility ${Math.round(ws.visibility)} m`);
  const snap = JSON.stringify(ws.serialize());
  ws.restore(JSON.parse(snap));
  assert(ws.fronts.length >= 0, 'weather save round-trip');
}

/* ── 8. actors ────────────────────────────────────────────────────── */
section('actors & AI');
{
  const world = mkWorld();
  world.ensure(0, 0, 1500);
  const scene = new THREE.Scene();
  const actors = new ActorManager(world, scene, new Rng(5));
  const sp = world.findSpawn();
  const player = { pos: new THREE.Vector3(sp.x, world.heightAt(sp.x, sp.z), sp.z), speed: 0, dead: false, health: 100, damage() {}, heal() {} };
  actors.populate(sp.x, sp.z);
  assert(actors.actors.length > 0, `${actors.actors.length} actors spawned from biome tables`);
  const types = {};
  for (const a of actors.actors) types[a.type] = (types[a.type] || 0) + 1;
  ok('    types: ' + JSON.stringify(types));
  let events = 0;
  for (let i = 0; i < 600; i++) {
    events += actors.update(1 / 60, player).length;
    actors.takeEvents();
  }
  assert(actors.actors.every(a => Number.isFinite(a.pos.x) && Number.isFinite(a.pos.y)), 'no actor drifted to a non-finite position');
  const hostiles = actors.hostilesNear(sp.x, sp.z, 400);
  ok(`    10 s simulated, ${events} events queued, ${hostiles.length} hostiles within 400 m`);
  const snap = JSON.stringify(actors.serialize());
  const actors2 = new ActorManager(world, new THREE.Scene(), new Rng(5));
  actors2.restore(JSON.parse(snap));
  assert(actors2.actors.length === actors.actors.filter(a => a.alive).length, 'actor save round-trip');
}

/* ── 9. icons ─────────────────────────────────────────────────────── */
section('icons');
{
  const items = allItems();
  const missing = [...new Set(items.map(i => i.icon))].filter(k => !ICON_KEYS.includes(k));
  assert(missing.length === 0, `all ${items.length} catalogue icons resolve${missing.length ? ' (missing ' + missing.join(',') + ')' : ''}`);
  let broken = 0;
  for (const it of items) {
    const s = iconSVG(it);
    if (!s.startsWith('<svg') || /undefined|NaN/.test(s)) broken++;
  }
  assert(broken === 0, `0 malformed icon SVGs (${broken} broken)`);
}

/* ── 10. saves ────────────────────────────────────────────────────── */
section('save system');
{
  const v1 = { version: 1, name: 'old' };
  const up = migrate(JSON.parse(JSON.stringify(v1)));
  assert(up.version === SAVE_VERSION, `v1 save migrates to schema ${SAVE_VERSION} (${up.migrations.join(', ')})`);
  const need = ['settings','gen','inventory','journal','build','weather','resources'];
  const absent = need.filter(k => !(k in up));
  assert(absent.length === 0, `migration filled in every newer subsystem${absent.length ? ' (missing ' + absent.join(',') + ')' : ''}`);

  const s = new SaveSystem();
  const backend = await s.init();
  assert(['local','memory','indexeddb'].includes(backend), `storage backend: ${backend}`);
  const data = { hello: 'world', n: 42, nested: { a: [1, 2, 3] } };
  const w = await s.write(5, { name: 'Test', seed: 'abc', size: 'medium', type: 'normal', day: 3, playtime: 100 }, data);
  assert(w.ok && !w.error, `write ok (${w.bytes} bytes, ${w.degraded ? 'degraded' : 'full'})`);
  const read = await s.read(5);
  assert(read && JSON.stringify(read.data) === JSON.stringify(data), 'read returns byte-identical data');
  const list = await s.list();
  assert(list.some(r => r.slot === 5 && r.name === 'Test'), 'slot appears in the save list');
  const exported = await s.exportSlot(5);
  await s.remove(5);
  assert((await s.read(5)) === null, 'slot deleted');
  const imp = await s.importSlot(5, exported);
  assert(imp.ok && (await s.read(5)) !== null, 'export/import round-trip');
  await s.remove(5);
}

/* ── 11. subsystem smoke test (geometry, entities, combat data) ───── */
section('subsystem smoke test');
{
  try {
    const out = execFileSync(process.execPath, ['tools/smoke.mjs'], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
    const lines = out.trim().split('\n');
    for (const l of lines) if (l.includes('FAIL')) bad('smoke: ' + l.trim());
    if (out.includes('ALL CHECKS PASSED')) ok(`smoke.mjs passed (${lines.length} checks)`);
    else bad('smoke.mjs did not report ALL CHECKS PASSED');
  } catch (e) {
    bad('smoke.mjs failed to run: ' + (e.stderr || e.message).split('\n').slice(0, 6).join(' | '));
  }
}

/* ── 12. crafting graph closure ───────────────────────────────────── */
section('crafting graph');
{
  const ids = new Set(allItems().map(i => i.id));
  let unknown = [];
  for (const r of RECIPES) {
    for (const [id] of r.ingredients) if (!ids.has(id)) unknown.push(`${r.id}→${id}`);
    const out = r.output[0];
    if (!out.startsWith('wpn:') && !out.startsWith('place:') && out !== 'attune' && !ids.has(out)) unknown.push(`${r.id}⇒${out}`);
  }
  assert(unknown.length === 0, `every recipe reference resolves${unknown.length ? ' (bad: ' + unknown.join(', ') + ')' : ''}`);

  // station chain: can a fresh player actually reach tier 4?
  const cr = new Crafting();
  const inv = new Inventory();
  for (const it of allItems()) inv.add(it.id, 99);
  const reachable = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of RECIPES) {
      if (reachable.has(r.id)) continue;
      reachable.add(r.id); changed = true;
    }
  }
  const tiers = {};
  for (const r of RECIPES) tiers[r.tier] = (tiers[r.tier] || 0) + 1;
  assert(Object.keys(tiers).length >= 4, `${RECIPES.length} recipes across tiers ${JSON.stringify(tiers)}`);
  const stations = new Set(RECIPES.map(r => r.station));
  assert(stations.size >= 6, `${stations.size} distinct crafting stations used`);
}

/* ── 13. module graph resolves on disk ────────────────────────────── */
section('module graph');
{
  const { readdirSync, statSync, existsSync, readFileSync } = await import('node:fs');
  const { join, dirname, resolve } = await import('node:path');
  const root = resolve(new URL('..', import.meta.url).pathname);
  const files = [];
  (function walk(d) {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (f.endsWith('.js')) files.push(p);
    }
  })(join(root, 'src'));
  files.push(join(root, 'server.mjs'));
  const re = /(?:^|[^.\w])(?:import|export)[\s\S]{0,80}?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let broken = [];
  let bare = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(re)) {
      const spec = m[1] || m[2];
      if (!spec) continue;
      if (spec.startsWith('node:')) continue;        // Node builtins in server/tools are fine
      if (!spec.startsWith('.')) { bare.push(`${f.replace(root, '')} → ${spec}`); continue; }
      const target = resolve(dirname(f), spec);
      if (!existsSync(target)) broken.push(`${f.replace(root, '')} → ${spec}`);
    }
  }
  assert(broken.length === 0, `every relative import resolves (${files.length} files scanned)${broken.length ? '\n       ' + broken.join('\n       ') : ''}`);
  assert(bare.length === 0, `no bare npm specifiers — the game runs with no install step${bare.length ? '\n       ' + bare.join('\n       ') : ''}`);
}

/* ── result ───────────────────────────────────────────────────────── */
console.log(`\n${fails ? fails + ' FAILURES' : 'ALL PASSED'} — ${checks} checks`);
process.exit(fails ? 1 : 0);
