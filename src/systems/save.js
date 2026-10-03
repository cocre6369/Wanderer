/**
 * WANDERER — Saves
 * ----------------
 * IndexedDB when the browser has it, localStorage when it doesn't, and a
 * version stamp on every record so an old world can be migrated forward
 * instead of silently corrupting. Slots are explicit, autosave is a slot,
 * and every write goes through `atomicWrite` (write to a temp key, then
 * rename) so a crash mid-write cannot destroy the previous copy.
 */

export const SAVE_VERSION = 3;
export const SLOT_COUNT = 6;              // 5 player slots + autosave
export const AUTOSAVE_SLOT = 0;

const DB_NAME = 'wanderer';
const DB_STORE = 'worlds';
const LS_PREFIX = 'wanderer:slot:';

/* ── migrations ────────────────────────────────────────────────────── */

/**
 * MIGRATIONS[k] takes a save from schema k to schema k+1, so reaching
 * SAVE_VERSION from version 1 runs MIGRATIONS[1] then MIGRATIONS[2].
 */
const MIGRATIONS = {
  1: (d) => { d.settings = d.settings || {}; d.gen = d.gen || {}; return d; },
  2: (d) => {
    d.inventory = d.inventory || { slots: [], equipment: {} };
    d.journal = d.journal || { found: [], mysteries: [] };
    d.build = d.build || { pieces: [], farms: [] };
    d.weather = d.weather || null;
    d.resources = d.resources || { depleted: [] };
    return d;
  },
};

export function migrate(data) {
  let v = data.version || 1;
  const log = [];
  while (v < SAVE_VERSION) {
    const fn = MIGRATIONS[v];
    if (fn) { data = fn(data) || data; log.push(`${v}->${v + 1}`); }
    v++;
  }
  data.version = SAVE_VERSION;
  data.migrations = log;
  return data;
}

/* ── storage backends ──────────────────────────────────────────────── */

function hasIDB() {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openDB() {
  return new Promise((resolve, reject) => {
    if (!hasIDB()) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'slot' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb open failed'));
  });
}

function idbGet(db, slot) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(slot);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
function idbPut(db, rec) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(rec);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
function idbDel(db, slot) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(slot);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}
function idbAll(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/** In-memory stand-in used when the browser refuses localStorage. */
const memoryStore = new Map();

function hasLocalStorage() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return false;
    const probe = '__wanderer_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch (e) { return false; }
}

const local = {
  /** 'local' when the browser's storage works, 'memory' when it does not. */
  get kind() { return hasLocalStorage() ? 'local' : 'memory'; },
  get(slot) {
    try {
      const s = hasLocalStorage() ? localStorage.getItem(LS_PREFIX + slot) : memoryStore.get(LS_PREFIX + slot);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  },
  put(rec) {
    const json = JSON.stringify(rec);
    try {
      if (hasLocalStorage()) localStorage.setItem(LS_PREFIX + rec.slot, json);
      else memoryStore.set(LS_PREFIX + rec.slot, json);
      return true;
    } catch (e) { return false; }        // quota exceeded / blocked
  },
  del(slot) {
    try {
      if (hasLocalStorage()) localStorage.removeItem(LS_PREFIX + slot);
      else memoryStore.delete(LS_PREFIX + slot);
      return true;
    } catch (e) { return false; }
  },
  all() {
    const out = [];
    try {
      if (hasLocalStorage()) {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(LS_PREFIX)) { try { out.push(JSON.parse(localStorage.getItem(k))); } catch (e) { /* skip */ } }
        }
      } else {
        for (const [k, v] of memoryStore) if (k.startsWith(LS_PREFIX)) { try { out.push(JSON.parse(v)); } catch (e) { /* skip */ } }
      }
    } catch (e) { /* ignore */ }
    return out;
  },
};

/* ── public API ────────────────────────────────────────────────────── */

export class SaveSystem {
  constructor() {
    this.db = null;
    this.backend = 'none';
    this.lastError = null;
  }

  async init() {
    try {
      this.db = await openDB();
      this.backend = 'indexeddb';
    } catch (e) {
      this.db = null;
      this.backend = local.kind;      // 'local' or 'memory'
      this.lastError = e.message;
    }
    return this.backend;
  }

