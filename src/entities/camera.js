/**
 * WANDERER — Camera rig
 * ---------------------
 * Third-person orbit with terrain collision, first-person mode, zoom, shake
 * and a slow cinematic drift used behind the menus.
 */

import * as THREE from '../three.js';
import { clamp } from '../core/noise.js';

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.mode = 'third';            // 'third' | 'first'
    this.distance = 4.6;
    this.minDistance = 0.9;
    this.maxDistance = 11;
    this.height = 0.35;
    this.fov = 72;
    this.sensitivity = 1;
    this.shake = 0;
    this.shakeDecay = 3.2;
    this.smoothing = 14;
    this.bob = 0;
    this._pos = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this.offset = new THREE.Vector3(0, 0, 0);
    this.cinematic = false;
    this.cineT = 0;
    this.firstPersonOffset = 0.0;
    camera.rotation.order = 'YXZ';
  }

  addShake(amount) { this.shake = Math.min(1.6, this.shake + amount); }

  zoom(delta) {
    if (this.mode === 'first') {
      this.fov = clamp(this.fov - delta * 3, 34, 100);
    } else {
      this.distance = clamp(this.distance + delta * 0.7, this.minDistance, this.maxDistance);
    }
    this.camera.fov = this.fov + (this.mode === 'first' ? 0 : (this.distance - 4.6) * 0.6);
    this.camera.updateProjectionMatrix();
  }

  toggleMode() {
    this.mode = this.mode === 'third' ? 'first' : 'third';
    return this.mode;
  }

  update(dt, player, input) {
    const cam = this.camera;
    const md = input ? input.takeMouseDelta() : { dx: 0, dy: 0, wheel: 0 };
    if (input && md.wheel) this.zoom(md.wheel);

    if (this.cinematic) { this._cinematic(dt); return; }

    const eye = player.eye.clone();
    const yaw = player.yaw, pitch = player.pitch;

    // head bob
    this.bob += dt * player.speed * 1.5;
    const bobAmt = this.mode === 'third' ? 0.02 : 0.045;
    const bobY = Math.sin(this.bob * 2) * bobAmt * Math.min(1, player.speed / 5);
    const bobX = Math.cos(this.bob) * bobAmt * 0.6 * Math.min(1, player.speed / 5);

    if (this.mode === 'first') {
      cam.position.copy(eye);
      cam.position.y += bobY;
      cam.rotation.set(pitch, yaw, bobX * 0.25);
      this._pos.copy(cam.position);
    } else {
      this._target.copy(eye).add(new THREE.Vector3(0, this.height, 0));
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      this._dir.set(Math.sin(yaw) * cp, -sp + 0.12, Math.cos(yaw) * cp);
      let dist = this.distance;
      // terrain collision: walk the ray and stop before we clip a hillside
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        const t = dist * (i / steps);
        const px = this._target.x + this._dir.x * t;
        const py = this._target.y + this._dir.y * t;
        const pz = this._target.z + this._dir.z * t;
        const g = this.world.heightAt(px, pz) + 0.35;
        if (py < g) { dist = Math.max(this.minDistance, t - dist / steps); break; }
      }
      this._desired.set(
        this._target.x + this._dir.x * dist,
        this._target.y + this._dir.y * dist,
        this._target.z + this._dir.z * dist,
      );
      const k = Math.min(1, this.smoothing * dt);
      this._pos.lerp(this._desired, k);
      // never let the camera go under the ground
      const gy = this.world.heightAt(this._pos.x, this._pos.z) + 0.45;
      if (this._pos.y < gy) this._pos.y = gy;
      cam.position.copy(this._pos).add(new THREE.Vector3(bobX * 0.3, bobY * 0.6, 0));
      cam.rotation.set(pitch, yaw, 0);
    }

    // shake
    if (this.shake > 0.001) {
      this.shake = Math.max(0, this.shake - this.shakeDecay * dt * this.shake);
      const s = this.shake * 0.06;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
      cam.rotation.z += (Math.random() - 0.5) * s * 0.4;
    } else if (cam.rotation.z !== 0 && this.mode === 'third') cam.rotation.z = 0;

    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov += (this.fov - cam.fov) * Math.min(1, dt * 8);
      cam.updateProjectionMatrix();
    }
  }

  /** Slow orbit used behind the main menu / world creation preview. */
  _cinematic(dt) {
    this.cineT += dt * 0.045;
    const cam = this.camera;
    const r = this.cineRadius || 90;
    const cx = this.cineCenter ? this.cineCenter.x : 0;
    const cz = this.cineCenter ? this.cineCenter.z : 0;
    cam.position.set(
      cx + Math.cos(this.cineT) * r,
      (this.cineHeight || 40) + Math.sin(this.cineT * 0.7) * 6,
      cz + Math.sin(this.cineT) * r,
    );
    cam.lookAt(cx, (this.cineHeight || 40) - 18, cz);
    this._pos.copy(cam.position);
  }

  setCinematic(center, radius, height) {
    this.cinematic = true;
    this.cineCenter = center;
    this.cineRadius = radius;
    this.cineHeight = height;
  }
  endCinematic() { this.cinematic = false; }

  /** Screen-space ray for picking (interaction, building preview). */
  raycaster(ndcX = 0, ndcY = 0) {
    const rc = new THREE.Raycaster();
    rc.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    return rc;
  }
}

export default CameraRig;
