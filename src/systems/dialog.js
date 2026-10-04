/**
 * WANDERER — Dialogue, Trade & Quests
 * -----------------------------------
 * Nobody has a scripted speech tree. Lines are assembled from what the NPC
 * knows: their settlement, their trade, the weather, the time of day, the
 * nearest ruin, and the last thing that happened to the player. Trade prices
 * are driven by what the local biome actually produces — a fishing village
 * sells fish cheap and iron dear.
 */

import { Rng } from '../core/rng.js';
import { itemById, allItems, rollWeapon } from './items.js';
import { biomeName } from '../world/biomes.js';
import { personName, npcIdentity } from '../core/names.js';

/* ── line banks ────────────────────────────────────────────────────── */

const GREET = {
  day:   ['Well met.', 'You are a long way from anywhere.', 'Roads have been quiet.', 'You look like you have walked.', 'Careful out there — {danger}.'],
  night: ['You are out late.', 'Get inside if you can. It is not safe after dark.', 'The fires are lit for a reason.', 'Something was howling earlier.'],
  rain:  ['Wet enough for you?', 'Come in out of it.', 'Roof leaks, but it is a roof.'],
  cold:  ['You are blue. Stand by the fire.', 'Cold year. Cold every year now.', 'Wrap up or you will not see morning.'],
};

const ROLE_LINES = {
  farmer:   ['Wheat does well here. Roots do better.', 'Rain when we need it, never when we do not.', 'Buy some flour — it keeps.'],
  fisher:   ['The shoals came in close this week.', 'Salt and nets, that is the whole trade.', 'River is low. Bad for the fish, good for the crossing.'],
  hunter:   ['Tracks north of here. Big ones.', 'I dry the meat, so it carries.', 'Do not go after the white ones alone.'],
  smith:    ['Bring me ore and I will bring you an edge.', 'Steel folds better than it used to.', 'Iron is iron. The temper is the craft.'],
  trader:   ['I carry what sells. Prices move with the road.', 'Everything here came overland. That is why it costs what it costs.', 'Buy in bulk and I will shave a little.'],
  scholar:  ['The stones are older than the village by a long way.', 'I have been mapping the spires. There is a pattern.', 'They built those towers to hold a sound. Ask me why.'],
  guard:    ['Keep your weapon sheathed in the square.', 'We lost two last month to the hollow ones.', 'If you see them at night, run. Do not be brave.'],
  healer:   ['Sit. You are bleeding.', 'Herbs from the wet ground work best.', 'I can bind that, but rest does the rest.'],
  innkeeper:['Room is two coin. Stew is one.', 'Stories are free if you have any.', 'Beds are dry. That is the whole pitch.'],
  chief:    ['This settlement survives because we plan for the worst.', 'We trade fairly. We remember who does not.', 'If you are staying, you work.'],
  drifter:  ['I do not stay anywhere long.', 'Seen a spire? They hum if you put your hand on them.', 'The roads are straighter than they should be.'],
};

const QUEST_KINDS = ['slay', 'fetch', 'scout', 'escort', 'salvage', 'mystery'];

/* ── quests ────────────────────────────────────────────────────────── */

export class Quest {
  constructor(def) {
    Object.assign(this, def);
    this.progress = 0;
    this.state = 'active';
  }
  get done() { return this.progress >= this.goal; }
  advance(n = 1) { this.progress = Math.min(this.goal, this.progress + n); if (this.done) this.state = 'ready'; return this.progress; }
  serialize() { return { id: this.id, kind: this.kind, title: this.title, text: this.text, goal: this.goal, progress: this.progress, state: this.state, reward: this.reward, target: this.target || null, giver: this.giver || null }; }
}

export class QuestBoard {
  constructor(world, rng) {
    this.world = world;
    this.rng = rng || new Rng(world.seed);
    this.active = [];
    this.completed = [];
    this.listeners = [];
  }
  onChange(fn) { this.listeners.push(fn); }

