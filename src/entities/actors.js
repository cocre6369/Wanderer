/**
 * WANDERER — Actors
 * -----------------
 * Everything that moves and isn't the player: wildlife, enemies, and the
 * people who live in settlements. One class, three temperaments, and a
 * streaming manager that only thinks hard about what is close to you.
 *
 * AI budget (spec 46 — distance gating):
 *   ≤ 70 m   full state machine, animation, pathing
 *   ≤ 200 m  position + heading only, no animation
 *   > 200 m  dormant: state frozen, mesh hidden, nothing computed
 */

import * as THREE from '../three.js';
import { buildCreature, animateCreature, CREATURES } from '../render/creatures.js';
import { creatureTable } from '../world/biomes.js';
import { hash2 } from '../core/rng.js';

export const FULL_AI = 70;
export const LITE_AI = 200;
export const SPAWN_RING = 130;
export const DESPAWN_RING = 260;

const _v = new THREE.Vector3();

export class Actor {
  constructor(world, scene, type, x, z, opts = {}) {
    this.world = world;
    this.type = type;
    this.def = CREATURES[type] || CREATURES.deer;
    this.id = opts.id || `${type}_${hash2(Math.round(x), Math.round(z), 991)}`;
    this.pos = new THREE.Vector3(x, world.heightAt(x, z), z);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.home = new THREE.Vector2(x, z);
    this.state = 'wander';
    this.stateT = 0;
    this.target = null;
    this.speed = 0;
    this.alive = true;
    this.hostile = !!this.def.hostile;
    this.flying = !!this.def.flying;
    this.aquatic = !!this.def.aquatic;
    this.ranged = !!this.def.ranged;
    this.maxHealth = this.def.hp || 20;
    this.health = this.maxHealth;
    this.damageBase = this.def.dmg || 4;
    this.mass = this.def.mass || 20;
    this.alert = 0;
    this.attackCd = 0;
    this.hitFlash = 0;
    this.dyingT = 0;
    this.nocturnal = opts.nocturnal || null;
    this.leash = opts.leash === undefined ? 90 : opts.leash;
    this.drops = opts.drops || null;
    this.group = buildCreature(type, opts.build || {});
    this.group.position.copy(this.pos);
    this.group.visible = false;
    this.group.userData.actor = this;
    scene.add(this.group);
    this.scene = scene;
    this._col = {};
    this._think = 0;
    this.grounded = !this.flying;
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }
  distTo(x, z) { return Math.hypot(this.pos.x - x, this.pos.z - z); }

  /** Ground (or water surface for flyers/swimmers) at a position. */
  floorAt(x, z) {
    if (this.flying) return this.world.heightAt(x, z) + 12;
    const h = this.world.heightAt(x, z);
    const w = this.world.waterAt(x, z, h);
    if (this.aquatic) return w === null ? h : w - 0.2;
    return w !== null && w - h > 2.2 ? h : Math.max(h, w === null ? h : w);
  }

  damage(amount, from, kind) {
    if (!this.alive) return 0;
    this.health -= amount;
    this.hitFlash = 0.28;
    this.alert = 1;
    if (from) this.target = from;
    if (this.hostile && from) this.state = 'chase';
    else if (!this.hostile) { this.state = 'flee'; this.target = from; }
    if (this.health <= 0) { this.health = 0; this.alive = false; this.dyingT = 1.6; this.state = 'dead'; }
    return amount;
  }

  /**
   * ctx: { player, dt, time, night, weather, actors, events }
   * `events` collects things the game reacts to (deaths, attacks, noise).
   */
  update(dt, ctx) {
    if (this.dyingT > 0) {
      this.dyingT -= dt;
      this.group.rotation.z = Math.min(1.5, this.group.rotation.z + dt * 2.4);
      this.group.position.y += Math.min(0, -dt * 0.2);
      animateCreature(this.group, dt, { speed: 0, dying: 1 });
      return;
    }
    if (!this.alive) return;

    const d = this.distTo(ctx.player.pos.x, ctx.player.pos.z);
    const far = d > FULL_AI;

    this._think -= dt;
    if (this._think <= 0 && !far) {
      this._think = 0.25 + Math.random() * 0.2;
      this.think(ctx, d);
    }
    this.move(dt, ctx, far);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    if (!far) {
      animateCreature(this.group, dt, {
        speed: this.speed,
        attack: this.attackCd > 0.5 ? 1 : 0,
        hit: this.hitFlash,
        yaw: this.yaw,
      });
    }
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;
  }

