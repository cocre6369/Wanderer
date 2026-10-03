/**
 * WANDERER — Combat
 * -----------------
 * Real-time, weight-based melee: wind-up, active frames, recovery. Blocking
 * costs stamina, a block started within 0.22 s of a hit parries, dodging
 * grants i-frames, and every weapon archetype has its own rhythm and combo.
 * Nothing here is a damage-spreadsheet: reach, arc and stagger decide fights.
 */

import * as THREE from '../three.js';
import { itemById, rollWeapon } from './items.js';

/** Per-archetype timings in seconds: wind-up, active, recovery, arc (radians). */
export const SWING = {
  sword:     { wind: 0.20, active: 0.16, rec: 0.24, arc: 1.5, heavyWind: 0.42, heavyArc: 2.4 },
  longsword: { wind: 0.28, active: 0.18, rec: 0.34, arc: 1.9, heavyWind: 0.55, heavyArc: 3.0 },
  dagger:    { wind: 0.10, active: 0.10, rec: 0.13, arc: 1.0, heavyWind: 0.26, heavyArc: 1.6 },
  axe:       { wind: 0.30, active: 0.16, rec: 0.36, arc: 1.6, heavyWind: 0.60, heavyArc: 2.2 },
  spear:     { wind: 0.18, active: 0.12, rec: 0.26, arc: 0.5, heavyWind: 0.40, heavyArc: 0.8 },
  hammer:    { wind: 0.44, active: 0.20, rec: 0.52, arc: 1.4, heavyWind: 0.78, heavyArc: 2.0 },
  staff:     { wind: 0.24, active: 0.18, rec: 0.30, arc: 1.3, heavyWind: 0.50, heavyArc: 2.6 },
  shield:    { wind: 0.16, active: 0.14, rec: 0.30, arc: 1.2, heavyWind: 0.36, heavyArc: 1.8 },
  bow:       { wind: 0.55, active: 0.05, rec: 0.30, arc: 0.1, heavyWind: 1.00, heavyArc: 0.1 },
  crossbow:  { wind: 0.70, active: 0.05, rec: 0.40, arc: 0.1, heavyWind: 0.90, heavyArc: 0.1 },
  thrown:    { wind: 0.30, active: 0.05, rec: 0.35, arc: 0.1, heavyWind: 0.45, heavyArc: 0.1 },
};

/** What each creature is weak / resistant to. Drives elemental play. */
export const AFFINITY = {
  wolf: {}, wolf_white: { fire: 1.6, frost: 0.4 }, icestalker: { fire: 1.9, frost: 0.2 },
  bear: { fire: 1.3 }, panther: { bleed: 1.4 }, ashbeast: { frost: 1.8, fire: 0.2 },
  lavaling: { frost: 2.0, fire: 0.1 }, magmite: { frost: 1.7, fire: 0.2 },
  shardling: { resonance: 1.8 }, wisp: { resonance: 2.2, bleed: 0.2 },
  hollow: { resonance: 1.7, fire: 1.3 }, guardian: { resonance: 1.5, bleed: 0.3 },
  stonegolem: { resonance: 1.6, bleed: 0.0, slow: 0.2 }, sandworm: { frost: 1.3, bleed: 1.4 },
  drowned: { fire: 1.4, frost: 0.6 }, infected: { fire: 1.8 }, bandit: { bleed: 1.2 },
  scorpion: { fire: 1.4 }, crawler: { fire: 1.3 }, spitter: { fire: 1.4 },
  harpy: { bleed: 1.3 }, lurker: { fire: 1.5 }, bloodhound: { fire: 1.5 },
};