  /** Build a quest out of what is actually near the giver. */
  generate(giver, playerPos, discovery) {
    const rng = this.rng;
    const pois = this.world.poisNear(giver.pos.x, giver.pos.z, 1400).filter(p => p.type !== 'village');
    const kind = rng.pick(QUEST_KINDS);
    const target = pois.length ? rng.pick(pois) : null;
    const dirName = target ? compassWord(target.x - giver.pos.x, target.z - giver.pos.z) : 'north';
    const dist = target ? Math.round(Math.hypot(target.x - giver.pos.x, target.z - giver.pos.z) / 10) * 10 : 400;
    let q;
    switch (kind) {
      case 'slay': {
        const beast = rng.pick(['wolf', 'bear', 'bandit', 'hollow', 'panther', 'ashbeast']);
        q = new Quest({
          id: 'q' + Math.abs(rng.int(1, 999999)), kind, goal: 1 + rng.int(0, 2),
          title: `Cull the ${beastName(beast)}`,
          text: `Something has been coming close to the ${giver.profile.settlement || 'settlement'}. Put down ${'it'} and we will pay.`,
          reward: { coin: 20 + rng.int(0, 40), item: rng.chance(0.4) ? 'potion_minor' : null },
          target: { type: 'kill', creature: beast },
          giver: giver.id,
        });
        break;
      }
      case 'fetch': {
        const want = rng.pick(['iron_ingot', 'crystal', 'fur', 'mushroom', 'wheat', 'copper_ingot', 'herb', 'echo_shard']);
        const n = 3 + rng.int(0, 6);
        q = new Quest({
          id: 'q' + Math.abs(rng.int(1, 999999)), kind, goal: n,
          title: `${n} ${itemById(want) ? itemById(want).name : want}`,
          text: `We are short of ${itemById(want) ? itemById(want).name.toLowerCase() : want}. Bring ${n} and we will settle up.`,
          reward: { coin: 8 * n + rng.int(0, 20), item: rng.chance(0.3) ? 'bandage' : null },
          target: { type: 'fetch', item: want },
          giver: giver.id,
        });
        break;
      }
      case 'scout': {
        q = new Quest({
          id: 'q' + Math.abs(rng.int(1, 999999)), kind, goal: 1,
          title: target ? `Scout the ${target.type}` : 'Chart the country',
          text: target
            ? `There is a ${target.type} about ${dist} m ${dirName} of here. Nobody has been in a season. Go and look, come back and tell me what is there.`
            : `Walk the country to the ${dirName} and mark what you find. The map is worth more than the coin.`,
          reward: { coin: 15 + rng.int(0, 25), item: 'compass' },
          target: target ? { type: 'visit', poi: target.id } : { type: 'distance', metres: 800 },
          giver: giver.id,
        });
        break;
      }
      case 'salvage': {
        q = new Quest({
          id: 'q' + Math.abs(rng.int(1, 999999)), kind, goal: 1,
          title: 'Bring Back What Is Useful',
          text: target ? `There is gear left at the ${target.type} ${dist} m ${dirName}. Planks, iron, anything that is not rotten.`
                       : 'Anything you can carry out of the old places, we will buy.',
          reward: { coin: 25 + rng.int(0, 30) },
          target: target ? { type: 'visit', poi: target.id } : { type: 'fetch', item: 'plank' },
          giver: giver.id,
        });
        break;
      }
      case 'mystery': {
        q = new Quest({
          id: 'q' + Math.abs(rng.int(1, 999999)), kind, goal: 1,
          title: 'A Sound With No Source',
          text: 'There is a place where the stones hum. My grandfather said it was a choir. I say it is wind. Go and find out which of us is a fool.',
          reward: { coin: 30, item: 'echo_shard' },
          target: { type: 'resonance' },
          giver: giver.id,
        });
        break;
      }
      default: {
        q = new Quest({
          id: 'q' + Math.abs(rng.int(1, 999999)), kind: 'escort', goal: 1,
          title: 'Walk With Me',
          text: `I am going as far as the crossroads. Company makes it quicker.`,
          reward: { coin: 18 },
          target: { type: 'distance', metres: 300 },
          giver: giver.id,
        });
      }
    }
    this.active.push(q);
    for (const f of this.listeners) f(q);
    return q;
  }

  /** Called whenever something happens that a quest might care about. */
  notify(evt) {
    const done = [];
    for (const q of this.active) {
      const t = q.target || {};
      if (evt.type === 'kill' && t.type === 'kill' && evt.creature === t.creature) q.advance(1);
      else if (evt.type === 'fetch' && t.type === 'fetch' && evt.item === t.item) q.advance(evt.count || 1);
      else if (evt.type === 'visit' && t.type === 'visit' && evt.poi === t.poi) q.advance(1);
      else if (evt.type === 'distance' && t.type === 'distance') q.advance(evt.metres);
      else if (evt.type === 'resonance' && t.type === 'resonance') q.advance(1);
      if (q.done) done.push(q);
    }
    return done;
  }

