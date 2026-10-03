/**
 * WANDERER — Inventory
 * --------------------
 * One array holds the hotbar then the pack grid, so "slot index" is a single
 * number everywhere (UI, saves, crafting, trading all agree). Stacking,
 * splitting, weight and equipment are all handled here.
 */

import { itemById, CATALOG } from './items.js';

export const HOTBAR = 10;
export const GRID_COLS = 9;
export const GRID_ROWS = 5;
export const EQUIP_SLOTS = ['head', 'chest', 'back', 'hands', 'feet', 'hand', 'off', 'trinket'];

export class Inventory {
  constructor(opts = {}) {
    this.cols = opts.cols || GRID_COLS;
    this.rows = opts.rows || GRID_ROWS;
    this.size = HOTBAR + this.cols * this.rows;
    this.slots = new Array(this.size).fill(null);
    this.equipment = {};
    for (const s of EQUIP_SLOTS) this.equipment[s] = null;
    this.capacity = 60;
    this.selected = 0;
    this.listeners = [];
  }

  onChange(fn) { this.listeners.push(fn); }
  _emit() { for (const f of this.listeners) f(this); }

  /* ── queries ─────────────────────────────────────────────────────── */

  weight() {
    let w = 0;
    for (const s of this.slots) if (s) w += (s.item.weight || 0) * s.count;
    for (const k in this.equipment) if (this.equipment[k]) w += this.equipment[k].item.weight || 0;
    return Math.round(w * 10) / 10;
  }
  overburdened() { return this.weight() > this.capacity; }
  countOf(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.item.id === id) n += s.count;
    return n;
  }
  has(list) { for (const [id, n] of list) if (this.countOf(id) < n) return false; return true; }
  findStack(id) { for (let i = 0; i < this.slots.length; i++) if (this.slots[i] && this.slots[i].item.id === id) return i; return -1; }
  emptySlot() { for (let i = 0; i < this.slots.length; i++) if (!this.slots[i]) return i; return -1; }
  get selected() { return this._selected || 0; }
  set selected(v) { this._selected = ((v % HOTBAR) + HOTBAR) % HOTBAR; }
  held() { return this.slots[this._selected || 0]; }
  all() { return this.slots.filter(Boolean).map(s => s.item); }

  /* ── mutation ────────────────────────────────────────────────────── */

  /** Add an item (definition or generated instance). Returns leftover count. */
  add(itemOrId, count = 1, meta = null) {
    const item = typeof itemOrId === 'string' ? itemById(itemOrId) : itemOrId;
    if (!item) return count;
    let left = count;
    const stackMax = item.stack || 1;
    if (stackMax > 1) {
      for (let i = 0; i < this.size && left > 0; i++) {
        const s = this.slots[i];
        if (s && s.item.id === item.id && s.count < stackMax) {
          const put = Math.min(stackMax - s.count, left);
          s.count += put; left -= put;
        }
      }
    }
    while (left > 0) {
      const i = this.emptySlot();
      if (i < 0) break;
      const put = Math.min(stackMax, left);
      this.slots[i] = { item, count: put, durability: meta && meta.durability !== undefined ? meta.durability : (item.durability || null) };
      left -= put;
    }
    this._emit();
    return left;
  }

  remove(id, count = 1) {
    let left = count;
    for (let i = 0; i < this.size && left > 0; i++) {
      const s = this.slots[i];
      if (!s || s.item.id !== id) continue;
      const take = Math.min(s.count, left);
      s.count -= take; left -= take;
      if (s.count <= 0) this.slots[i] = null;
    }
    this._emit();
    return left === 0;
  }

  consume(list) {
    if (!this.has(list)) return false;
    for (const [id, n] of list) this.remove(id, n);
    return true;
  }

  /** Move/swap between two slot indices (or 'equip:slot'). */
  move(from, to) {
    const a = this._ref(from), b = this._ref(to);
    if (!a || !b) return false;
    const A = a.arr[a.i], B = b.arr[b.i];
    if (A && B && A.item.id === B.item.id && (A.item.stack || 1) > 1) {
      const space = (A.item.stack || 1) - B.count;
      const put = Math.min(space, A.count);
      B.count += put; A.count -= put;
      if (A.count <= 0) a.arr[a.i] = null;
    } else {
      a.arr[a.i] = B; b.arr[b.i] = A;
      // equipment sanity: only allow valid slots
      if (b.arr === this.equipment && A && A.item.slot && A.item.slot !== b.key) {
        a.arr[a.i] = A; b.arr[b.i] = B;
        return false;
      }
    }
    this._emit();
    return true;
  }

  _ref(slot) {
    if (typeof slot === 'string' && slot.startsWith('equip:')) {
      const key = slot.slice(6);
      if (!(key in this.equipment)) return null;
      return { arr: this.equipment, i: key, key };
    }
    const i = slot | 0;
    if (i < 0 || i >= this.size) return null;
    return { arr: this.slots, i, key: null };
  }

  split(from, half = true) {
    const a = this._ref(from);
    if (!a) return false;
    const A = a.arr[a.i];
    if (!A || A.count < 2) return false;
    const take = half ? Math.ceil(A.count / 2) : 1;
    const i = this.emptySlot();
    if (i < 0) return false;
    A.count -= take;
    this.slots[i] = { item: A.item, count: take, durability: A.durability };
    this._emit();
    return true;
  }

  drop(slot, all = true) {
    const a = this._ref(slot);
    if (!a) return null;
    const A = a.arr[a.i];
    if (!A) return null;
    const out = all ? A : { item: A.item, count: 1, durability: A.durability };
    if (all) a.arr[a.i] = null;
    else { A.count--; if (A.count <= 0) a.arr[a.i] = null; }
    this._emit();
    return out;
  }

  /* ── equipment ───────────────────────────────────────────────────── */

  equipFrom(slotIndex) {
    const s = this.slots[slotIndex];
    if (!s || !s.item.slot) return false;
    const key = s.item.slot === 'misc' ? 'trinket' : s.item.slot;
    if (!(key in this.equipment)) return false;
    const prev = this.equipment[key];
    this.equipment[key] = s;
    this.slots[slotIndex] = prev;
    this._emit();
    return true;
  }

  unequip(key) {
    const e = this.equipment[key];
    if (!e) return false;
    const i = this.emptySlot();
    if (i < 0) return false;
    this.slots[i] = e;
    this.equipment[key] = null;
    this._emit();
    return true;
  }

  /** Aggregate stats from everything equipped. */
  stats() {
    const out = { armor: 0, speed: 0, cold: 0, heat: 0, carry: 0, light: 0, gather: 0, dmg: 0, block: 0 };
    for (const k in this.equipment) {
      const e = this.equipment[k];
      if (!e || !e.item.stats) continue;
      for (const s in e.item.stats) out[s] = (out[s] || 0) + e.item.stats[s];
    }
    return out;
  }

  /** Damage the held item's durability; returns true if it broke. */
  wearHeld(amount = 1) {
    const s = this.slots[this._selected || 0];
    if (!s || s.durability == null) return false;
    s.durability -= amount;
    if (s.durability <= 0) { this.slots[this._selected || 0] = null; this._emit(); return true; }
    this._emit();
    return false;
  }

  /* ── organisation ────────────────────────────────────────────────── */

  sort() {
    const CAT_ORDER = ['weapon', 'tool', 'armor', 'consumable', 'food', 'material', 'resource', 'building', 'quest', 'misc'];
    const items = this.slots.filter(Boolean);
    items.sort((a, b) => {
      const ca = CAT_ORDER.indexOf(a.item.cat), cb = CAT_ORDER.indexOf(b.item.cat);
      if (ca !== cb) return ca - cb;
      if (a.item.name !== b.item.name) return a.item.name.localeCompare(b.item.name);
      return b.count - a.count;
    });
    // compact: merge stacks of the same id
    const merged = [];
    for (const s of items) {
      const last = merged[merged.length - 1];
      const max = s.item.stack || 1;
      if (last && last.item.id === s.item.id && last.count < max) {
        const put = Math.min(max - last.count, s.count);
        last.count += put; s.count -= put;
      }
      if (s.count > 0) merged.push(s);
    }
    this.slots = new Array(this.size).fill(null);
    merged.forEach((s, i) => { this.slots[i] = s; });
    this._emit();
  }

  search(q) {
    const t = (q || '').trim().toLowerCase();
    if (!t) return this.slots.map((s, i) => (s ? i : -1)).filter(i => i >= 0);
    const out = [];
    for (let i = 0; i < this.size; i++) {
      const s = this.slots[i];
      if (!s) continue;
      const hay = `${s.item.name} ${s.item.desc} ${s.item.cat} ${(s.item.tags || []).join(' ')}`.toLowerCase();
      if (hay.includes(t)) out.push(i);
    }
    return out;
  }

  categoryOf(slotIndex) {
    const s = this.slots[slotIndex];
    return s ? s.item.cat : null;
  }

  /* ── persistence ─────────────────────────────────────────────────── */

  serialize() {
    return {
      size: this.size,
      slots: this.slots.map(s => s ? packSlot(s) : null),
      equipment: Object.fromEntries(Object.entries(this.equipment).map(([k, v]) => [k, v ? packSlot(v) : null])),
      capacity: this.capacity,
      selected: this._selected || 0,
    };
  }

  restore(data) {
    if (!data) return;
    this.size = data.size || this.size;
    this.slots = new Array(this.size).fill(null);
    (data.slots || []).forEach((s, i) => { if (i < this.size && s) this.slots[i] = unpackSlot(s); });
    this.equipment = {};
    for (const s of EQUIP_SLOTS) this.equipment[s] = null;
    for (const k in (data.equipment || {})) {
      const v = data.equipment[k];
      if (k in this.equipment && v) this.equipment[k] = unpackSlot(v);
    }
    this.capacity = data.capacity || 60;
    this._selected = data.selected || 0;
    this._emit();
  }

  /** Starter kit for a new world. */
  starter(rng, items) {
    this.add('torch', 2);
    this.add('berry', 4);
    this.add('stone', 3);
    this.add('fiber', 4);
    this.add(items.starter, 1);
    this.add('bandage', 1);
    this._selected = 0;
  }
}

function packSlot(s) {
  return {
    id: s.item.id,
    n: s.count,
    d: s.durability == null ? undefined : s.durability,
    inst: s.item.generated ? s.item.id : undefined,
  };
}
function unpackSlot(p) {
  const item = itemById(p.id);
  if (!item) return null;
  return { item, count: p.n || 1, durability: p.d == null ? (item.durability || null) : p.d };
}

export { CATALOG };
export default Inventory;
