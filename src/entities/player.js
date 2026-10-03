/**
 * WANDERER — Player controller
 * ----------------------------
 * Heightfield character physics with the full movement vocabulary: walk,
 * sprint, jump, crouch, slide, mantle, climb, swim, glide, ladder — and the
 * ground itself matters: mud drags, deep snow drags, ice slides, slopes shed
 * you downhill (spec 11).
 */

import * as THREE from '../three.js';
import { buildPlayer, animatePlayer, defaultLook } from '../render/player_model.js';
import { clamp01, clamp } from '../core/noise.js';

const EYE = 1.62;
const RADIUS = 0.34;
const HEIGHT = 1.78;
const GRAVITY = -22;

export class Player {
  constructor(world, scene, opts = {}) {
    this.world = world;
    this.scene = scene;
    this.pos = new THREE.Vector3(0, 20, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.state = 'idle';
    this.crouch = false;
    this.sprinting = false;
    this.swimming = false;
    this.submerged = 0;
    this.climbing = false;
    this.gliding = false;
    this.sliding = false;
    this.slideT = 0;
    this.onLadder = false;
    this.mantleT = 0;
    this.dodgeT = 0;
    this.dodgeDir = new THREE.Vector2();
    this.attackT = 0;
    this.attackKind = null;
    this.blocking = false;
    this.parryT = 0;
    this.stamina = 100;
    this.health = 100;
    this.hunger = 100;
    this.warmth = 100;
    this.breath = 100;
    this.speed = 0;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.surface = { mud: 0, snow: 0, ice: 0, slope: 0, biome: 'plains' };
    this.stepPhase = 0;
    this.lastFoot = 0;
    this.hurtT = 0;
    this.dead = false;
    this.model = buildPlayer(opts.look || defaultLook());
    this.model.visible = opts.thirdPerson !== false;
    scene.add(this.model);
    this.height = HEIGHT;
    this.radius = RADIUS;
    this._tmp = new THREE.Vector3();
    this.events = [];
    this.carryWeight = 0;
    this.maxCarry = 60;
  }

  /** Place the wanderer on solid ground at (x, z). */
  spawnAt(x, z, extraY = 0.2) {
    const h = this.world.heightAt(x, z);
    const w = this.world.waterAt(x, z, h);
    this.pos.set(x, Math.max(h, w === null ? -1e9 : w) + extraY, z);
    this.vel.set(0, 0, 0);
    this.dead = false;
    this.health = 100; this.stamina = 100; this.hunger = 100; this.warmth = 100; this.breath = 100;
    this.model.position.copy(this.pos);
    return this;
  }

  get eyeHeight() { return (this.crouch ? EYE * 0.62 : EYE) * (this.sliding ? 0.5 : 1); }
  get eye() { return this._tmp.copy(this.pos).setY(this.pos.y + this.eyeHeight); }

  emit(type, data) { this.events.push({ type, data, t: 0 }); }
  takeEvents() { const e = this.events; this.events = []; return e; }

  /** Base movement speed in m/s, modified by everything. */
  baseSpeed() {
    let s = 4.3;
    if (this.sprinting && this.stamina > 1) s = 7.4;
    if (this.crouch) s = 2.0;
    if (this.sliding) s = 9.5;
    if (this.blocking) s *= 0.45;
    if (this.swimming) s = 3.1;
    // surface
    const srf = this.surface;
    s *= 1 - srf.mud * 0.42 - srf.snow * 0.28 - srf.slope * 0.35;
    // burden
    const load = clamp01(this.carryWeight / Math.max(1, this.maxCarry));
    s *= 1 - load * 0.35;
    // cold and hunger
    if (this.warmth < 25) s *= 0.85;
    if (this.hunger < 15) s *= 0.8;
    return Math.max(0.8, s);
  }

  update(dt, input, camera, env) {
    const world = this.world;
    const p = this.pos, v = this.vel;

    // ── look ──
    const md = input.takeMouseDelta();
    this.yaw -= md.dx * 0.0026;
    this.pitch = clamp(this.pitch - md.dy * 0.0022, -1.45, 1.45);

    // ── sample the ground ──
    const ground = world.heightAt(p.x, p.z);
    const water = world.waterAt(p.x, p.z, ground);
    const waterY = water === null ? -Infinity : water;
    const depth = waterY - p.y;
    this.submerged = clamp01(depth / (this.height * 0.9));
    this.swimming = depth > this.height * 0.55;

    const col = world.columnAt(p.x, p.z);
    this.surface.biome = col.biome;
    this.surface.slope = col.slope;
    this.surface.mud = col.biome === 'swamp' || col.biome === 'volcanic_swamp' ? 1 : (col.humid > 0.72 && col.h < 12 ? 0.5 : 0);
    this.surface.snow = col.snow;
    this.surface.ice = world.gen.icy(col) ? 1 : 0;
    if (world.weather && world.weather.type === 'rain') this.surface.mud = Math.min(1, this.surface.mud + 0.35);

    // ── input ──
    const ax = input.axis();
    this.crouch = input.isDown('crouch') && !this.swimming;
    this.sprinting = input.isDown('sprint') && ax.y > 0.2 && !this.crouch && this.stamina > 2 && !this.blocking;
    this.blocking = input.isDown('block') && !this.swimming;

    // dodge roll
    if (input.wasPressed('dodge') && this.dodgeT <= 0 && this.stamina > 18 && !this.swimming) {
      this.dodgeT = 0.42;
      this.stamina -= 18;
      const dirX = ax.x !== 0 || ax.y !== 0 ? ax : { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
      this.dodgeDir.set(dirX.x, ax.y || 1);
      this.parryT = 0.22;             // dodges grant brief invulnerability
      this.emit('dodge');
    }
    if (this.dodgeT > 0) this.dodgeT -= dt;

    // slide
    if (input.wasPressed('slide') && this.onGround && this.speed > 4 && !this.sliding) {
      this.sliding = true; this.slideT = 1.1; this.stamina -= 6;
    }
    if (this.sliding) {
      this.slideT -= dt;
      if (this.slideT <= 0 || this.speed < 2.5 || !this.onGround) this.sliding = false;
    }

    // glide
    const wantGlide = input.isDown('glide') && !this.onGround && v.y < 1 && !this.swimming;
    if (wantGlide && !this.gliding && this.hasGlider) { this.gliding = true; this.emit('glide'); }
    if (this.gliding && (!wantGlide || this.onGround)) this.gliding = false;

    // ── desired velocity ──
    const speed = this.baseSpeed();
    let wishX = 0, wishZ = 0;
    if (this.dodgeT > 0) {
      const f = this.dodgeT / 0.42;
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      wishX = (this.dodgeDir.x * cy - this.dodgeDir.y * sy) * 11 * f;
      wishZ = (this.dodgeDir.x * sy + this.dodgeDir.y * cy) * 11 * f;
    } else if (ax.x !== 0 || ax.y !== 0) {
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      wishX = (ax.x * cy - ax.y * sy) * speed;
      wishZ = (ax.x * sy + ax.y * cy) * speed;
    }

    const accel = this.onGround ? (this.surface.ice ? 3.2 : 14) : (this.swimming ? 6 : 3.4);
    v.x += (wishX - v.x) * Math.min(1, accel * dt);
    v.z += (wishZ - v.z) * Math.min(1, accel * dt);

    // ice keeps you sliding
    if (this.onGround && this.surface.ice > 0.5 && (ax.x !== 0 || ax.y !== 0)) {
      v.x += wishX * dt * 0.35;
      v.z += wishZ * dt * 0.35;
    }

    // ── vertical ──
    if (this.swimming) {
      v.y += GRAVITY * 0.16 * dt;
      v.y *= 0.9;
      if (input.isDown('jump')) v.y = Math.min(3.2, v.y + 14 * dt);
      else v.y = Math.max(-1.6, v.y - 1.2 * dt);
      if (p.y < waterY - this.height * 0.5) p.y += (waterY - this.height * 0.5 - p.y) * Math.min(1, dt * 3);
      this.breath = Math.max(0, this.breath - dt * (p.y < waterY - 0.2 ? 7 : 0));
      if (p.y + EYE < waterY) this.breath = Math.max(0, this.breath - dt * 9);
      else this.breath = Math.min(100, this.breath + dt * 28);
    } else {
      v.y += GRAVITY * dt;
      if (this.gliding) v.y = Math.max(v.y, -3.2);
      if (input.wasPressed('jump')) {
        if (this.onGround) { v.y = 8.1; this.onGround = false; this.stamina -= 6; this.emit('jump'); }
        else if (p.y < waterY + 0.4 && waterY > -1000) { v.y = 6.5; }
      }
      this.breath = Math.min(100, this.breath + dt * 30);
    }

    // ── step / mantle / collide ──
    const horiz = Math.hypot(v.x, v.z);
    const nx = p.x + v.x * dt, nz = p.z + v.z * dt;
    const hAhead = world.heightAt(nx, nz);
    const stepUp = hAhead - p.y;
    const MAX_STEP = this.crouch ? 0.45 : 0.62;
    if (stepUp > MAX_STEP && !this.swimming && this.onGround) {
      // mantle: is there headroom and a ledge within reach?
      const ledge = world.heightAt(nx, nz);
      if (stepUp < 2.1 && this.stamina > 12 && world.heightAt(nx, nz) < ledge + 2.2 && input.isDown('jump')) {
        this.mantleT = 0.32;
        v.y = Math.max(v.y, 4.6 + stepUp * 1.5);
        this.stamina -= 12;
        this.emit('mantle');
      } else if (stepUp > 2.4) {
        // wall: kill the blocked component
        v.x *= 0.1; v.z *= 0.1;
      } else {
        // small step: climb it smoothly
        v.y = Math.max(v.y, 2.0);
      }
    }
    if (this.mantleT > 0) { this.mantleT -= dt; }

    // steep slopes shed you downhill
    if (this.onGround && col.slope > 0.72 && !this.crouch && !this.swimming) {
      const e = 5;
      const gx = (world.heightAt(p.x + e, p.z) - world.heightAt(p.x - e, p.z)) / (2 * e);
      const gz = (world.heightAt(p.x, p.z + e) - world.heightAt(p.x, p.z - e)) / (2 * e);
      v.x -= gx * dt * 22;
      v.z -= gz * dt * 22;
    }

    p.x += v.x * dt;
    p.z += v.z * dt;
    p.y += v.y * dt;

    // ── ground contact ──
    const g2 = world.heightAt(p.x, p.z);
    const w2 = world.waterAt(p.x, p.z, g2);
    const floorY = g2;
    if (p.y <= floorY + 0.001) {
      if (!this.onGround && v.y < -12) {
        const dmg = (-v.y - 12) * 2.6;
        if (dmg > 1) this.damage(dmg, 'fall');
        this.emit('land', { impact: -v.y });
      }
      p.y = floorY;
      v.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
    this.groundY = g2;
    this.waterY = w2 === null ? null : w2;

    // world bounds for finite worlds
    if (!world.inBounds(p.x, p.z)) {
      const lim = world.sizeMeters * 0.5 - 60;
      p.x = clamp(p.x, -lim, lim);
      p.z = clamp(p.z, -lim, lim);
    }

    // ── speed bookkeeping, footsteps ──
    this.speed = Math.hypot(v.x, v.z);
    this.state = this.swimming ? 'swim' : !this.onGround ? (this.gliding ? 'glide' : v.y > 0.5 ? 'jump' : 'fall')
      : this.sliding ? 'slide' : this.crouch ? 'crouch' : this.sprinting ? 'sprint' : this.speed > 0.4 ? 'walk' : 'idle';

    if (this.onGround && this.speed > 0.6) {
      this.stepPhase += this.speed * dt * 1.35;
      if (this.stepPhase - this.lastFoot > 1) {
        this.lastFoot = this.stepPhase;
        this.emit('footstep', {
          x: p.x, y: g2, z: p.z, yaw: this.yaw,
          kind: this.surface.snow > 0.5 ? 'snow' : this.surface.mud > 0.4 ? 'mud' : col.humid < 0.3 ? 'sand' : 'dirt',
          loud: this.sprinting ? 1.4 : 1,
        });
      }
    }

    // ── stamina ──
    const drain = this.sprinting ? 9 : this.sliding ? 7 : this.blocking ? 2.5 : this.swimming ? 2 : 0;
    const regen = (env && env.staminaRegen ? env.staminaRegen : 1) * (this.onGround ? 12 : 6) * (this.hunger < 20 ? 0.5 : 1);
    this.stamina = clamp(this.stamina + (drain > 0 ? -drain * dt : regen * dt), 0, 100);

    // ── attacks ──
    if (this.attackT > 0) this.attackT -= dt;
    if (this.parryT > 0) this.parryT -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;

    // ── model ──
    this.model.position.set(p.x, p.y, p.z);
    this.model.rotation.y = this.yaw;
    animatePlayer(this.model, dt, {
      speed: this.speed, sprint: this.sprinting, crouch: this.crouch, swim: this.swimming,
      climb: this.climbing, glide: this.gliding, attack: this.attackT > 0 ? Math.min(1, this.attackT * 4) : 0,
      block: this.blocking, lookPitch: this.pitch * 0.4, lookYaw: 0,
    });
  }

  damage(amount, source) {
    if (this.dead || this.parryT > 0) return 0;
    const armour = this.armour || 0;
    const dealt = Math.max(1, amount * (1 - armour * 0.012));
    this.health = Math.max(0, this.health - dealt);
    this.hurtT = 0.45;
    this.emit('hurt', { amount: dealt, source });
    if (this.health <= 0) { this.dead = true; this.emit('death'); }
    return dealt;
  }

  heal(amount) { this.health = Math.min(100, this.health + amount); }
  eat(amount) { this.hunger = Math.min(100, this.hunger + amount); }
  warm(amount) { this.warmth = clamp(this.warmth + amount, 0, 100); }

  /** Slow survival tick, called once a second. */
  survivalTick(env) {
    const rate = env ? env.hungerRate : 1;
    this.hunger = Math.max(0, this.hunger - 0.16 * rate * (this.sprinting ? 1.8 : 1));
    const col = this.world.columnAt(this.pos.x, this.pos.z);
    const comfort = col.temp > -4 && col.temp < 32 ? 1 : 0;
    const coldRate = (env ? env.coldRate : 1) * (comfort ? 0 : 1) * (col.temp < -4 ? Math.min(3, (-col.temp) / 8) : 0);
    this.warmth = clamp(this.warmth - coldRate * 0.5 + (comfort ? 0.6 : 0), 0, 100);
    if (this.hunger <= 0) this.damage(0.6, 'starvation');
    if (this.warmth <= 0) this.damage(0.9, 'cold');
    if (this.hunger > 70 && this.warmth > 40 && this.health < 100) this.heal(0.35);
  }

  serialize() {
    return {
      pos: [this.pos.x, this.pos.y, this.pos.z], yaw: this.yaw, pitch: this.pitch,
      health: this.health, stamina: this.stamina, hunger: this.hunger, warmth: this.warmth,
      look: this.model.userData.look, dead: this.dead,
    };
  }
  restore(s) {
    if (!s) return;
    this.pos.set(s.pos[0], s.pos[1], s.pos[2]);
    this.yaw = s.yaw; this.pitch = s.pitch;
    this.health = s.health; this.stamina = s.stamina; this.hunger = s.hunger; this.warmth = s.warmth;
    this.dead = !!s.dead;
  }
}

export { EYE, HEIGHT };
export default Player;