  turnIn(questId, inventory, rng) {
    const i = this.active.findIndex(q => q.id === questId);
    if (i < 0) return null;
    const q = this.active[i];
    if (!q.done) return null;
    if (q.target && q.target.type === 'fetch') {
      if (!inventory.remove(q.target.item, q.goal)) return null;
    }
    this.active.splice(i, 1);
    q.state = 'done';
    this.completed.push(q);
    const got = { coin: 0, items: [] };
    if (q.reward.coin) { inventory.add('coin', q.reward.coin); got.coin = q.reward.coin; }
    if (q.reward.item) { inventory.add(q.reward.item, 1); got.items.push(q.reward.item); }
    if (rng && rng.chance(0.18)) { const w = rollWeapon(rng, { luck: 0.3 }); inventory.add(w, 1); got.items.push(w.id); }
    for (const f of this.listeners) f(q);
    return got;
  }

  serialize() { return { active: this.active.map(q => q.serialize()), completed: this.completed.map(q => q.serialize()) }; }
  restore(d) {
    this.active = (d && d.active ? d.active : []).map(s => Object.assign(new Quest(s), s));
    this.completed = (d && d.completed ? d.completed : []).map(s => Object.assign(new Quest(s), s));
  }
}

/* ── dialogue ──────────────────────────────────────────────────────── */

export function compassWord(dx, dz) {
  const a = Math.atan2(dx, -dz) * 180 / Math.PI;
  const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return dirs[Math.round(((a + 360) % 360) / 45) % 8];
}
function beastName(id) {
  return ({ wolf: 'wolves', bear: 'bear', bandit: 'bandits', hollow: 'hollow ones', panther: 'panther', ashbeast: 'ash beast' })[id] || id;
}

export class Dialogue {
  constructor(world) { this.world = world; }

  /** Build the whole conversation for one NPC at one moment. */
  open(npc, ctx) {
    const rng = new Rng((npc.id.charCodeAt(0) * 7919 + Math.floor(ctx.hour)) >>> 0);
    const p = npc.profile;
    const col = this.world.columnAt(npc.pos.x, npc.pos.z, {});
    const biome = biomeName(col.biome);
    const weather = ctx.weather && ctx.weather.name ? ctx.weather.name.toLowerCase() : 'clear';
    const danger = ctx.hostilesNear > 0 ? 'something is close' : 'the hollow ones come at night';

    const bank = ctx.night ? GREET.night : GREET.day;
    const extra = col.temp < 0 ? GREET.cold : (ctx.wet ? GREET.rain : []);
    const greet = rng.pick(bank.length ? bank : GREET.day).replace('{danger}', danger);

    const topics = [];
    topics.push({ id: 'about', label: 'Tell me about this place.', lines: this._about(p, biome, rng) });
    topics.push({ id: 'work', label: `What do you do here?`, lines: this._work(p, rng) });
    if (ctx.threat) topics.push({ id: 'threat', label: 'What is out there?', lines: this._threat(ctx, rng) });
    if (ctx.resonance > 0) topics.push({ id: 'choir', label: 'Have you heard the humming?', lines: this._choir(ctx, rng) });
    topics.push({ id: 'rumour', label: 'Any rumours?', lines: this._rumour(rng, ctx) });
    if (npc.trade) topics.push({ id: 'trade', label: 'Let us trade.', trade: true });
    if (ctx.quests && ctx.quests.length) topics.push({ id: 'quests', label: 'About that work...', quests: ctx.quests });
    topics.push({ id: 'bye', label: 'Goodbye.', lines: ['Safe roads.', 'Come back when it is lighter.', 'Mind the dark.'] });

    return {
      npc: { name: p.name, role: p.role, settlement: p.settlement },
      greeting: greet,
      topics,
      voice: p.voice || 'flat',
    };
  }