/** Loot rolled when something dies. `[item, chance, min, max]`. */
export const LOOT = {
  deer: [['raw_meat', 1, 2, 3], ['leather', 1, 1, 2], ['sinew', 0.7, 1, 2], ['bone', 0.6, 1, 2]],
  stag: [['raw_meat', 1, 2, 4], ['leather', 1, 2, 3], ['sinew', 0.8, 1, 2], ['bone', 0.8, 1, 3], ['antler', 0.5, 1, 2]],
  boar: [['raw_meat', 1, 2, 3], ['leather', 1, 1, 2], ['tusk', 0.5, 1, 2]],
  rabbit: [['raw_meat', 1, 1, 1], ['fur', 0.8, 1, 1]],
  hare_snow: [['raw_meat', 1, 1, 1], ['fur', 1, 1, 2]],
  fox: [['fur', 1, 1, 2], ['raw_meat', 0.6, 1, 1]],
  goat: [['raw_meat', 1, 1, 2], ['leather', 1, 1, 2], ['bone', 0.5, 1, 1]],
  goat_feral: [['raw_meat', 1, 2, 3], ['leather', 1, 1, 2], ['bone', 0.7, 1, 2]],
  camel_wild: [['raw_meat', 1, 3, 4], ['leather', 1, 2, 3]],
  monkey: [['raw_meat', 0.8, 1, 1], ['exotic_fruit', 0.4, 1, 2]],
  crab: [['clam', 1, 1, 2]],
  fish: [['fish_raw', 1, 1, 2]],
  bird: [['raw_meat', 0.8, 1, 1], ['feather', 1, 1, 3]],
  gull: [['feather', 1, 1, 3]],
  owl: [['feather', 1, 1, 3]],
  wolf: [['fur', 1, 1, 2], ['raw_meat', 0.8, 1, 2], ['fang', 0.5, 1, 1]],
  wolf_white: [['fur', 1, 2, 3], ['raw_meat', 0.8, 1, 2], ['fang', 0.6, 1, 2]],
  bloodhound: [['fur', 1, 1, 2], ['fang', 0.7, 1, 2], ['echo_shard', 0.06, 1, 1]],
  icestalker: [['fur', 1, 2, 3], ['ice', 1, 2, 4], ['fang', 0.6, 1, 2], ['frostbloom', 0.25, 1, 1]],
  panther: [['fur', 1, 1, 2], ['fang', 0.6, 1, 1], ['raw_meat', 0.7, 1, 1]],
  bear: [['fur', 1, 3, 5], ['raw_meat', 1, 3, 5], ['fang', 0.7, 1, 2], ['claw', 0.5, 1, 2]],
  scorpion: [['toxic_gland', 1, 1, 2], ['chitin', 0.8, 1, 2]],
  crawler: [['toxic_gland', 0.8, 1, 1], ['chitin', 0.7, 1, 1]],
  lurker: [['leather', 1, 2, 3], ['toxic_gland', 0.6, 1, 2], ['raw_meat', 0.8, 1, 2]],
  infected: [['cloth', 0.7, 1, 2], ['toxic_gland', 0.8, 1, 2], ['bone', 0.4, 1, 1]],
  bandit: [['coin', 1, 4, 18], ['iron_ingot', 0.35, 1, 2], ['bandage', 0.4, 1, 2], ['arrow', 0.4, 4, 10], ['wpn', 0.25, 1, 1], ['cloth', 0.5, 1, 2]],
  hollow: [['echo_shard', 0.6, 1, 2], ['ancient_wood', 0.3, 1, 1], ['cloth', 0.5, 1, 2], ['wpn', 0.2, 1, 1]],
  stonegolem: [['stone', 1, 6, 12], ['iron', 0.5, 2, 4], ['crystal', 0.25, 1, 2], ['echo_shard', 0.2, 1, 1]],
  harpy: [['feather', 1, 2, 4], ['claw', 0.6, 1, 2]],
  sandworm: [['chitin', 1, 3, 6], ['toxic_gland', 0.7, 1, 2], ['raw_meat', 1, 2, 4]],
  ashbeast: [['ash', 1, 3, 6], ['obsidian', 0.5, 1, 3], ['emberstone', 0.3, 1, 2]],
  lavaling: [['emberstone', 1, 1, 3], ['sulfur', 0.8, 1, 2]],
  magmite: [['obsidian', 1, 2, 4], ['emberstone', 0.6, 1, 2], ['sulfur', 0.7, 1, 2]],
  shardling: [['crystal', 1, 2, 4], ['echo_shard', 0.35, 1, 1]],
  spitter: [['toxic_gland', 1, 1, 3]],
  wisp: [['crystal', 0.8, 1, 2], ['echo_shard', 0.15, 1, 1]],
  guardian: [['echo_shard', 1, 2, 4], ['crystal', 1, 3, 6], ['ancient_wood', 0.6, 1, 2], ['relic', 0.3, 1, 1]],
  drowned: [['bone', 1, 1, 3], ['pearl', 0.2, 1, 1], ['cloth', 0.4, 1, 2]],
  crow_swarm: [['feather', 1, 1, 2]],
  crow: [['feather', 1, 1, 2]],
  vulture: [['feather', 1, 1, 3]],
};

