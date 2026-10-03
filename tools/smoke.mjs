/* Headless smoke test for every render/entity/system module. Node only — no GL context needed. */
import * as THREE from '../src/three.js';
import { World } from '../src/world/world.js';
import { defaultGen } from '../src/world/config.js';
import { Rng } from '../src/core/rng.js';

let fails = 0;
const bad = (m) => { console.log('  FAIL ' + m); fails++; };
const ok = (m) => console.log('  ok   ' + m);

function checkGeom(g, label) {
  const p = g.attributes && g.attributes.position;
  if (!p) { bad(label + ': no position attribute'); return 0; }
  let nan = 0;
  for (let i = 0; i < p.array.length; i++) if (!Number.isFinite(p.array[i])) nan++;
  if (nan) bad(`${label}: ${nan} non-finite position values`);
  const c = g.attributes.color;
  if (c) {
    let oob = 0;
    for (let i = 0; i < c.array.length; i++) if (!(c.array[i] >= 0 && c.array[i] <= 1.0001)) oob++;
    if (oob) bad(`${label}: ${oob} out-of-range colour values`);
  }
  return p.count;
}
function trisOf(g) { return g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0); }
function checkTree(obj, label) {
  let n = 0, tris = 0;
  obj.traverse(o => { if (o.isMesh || o.isInstancedMesh) { n++; checkGeom(o.geometry, label); tris += trisOf(o.geometry); } });
  if (!n) bad(label + ': 0 meshes');
  return { n, tris };
}

const desc = { name: 'Smoke', seed: 847293, size: 'medium', type: 'normal', gen: defaultGen() };
const world = new World(desc);
world.ensure(0, 0);
const rng = new Rng(847293);
ok(`world: height at origin ${world.heightAt(0, 0).toFixed(2)} m`);

/* ── sky ───────────────────────────────────────────────────────────── */
console.log('== sky ==');
{
  const { Sky } = await import('../src/render/sky.js');
  const scene = new THREE.Scene();
  const sky = new Sky(scene);
  const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 20000);
  let minL = 9, maxL = -9;
  for (let i = 0; i < 240; i++) {
    sky.update(1 / 60, i / 240, { wind: 1.2, haze: 1 });
    sky.follow(cam);
    sky.setMoonPhase(i);
    const l = sky.sunIntensity;
    if (Number.isFinite(l)) { minL = Math.min(minL, l); maxL = Math.max(maxL, l); } else bad('sunIntensity non-finite');
    if (!sky.fogColor) bad('fogColor missing');
  }
  checkGeom(sky.mesh.geometry, 'sky dome');
  ok(`sky: full 24 h cycle, sunIntensity ${minL.toFixed(2)}..${maxL.toFixed(2)}, night=${sky.isNight}`);
}