  /** Decide what to do. Runs ~4×/s and only inside FULL_AI. */
  think(ctx, dist) {
    const p = ctx.player;
    this.stateT -= 0.3;

    if (this.hostile) {
      const sees = dist < (ctx.night ? 26 : 42) && !p.dead;
      if (this.target === p && this.alert > 0) {
        this.state = dist < (this.ranged ? 14 : 2.6) ? 'attack' : 'chase';
        this.alert = Math.min(1, this.alert + 0.1);
      } else if (sees && this.alert > 0.2) {
        this.target = p;
        this.state = 'chase';
      } else if (this.distTo(this.home.x, this.home.y) > this.leash) {
        this.state = 'return';
        this.target = null;
      } else {
        this.state = this.stateT <= 0 ? 'wander' : this.state;
        this.alert = Math.max(0, this.alert - 0.05);
      }
      return;
    }

    // Wildlife: graze, wander, and bolt when something loud happens nearby.
    if (dist < 12 && (p.speed > 4.5 || ctx.noise > 0.5)) { this.state = 'flee'; this.target = p; this.stateT = 3; }
    else if (this.stateT <= 0) {
      this.state = Math.random() < 0.55 ? 'wander' : 'idle';
      this.stateT = 2 + Math.random() * 5;
    }
  }

  move(dt, ctx, far) {
    const p = ctx.player;
    let speed = 0, tx = this.pos.x, tz = this.pos.z, turn = 0;
    const maxSpeed = this.def.speed || 4;

    switch (this.state) {
      case 'wander': {
        if (!this._wanderTarget || this.distTo(this._wanderTarget.x, this._wanderTarget.z) < 4 || Math.random() < 0.01) {
          const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 22;
          this._wanderTarget = {
            x: THREE.MathUtils.clamp(this.home.x + Math.cos(a) * r, this.home.x - this.leash, this.home.x + this.leash),
            z: THREE.MathUtils.clamp(this.home.z + Math.sin(a) * r, this.home.z - this.leash, this.home.z + this.leash),
          };
        }
        tx = this._wanderTarget.x; tz = this._wanderTarget.z;
        speed = maxSpeed * (this.hostile ? 0.35 : 0.3);
        break;
      }
      case 'idle': speed = 0; break;
      case 'chase': {
        if (!this.target) { this.state = 'wander'; break; }
        tx = this.target.pos.x; tz = this.target.pos.z;
        speed = maxSpeed * (this.alert > 0.6 ? 1 : 0.7);
        break;
      }
      case 'attack': {
        speed = 0;
        if (this.target) {
          tx = this.target.pos.x; tz = this.target.pos.z;
          if (this.attackCd <= 0) {
            this.attackCd = this.hostile ? 1.1 + Math.random() * 0.5 : 2;
            ctx.events.push({ type: 'actor_attack', actor: this, target: this.target, damage: this.damageBase, ranged: this.ranged });
          }
        }
        break;
      }
      case 'flee': {
        const src = this.target || p;
        const dx = this.pos.x - src.pos.x, dz = this.pos.z - src.pos.z;
        const l = Math.hypot(dx, dz) || 1;
        tx = this.pos.x + (dx / l) * 20; tz = this.pos.z + (dz / l) * 20;
        speed = maxSpeed * 1.15;
        if (this.distTo(src.pos.x, src.pos.z) > 45) { this.state = 'wander'; this.stateT = 3; }
        break;
      }
      case 'return': {
        tx = this.home.x; tz = this.home.y;
        speed = maxSpeed * 0.6;
        if (this.distTo(this.home.x, this.home.y) < 6) this.state = 'wander';
        break;
      }
      default: speed = 0;
    }

    // Steering
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.4) {
      const want = Math.atan2(dx, dz);
      let diff = want - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      turn = THREE.MathUtils.clamp(diff, -6 * dt, 6 * dt);
      this.yaw += turn;
    }
    if (far) { this.speed = 0; return; }

    // Slopes slow ground creatures; flyers ignore them.
    if (!this.flying) {
      const h0 = this.world.heightAt(this.pos.x, this.pos.z);
      const h1 = this.world.heightAt(this.pos.x + Math.sin(this.yaw) * 2, this.pos.z + Math.cos(this.yaw) * 2);
      const grade = Math.abs(h1 - h0) / 2;
      speed *= 1 - Math.min(0.7, grade * 0.55);
    }

    const step = speed * dt;
    const nx = this.pos.x + Math.sin(this.yaw) * step;
    const nz = this.pos.z + Math.cos(this.yaw) * step;
    if (this.world.inBounds(nx, nz)) {
      const fy = this.floorAt(nx, nz);
      const dy = fy - this.pos.y;
      // step up small ledges, refuse cliffs (keeps deer off cliff faces)
      if (this.flying || Math.abs(dy) < 3.2) { this.pos.x = nx; this.pos.z = nz; this.pos.y += dy * Math.min(1, dt * 14); }
      else if (Math.random() < 0.3) { this.yaw += Math.PI * 0.5 * (Math.random() < 0.5 ? 1 : -1); }
    } else this.yaw += dt * 2;

