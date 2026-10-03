/**
 * WANDERER — Discovery, Journal & Events
 * --------------------------------------
 * The reward for going somewhere is *knowing* something. Every new biome,
 * creature, ruin and artefact lands in the journal; the mystery layer hangs
 * off specific places in the world (Hollow Spires, Choir Stones) rather than
 * off a quest log; and the tutorial is a queue of contextual nudges that only
 * fire when the situation they describe is actually happening.
 */

import { Rng, hash2 } from '../core/rng.js';

/* ── journal entries ───────────────────────────────────────────────── */

export const JOURNAL_KINDS = {
  biome:    { id: 'biome',    name: 'Places',    icon: 'compass' },
  creature: { id: 'creature', name: 'Bestiary',  icon: 'bone' },
  poi:      { id: 'poi',      name: 'Ruins & Works', icon: 'monolith' },
  item:     { id: 'item',     name: 'Catalogue', icon: 'misc' },
  recipe:   { id: 'recipe',   name: 'Recipes',   icon: 'scroll' },
  mystery:  { id: 'mystery',  name: 'The Choir', icon: 'relic' },
  landmark: { id: 'landmark', name: 'Landmarks', icon: 'statue' },
};

/* ── the mystery layer ─────────────────────────────────────────────── */

export const MYSTERIES = [
  { id: 'first_hum', title: 'A Hum Beneath the Wind', hint: 'Something under the ground keeps time. Follow the feeling, not the sound.', tier: 1 },
  { id: 'choir_stone', title: 'Choir Stones', hint: 'Standing stones in a ring. They answer each other when struck.', tier: 1 },
  { id: 'hollow_spire', title: 'The Hollow Spires', hint: 'Towers with nothing inside. They were built to hold a note.', tier: 2 },
  { id: 'echo_shard', title: 'Echo Shards', hint: 'A fragment of a sound that has not finished. It vibrates near its brothers.', tier: 2 },
  { id: 'the_ninth_tide', title: 'The Ninth Tide', hint: 'Nine tides, then silence. Count them at the shore.', tier: 3 },
  { id: 'attunement', title: 'Attunement', hint: 'Bind a shard to a blade at a Resonance Bench and the blade remembers.', tier: 3 },
  { id: 'old_roads', title: 'The Old Roads', hint: 'Straight lines across country nobody walks any more.', tier: 3 },
  { id: 'the_waking_stone', title: 'The Waking Stone', hint: 'Under the deepest cavern, something is being counted down to.', tier: 4 },
];

/* ── tutorial nudges ───────────────────────────────────────────────── */

export const HINTS = [
  { id: 'move', text: 'WASD to walk. Hold Shift to run — running costs stamina.', cond: s => s.playtime < 8 && !s.moved },
  { id: 'look', text: 'Move the mouse to look. Press Z to switch between third and first person.', cond: s => s.playtime < 15 && !s.looked },
  { id: 'gather', text: 'Walk up to a tree or a rock and press E to harvest it.', cond: s => s.nearResource && s.inventory < 6 },
  { id: 'craft', text: 'Press R to open the bench. Everything you can make is listed there.', cond: s => s.hasWood && !s.openedCrafting },
  { id: 'campfire', text: 'A campfire cooks food, warms you, and keeps most things away.', cond: s => s.night && !s.nearFire },
  { id: 'combat', text: 'Left click for a quick strike, right click for a heavy one. Middle click blocks — time it and you parry.', cond: s => s.enemyNear && !s.fought },
  { id: 'stamina', text: 'Dodging (Q) costs stamina but leaves you untouchable for a moment.', cond: s => s.enemyNear && s.health < 70 },
  { id: 'cold', text: 'You are getting cold. Find shelter, fire, or warmer clothes.', cond: s => s.warmth < 45 },
  { id: 'hunger', text: 'You are hungry. Berries, mushrooms and cooked meat all help.', cond: s => s.hunger < 40 },
  { id: 'map', text: 'Press M for the map. Everything you have walked is drawn there.', cond: s => s.playtime > 40 && !s.openedMap },
  { id: 'build', text: 'Press B to build. Foundations snap to a grid; hold Alt to place freely.', cond: s => s.planks > 4 && !s.built },
  { id: 'journal', text: 'Press J for the journal. New places and creatures are written down automatically.', cond: s => s.discoveries > 3 && !s.openedJournal },
  { id: 'swim', text: 'Deep water means swimming. Watch your breath.', cond: s => s.inWater && s.depth > 1.5 },
  { id: 'climb', text: 'Hold jump against a low ledge to mantle up. Ladders climb on their own.', cond: s => s.atLedge },
  { id: 'night', text: 'Night is coming. Hostile things wake up after dark.', cond: s => s.dusk && !s.nearFire },
];

/* ── random world events ───────────────────────────────────────────── */