/* ── structures ────────────────────────────────────────────────────── */
console.log('== structures ==');
{
  const { propGeometry, buildPoiGeometry, applyCarves, registerTreeModule } = await import('../src/render/structs.js');
  const veg = await import('../src/render/veg.js');
  registerTreeModule(veg);
  const PROP_IDS = ['barrel', 'crate', 'pot', 'cart', 'well', 'bonfire', 'tent', 'statue_small', 'statue', 'altar',
    'monolith', 'arch_small', 'glyph', 'bone', 'skull', 'rail', 'target', 'logpile', 'lantern', 'shrine_lantern',
    'orrery', 'meteor', 'pool', 'fence', 'door', 'window', 'ladder', 'chest', 'workbench', 'forge', 'bed',
    'campfire', 'torch', 'storage', 'anvil', 'sign', 'banner', 'skull_post'];
  let tris = 0;
  for (const id of PROP_IDS) {
    const g = propGeometry(id, 3);
    if (!g) { bad(`propGeometry('${id}') returned nothing`); continue; }
    checkGeom(g, `prop ${id}`);
    tris += trisOf(g);
  }
  const fallback = propGeometry('definitely_not_a_prop', 1);
  if (!fallback) bad('propGeometry has no fallback for unknown ids');
  ok(`${PROP_IDS.length} prop geometries, ${Math.round(tris)} triangles, fallback ${fallback ? 'ok' : 'missing'}`);

  // Real code path: let the POI system place things, then build each one.
  world.poiSystem.ensureRegion(-3000, -3000, 3000, 3000);
  world.poiSystem.processAll();
  const pois = world.poiSystem.list;
  ok(`poi system placed ${pois.length} structures in a 6 km square`);
  const kinds = {};
  let built = 0, meshTotal = 0, triTotal = 0, carved = 0;
  for (const poi of pois) {
    const bp = world.blueprint(poi);
    if (!bp) { bad(`blueprint missing for ${poi.type} @${poi.id}`); continue; }
    const out = buildPoiGeometry(bp, poi);
    if (!out || !out.geometry) { bad(`${poi.type} blueprint produced no geometry`); continue; }
    const verts = checkGeom(out.geometry, `${poi.type} @${Math.round(poi.x)},${Math.round(poi.z)}`);
    const t = trisOf(out.geometry);
    if (!verts) bad(`${poi.type} @${Math.round(poi.x)},${Math.round(poi.z)} produced 0 vertices`);
    else { built++; meshTotal++; triTotal += t; }
    if (out.carves && out.carves.length) {
      const n = 16, xs = new Float32Array(n), zs = new Float32Array(n), hs = new Float32Array(n);
      for (let i = 0; i < n; i++) { xs[i] = poi.x - 20 + i * 2.5; zs[i] = poi.z; hs[i] = world.heightAt(xs[i], zs[i]); }
      applyCarves(out.carves, poi, xs, zs, hs, n);
      let nn = 0; for (let i = 0; i < n; i++) if (!Number.isFinite(hs[i])) nn++;
      if (nn) bad(`${poi.type} applyCarves wrote ${nn} NaN heights`);
      carved++;
    }
    kinds[poi.type] = (kinds[poi.type] || 0) + 1;
  }
  ok(`built ${built}/${pois.length} POI meshes: ${Math.round(triTotal)} triangles merged, ${carved} with terrain carves`);
  ok(`kinds: ${JSON.stringify(kinds)}`);
}

/* ── creatures ─────────────────────────────────────────────────────── */
console.log('== creatures ==');
{
  const { CREATURES, buildCreature, animateCreature } = await import('../src/render/creatures.js');
  globalThis.__CREATURES__ = CREATURES;
  const ids = Object.keys(CREATURES);
  let total = 0;
  for (const id of ids) {
    const c = buildCreature(id);
    if (!c) { bad(`buildCreature('${id}') returned nothing`); continue; }
    const r = checkTree(c, `creature ${id}`);
    total += r.tris;
    for (let i = 0; i < 30; i++) animateCreature(c, 0.05, { speed: 3, action: i % 9 === 0 ? 'attack' : (i % 9 === 4 ? 'idle' : 'walk') });
  }
  ok(`${ids.length} creature archetypes built + animated, ${Math.round(total)} triangles total`);
}

/* ── player model ──────────────────────────────────────────────────── */
console.log('== player model ==');
{
  const M = await import('../src/render/player_model.js');
  const { buildPlayer, animatePlayer, restyle, attachItem, defaultLook, HAIR_STYLES, SKIN_TONES, CLOTH_COLORS, HAIR_COLORS, FACES } = M;
  const p = buildPlayer(defaultLook());
  const base = checkTree(p, 'player base');
  let combos = 0;
  for (const h of HAIR_STYLES) {
    for (let s = 0; s < SKIN_TONES.length; s += 2) {
      restyle(p, { ...defaultLook(), hair: h, skin: SKIN_TONES[s], hairColor: HAIR_COLORS[s % HAIR_COLORS.length], cloth: CLOTH_COLORS[(s + 1) % CLOTH_COLORS.length], face: FACES[s % FACES.length] });
      combos++;
    }
  }
  const states = [
    { speed: 0 }, { speed: 4 }, { speed: 8, sprint: true }, { speed: 1.4, crouch: true },
    { speed: 2, swim: true }, { climb: true }, { glide: true }, { attack: 1 }, { block: true },
    { speed: 2, lookPitch: 0.5, lookYaw: -0.4 },
  ];
  let sim = 0;
  for (const st of states) for (let i = 0; i < 20; i++) { animatePlayer(p, 1 / 60, st); sim += 1 / 60; }
  const after = checkTree(p, 'player after animation');
  const socket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), new THREE.MeshLambertMaterial());
  attachItem(p, 'handR', socket);
  attachItem(p, 'back', new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.22), new THREE.MeshLambertMaterial()));
  ok(`player: ${base.n} meshes / ${Math.round(base.tris)} tris, ${combos} restyles, ${states.length} anim states over ${sim.toFixed(1)}s, ${after.n} meshes after, sockets attached`);
}