    if (this.flying) {
      const cruise = this.world.heightAt(this.pos.x, this.pos.z) + 10 + Math.sin(performance.now ? 0 : 0) * 0;
      this.pos.y += (cruise - this.pos.y) * Math.min(1, dt * 1.2);
    }
    this.speed = speed;
  }

  hide() { this.group.visible = false; }
  show() { this.group.visible = true; }

  serialize() {
    return {
      type: this.type, id: this.id,
      pos: [Math.round(this.pos.x * 10) / 10, Math.round(this.pos.y * 10) / 10, Math.round(this.pos.z * 10) / 10],
      hp: Math.round(this.health), yaw: Math.round(this.yaw * 100) / 100,
      alive: this.alive, hostile: this.hostile, home: [this.home.x, this.home.y],
    };
  }
}

/** Settlement people: same body, but with a home, a routine and a face. */
export class Npc extends Actor {
  constructor(world, scene, type, x, z, profile, opts = {}) {
    super(world, scene, type, x, z, opts);
    this.profile = profile;               // { name, role, voice, stock, lines, home }
    this.hostile = false;
    this.home = new THREE.Vector2(profile.home ? profile.home.x : x, profile.home ? profile.home.z : z);
    this.schedule = profile.schedule || [];
    this.talking = false;
    this.name = profile.name;
    this.role = profile.role || 'settler';
  }

  think(ctx, dist) {
    if (this.talking) { this.state = 'idle'; return; }
    const hour = ctx.hour;
    // Where should they be right now?
    let dest = this.home;
    for (const s of this.schedule) if (hour >= s.from && hour < s.to) { dest = s.at || this.home; break; }
    if (this.distTo(dest.x, dest.y) > 3) {
      this._wanderTarget = { x: dest.x + (Math.random() - 0.5) * 6, z: dest.y + (Math.random() - 0.5) * 6 };
      this.state = 'wander';
    } else {
      this.state = this.stateT <= 0 ? (Math.random() < 0.6 ? 'idle' : 'wander') : this.state;
      this.stateT = 4 + Math.random() * 8;
    }
  }
}

/* ── manager ───────────────────────────────────────────────────────── */

export class ActorManager {
  constructor(world, scene, rng) {
    this.world = world;
    this.scene = scene;
    this.rng = rng;
    this.actors = [];
    this.dead = [];
    this.events = [];
    this.cells = new Map();          // "i,j" -> [ids]
    this.cellSize = 96;
    this.maxActors = 90;
    this.density = 1;                // world type / settings multiplier
    this.night = false;
    this.hour = 12;
    this.noise = 0;
    this._col = {};
  }

  setNoise(n) { this.noise = Math.max(this.noise, n); }

  cellKey(x, z) { return `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`; }