export const EVENTS = [
  { id: 'shooting_star', title: 'A Star Falls', text: 'Something bright went down behind the hills, trailing smoke.', weight: 3, cond: s => s.night, effect: 'markMeteor' },
  { id: 'trader', title: 'A Trader on the Road', text: 'A cart has stopped nearby. The driver waves.', weight: 3, cond: s => !s.night, effect: 'spawnTrader' },
  { id: 'hunt', title: 'A Hunt Passes By', text: 'Hounds, then hooves. Somebody important is chasing dinner.', weight: 2, effect: 'spawnHunt' },
  { id: 'aurora', title: 'The Sky Opens', text: 'Green light spills across the north. The air tastes of metal.', weight: 2, cond: s => s.night && s.cold, effect: 'aurora' },
  { id: 'herd', title: 'A Herd Moves Through', text: 'Hundreds of them, all going the same way. Best not to stand in it.', weight: 2, effect: 'spawnHerd' },
  { id: 'whale', title: 'Something Large Surfaces', text: 'A back the size of a house breaks the water, then is gone.', weight: 1, cond: s => s.nearOcean, effect: 'leviathan' },
  { id: 'choir', title: 'The Choir Sings', text: 'Every stone within a mile hums the same note at once.', weight: 1, cond: s => s.nearSpire, effect: 'choir' },
  { id: 'survivor', title: 'Somebody Needs Help', text: 'A voice calling, not far off. It does not sound like it has long.', weight: 2, cond: s => !s.night, effect: 'spawnSurvivor' },
  { id: 'quake', title: 'The Ground Shifts', text: 'A short, sharp tremor. Dust comes off the cliffs.', weight: 1, effect: 'quake' },
  { id: 'bloom', title: 'A Sudden Bloom', text: 'Overnight, flowers everywhere. The air is thick with them.', weight: 2, cond: s => s.warm && !s.night, effect: 'bloom' },
];

/* ── the system ────────────────────────────────────────────────────── */

export class DiscoverySystem {
  constructor(world) {
    this.world = world;
    this.found = { biome: [], creature: [], poi: [], item: [], recipe: [], mystery: [], landmark: [] };
    this.notes = [];
    this.hintsShown = new Set();
    this.hintQueue = [];
    this.hintT = 0;
    this.eventsSeen = [];
    this.mysteryProgress = {};
    this.listeners = [];
    this._eventT = 240;
    this.lastEvent = null;
    this.discoveryCount = 0;
    this.resonance = 0;               // accumulated attunement, unlocks the deep layer
  }

  onChange(fn) { this.listeners.push(fn); }
  _emit(e) { for (const f of this.listeners) f(e); }

  /** Record a discovery. Returns the entry if it was new. */
  record(kind, id, detail) {
    if (!this.found[kind]) this.found[kind] = [];
    if (this.found[kind].includes(id)) return null;
    this.found[kind].push(id);
    this.discoveryCount++;
    const entry = { kind, id, detail: detail || null, at: Date.now() };
    this.notes.unshift(entry);
    if (this.notes.length > 200) this.notes.pop();
    this._emit(entry);
    return entry;
  }

  has(kind, id) { return this.found[kind] ? this.found[kind].includes(id) : false; }
  count(kind) { return this.found[kind] ? this.found[kind].length : 0; }
  total() { return Object.values(this.found).reduce((s, a) => s + a.length, 0); }

  /* ── mysteries ───────────────────────────────────────────────────── */

  advanceMystery(id, amount = 1, note) {
    const m = MYSTERIES.find(x => x.id === id);
    this.mysteryProgress[id] = (this.mysteryProgress[id] || 0) + amount;
    if (m && this.mysteryProgress[id] >= m.tier * 2) this.record('mystery', id, { title: m.title, hint: m.hint });
    this.resonance += amount;
    if (note) this.notes.unshift({ kind: 'mystery', id, detail: { note }, at: Date.now() });
    this._emit({ kind: 'mystery', id });
    return this.mysteryProgress[id];
  }

  mysteriesAvailable() {
    return MYSTERIES.filter(m => m.tier <= 1 + Math.floor(this.resonance / 4));
  }

  /* ── hints ───────────────────────────────────────────────────────── */

  update(dt, state) {
    this.hintT -= dt;
    this._eventT -= dt;
    if (this._eventT <= 0) {
      this._eventT = 420 + Math.random() * 900;
      const ev = this.rollEvent(state);
      if (ev) { this.lastEvent = { ...ev, at: Date.now() }; this._emit({ kind: 'event', id: ev.id, event: ev }); }
    }
    if (this.hintT > 0) return null;
    for (const h of HINTS) {
      if (this.hintsShown.has(h.id)) continue;
      if (!h.cond(state)) continue;
      this.hintsShown.add(h.id);
      this.hintT = 26;
      return h;
    }
    return null;
  }

  rollEvent(state) {
    const pool = EVENTS.filter(e => !e.cond || e.cond(state));
    if (!pool.length) return null;
    let total = 0; for (const e of pool) total += e.weight;
    let r = Math.random() * total;
    for (const e of pool) { r -= e.weight; if (r <= 0) return e; }
    return pool[0];
  }

  /** Deterministic: which event would fire in this world on this day? */
  scheduledEvent(day, seed) {
    const h = hash2(day, seed || this.world.seed, 4242) / 4294967296;
    return EVENTS[Math.floor(h * EVENTS.length)];
  }

  /* ── persistence ─────────────────────────────────────────────────── */

  serialize() {
    return {
      found: this.found,
      notes: this.notes.slice(0, 60),
      hintsShown: [...this.hintsShown],
      mysteryProgress: this.mysteryProgress,
      resonance: this.resonance,
      eventsSeen: this.eventsSeen.slice(0, 30),
      discoveryCount: this.discoveryCount,
    };
  }

  restore(d) {
    if (!d) return;
    this.found = Object.assign({ biome: [], creature: [], poi: [], item: [], recipe: [], mystery: [], landmark: [] }, d.found || {});
    this.notes = d.notes || [];
    this.hintsShown = new Set(d.hintsShown || []);
    this.mysteryProgress = d.mysteryProgress || {};
    this.resonance = d.resonance || 0;
    this.eventsSeen = d.eventsSeen || [];
    this.discoveryCount = d.discoveryCount || 0;
  }
}

export default DiscoverySystem;