export class Combat {
  constructor(ctx) {
    this.world = ctx.world;
    this.fx = ctx.fx;
    this.audio = ctx.audio;
    this.events = [];
    this.combo = 0;
    this.comboT = 0;
    this.attack = null;      // { kind, t, phase, weapon, hit:Set }
    this.blockT = 0;         // time since block started (parry window)
    this.dodgeIFrames = 0;
    this.hitStop = 0;
    this.lastDamageDealt = 0;
  }

  get busy() { return !!this.attack; }

  startAttack(kind, weapon, player) {
    if (this.attack) return false;
    const arch = (weapon && weapon.arch) || 'sword';
    const s = SWING[arch] || SWING.sword;
    const wind = kind === 'heavy' ? s.heavyWind : s.wind;
    const stam = (weapon && weapon.stats ? weapon.stats.stam : 9) * (kind === 'heavy' ? 1.8 : 1);
    if (player.stamina < stam) { this.events.push({ type: 'no_stamina' }); return false; }
    player.stamina -= stam;
    this.attack = { kind, t: 0, wind, active: s.active, rec: s.rec, arc: kind === 'heavy' ? s.heavyArc : s.arc, weapon, hit: new Set(), arch, resolved: false };
    if (this.audio) this.audio.swing(arch, kind);
    return true;
  }

  startBlock(player) {
    if (this.blockT === 0) this.blockT = 0.001;
  }

  update(dt, player, actors, inventory) {
    this.comboT = Math.max(0, this.comboT - dt);
    if (this.comboT === 0) this.combo = 0;
    if (this.dodgeIFrames > 0) this.dodgeIFrames -= dt;
    if (this.hitStop > 0) this.hitStop -= dt;
    if (!player.blocking) this.blockT = 0;
    else this.blockT += dt;

    // weapon effects ticking on the player
    this._tickEffects(player, dt);

    const a = this.attack;
    if (!a) return this.events;
    a.t += dt;

    if (a.t >= a.wind && !a.resolved) {
      a.resolved = true;
      this._resolveMelee(a, player, actors);
    }
    if (a.t >= a.wind + a.active + a.rec) {
      this.attack = null;
      player.attackT = 0;
    } else {
      // drive the model animation
      const total = a.wind + a.active + a.rec;
      player.attackT = a.t < a.wind ? a.t / a.wind : (a.t < a.wind + a.active ? 1 : 1 - (a.t - a.wind - a.active) / a.rec);
      player.attackKind = a.kind;
    }
    return this.events;
  }

  _resolveMelee(a, player, actors) {
    const w = a.weapon;
    const reach = (w && w.stats ? w.stats.reach : 2.3) + 0.4;
    const base = (w && w.stats ? w.stats.dmg : 8) * (a.kind === 'heavy' ? 1.75 : 1);
    const fwd = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const eye = player.eye;
    const list = actors.within(eye.x, eye.z, reach + 1.5, x => x.alive);
    let hits = 0;
    for (const actor of list) {
      if (a.hit.has(actor.id)) continue;
      const to = _v.set(actor.pos.x - eye.x, 0, actor.pos.z - eye.z);
      const dist = to.length();
      if (dist > reach) continue;
      to.normalize();
      const dot = to.dot(fwd);
      if (dot < Math.cos(a.arc * 0.5)) continue;
      // vertical sanity for flyers
      if (Math.abs(actor.pos.y - eye.y) > 3.4 && !actor.flying) continue;
      this.hitActor(actor, base, w, a.kind, player, dot);
      a.hit.add(actor.id);
      hits++;
      if (hits >= (a.kind === 'heavy' ? 4 : 2) && !(w && w.arch === 'hammer')) break;
    }
    if (hits) {
      this.combo = Math.min(5, this.combo + 1);
      this.comboT = 2.2;
    }
    if (this.fx) this.fx.burst(hits ? 'hit' : 'swing', { x: eye.x + fwd.x * reach * 0.6, y: eye.y, z: eye.z + fwd.z * reach * 0.6 }, hits ? 14 : 4);
    if (this.audio) this.audio.impact(hits ? 'flesh' : 'air', hits);
    this.events.push({ type: 'swing', kind: a.kind, hits, combo: this.combo, weapon: w });
  }