  _about(p, biome, rng) {
    return [
      `${p.settlement || 'This place'} sits in the ${biome.toLowerCase()}.`,
      rng.pick([
        'We came here because there was water and the ground was flat. That is the whole story.',
        'Nobody chose this. The road went here, so we did too.',
        'Older than any of us. The stones out back are older than the village.',
        'We keep to ourselves. Mostly because there is nobody else to keep to.',
      ]),
    ];
  }
  _work(p, rng) {
    const bank = ROLE_LINES[p.role] || ROLE_LINES.drifter;
    return [rng.pick(bank), rng.pick(bank)];
  }
  _threat(ctx, rng) {
    const lines = [];
    if (ctx.night) lines.push('After dark they come closer to the fires. Do not go past the last lantern.');
    lines.push(rng.pick([
      'Wolves mostly. Occasionally worse.',
      'There are bandits on the road to the east. They take the carts.',
      'Something has been in the livestock. Not a wolf — the bodies were wrong.',
      'If the stones start humming, walk away from them.',
    ]));
    return lines;
  }
  _choir(ctx, rng) {
    return [
      'So you have heard it too.',
      rng.pick([
        'My grandmother called it the Choir. She said the towers were built to sing back.',
        'It gets louder near the spires. Some people go looking for it and do not come back the same.',
        'Put your hand on a standing stone when it happens. You will feel it in your teeth.',
      ]),
      ctx.resonance > 3 ? 'You have been carrying shards. That is why you can hear it clearly.' : 'Come back when you have heard more.',
    ];
  }
  _rumour(rng, ctx) {
    return [rng.pick([
      'A star came down three nights ago. Somebody is already walking out to it.',
      'A trader went through with iron. Nobody has seen iron that cheap in a season.',
      'The tide went out further than I have ever seen it. Nine times, then it stopped.',
      'They found a room under the old ruin. Sealed from the inside.',
      'There is a herd moving south a week early. Animals know weather before we do.',
      'A woman walked into the village asking about spires. Left the same night.',
    ])];
  }
}

/* ── trade ─────────────────────────────────────────────────────────── */

/**
 * Prices move with place. A settlement's stock comes from what its biome
 * produces; anything else has to be brought in, and that shows in the price.
 */
export class Market {
  constructor(world, rng) { this.world = world; this.rng = rng; }

  stockFor(poi, role) {
    const rng = new Rng((poi.id ? poi.id.length * 131 : 7) + (role || '').length * 17 + this.world.seed);
    const col = this.world.columnAt(poi.x, poi.z, {});
    const local = (col.resources || []).map(r => r[0]);
    const base = ['bread', 'bandage', 'torch', 'rope', 'arrow', 'cooked_meat'];
    const byRole = {
      smith: ['iron_ingot', 'steel_ingot', 'nail', 'pick_iron', 'axe_iron', 'iron_plate'],
      trader: ['plank', 'cloth', 'leather', 'glass_pane', 'brick', 'lantern', 'spyglass'],
      healer: ['bandage', 'herb', 'potion_minor', 'antidote', 'mushroom'],
      hunter: ['leather', 'fur', 'arrow', 'raw_meat', 'jerky', 'sinew'],
      fisher: ['fish_raw', 'clam', 'kelp', 'rope', 'salt_crystal'],
      farmer: ['wheat', 'flour', 'bread', 'root_veg', 'wheat_seed', 'berry'],
      scholar: ['scroll', 'crystal', 'echo_shard', 'compass', 'glass_pane'],
      innkeeper: ['bread', 'stew', 'beer', 'bed_roll'],
    };
    const ids = [...new Set([...base, ...(byRole[role] || []), ...local.filter(id => itemById(id))])];
    const stock = [];
    for (const id of ids) {
      const item = itemById(id);
      if (!item) continue;
      if (rng.float() < 0.28) continue;
      stock.push({ id, count: 1 + rng.int(0, 6), priceMult: local.includes(id) ? 0.65 : 1.35 });
    }
    if (role === 'smith' && rng.chance(0.5)) stock.push({ id: 'wpn', weapon: rollWeapon(rng, { luck: 0.2 }), count: 1, priceMult: 1 });
    return stock;
  }

  price(item, mult, relation = 0) {
    const v = (item.value || 1) * (mult || 1) * (1 - relation * 0.12);
    return Math.max(1, Math.round(v));
  }

  /** What the settlement will pay for the player's goods. */
  buyPrice(item, col) {
    const local = (col.resources || []).map(r => r[0]);
    return this.price(item, local.includes(item.id) ? 0.55 : 0.9);
  }
}

export { QUEST_KINDS, ROLE_LINES };
export default Dialogue;