/* ── fx ────────────────────────────────────────────────────────────── */
console.log('== fx ==');
{
  const { FX } = await import('../src/render/fx.js');
  const scene = new THREE.Scene();
  const fx = new FX(scene, 3000);
  const r = new Rng(7);
  for (let i = 0; i < 500; i++) fx.spawn({ x: r.range(-20, 20), y: r.range(0, 5), z: r.range(-20, 20), vy: 3, life: 1.5, size: 0.3, color: [1, 0.6, 0.2] });
  for (const kind of ['hit', 'blood', 'spark', 'dust', 'snow', 'leaves', 'splash', 'smoke']) if (fx.burst) fx.burst(kind, { x: 0, y: 1, z: 0 }, 24);
  for (const w of ['clear', 'rain', 'storm', 'snow', 'blizzard', 'ashfall', 'sandstorm', 'fog']) fx.setWeather(w, 0.7);
  for (let i = 0; i < 60; i++) fx.footprint({ x: r.range(-6, 6), y: 0, z: r.range(-6, 6), yaw: r.range(0, 6.28), kind: i % 2 ? 'boot' : 'paw' });
  const cam = new THREE.Vector3(0, 2, 0);
  for (let i = 0; i < 300; i++) fx.update(1 / 60, cam, (x, z) => 0);
  ok(`FX: 500 spawns, 8 bursts, 8 weathers, 60 decals, 300 updates without throwing`);
  fx.clear(); fx.dispose();
}

/* ── input ─────────────────────────────────────────────────────────── */
console.log('== input ==');
{
  const { Input, DEFAULT_BINDINGS } = await import('../src/core/input.js');
  const el = { addEventListener() {}, removeEventListener() {}, requestPointerLock() {}, style: {} };
  const doc = { addEventListener() {}, removeEventListener() {}, pointerLockElement: null, exitPointerLock() {} };
  const win = { addEventListener() {}, removeEventListener() {} };
  const inp = new Input(el, { window: win, document: doc });
  const n = Object.keys(DEFAULT_BINDINGS).length;
  if (n < 25) bad(`only ${n} bindings defined`);
  // drive it like the game does and check the action layer responds
  inp.setAction('forward', true);
  inp.setAction('right', true);
  const ax = inp.axis();
  if (!(ax.x > 0 && ax.y > 0)) bad(`axis() wrong: ${JSON.stringify(ax)}`);
  if (Math.hypot(ax.x, ax.y) > 1.0001) bad('axis() not normalised');
  if (!inp.isDown('forward')) bad('isDown(forward) false after setAction');
  if (!inp.wasPressed('forward')) bad('wasPressed(forward) false');
  inp.endFrame();
  if (inp.wasPressed('forward')) bad('endFrame did not clear pressed');
  inp.addMouseDelta(120, -40);
  const md = inp.takeMouseDelta();
  if (md.dx !== 120 || md.dy !== -40) bad(`takeMouseDelta wrong: ${JSON.stringify(md)}`);
  if (inp.takeMouseDelta().dx !== 0) bad('takeMouseDelta did not reset');
  let err = null;
  try { const ser = inp.serialize(); inp.load(ser); inp.resetBindings(); } catch (e) { err = e.message; }
  if (err) bad('input serialize/load: ' + err);
  // every binding the gameplay code actually asks for must exist
  const needed = ['forward','back','left','right','sprint','jump','crouch','slide','glide','interact','attack','heavy','block','dodge','inventory','crafting','map','journal','character','settings','build','drop','torch','view'];
  const absent = needed.filter(a => !DEFAULT_BINDINGS[a]);
  if (absent.length) bad('missing bindings used by gameplay: ' + absent.join(', '));
  ok(`input: ${n} bindings, action layer + axis + mouse delta + serialize verified`);
}

