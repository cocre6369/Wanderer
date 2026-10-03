/**
 * WANDERER — Game
 * ---------------
 * The orchestrator. Owns the renderer, the world, every subsystem and the
 * frame loop. Nothing else in the codebase knows about three.js scene
 * graph order or the order systems must tick in — that all lives here.
 *
 * Frame order (deliberate):
 *   input -> time/weather -> terrain stream -> POI/veg/resource stream
 *   -> actors -> player -> combat -> camera -> fx -> audio -> ui -> autosave
 */

import * as THREE from './three.js';
import { World } from './world/world.js';
import { clampGen, genForType, defaultGen, worldSizeMeters, dayLengthMinutes, VERSION } from './world/config.js';
import { Rng, randomSeedText } from './core/rng.js';
import { Input } from './core/input.js';
import { Sky } from './render/sky.js';
import { Ocean, createWaterMaterial } from './render/water.js';
import { TerrainSystem } from './render/terrain.js';
import { VegetationSystem } from './render/veg.js';
import { ENV, updateEnv } from './render/env.js';
import { FX } from './render/fx.js';
import { buildPlayer, animatePlayer, restyle, attachItem, defaultLook } from './render/player_model.js';
import { Player } from './entities/player.js';
import { CameraRig } from './entities/camera.js';
import { ActorManager } from './entities/actors.js';
import { Inventory } from './systems/inventory.js';
import { Crafting } from './systems/crafting.js';
import { Combat } from './systems/combat.js';
import { WeatherSystem, WEATHERS } from './systems/weather.js';
import { BuildSystem, CROPS } from './systems/building.js';
import { ResourceSystem } from './systems/resources.js';
import { StructureSystem } from './systems/structures.js';
import { DiscoverySystem } from './systems/discovery.js';
import { Dialogue, QuestBoard, Market, compassWord } from './systems/dialog.js';
import { AudioEngine } from './systems/audio.js';
import { SaveSystem, Autosave, AUTOSAVE_SLOT } from './systems/save.js';
import { itemById, rollWeapon, starterWeapon, allItems } from './systems/items.js';