  /** Populate cells around the player. Deterministic per cell + world seed. */
  populate(px, pz, radius = SPAWN_RING) {
    const cs = this.cellSize;
    const i0 = Math.floor((px - radius) / cs), i1 = Math.floor((px + radius) / cs);
    const j0 = Math.floor((pz - radius) / cs), j1 = Math.floor((pz + radius) / cs);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const key = `${i},${j}`;
        if (this.cells.has(key)) continue;
        this.cells.set(key, this._seedCell(i, j, px, pz));
      }
    }
  }

  _seedCell(i, j, px, pz) {
    const cs = this.cellSize;
    const key = `${i},${j}`;
    const x = (i + 0.5) * cs, z = (j + 0.5) * cs;
    if (!this.world.inBounds(x, z)) return [];
    const r = hash2(i, j, this.world.seed + 77) / 4294967296;
    const r2 = hash2(i, j, this.world.seed + 78) / 4294967296;
    const r3 = hash2(i, j, this.world.seed + 79) / 4294967296;
    const col = this.world.columnAt(x, z, this._col);
    const h = col.h;
    const water = this.world.waterAt(x, z, h);
    if (water !== null && water - h > 2.5) return [];            // deep water: nothing walks here
    if (col.slope > 0.9) return [];

    const wantHostile = this.night ? r < 0.34 : r < 0.14;
    const field = wantHostile ? 'enemies' : 'wildlife';
    const table = creatureTable(col.weights || [{ id: col.biome, w: 1 }], field);
    if (!table.length) return [];
    const total = table.reduce((s, e) => s + e[1], 0);
    let pick = (wantHostile ? r2 : r3) * total, type = table[0][0];
    for (const [id, w] of table) { pick -= w; if (pick <= 0) { type = id; break; } }
    if (!CREATURES[type]) return [];
    const def = CREATURES[type];
    if (def.aquatic && water === null) return [];
    const count = def.flying ? 1 + Math.floor(r2 * 3) : 1 + Math.floor(r2 * 2.4);
    const out = [];
    for (let k = 0; k < count; k++) {
      const a = (r3 * 6.283 + k * 2.1) % 6.283;
      const rad = 8 + ((hash2(i + k, j, this.world.seed + 80 + k) / 4294967296) * 34);
      const sx = x + Math.cos(a) * rad, sz = z + Math.sin(a) * rad;
      if (!this.world.inBounds(sx, sz)) continue;
      const act = new Actor(this.world, this.scene, type, sx, sz, {
        id: `${key}:${k}:${type}`,
        nocturnal: this.night,
      });
      act.home.set(sx, sz);
      this.actors.push(act);
      out.push(act.id);
    }
    return out;
  }

  addActor(actor) { this.actors.push(actor); return actor; }

  spawnNpc(profile, x, z) {
    const n = new Npc(this.world, this.scene, 'bandit', x, z, profile, { build: {} });
    n.hostile = false;
    n.def = Object.assign({}, CREATURES.bandit, { hostile: false });
    this.actors.push(n);
    return n;
  }

  /** Per-frame: stream, gate, update. */
  update(dt, player) {
    const ctx = { player, dt, night: this.night, hour: this.hour, noise: this.noise, events: this.events, actors: this.actors };
    this.populate(player.pos.x, player.pos.z);

    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      const d = a.distTo(player.pos.x, player.pos.z);
      if (!a.alive) {
        if (a.dyingT <= 0) {
          this.scene.remove(a.group);
          this.actors.splice(i, 1);
          this.events.push({ type: 'actor_removed', actor: a });
        } else a.update(dt, ctx);
        continue;
      }
      if (d > DESPAWN_RING) {
        this.scene.remove(a.group);
        this.actors.splice(i, 1);
        this._forgetCell(a);
        continue;
      }
      const near = d < LITE_AI;
      a.group.visible = near;
      if (d > LITE_AI) continue;                    // dormant
      a.update(dt, ctx);
    }

    // trim if the world is unusually dense
    if (this.actors.length > this.maxActors) {
      this.actors.sort((a, b) => b.distTo(player.pos.x, player.pos.z) - a.distTo(player.pos.x, player.pos.z));
      while (this.actors.length > this.maxActors) {
        const a = this.actors.pop();
        this.scene.remove(a.group);
        this._forgetCell(a);
      }
    }
    this.noise = 0;
    return this.events;
  }

  _forgetCell(actor) {
    for (const [k, list] of this.cells) {
      const i = list.indexOf(actor.id);
      if (i >= 0) { list.splice(i, 1); if (!list.length) this.cells.delete(k); break; }
    }
  }

  takeEvents() { const e = this.events; this.events = []; return e; }

  /** Nearest actor matching a filter, within r metres. */
  nearest(x, z, r, filter) {
    let best = null, bd = r * r;
    for (const a of this.actors) {
      if (!a.alive) continue;
      if (filter && !filter(a)) continue;
      const dx = a.pos.x - x, dz = a.pos.z - z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  /** Everything within r metres (interaction, area effects). */
  within(x, z, r, filter) {
    const out = [];
    for (const a of this.actors) {
      if (!a.alive) continue;
      if (filter && !filter(a)) continue;
      if (a.distTo(x, z) <= r) out.push(a);
    }
    return out;
  }

  hostilesNear(x, z, r) { return this.within(x, z, r, a => a.hostile); }
  npcsNear(x, z, r) { return this.within(x, z, r, a => a instanceof Npc); }

  serialize() {
    return this.actors.filter(a => a.alive || a.dyingT > 0).map(a => a.serialize());
  }

  restore(list) {
    this.clear();
    for (const s of (list || [])) {
      const a = new Actor(this.world, this.scene, s.type, s.pos[0], s.pos[2], { id: s.id });
      a.pos.set(s.pos[0], s.pos[1], s.pos[2]);
      a.health = s.hp; a.yaw = s.yaw; a.alive = s.alive; a.hostile = s.hostile;
      a.home.set(s.home[0], s.home[1]);
      this.actors.push(a);
      const k = this.cellKey(a.pos.x, a.pos.z);
      if (!this.cells.has(k)) this.cells.set(k, []);
      this.cells.get(k).push(a.id);
    }
  }

  clear() {
    for (const a of this.actors) this.scene.remove(a.group);
    this.actors.length = 0;
    this.cells.clear();
  }
}

export { CREATURES, creatureTable };
export default ActorManager;