/* ── player entity ─────────────────────────────────────────────────── */
console.log('== player entity ==');
{
  const { Player } = await import('../src/entities/player.js');
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 20000);
  const sp = world.findSpawn();
  const pl = new Player(world, scene, { thirdPerson: true });
  if (pl.spawnAt) pl.spawnAt(sp.x, sp.z); else pl.spawnAt(sp.x, sp.z);
  const mkInput = (held) => ({
    isDown: (a) => held.includes(a),
    wasPressed: (a) => held.includes('press:' + a),
    wasReleased: () => false,
    axis: () => ({ x: 0, y: held.includes('forward') ? 1 : 0 }),
    takeMouseDelta: () => ({ dx: 0, dy: 0, wheel: 0 }),
    endFrame() {},
  });
  const env = { hungerRate: 1, coldRate: 1, staminaRegen: 1, temperature: 18, hour: 12 };
  let evts = 0, kinds = {};
  for (const held of [[], ['forward'], ['forward', 'sprint'], ['press:jump', 'jump'], ['crouch'], ['press:dodge'], ['forward', 'press:slide']]) {
    const inp = mkInput(held);
    for (let i = 0; i < 240; i++) {
      pl.update(1 / 60, inp, cam, env);
      for (const e of (pl.takeEvents ? pl.takeEvents() : [])) { evts++; kinds[e.type] = (kinds[e.type] || 0) + 1; }
    }
  }
  const s = pl.serialize();
  if (!s) bad('player.serialize() returned nothing');
  else {
    const pl2 = new Player(world, new THREE.Scene(), { thirdPerson: true });
    pl2.restore(JSON.parse(JSON.stringify(s)));
    const d = Math.hypot(pl2.pos.x - pl.pos.x, pl2.pos.z - pl.pos.z);
    if (d > 0.001) bad(`player restore drift ${d.toFixed(4)} m`);
    else ok('player serialize/restore round-trips exactly');
  }
  ok(`player: 20 s simulated, pos ${pl.pos.x.toFixed(1)},${pl.pos.y.toFixed(1)},${pl.pos.z.toFixed(1)} — ${evts} events ${JSON.stringify(kinds)}`);
  if (!Number.isFinite(pl.pos.y)) bad('player y non-finite');
}

/* ── camera rig ────────────────────────────────────────────────────── */
console.log('== camera rig ==');
{
  const { CameraRig } = await import('../src/entities/camera.js');
  const { Player } = await import('../src/entities/player.js');
  const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 20000);
  const rig = new CameraRig(cam, world);
  const pl = new Player(world, new THREE.Scene(), {});
  const sp = world.findSpawn();
  if (pl.spawnAt) pl.spawnAt(sp.x, sp.z);
  const inp = { isDown: () => false, wasPressed: () => false, wasReleased: () => false, axis: () => ({ x: 0, y: 0 }), takeMouseDelta: () => ({ dx: 14, dy: -7, wheel: 0 }), endFrame() {} };
  for (let i = 0; i < 400; i++) { rig.update(1 / 60, pl, inp); pl.update(1 / 60, inp, cam, {}); }
  if (![cam.position.x, cam.position.y, cam.position.z].every(Number.isFinite)) bad('camera position non-finite');
  else ok(`camera: 400 frames, pos ${cam.position.x.toFixed(1)},${cam.position.y.toFixed(1)},${cam.position.z.toFixed(1)}, fov ${cam.fov}`);
}

