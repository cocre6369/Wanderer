/**
 * WANDERER — Input
 * ----------------
 * Keyboard + mouse state with rebinding, pointer lock and a small action
 * layer so gameplay code never talks about key codes directly.
 */

export const DEFAULT_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  crouch: ['KeyC', 'ControlLeft'],
  slide: ['KeyX'],
  glide: ['KeyG'],
  interact: ['KeyE'],
  attack: ['Mouse0'],
  heavy: ['Mouse2'],
  block: ['Mouse1'],
  dodge: ['KeyQ'],
  inventory: ['KeyI', 'Tab'],
  crafting: ['KeyR'],
  map: ['KeyM'],
  journal: ['KeyJ'],
  character: ['KeyK'],
  settings: ['Escape'],
  build: ['KeyB'],
  drop: ['KeyV'],
  torch: ['KeyT'],
  sit: ['KeyF'],
  photo: ['KeyP'],
  view: ['KeyZ'],
  slot1: ['Digit1'], slot2: ['Digit2'], slot3: ['Digit3'], slot4: ['Digit4'],
  slot5: ['Digit5'], slot6: ['Digit6'], slot7: ['Digit7'], slot8: ['Digit8'],
  slot9: ['Digit9'], slot0: ['Digit0'],
  zoom: ['MouseWheel'],
};

export class Input {
  /**
   * domElement — the canvas that receives mouse + pointer lock.
   * globals    — optional { window, document } so the controller can be
   *              driven headlessly (tests, replays, server-side validation).
   */
  constructor(domElement, globals = {}) {
    this.el = domElement;
    this.win = globals.window || (typeof window !== 'undefined' ? window : null);
    this.doc = globals.document || (typeof document !== 'undefined' ? document : null);
    this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { x: 0, y: 0, dx: 0, dy: 0, wheel: 0 };
    this.locked = false;
    this.enabled = true;
    this.sensitivity = 1;
    this.invertY = false;
    this._bind();
  }

  _bind() {
    if (!this.win || !this.doc) return;           // headless: state is driven directly
    const window = this.win, document = this.doc;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (!this.enabled && e.code !== 'Escape') return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => { this.down.clear(); });
    this.el.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this.down.add('Mouse' + e.button);
      this.pressed.add('Mouse' + e.button);
    });
    window.addEventListener('mouseup', (e) => {
      this.down.delete('Mouse' + e.button);
      this.released.add('Mouse' + e.button);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX * this.sensitivity;
      this.mouse.dy += e.movementY * this.sensitivity * (this.invertY ? -1 : 1);
    });
    this.el.addEventListener('wheel', (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
    });
    window.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
  }

  requestLock() { if (this.el && this.el.requestPointerLock) this.el.requestPointerLock(); }
  releaseLock() { if (this.doc && this.doc.pointerLockElement) this.doc.exitPointerLock(); }

  /** Headless / replay hook: assert a raw code is held this frame. */
  setCode(code, isDown) {
    if (isDown) { if (!this.down.has(code)) { this.down.add(code); this.pressed.add(code); } }
    else if (this.down.delete(code)) this.released.add(code);
  }
  /** Headless / replay hook: assert an action directly (bypasses bindings). */
  setAction(action, isDown) {
    const b = this.bindings[action];
    if (b && b[0]) this.setCode(b[0], isDown);
  }
  addMouseDelta(dx, dy) { this.mouse.dx += dx; this.mouse.dy += dy; }

  isDown(action) {
    const b = this.bindings[action];
    if (!b) return false;
    for (const k of b) if (this.down.has(k)) return true;
    return false;
  }
  wasPressed(action) {
    const b = this.bindings[action];
    if (!b) return false;
    for (const k of b) if (this.pressed.has(k)) return true;
    return false;
  }
  wasReleased(action) {
    const b = this.bindings[action];
    if (!b) return false;
    for (const k of b) if (this.released.has(k)) return true;
    return false;
  }
  /** Movement axis: {x: strafe, y: forward} normalised. */
  axis() {
    let x = 0, y = 0;
    if (this.isDown('forward')) y += 1;
    if (this.isDown('back')) y -= 1;
    if (this.isDown('right')) x += 1;
    if (this.isDown('left')) x -= 1;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  takeMouseDelta() {
    const d = { dx: this.mouse.dx, dy: this.mouse.dy, wheel: this.mouse.wheel };
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    return d;
  }
  endFrame() { this.pressed.clear(); this.released.clear(); }
  rebind(action, code) { this.bindings[action] = [code]; }
  resetBindings() { this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)); }
  serialize() { return JSON.parse(JSON.stringify(this.bindings)); }
  load(map) { if (map) this.bindings = Object.assign(JSON.parse(JSON.stringify(DEFAULT_BINDINGS)), map); }
}

export default Input;