export const TICKS_PER_SECOND = 60;

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui;
    this.running = false;
    this.paused = false;
    this.lastT = 0;
    this.frame = 0;
    this.fps = 60;
    this.playtime = 0;
    this.stats = { tris: 0, calls: 0, chunks: 0 };
    this.settings = Object.assign({
      renderDistance: 1.0, vegDensity: 1.0, shadows: false, fov: 75,
      thirdPerson: true, invertY: false, sensitivity: 1.0,
      music: 0.45, sfx: 0.85, ambient: 0.6, master: 0.8,
      showFps: true, subtitles: true, hints: true, autosave: true,
      difficulty: 'normal',
    }, this._loadSettings());
    this._pending = [];
  }

  _loadSettings() {
    try { return JSON.parse(localStorage.getItem('wanderer:settings') || '{}'); } catch (e) { return {}; }
  }
  saveSettings() {
    try { localStorage.setItem('wanderer:settings', JSON.stringify(this.settings)); } catch (e) { /* private mode */ }
  }

  /* ── boot ────────────────────────────────────────────────────────── */

  async init() {
    const canvas = this.canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, typeof devicePixelRatio === 'undefined' ? 1 : devicePixelRatio));
    this.renderer.setSize(canvas.clientWidth || 1280, canvas.clientHeight || 720, false);
    THREE.ColorManagement.enabled = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x9fb8c8, 120, 1400);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.08, 12000);

    this.input = new Input(canvas);
    this.input.sensitivity = this.settings.sensitivity;
    this.input.invertY = this.settings.invertY;

    this.audio = new AudioEngine();
    this.save = new SaveSystem();
    await this.save.init();
    this.autosave = new Autosave(this.save, 90);
    this.autosave.enabled = this.settings.autosave;

    this._onResize = () => this.resize();
    if (typeof window !== 'undefined') window.addEventListener('resize', this._onResize);
    this.resize();
    return this;
  }

  resize() {
    const c = this.canvas;
    const w = c.clientWidth || window.innerWidth;
    const h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /* ── world creation ──────────────────────────────────────────────── */

  /**
   * Staged generation. `onProgress(0..1, label)` drives the loading screen so
   * the player sees what the world generator is actually doing.
   */
  async createWorld(desc, onProgress = () => {}) {
    this.desc = {
      name: desc.name || 'Unnamed World',
      seed: desc.seed,
      size: desc.size || 'medium',
      type: desc.type || 'normal',
      gen: clampGen(Object.assign(defaultGen(), genForType(desc.type || 'normal'), desc.gen || {})),
    };
    const step = async (p, label, fn) => {
      onProgress(p, label);
      await new Promise(r => setTimeout(r, 0));
      return fn();
    };

    await step(0.05, 'Reading the seed', () => {
      this.world = new World(this.desc);
      this.rng = new Rng(this.world.seed);
    });

    await step(0.15, 'Laying out climate', () => {
      this.world.ensure(0, 0, 1200);
      this.world.tickGeneration(60);
    });

    await step(0.3, 'Walking the rivers', () => {
      this.world.rivers.processAll();
    });

    await step(0.45, 'Placing ruins and settlements', () => {
      this.world.poiSystem.processAll();
    });

    const spawn = await step(0.55, 'Choosing where you wake up', () => this.world.findSpawn());
    this.spawnPoint = spawn;

    await step(0.62, 'Building the renderer', () => {
      this._buildRenderer();
    });

    await step(0.72, 'Raising the terrain', () => {
      this.terrain.buildAll(this.camera, this.settings.renderDistance > 0.7 ? 160 : 90);
    });

    await step(0.86, 'Planting the country', () => {
      this.veg.update(this.camera.position);
      this.veg.rebuild(this.camera.position);
    });

    await step(0.93, 'Waking the world', () => {
      this._spawnPlayer(spawn);
      this.structures.update(spawn.x, spawn.z, 260);
      this.actors.populate(spawn.x, spawn.z);
      this.resources.update(spawn.x, spawn.z);
    });

    await step(1.0, 'Ready', () => {
      this.world.timeOfDay = 0.28;
      this.world.day = 1;
      this._discoverAround(spawn);
    });

    this.startedAt = Date.now();
    return this;
  }

  _buildRenderer() {
    // sky + lights
    this.sky = new Sky(this.scene);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.0);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0xbfd8e8, 0x4a4436, 0.35);
    this.scene.add(this.hemi);

    // ground, water
    this.terrain = new TerrainSystem(this.world, this.scene, { viewScale: this.settings.renderDistance });
    this.ocean = new Ocean(this.scene, createWaterMaterial(), Math.max(4000, worldSizeMeters(this.desc.size) || 8000));

    // vegetation must know about terrain chunks to scatter into them
    this.veg = new VegetationSystem(this.world, this.scene, { density: this.settings.vegDensity });
    this.veg.attachTerrain(this.terrain);

    // systems
    this.structures = new StructureSystem(this.world, this.scene);
    this.terrain.carveHook = (grid) => this.structures.carveHook(grid);
    this.resources = new ResourceSystem(this.world, this.scene);
    this.actors = new ActorManager(this.world, this.scene, this.rng);
    this.build = new BuildSystem(this.world, this.scene);
    this.weather = new WeatherSystem(this.world, this.world.gen);
    this.fx = new FX(this.scene, 9000);

    // gameplay
    this.inventory = new Inventory();
    this.crafting = new Crafting();
    this.combat = new Combat({ world: this.world, fx: this.fx, audio: this.audio });
    this.discovery = new DiscoverySystem(this.world);
    this.dialogue = new Dialogue(this.world);
    this.quests = new QuestBoard(this.world, this.rng);
    this.market = new Market(this.world, this.rng);
    this.cameraRig = new CameraRig(this.camera, this.world);

    if (this.ui) this.ui.attach(this);
    this._wireUI();
  }

  _spawnPlayer(spawn) {
    this.player = new Player(this.world, this.scene, { thirdPerson: this.settings.thirdPerson });
    this.player.spawnAt(spawn.x, spawn.z, 0.4);
    this.player.yaw = Math.atan2(-(spawn.x), -(spawn.z));
    this.cameraRig.target = this.player;
    this.camera.position.set(this.player.pos.x, this.player.pos.y + 2, this.player.pos.z + 5);
    this.inventory.starter(this.rng, { starter: starterWeapon(this.rng) });
    this.player.carryWeight = this.inventory.weight();
    this.player.maxCarry = this.inventory.capacity;
    this._attachHeld();
  }

  _attachHeld() {
    const held = this.inventory.held();
    if (this._heldMesh) { this.player.model.remove(this._heldMesh); this._heldMesh = null; }
    if (held && held.item.cat === 'weapon') {
      const { weaponModel } = globalThis.__wanderer_weapons || {};
      if (weaponModel) {
        this._heldMesh = weaponModel(held.item);
        attachItem(this.player.model, 'handR', this._heldMesh);
      }
    }
  }

  /* ── main loop ───────────────────────────────────────────────────── */

  start() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.lastT) / 1000);
      this.lastT = t;
      this.fps = this.fps * 0.92 + (1 / Math.max(0.0005, dt)) * 0.08;
      try { this.tick(dt); } catch (e) { this._onError(e); }
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }

  _onError(e) {
    console.error('[wanderer]', e);
    if (this.ui && this.ui.toast) this.ui.toast('Something went wrong: ' + e.message, 'error');
  }

  tick(dt) {
    this.frame++;
    if (this.paused) { this.input.endFrame(); return; }
    this.playtime += dt;

    /* time + weather */
    const dayLen = dayLengthMinutes(this.world.gen.desc.gen) * 60;
    this.world.timeOfDay = (this.world.timeOfDay + dt / dayLen) % 1;
    if (this.world.timeOfDay < dt / dayLen) this.world.day++;
    const hour = this.world.timeOfDay * 24;
    this.weather.update(dt, this.player.pos.x, this.player.pos.z, this.world.timeOfDay);
    this.world.weather = { type: this.weather.type, name: this.weather.def.name, intensity: this.weather.intensity };
    this.resources.setDay(this.world.day);

    /* sky, fog, lights */
    this.sky.update(dt, this.world.timeOfDay, { wind: this.weather.wind, haze: 1 - this.weather.intensity * 0.4 });
    this.sky.follow(this.camera);
    this.sky.setMoonPhase(this.world.day);
    updateEnv(this.sky, this.camera, {
      fogNear: Math.min(180, this.weather.visibility * 0.18),
      fogFar: Math.max(320, this.weather.visibility),
      wind: this.weather.wind,
    });
    this.scene.fog.color.copy(this.sky.fogColor);
    this.scene.fog.near = Math.min(180, this.weather.visibility * 0.18);
    this.scene.fog.far = Math.max(320, this.weather.visibility);
    this.renderer.setClearColor(this.sky.fogColor, 1);
    this.sun.position.copy(this.sky.sunDir).multiplyScalar(400).add(this.camera.position);
    this.sun.target.position.copy(this.camera.position);
    this.sun.intensity = this.sky.sunIntensity;
    this.sun.color.copy(this.sky.uniforms.uSunColor.value);
    this.ambient.color.copy(this.sky.ambient);
    this.ambient.intensity = this.sky.isNight ? 0.45 : 0.7;
    if (this.weather.lightning > 0.5) this.ambient.intensity += 1.6 * this.weather.lightning;

    /* streaming */
    this.world.ensure(this.player.pos.x, this.player.pos.z, 900);
    this.world.tickGeneration(3);
    this.terrain.update(this.camera, 3.5);
    this.ocean.update(this.camera.position, this.player.pos.y < 40);
    if (this.frame % 6 === 0) {
      this.veg.update(this.camera.position);
      this.veg.rebuild(this.camera.position);
    }
    if (this.frame % 12 === 0) this.structures.update(this.player.pos.x, this.player.pos.z);
    this.resources.update(this.player.pos.x, this.player.pos.z);
    this.resources.tick(dt);

    /* actors */
    this.actors.hour = hour;
    this.actors.night = this.sky.isNight;
    this.actors.update(dt, this.player);

    /* player + combat */
    this._handleHotbar();
    const env = {
      hungerRate: this._difficulty().hunger, coldRate: this._difficulty().cold,
      staminaRegen: this._difficulty().stamina, temperature: this._tempAt(), hour,
    };
    this.player.update(dt, this.input, this.camera, env);
    this._consumePlayerEvents(dt);
    this._handleAttacks(dt);
    this.combat.update(dt, this.player, this.actors, this.inventory);
    // drain both queues: leaving them full would replay every event next frame
    this._handleActorAttacks(this.actors.takeEvents());

    /* interaction */
    this._handleInteraction(dt);

    /* camera + fx + audio */
    this.cameraRig.update(dt, this.player, this.input);
    this.camera.fov = this.settings.fov + (this.player.sprinting ? 4 : 0) + (this.player.sliding ? 6 : 0);
    this.camera.updateProjectionMatrix();
    this.fx.setWeather(this.weather.fxKind, this.weather.intensity);
    this.fx.update(dt, this.camera.position, (x, z) => this.world.heightAt(x, z));

    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.audio.setListener(this.camera.position, fwd, new THREE.Vector3(0, 1, 0));
    this._updateAudio(dt, hour);

    /* discovery, quests, ui */
    this._discoverAround(this.player.pos);
    const hint = this.discovery.update(dt, this._hintState());
    if (hint && this.settings.hints && this.ui) this.ui.hint(hint.text);
    this._handleCombatEvents(this.combat.takeEvents());
    this.build.growFarms(dt / dayLen, this.world.columnAt(this.player.pos.x, this.player.pos.z, {}));
    if (this.ui) this.ui.update(dt, this);

    /* autosave */
    if (this.settings.autosave) this.autosave.tick(dt, () => this.snapshot());

    this.input.endFrame();
    this.stats.tris = this.renderer.info.render.triangles;
    this.stats.calls = this.renderer.info.render.calls;
    this.renderer.render(this.scene, this.camera);
  }

  _difficulty() {
    const t = this.settings.difficulty;
    return t === 'peaceful' ? { hunger: 0.4, cold: 0.4, stamina: 1.4, damage: 0.4 }
      : t === 'harsh' ? { hunger: 1.6, cold: 1.7, stamina: 0.85, damage: 1.5 }
      : t === 'extreme' ? { hunger: 2.2, cold: 2.4, stamina: 0.7, damage: 2.2 }
      : { hunger: 1, cold: 1, stamina: 1, damage: 1 };
  }

  _tempAt() {
    const col = this.world.columnAt(this.player.pos.x, this.player.pos.z, {});
    return col.temp + this.weather.temperatureMod - (this.sky.isNight ? 5 : 0);
  }

  /* ── player events: footsteps, sound, footprints ─────────────────── */

  _consumePlayerEvents() {
    for (const e of this.player.takeEvents()) {
      const d = e.data || {};
      switch (e.type) {
        case 'footstep': {
          const kind = this._surfaceName(d.kind);
          this.audio.footstep(kind, this.settings.thirdPerson ? d : null, 0.9);
          if (this.fx) this.fx.footprint(d);
          this.actors.setNoise(d.loud || 0.3);
          break;
        }
        case 'jump': this.audio.tone({ freq: 220, to: 320, dur: 0.1, gain: 0.06 }); break;
        case 'land': this.audio.footstep(this._surfaceName(d.kind), null, 1.3); this.cameraRig.addShake(0.18); break;
        case 'dodge': this.combat.dodge(this.player); this.audio.dodge(); break;
        case 'mantle': this.audio.footstep('stone', null, 0.8); break;
        case 'glide': break;
        case 'hurt': this.cameraRig.addShake(0.35); break;
        case 'death': this.audio.death(); if (this.ui) this.ui.onDeath(); break;
      }
    }
  }

  _surfaceName(kind) {
    const p = this.player;
    if (p.swimming) return 'water';
    const s = p.surface || {};
    if (kind) return kind;
    if (s.ice > 0.5) return 'ice';
    if (s.mud > 0.5) return 'mud';
    if (s.snow > 0.5) return 'snow';
    const b = s.biome || this.world.biomeAt(p.pos.x, p.pos.z);
    if (b === 'desert' || b === 'dunes' || b === 'flooded_desert') return 'sand';
    if (b === 'rock' || b === 'mountain' || b === 'alpine' || b === 'canyonlands' || b === 'volcanic') return 'stone';
    return 'grass';
  }

  /* ── attacks ─────────────────────────────────────────────────────── */

  _handleAttacks(dt) {
    const held = this.inventory.held();
    const weapon = held && held.item.cat === 'weapon' ? held.item : null;
    if (this.input.isDown('block')) this.combat.startBlock(this.player);
    if (this.input.wasPressed('attack')) this.combat.startAttack('light', weapon, this.player);
    if (this.input.wasPressed('heavy')) this.combat.startAttack('heavy', weapon, this.player);
    if (this.combat.hitStop > 0) return;
    // tools also harvest when you swing at a node
    if (this._nodeTarget && this.input.isDown('attack')) this._strikeNode(weapon);
  }

  _handleActorAttacks(events) {
    for (const e of events) {
      if (e.type !== 'actor_attack') continue;
      if (e.target !== this.player) continue;
      const dist = e.actor.distTo(this.player.pos.x, this.player.pos.z);
      if (!e.ranged && dist > 3.4) continue;
      const dmg = e.damage * this._difficulty().damage;
      this.combat.incoming(e.actor, this.player, dmg, e);
      this.cameraRig.addShake(0.2);
    }
  }

  _handleCombatEvents(events) {
    for (const e of events) {
      if (e.type === 'kill') {
        const loot = this.combat.rollLoot(e.actor, this.rng, this.discovery.resonance * 0.01);
        for (const [item, n] of loot) this.inventory.add(item, n);
        this.discovery.record('creature', e.actor.type, { name: e.actor.type });
        this.quests.notify({ type: 'kill', creature: e.actor.type });
        if (this.ui) this.ui.toast(`Killed ${e.actor.type}`, 'combat');
        this.audio.tone({ freq: 180, to: 90, dur: 0.4, gain: 0.14, type: 'triangle' });
        this.actors.setNoise(0.9);
      } else if (e.type === 'hit' && this.ui) {
        this.ui.damageNumber(e.amount, e.crit);
      } else if (e.type === 'parry' && this.ui) {
        this.ui.toast('Parried!', 'good');
      }
    }
  }

  /* ── interaction ─────────────────────────────────────────────────── */

  _handleInteraction(dt) {
    const origin = this.camera.position;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);

    const node = this.resources.pick(origin, dir);
    this._nodeTarget = node;
    const inter = this.structures.pick(origin, dir);
    const npc = this.actors.nearest(this.player.pos.x, this.player.pos.z, 4, a => a.profile);

    let prompt = null;
    if (npc) prompt = { label: `Speak with ${npc.name || 'somebody'}`, action: 'talk', npc };
    else if (inter) prompt = { label: inter.label, action: inter.kind, target: inter };
    else if (node) prompt = { label: node.label + (node.tool ? ` (needs ${node.tool})` : ''), action: 'harvest', node };

    if (this.ui) this.ui.prompt(prompt);

    if (!this.input.wasPressed('interact')) return;
    if (!prompt) return;
    if (prompt.action === 'talk') this._talkTo(prompt.npc);
    else if (prompt.action === 'harvest') this._strikeNode(this.inventory.held() && this.inventory.held().item);
    else this._useInteractable(prompt.target);
  }

  _strikeNode(tool) {
    const node = this._nodeTarget;
    if (!node) return;
    const r = this.resources.strike(node, tool && tool.tool ? tool : null, this.rng);
    if (!r) return;
    if (r.rightTool) this.audio.impact(node.kind === 'tree' ? 'wood' : 'stone', 1);
    else this.audio.impact('air', 1);
    if (this.fx) this.fx.burst(node.kind === 'tree' ? 'leaves' : 'dust', { x: node.x, y: node.y + 1, z: node.z }, 8);
    this.actors.setNoise(0.6);
    if (r.done && r.yields) {
      let n = 0;
      for (const [id, c] of r.yields) { this.inventory.add(id, c); n += c; this.discovery.record('item', id); }
      this.audio.pickup();
      if (this.ui) this.ui.toast(`+${n} harvested`, 'loot');
      this.quests.notify({ type: 'fetch', item: r.yields[0][0], count: r.yields[0][1] });
    }
    if (tool && tool.durability) this.inventory.wearHeld(1);
  }

  _useInteractable(it) {
    switch (it.kind) {
      case 'station':
        if (this.ui) this.ui.openCrafting(it.station);
        this.audio.ui('open');
        break;
      case 'container': {
        if (this.structures.looted.has(it.id)) { if (this.ui) this.ui.toast('Already emptied.', 'neutral'); return; }
        this.structures.looted.add(it.id);
        const loot = this.structures.rollLoot(it.poiId, this.rng);
        let n = 0;
        for (const [id, c] of loot) { this.inventory.add(id, c); n += c; this.discovery.record('item', id); }
        if (this.rng.chance(0.12)) { const w = rollWeapon(this.rng, { luck: 0.4 }); this.inventory.add(w, 1); n++; }
        this.audio.pickup();
        if (this.ui) this.ui.toast(n ? `Found ${n} item${n > 1 ? 's' : ''}` : 'Empty.', 'loot');
        break;
      }
      case 'bed':
        this.world.timeOfDay = 0.26;
        this.player.heal(30); this.player.stamina = 100; this.player.warmth = 100;
        this.audio.tone({ freq: 300, to: 500, dur: 0.8, gain: 0.1 });
        if (this.ui) this.ui.toast('You sleep until dawn.', 'good');
        break;
      case 'resonance':
        this.discovery.advanceMystery('choir_stone', 1, 'You touched a standing stone and felt it answer.');
        this.audio.resonance({ x: it.x, y: it.y, z: it.z });
        if (this.fx) this.fx.burst('spark', { x: it.x, y: it.y + 1, z: it.z }, 30);
        if (this.ui) this.ui.toast('The stone hums back.', 'mystery');
        this.quests.notify({ type: 'resonance' });
        break;
      case 'descent':
        if (this.ui) this.ui.toast('The way down is dark. Bring a torch.', 'neutral');
        this.player.spawnAt(it.x, it.z - 2);
        break;
      case 'lore':
        if (this.ui) this.ui.lore(it);
        break;
    }
  }

  _talkTo(npc) {
    const col = this.world.columnAt(npc.pos.x, npc.pos.z, {});
    const ctx = {
      hour: this.world.timeOfDay * 24,
      night: this.sky.isNight,
      wet: this.weather.wetness > 0.2,
      weather: this.weather.def,
      hostilesNear: this.actors.hostilesNear(npc.pos.x, npc.pos.z, 60).length,
      resonance: this.discovery.resonance,
      threat: this.actors.hostilesNear(npc.pos.x, npc.pos.z, 120).length > 0,
      quests: this.quests.active.filter(q => q.giver === npc.id),
    };
    npc.talking = true;
    const convo = this.dialogue.open(npc, ctx);
    if (!npc.trade) npc.trade = this.market.stockFor({ x: npc.pos.x, z: npc.pos.z, id: npc.id }, npc.role);
    if (this.ui) this.ui.openDialogue(convo, npc, this.market, col);
  }

  /* ── discovery ───────────────────────────────────────────────────── */

  _discoverAround(pos) {
    const col = this.world.columnAt(pos.x, pos.z, {});
    if (this.discovery.record('biome', col.biome, { name: col.biome })) {
      if (this.ui) this.ui.toast(`Discovered: ${col.biome.replace(/_/g, ' ')}`, 'discovery');
      this.audio.discover();
    }
    for (const poi of this.world.poisNear(pos.x, pos.z, 90)) {
      if (this.discovery.record('poi', poi.id, { type: poi.type, name: poi.name, x: poi.x, z: poi.z })) {
        if (this.ui) this.ui.toast(`Found: ${poi.name || poi.type}`, 'discovery');
        this.audio.discover();
        this.quests.notify({ type: 'visit', poi: poi.id });
        if (poi.resonant || poi.type === 'hollowspire') this.discovery.advanceMystery('hollow_spire', 1);
      }
      this.world.knownPois.add(poi.id);
    }
    const cell = `${Math.floor(pos.x / 512)},${Math.floor(pos.z / 512)}`;
    this.world.visitedCells.add(cell);
  }

  _hintState() {
    const p = this.player;
    const col = this.world.columnAt(p.pos.x, p.pos.z, {});
    return {
      playtime: this.playtime,
      moved: p.speed > 0.5,
      looked: Math.abs(p.yaw) > 0.05 || Math.abs(p.pitch) > 0.05,
      nearResource: !!this._nodeTarget,
      inventory: this.inventory.all().length,
      hasWood: this.inventory.countOf('wood') > 0,
      openedCrafting: !!(this.ui && this.ui.craftingOpened),
      night: this.sky.isNight,
      nearFire: this.structures.interactables.some(i => i.fire && Math.hypot(i.x - p.pos.x, i.z - p.pos.z) < 14),
      enemyNear: this.actors.hostilesNear(p.pos.x, p.pos.z, 40).length > 0,
      fought: this.combat.lastDamageDealt > 0,
      health: p.health, warmth: p.warmth, hunger: p.hunger,
      openedMap: !!(this.ui && this.ui.mapOpened),
      openedJournal: !!(this.ui && this.ui.journalOpened),
      planks: this.inventory.countOf('plank'),
      built: this.build.pieces.length > 0,
      discoveries: this.discovery.total(),
      inWater: p.swimming, depth: p.submerged,
      atLedge: false,
      dusk: this.world.timeOfDay > 0.72 && this.world.timeOfDay < 0.8,
      warm: col.temp > 10,
      cold: col.temp < 0,
      nearOcean: col.biome === 'ocean' || col.biome === 'deep_ocean' || col.biome === 'coast',
      nearSpire: this.world.poisNear(p.pos.x, p.pos.z, 200).some(x => x.type === 'hollowspire'),
    };
  }

  /* ── audio ───────────────────────────────────────────────────────── */

  _updateAudio(dt, hour) {
    const p = this.player.pos;
    const col = this.world.columnAt(p.x, p.z, {});
    const w = this.weather;
    const underground = p.y < -4;
    this.audio.setAmbient({
      wind: Math.min(1, w.wind * 0.5),
      water: col.biome === 'ocean' || col.biome === 'deep_ocean' || col.biome === 'coast' || col.biome === 'swamp' ? 0.8 : 0,
      rumble: underground ? 0.9 : 0,
      birds: this.sky.isNight || underground ? 0 : (col.old > 0.4 ? 0.8 : col.humid > 0.4 ? 0.4 : 0.12),
      insects: this.sky.isNight && !underground && col.temp > 8 ? 0.7 : 0,
    });
    this.audio.updateAmbient(dt);

    const hostiles = this.actors.hostilesNear(p.x, p.z, 45).length;
    const mode = underground ? 'hollow' : this.sky.isNight ? 'dusk'
      : hostiles > 0 ? 'dusk' : (this.world.poisNear(p.x, p.z, 60).some(x => x.type === 'village') ? 'calm' : 'wanderer');
    this.audio.setMood(mode, Math.min(1, hostiles * 0.35 + (this.player.health < 40 ? 0.3 : 0)));
    this.audio.update(dt);
    if (w.lightning > 0.9 && !this._thunderCd) { this.audio.thunder(); this._thunderCd = 3; }
    if (this._thunderCd) this._thunderCd -= dt;
  }

  /* ── hotbar ──────────────────────────────────────────────────────── */

  _handleHotbar() {
    for (let i = 0; i < 10; i++) {
      const key = i === 9 ? 'slot0' : 'slot' + (i + 1);
      if (this.input.wasPressed(key)) {
        this.inventory.selected = i;
        this._attachHeld();
        this.audio.ui('click');
        if (this.ui) this.ui.refreshHotbar();
      }
    }
    const wheel = this.input.mouse.wheel;
    if (wheel) {
      this.inventory.selected = this.inventory.selected + (wheel > 0 ? 1 : -1);
      this.input.mouse.wheel = 0;
      this._attachHeld();
      if (this.ui) this.ui.refreshHotbar();
    }
    if (this.input.wasPressed('drop')) {
      const dropped = this.inventory.drop(this.inventory.selected, false);
      if (dropped && this.ui) this.ui.toast(`Dropped ${dropped.item.name}`, 'neutral');
    }
    this.player.carryWeight = this.inventory.weight();
    this.player.maxCarry = this.inventory.capacity + (this.inventory.equipment.back ? 20 : 0);
  }

  /* ── save / load ─────────────────────────────────────────────────── */

  snapshot() {
    return {
      meta: {
        name: this.desc.name, seed: this.desc.seed, size: this.desc.size, type: this.desc.type,
        day: this.world.day, playtime: Math.round(this.playtime),
        progress: { discoveries: this.discovery.total(), resonance: this.discovery.resonance, quests: this.quests.completed.length },
      },
      data: {
        version: VERSION.schema,
        desc: this.desc,
        settings: this.settings,
        time: { tod: this.world.timeOfDay, day: this.world.day },
        player: this.player.serialize(),
        inventory: this.inventory.serialize(),
        crafting: this.crafting.serialize(),
        build: this.build.serialize(),
        discovery: this.discovery.serialize(),
        quests: this.quests.serialize(),
        weather: this.weather.serialize(),
        resources: this.resources.serialize(),
        structures: this.structures.serialize(),
        actors: this.actors.serialize(),
        markers: [...this.world.markers],
        visited: [...this.world.visitedCells],
        knownPois: [...this.world.knownPois],
        discoveredBiomes: [...this.world.discovered],
      },
    };
  }

  async saveTo(slot) {
    const { meta, data } = this.snapshot();
    const r = await this.save.write(slot, meta, data);
    if (this.ui) this.ui.toast(r.ok ? (r.degraded ? 'Saved (reduced detail — storage was full).' : 'World saved.') : 'Save failed: ' + r.error, r.ok ? 'good' : 'error');
    return r;
  }

  async loadFrom(slot) {
    const rec = await this.save.read(slot);
    if (!rec) return false;
    await this.createWorld(rec.data.desc, () => {});
    const d = rec.data;
    this.settings = Object.assign(this.settings, d.settings || {});
    this.world.timeOfDay = d.time.tod;
    this.world.day = d.time.day;
    this.player.restore(d.player);
    this.inventory.restore(d.inventory);
    this.crafting.restore(d.crafting);
    this.build.restore(d.build);
    this.discovery.restore(d.discovery);
    this.quests.restore(d.quests);
    this.weather.restore(d.weather);
    this.resources.restore(d.resources);
    this.structures.restore(d.structures);
    this.actors.restore(d.actors);
    this.world.markers = new Set(d.markers || []);
    this.world.visitedCells = new Set(d.visited || []);
    this.world.knownPois = new Set(d.knownPois || []);
    this.world.discovered = new Set(d.discoveredBiomes || []);
    this.playtime = rec.playtime || 0;
    this._attachHeld();
    this.cameraRig.target = this.player;
    return true;
  }

  async autosaveNow() { return this.autosave.force(() => this.snapshot()); }

  /* ── settings ────────────────────────────────────────────────────── */

  applySettings(patch) {
    Object.assign(this.settings, patch);
    this.saveSettings();
    this.input.sensitivity = this.settings.sensitivity;
    this.input.invertY = this.settings.invertY;
    this.camera.fov = this.settings.fov;
    this.audio.setVolume('master', this.settings.master);
    this.audio.setVolume('music', this.settings.music);
    this.audio.setVolume('sfx', this.settings.sfx);
    this.audio.setVolume('ambient', this.settings.ambient);
    if (this.veg) this.veg.setDensity(this.settings.vegDensity);
    if (this.terrain) this.terrain.viewScale = this.settings.renderDistance;
    if (this.player) this.player.model.visible = this.settings.thirdPerson;
    if (this.cameraRig) this.cameraRig.mode = this.settings.thirdPerson ? 'third' : 'first';
    this.autosave.enabled = this.settings.autosave;
  }

  /* ── ui wiring ───────────────────────────────────────────────────── */

  _wireUI() {
    if (!this.ui) return;
    this.inventory.onChange(() => this.ui.refreshInventory && this.ui.refreshInventory());
    this.crafting.onChange(() => this.ui.refreshCrafting && this.ui.refreshCrafting());
    this.build.onChange(() => this.ui.refreshBuild && this.ui.refreshBuild());
    this.discovery.onChange(e => this.ui.onDiscovery && this.ui.onDiscovery(e));
  }
}

export default Game;