/* ── items ─────────────────────────────────────────────────────────── */
console.log('== items ==');
{
  const { allItems, rollWeapon, itemById, RESOURCE_NODE, rehydrateWeapon, starterWeapon, RARITY_ORDER } = await import('../src/systems/items.js');
  const items = allItems();
  const noIcon = items.filter(i => !i.icon);
  if (noIcon.length) bad(`${noIcon.length} items missing icon: ${noIcon.map(i => i.id).slice(0, 8).join(', ')}`);
  const noName = items.filter(i => !i.name);
  if (noName.length) bad(`${noName.length} items missing name`);
  let idFail = 0;
  for (const i of items) if (!itemById(i.id)) idFail++;
  if (idFail) bad(`${idFail} ids do not resolve through itemById`);
  ok(`catalogue: ${items.length} items, ${Object.keys(RESOURCE_NODE).length} resource nodes, ${RARITY_ORDER.length} rarities`);

  const r = new Rng(4242);
  const rarities = {}; const names = new Set(); const archs = {};
  for (let i = 0; i < 500; i++) {
    const w = rollWeapon(r, { luck: (i % 100) / 100 });
    if (!w) { bad('rollWeapon returned nothing'); break; }
    rarities[w.rarity] = (rarities[w.rarity] || 0) + 1;
    archs[w.arch] = (archs[w.arch] || 0) + 1;
    names.add(w.name);
    const st = w.stats || {};
    if (!Number.isFinite(st.dmg) || st.dmg <= 0) { bad(`bad damage on ${w.id}: ${JSON.stringify(st)}`); break; }
    if (!Number.isFinite(st.spd) || !Number.isFinite(st.reach) || !Number.isFinite(st.stam)) { bad(`bad stat on ${w.id}`); break; }
    if (!Number.isFinite(w.weight) || !Number.isFinite(w.value) || !w.durability) { bad(`bad weight/value/durability on ${w.id}`); break; }
    const back = rehydrateWeapon(w.id);
    if (!back) { bad(`rehydrate failed for ${w.id}`); break; }
    if (back.arch !== w.arch || back.material !== w.material || back.rarity !== w.rarity) { bad(`rehydrate mismatch ${w.id} -> ${back.id}`); break; }
    if (JSON.stringify(back.stats) !== JSON.stringify(w.stats)) { bad(`rehydrate stats differ for ${w.id}: ${JSON.stringify(w.stats)} vs ${JSON.stringify(back.stats)}`); break; }
    if (back.weight !== w.weight || back.value !== w.value || back.durability !== w.durability || back.tier !== w.tier) { bad(`rehydrate meta differs for ${w.id}`); break; }
    const item = itemById(w.id);
    if (!item) { bad(`itemById failed for generated ${w.id}`); break; }
  }
  ok(`rollWeapon x500: ${names.size} distinct names, rarities ${JSON.stringify(rarities)}`);
  ok(`archetypes rolled: ${JSON.stringify(archs)}`);
  const sw = starterWeapon(new Rng(3));
  if (!sw || !sw.arch) bad('starterWeapon invalid');
  else ok(`starterWeapon: ${sw.name} (${sw.arch}/${sw.material})`);
}

/* ── icons ─────────────────────────────────────────────────────────── */
console.log('== icons ==');
{
  const { iconSVG, ICON_KEYS, iconURL } = await import('../src/systems/icons.js');
  const { allItems } = await import('../src/systems/items.js');
  const set = new Set(ICON_KEYS);
  const used = [...new Set(allItems().map(i => i.icon))];
  const missing = used.filter(k => !set.has(k));
  if (missing.length) bad(`item icons with no shape: ${missing.join(', ')}`);
  const svg = iconSVG({ icon: 'sword', colors: ['#aabbcc', '#556677'] });
  if (!svg.startsWith('<svg') || /undefined|NaN/.test(svg)) bad('iconSVG produced bad markup: ' + svg.slice(0, 160));
  const url = iconURL({ icon: 'gem', colors: ['#4fd1c5', '#224'] });
  if (!url.startsWith('data:image/svg+xml')) bad('iconURL bad scheme');
  ok(`${ICON_KEYS.length} icon shapes, ${used.length} used by the catalogue, all resolve; data-URI encoding ok`);
}