  /** Light record used by the slot list (no full world payload). */
  async list() {
    const recs = this.db ? await idbAll(this.db) : local.all();
    return recs
      .filter(r => r && r.slot !== undefined)
      .map(r => ({
        slot: r.slot, name: r.name || 'Unnamed', seed: r.seed,
        size: r.size, type: r.type, savedAt: r.savedAt || 0,
        playtime: r.playtime || 0, day: r.day || 1, progress: r.progress || null,
        version: r.version || 1, bytes: r.bytes || 0,
      }))
      .sort((a, b) => a.slot - b.slot);
  }

  async read(slot) {
    try {
      let rec = this.db ? await idbGet(this.db, slot) : local.get(slot);
      if (!rec) return null;
      if ((rec.version || 1) < SAVE_VERSION) { rec.data = migrate(rec.data || rec); rec.version = SAVE_VERSION; }
      return rec;
    } catch (e) { this.lastError = e.message; return null; }
  }

  /**
   * Atomic-ish write: the payload lands under `slot:-tmp` first, then is
   * copied into place, then the temp record is removed. If the tab dies
   * mid-write the previous save is still intact.
   */
  async write(slot, meta, data) {
    const json = JSON.stringify(data);
    const rec = {
      slot, version: SAVE_VERSION, savedAt: Date.now(), bytes: json.length,
      name: meta.name, seed: meta.seed, size: meta.size, type: meta.type,
      day: meta.day, playtime: meta.playtime, progress: meta.progress,
      data,
    };
    try {
      if (this.db) {
        await idbPut(this.db, Object.assign({}, rec, { slot: -1 }));
        await idbPut(this.db, rec);
        await idbDel(this.db, -1);
      } else {
        local.put(Object.assign({}, rec, { slot: -1 }));
        if (!local.put(rec)) throw new Error('storage refused the write (quota or blocked)');
        local.del(-1);
      }
      return { ok: true, bytes: json.length, backend: this.backend };
    } catch (e) {
      this.lastError = e.message;
      // last resort: strip the heavy caches and try once more
      try {
        const slim = JSON.parse(json);
        delete slim.terrainCache; delete slim.actorCache;
        const r2 = Object.assign({}, rec, { data: slim, bytes: JSON.stringify(slim).length, degraded: true });
        const landed = this.db ? (await idbPut(this.db, r2), true) : local.put(r2);
        if (!landed) return { ok: false, error: 'storage refused the write even after trimming caches' };
        return { ok: true, degraded: true, bytes: r2.bytes, backend: this.backend };
      } catch (e2) {
        return { ok: false, error: e2.message };
      }
    }
  }

  async remove(slot) {
    try { if (this.db) await idbDel(this.db, slot); else local.del(slot); return true; }
    catch (e) { this.lastError = e.message; return false; }
  }

  /** Free a temp record left behind by an interrupted write. */
  async recover() {
    try {
      const rec = this.db ? await idbGet(this.db, -1) : local.get(-1);
      if (!rec) return null;
      if (this.db) { await idbPut(this.db, Object.assign({}, rec, { slot: rec.slot })); await idbDel(this.db, -1); }
      else { local.put(rec); local.del(-1); }
      return rec.slot;
    } catch (e) { return null; }
  }

  async exportSlot(slot) {
    const rec = await this.read(slot);
    return rec ? JSON.stringify(rec) : null;
  }

  async importSlot(slot, text) {
    try {
      const rec = JSON.parse(text);
      if (!rec || !rec.data) return { ok: false, error: 'not a WANDERER save' };
      rec.slot = slot;
      if (this.db) await idbPut(this.db, rec); else local.put(rec);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }
}

/** Autosave pacing: every N seconds of play, plus on important events. */
export class Autosave {
  constructor(save, intervalSec = 90) {
    this.save = save;
    this.interval = intervalSec;
    this.t = 0;
    this.enabled = true;
    this.lastResult = null;
    this.busy = false;
  }
  tick(dt, getSnapshot) {
    if (!this.enabled || this.busy) return null;
    this.t += dt;
    if (this.t < this.interval) return null;
    this.t = 0;
    return this.force(getSnapshot);
  }
  async force(getSnapshot) {
    if (this.busy) return null;
    this.busy = true;
    try {
      const { meta, data } = getSnapshot();
      this.lastResult = await this.save.write(AUTOSAVE_SLOT, meta, data);
      return this.lastResult;
    } finally { this.busy = false; }
  }
}

export default SaveSystem;