  hitActor(actor, base, weapon, kind, player, dot = 1) {
    const eff = (weapon && weapon.effects) || {};
    let mult = 1;
    const aff = AFFINITY[actor.type] || {};
    for (const k in aff) if (eff[k]) mult *= Math.pow(aff[k], Math.min(1, eff[k]));
    // backstab
    const behind = Math.cos(actor.yaw - Math.atan2(player.pos.x - actor.pos.x, player.pos.z - actor.pos.z));
    if (weapon && weapon.arch === 'dagger' && behind > 0.4) mult *= 3;
    // crit
    const critChance = 0.05 + (eff.crit || 0);
    const crit = Math.random() < critChance;
    if (crit) mult *= 1.8;
    // daylight / night bonuses
    if (eff.daylight && this.world && this.world.timeOfDay > 0.25 && this.world.timeOfDay < 0.75) mult *= 1 + eff.daylight;
    // combo scaling
    mult *= 1 + this.combo * 0.06;

    const amount = Math.max(1, Math.round(base * mult));
    actor.damage(amount, player, kind);
    actor.vel.x += Math.sin(player.yaw) * (kind === 'heavy' ? 6 : 2.5) * (30 / Math.max(20, actor.mass));
    actor.vel.z += Math.cos(player.yaw) * (kind === 'heavy' ? 6 : 2.5) * (30 / Math.max(20, actor.mass));

    this.lastDamageDealt = amount;
    this.hitStop = kind === 'heavy' ? 0.07 : 0.035;
    if (this.fx) {
      this.fx.burst('blood', { x: actor.pos.x, y: actor.pos.y + 0.9, z: actor.pos.z }, 12);
      if (crit) this.fx.burst('spark', { x: actor.pos.x, y: actor.pos.y + 1.1, z: actor.pos.z }, 18);
    }
    if (this.audio) this.audio.hit(crit, kind);

    // status effects
    if (eff.bleed) actor.bleed = Math.max(actor.bleed || 0, eff.bleed * (aff.bleed || 1));
    if (eff.burn) actor.burn = Math.max(actor.burn || 0, eff.burn * (aff.fire || 1));
    if (eff.slow) actor.slow = Math.max(actor.slow || 0, eff.slow);
    if (eff.drain) player.heal(eff.drain * 0.5);

    this.events.push({ type: 'hit', actor, amount, crit, combo: this.combo, kind });
    if (!actor.alive) this.events.push({ type: 'kill', actor, weapon });
    return amount;
  }

  /** An actor lands a blow on the player. Handles block/parry/dodge. */
  incoming(actor, target, amount, ev) {
    if (this.dodgeIFrames > 0) {
      this.events.push({ type: 'dodged', actor });
      if (this.audio) this.audio.dodge();
      return 0;
    }
    if (target.blocking) {
      if (this.blockT < 0.22) {
        // parry: stagger the attacker, refund stamina
        actor.stagger = 1.6;
        actor.state = 'idle';
        target.stamina = Math.min(100, target.stamina + 18);
        this.events.push({ type: 'parry', actor });
        if (this.fx) this.fx.burst('spark', { x: target.pos.x, y: target.pos.y + 1.2, z: target.pos.z }, 22);
        if (this.audio) this.audio.parry();
        return 0;
      }
      const absorbed = Math.min(amount, target.stamina * 0.9);
      target.stamina = Math.max(0, target.stamina - absorbed * 1.1);
      const through = Math.max(0, amount - absorbed);
      if (through > 0) target.damage(through * 0.5, actor);
      this.events.push({ type: 'blocked', actor, absorbed, through });
      if (this.audio) this.audio.block();
      return through;
    }
    const dealt = target.damage(amount, actor);
    if (this.fx) this.fx.burst('blood', { x: target.pos.x, y: target.pos.y + 1.2, z: target.pos.z }, 14);
    if (this.audio) this.audio.hurt();
    this.events.push({ type: 'player_hurt', actor, amount: dealt });
    return dealt;
  }

  dodge(player) { this.dodgeIFrames = 0.36; }

  _tickEffects(player, dt) {
    if (player.burn > 0) { player.burn -= dt; player.damage(2.4 * dt, 'burn'); }
    if (player.bleed > 0) { player.bleed -= dt; player.damage(1.4 * dt, 'bleed'); }
  }

  /** Roll the drops for a dead actor. Returns [{item, count}]. */
  rollLoot(actor, rng, luck = 0) {
    const table = LOOT[actor.type];
    if (!table) return [];
    const out = [];
    for (const [id, chance, min, max] of table) {
      if (rng.float() > chance + luck * 0.25) continue;
      const n = min + rng.int(0, Math.max(0, max - min));
      if (id === 'wpn') {
        out.push({ item: rollWeapon(rng, { luck: 0.3 + luck }), count: 1 });
      } else if (itemById(id)) out.push({ item: itemById(id), count: n });
    }
    return out;
  }

  takeEvents() { const e = this.events; this.events = []; return e; }
}

const _v = new THREE.Vector3();
export default Combat;