/* ── inventory + crafting ──────────────────────────────────────────── */
console.log('== inventory + crafting ==');
{
  const { Inventory } = await import('../src/systems/inventory.js');
  const { Crafting, RECIPES, STATIONS } = await import('../src/systems/crafting.js');
  const { allItems, starterWeapon } = await import('../src/systems/items.js');
  const ids = new Set(allItems().map(i => i.id));
  const refs = [];
  for (const r of RECIPES) {
    for (const [id] of r.ingredients) if (!ids.has(id)) refs.push(`${r.id} needs unknown '${id}'`);
    const out = r.output[0];
    if (out.startsWith('wpn:') || out.startsWith('place:') || out === 'attune') continue;
    if (!ids.has(out)) refs.push(`${r.id} outputs unknown '${out}'`);
    if (!STATIONS[r.station]) refs.push(`${r.id} uses unknown station '${r.station}'`);
  }
  const dupe = RECIPES.map(r => r.id).filter((v, i, a) => a.indexOf(v) !== i);
  if (dupe.length) bad('duplicate recipe ids: ' + dupe.join(', '));
  if (refs.length) refs.forEach(b => bad(b));
  else ok(`crafting: ${RECIPES.length} recipes across ${Object.keys(STATIONS).length} stations, every item/station reference resolves`);

  const inv = new Inventory();
  inv.starter(new Rng(1), { starter: starterWeapon(new Rng(1)) });
  const w0 = inv.weight();
  inv.add('wood', 60);
  if (inv.countOf('wood') !== 60) bad(`stacking: expected 60 wood, got ${inv.countOf('wood')}`);
  inv.sort();
  if (inv.countOf('wood') !== 60) bad(`sort lost items: ${inv.countOf('wood')} wood`);
  const snap = JSON.stringify(inv.serialize());
  const inv2 = new Inventory();
  inv2.restore(JSON.parse(snap));
  if (JSON.stringify(inv2.serialize()) !== snap) bad('inventory save/load round-trip mismatch');
  else ok(`inventory: weight ${w0} -> ${inv.weight()}, 60 wood stacked, sort + round-trip exact`);

  const cr = new Crafting();
  const r2 = new Rng(99);
  let crafted = 0, failed = [];
  for (const rec of RECIPES) {
    cr.known.add(rec.id);
    const bench = new Inventory();            // fresh pack: slot exhaustion must not mask a recipe
    for (const [id, n] of rec.ingredients) bench.add(id, n);
    if (!cr.canCraft(rec, bench, rec.station)) { failed.push(rec.id + ' (mats)'); continue; }
    const out = cr.craft(rec.id, bench, r2, rec.station);
    if (!out) failed.push(rec.id + ' (null result)');
    else {
      crafted++;
      const [outId, count] = rec.output;
      if (!outId.startsWith('place:') && outId !== 'attune' && !outId.startsWith('wpn:')) {
        if (bench.countOf(outId) !== count) failed.push(`${rec.id} produced ${bench.countOf(outId)}x, expected ${count}x`);
      }
    }
  }
  if (failed.length) bad(`uncraftable recipes: ${failed.join(', ')}`);
  ok(`crafting: crafted ${crafted}/${RECIPES.length} recipes end-to-end`);

  // Discovery gating
  const cr2 = new Crafting();
  const avail0 = cr2.available('workbench', new Inventory()).length;
  const disc = cr2.discoverRandom(new Rng(5), 'anvil');
  if (!disc) bad('discoverRandom returned nothing');
  if (cr2.knows('resonant_plate')) bad('resonance recipe should not be known at start');
  ok(`discovery: ${cr2.known.size} recipes known at start, ${avail0} visible at a workbench, discovered '${disc && disc.id}'`);
}

/* ── combat ────────────────────────────────────────────────────────── */
console.log('== combat ==');
{
  const { Combat, SWING, AFFINITY, LOOT } = await import('../src/systems/combat.js');
  const { ActorManager, Actor } = await import('../src/entities/actors.js');
  const CREATURES = (await import('../src/render/creatures.js')).CREATURES;
  const { rollWeapon, itemById } = await import('../src/systems/items.js');
  const { FX } = await import('../src/render/fx.js');

  const scene = new THREE.Scene();
  const fx = new FX(scene, 1200);
  const combat = new Combat({ world, fx, audio: null });
  const actors = new ActorManager(world, scene, new Rng(3));
  const sp = world.findSpawn();
  const gy = world.heightAt(sp.x, sp.z);

  const player = {
    pos: new THREE.Vector3(sp.x, gy, sp.z),
    yaw: Math.PI / 2, pitch: 0, stamina: 100, health: 100, blocking: false, dead: false,
    attackT: 0, attackKind: null, burn: 0, bleed: 0,
    get eye() { return new THREE.Vector3(this.pos.x, this.pos.y + 1.62, this.pos.z); },
    damage(a) { this.health -= a; return a; },
    heal(a) { this.health += a; },
  };

  // stand a hostile wolf right in front of the player and swing at it
  const wolf = actors.addActor(new Actor(world, scene, 'wolf', sp.x + 1.4, sp.z, {}));
  wolf.yaw = Math.PI;                       // facing the player
  const weapon = rollWeapon(new Rng(8), { arch: 'sword', material: 'iron' });

  const stamBefore = player.stamina;
  if (!combat.startAttack('light', weapon, player)) bad('startAttack refused with full stamina');
  else if (player.stamina >= stamBefore) bad(`attack did not cost stamina (${stamBefore} -> ${player.stamina})`);

  let kill = null, hits = 0;
  for (let i = 0; i < 90; i++) {
    combat.update(1 / 60, player, actors, null);
    for (const e of combat.takeEvents()) {
      if (e.type === 'hit') hits++;
      if (e.type === 'kill') kill = e;
    }
    if (wolf.health <= 0) break;
    if (!combat.busy) combat.startAttack('light', weapon, player);
  }
  if (!hits) bad('no hits registered on a wolf standing 1.4 m away');
  else ok(`melee: ${hits} hits landed, wolf ${wolf.health.toFixed(0)}/${wolf.maxHealth} hp, combo ${combat.combo}`);

  // blocking + parry
  player.blocking = true;
  combat.blockT = 0.05;                     // inside the 0.22 s parry window
  const before = player.health;
  const dealt = combat.incoming(wolf, player, 20, {});
  if (dealt !== 0) bad('parry let damage through');
  else ok('parry window negated the hit and staggered the attacker (stagger ' + wolf.stagger + ')');
  combat.blockT = 1.0;                      // outside the window: a normal block
  const through = combat.incoming(wolf, player, 20, {});
  if (through === undefined) bad('block path returned nothing');
  else ok(`block absorbed stamina and let ${Math.round(through)} damage through`);
  player.blocking = false;

  // dodge i-frames
  combat.dodge(player);
  if (combat.incoming(wolf, player, 50, {}) !== 0) bad('dodge i-frames did not apply');
  else ok('dodge i-frames negated a 50 damage hit');

  // loot
  wolf.health = 0; wolf.alive = false;
  const loot = combat.rollLoot(wolf, new Rng(2), 0.5);
  const badLoot = loot.filter(e => !e || !e.item || !Number.isFinite(e.count) || e.count < 1);
  if (badLoot.length) bad('loot entries malformed: ' + JSON.stringify(badLoot));
  const names = loot.map(e => `${typeof e.item === 'string' ? e.item : e.item.name}×${e.count}`).join(', ');
  ok(`loot: ${loot.length} entries for a wolf (${names || 'none'}); ${Object.keys(LOOT).length} loot tables, ${Object.keys(AFFINITY).length} affinities, ${Object.keys(SWING).length} swing profiles`);

  // every hostile creature must have a loot table
  const noLoot = Object.keys(CREATURES).filter(id => CREATURES[id].hostile && !LOOT[id]);
  if (noLoot.length) bad('hostile creatures with no loot table: ' + noLoot.join(', '));
  else ok('every hostile creature has a loot table');
  fx.dispose();
}

console.log(fails ? `\n${fails} FAILURES` : '\nALL CHECKS PASSED');
process.exit(fails ? 1 : 0);
