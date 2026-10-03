/**
 * WANDERER — Crafting
 * -------------------
 * Multi-tier crafting gated by *stations* and *knowledge*, not by level.
 * Recipes are discovered by finding blueprints, talking to people, exploring
 * ruins — or by experimenting at a bench and getting lucky.
 */

import { itemById, rollWeapon, WEAPON_MATERIALS } from './items.js';

export const STATIONS = {
  none:      { id: 'none',      name: 'Hands',        desc: 'Anything, anywhere.' },
  campfire:  { id: 'campfire',  name: 'Campfire',     desc: 'Cooking and simple work.' },
  workbench: { id: 'workbench', name: 'Workbench',    desc: 'Tools, parts and building supplies.' },
  forge:     { id: 'forge',     name: 'Forge',        desc: 'Smelt ore, work metal.' },
  anvil:     { id: 'anvil',     name: 'Anvil',        desc: 'Weapons and armour.' },
  kiln:      { id: 'kiln',      name: 'Kiln',         desc: 'Brick, glass and mortar.' },
  loom:      { id: 'loom',      name: 'Loom',         desc: 'Cloth, rope and clothing.' },
  alchemy:   { id: 'alchemy',   name: 'Alchemy Table',desc: 'Tonics, poisons and draughts.' },
  resonance: { id: 'resonance', name: 'Resonance Bench', desc: 'Attune crystal to metal. Advanced work.' },
};

/** [id, name, station, tier, ingredients, output, category, hint] */
const R = [
  // ── survival basics ──
  ['torch', 'Torch', 'none', 1, [['wood', 1], ['fiber', 1]], ['torch', 2], 'light', 'Stick, fibre, fire.'],
  ['campfire', 'Campfire', 'none', 1, [['stone', 6], ['wood', 4]], ['place:campfire', 1], 'station', 'Cook, warm up, keep the dark away.'],
  ['bandage', 'Bandage', 'none', 1, [['cloth', 1], ['fiber', 2]], ['bandage', 2], 'medical', ''],
  ['rope', 'Rope', 'none', 1, [['fiber', 4]], ['rope', 1], 'material', ''],
  ['stone_knife', 'Stone Knife', 'none', 1, [['stone', 2], ['fiber', 1]], ['wpn:dagger:stone', 1], 'weapon', ''],
  ['wooden_club', 'Wooden Club', 'none', 1, [['wood', 4]], ['wpn:hammer:wood', 1], 'weapon', ''],
  ['wooden_spear', 'Wooden Spear', 'none', 1, [['wood', 3], ['fiber', 1]], ['wpn:spear:wood', 1], 'weapon', ''],
  ['hide_wrap', 'Hide Wrapping', 'none', 1, [['leather', 2]], ['cloth_tunic', 1], 'armor', ''],

  // ── cooking ──
  ['cooked_meat', 'Cook Meat', 'campfire', 1, [['raw_meat', 1]], ['cooked_meat', 1], 'food', ''],
  ['fish_cooked', 'Cook Fish', 'campfire', 1, [['fish_raw', 1]], ['fish_cooked', 1], 'food', ''],
  ['bread', 'Bake Bread', 'campfire', 1, [['flour', 2]], ['bread', 2], 'food', ''],
  ['stew', 'Hunter Stew', 'campfire', 2, [['cooked_meat', 1], ['mushroom', 2], ['herb', 1]], ['stew', 1], 'food', ''],
  ['jerky', 'Dry Jerky', 'campfire', 1, [['raw_meat', 2], ['salt_crystal', 1]], ['jerky', 2], 'food', ''],
  ['flour', 'Grind Flour', 'none', 1, [['wheat', 2]], ['flour', 1], 'food', ''],

  // ── workbench ──
  ['workbench', 'Workbench', 'none', 1, [['wood', 10], ['stone', 4]], ['place:workbench', 1], 'station', ''],
  ['plank', 'Mill Planks', 'workbench', 1, [['wood', 2]], ['plank', 4], 'building', ''],
  ['beam', 'Support Beam', 'workbench', 1, [['plank', 3]], ['beam', 1], 'building', ''],
  ['nail', 'Iron Nails', 'workbench', 2, [['iron_ingot', 1]], ['nail', 12], 'building', ''],
  ['axe_wood', 'Wooden Axe', 'workbench', 1, [['wood', 5], ['fiber', 2]], ['axe_wood', 1], 'tool', ''],
  ['axe_stone', 'Stone Axe', 'workbench', 1, [['wood', 3], ['stone', 4], ['fiber', 2]], ['axe_stone', 1], 'tool', ''],
  ['pick_wood', 'Wooden Pick', 'workbench', 1, [['wood', 6], ['fiber', 2]], ['pick_wood', 1], 'tool', ''],
  ['pick_stone', 'Stone Pick', 'workbench', 1, [['wood', 3], ['stone', 5], ['fiber', 2]], ['pick_stone', 1], 'tool', ''],
  ['hammer_stone', 'Stone Maul', 'workbench', 1, [['wood', 4], ['stone', 6]], ['hammer_stone', 1], 'tool', ''],
  ['hoe', 'Hoe', 'workbench', 1, [['wood', 4], ['stone', 2]], ['hoe', 1], 'tool', ''],
  ['fishing_rod', 'Fishing Rod', 'workbench', 1, [['wood', 3], ['rope', 1]], ['fishing_rod', 1], 'tool', ''],
  ['sickle', 'Sickle', 'workbench', 2, [['wood', 2], ['copper_ingot', 1]], ['sickle', 1], 'tool', ''],
  ['watering_can', 'Watering Can', 'workbench', 2, [['copper_ingot', 2]], ['watering_can', 1], 'tool', ''],
  ['bow', 'Hunter Bow', 'workbench', 2, [['wood', 5], ['rope', 1], ['sinew', 1]], ['wpn:bow:wood', 1], 'weapon', ''],
  ['arrow', 'Arrows', 'workbench', 1, [['wood', 1], ['stone', 1], ['fiber', 1]], ['arrow', 12], 'ammo', ''],
  ['ladder', 'Ladder', 'workbench', 1, [['wood', 4], ['rope', 1]], ['place:ladder', 3], 'building', ''],
  ['storage_chest', 'Storage Chest', 'workbench', 1, [['plank', 6], ['nail', 4]], ['place:storage', 1], 'building', ''],
  ['bed', 'Bed', 'workbench', 1, [['plank', 6], ['cloth', 4]], ['place:bed', 1], 'building', ''],

  // ── loom ──
  ['loom', 'Loom', 'none', 1, [['wood', 8], ['rope', 2]], ['place:loom', 1], 'station', ''],
  ['cloth', 'Weave Cloth', 'loom', 1, [['fiber', 6]], ['cloth', 2], 'material', ''],
  ['leather_vest', 'Leather Vest', 'loom', 2, [['leather', 6], ['rope', 2]], ['leather_vest', 1], 'armor', ''],
  ['fur_cloak', 'Fur Cloak', 'loom', 2, [['fur', 5], ['cloth', 2]], ['fur_cloak', 1], 'armor', ''],
  ['boots', 'Traveler Boots', 'loom', 2, [['leather', 4], ['cloth', 1]], ['boots', 1], 'armor', ''],
  ['gloves', 'Work Gloves', 'loom', 1, [['leather', 2]], ['gloves', 1], 'armor', ''],
  ['backpack_big', 'Hauller Pack', 'loom', 2, [['leather', 6], ['rope', 3]], ['backpack_big', 1], 'armor', ''],

  // ── forge / kiln ──
  ['forge', 'Forge', 'none', 2, [['stone', 14], ['clay', 6], ['wood', 6]], ['place:forge', 1], 'station', ''],
  ['kiln', 'Kiln', 'none', 2, [['stone', 16], ['clay', 8]], ['place:kiln', 1], 'station', ''],
  ['copper_ingot', 'Smelt Copper', 'forge', 1, [['copper_ore', 2], ['coal', 1]], ['copper_ingot', 1], 'material', ''],
  ['iron_ingot', 'Smelt Iron', 'forge', 2, [['iron_ore', 2], ['coal', 1]], ['iron_ingot', 1], 'material', ''],
  ['steel_ingot', 'Fold Steel', 'forge', 3, [['iron_ingot', 2], ['coal', 2]], ['steel_ingot', 1], 'material', ''],
  ['silver_ingot', 'Smelt Silver', 'forge', 3, [['silver_ore', 2], ['coal', 1]], ['silver_ingot', 1], 'material', ''],
  ['gold_ingot', 'Smelt Gold', 'forge', 3, [['gold_ore', 2], ['coal', 1]], ['gold_ingot', 1], 'material', ''],
  ['brick', 'Fire Brick', 'kiln', 2, [['clay', 3], ['coal', 1]], ['brick', 4], 'building', ''],
  ['glass_pane', 'Cast Glass', 'kiln', 2, [['sand', 4], ['coal', 1]], ['glass_pane', 2], 'building', ''],
  ['mortar', 'Mix Mortar', 'kiln', 2, [['clay', 2], ['ash', 2], ['sand', 1]], ['mortar', 3], 'building', ''],
  ['lantern', 'Lantern', 'forge', 2, [['iron_ingot', 1], ['glass_pane', 1], ['pine_resin', 2]], ['lantern', 1], 'tool', ''],
  ['compass', 'Compass', 'workbench', 2, [['copper_ingot', 1], ['crystal', 1]], ['compass', 1], 'tool', ''],
  ['spyglass', 'Spyglass', 'workbench', 3, [['copper_ingot', 2], ['glass_pane', 2]], ['spyglass', 1], 'tool', ''],

  // ── anvil: weapons & armour ──
  ['anvil', 'Anvil', 'none', 2, [['iron_ingot', 3], ['wood', 4]], ['place:anvil', 1], 'station', ''],
  ['wpn_sword_copper', 'Copper Sword', 'anvil', 2, [['copper_ingot', 3], ['wood', 2]], ['wpn:sword:copper', 1], 'weapon', ''],
  ['wpn_sword_iron', 'Iron Sword', 'anvil', 2, [['iron_ingot', 3], ['wood', 2], ['leather', 1]], ['wpn:sword:iron', 1], 'weapon', ''],
  ['wpn_axe_iron', 'Iron Axe', 'anvil', 2, [['iron_ingot', 3], ['wood', 3]], ['wpn:axe:iron', 1], 'weapon', ''],
  ['wpn_spear_iron', 'Iron Spear', 'anvil', 2, [['iron_ingot', 2], ['wood', 4]], ['wpn:spear:iron', 1], 'weapon', ''],
  ['wpn_hammer_iron', 'Iron Hammer', 'anvil', 3, [['iron_ingot', 4], ['wood', 3]], ['wpn:hammer:iron', 1], 'weapon', ''],
  ['wpn_dagger_steel', 'Steel Dagger', 'anvil', 3, [['steel_ingot', 2], ['leather', 1]], ['wpn:dagger:steel', 1], 'weapon', ''],
  ['wpn_shield_iron', 'Iron Shield', 'anvil', 3, [['iron_ingot', 4], ['plank', 3]], ['wpn:shield:iron', 1], 'weapon', ''],
  ['wpn_crossbow_steel', 'Steel Crossbow', 'anvil', 4, [['steel_ingot', 3], ['plank', 4], ['rope', 2]], ['wpn:crossbow:steel', 1], 'weapon', ''],
  ['bolt', 'Bolts', 'workbench', 2, [['iron_ingot', 1], ['wood', 2]], ['bolt', 16], 'ammo', ''],
  ['iron_plate', 'Iron Plate', 'anvil', 3, [['iron_ingot', 6], ['leather', 3]], ['iron_plate', 1], 'armor', ''],
  ['iron_helm', 'Iron Helm', 'anvil', 3, [['iron_ingot', 4], ['leather', 1]], ['iron_helm', 1], 'armor', ''],
  ['pick_iron', 'Iron Pick', 'anvil', 2, [['iron_ingot', 3], ['wood', 2]], ['pick_iron', 1], 'tool', ''],
  ['axe_iron', 'Iron Axe (tool)', 'anvil', 2, [['iron_ingot', 3], ['wood', 3]], ['axe_iron', 1], 'tool', ''],
  ['pick_steel', 'Steel Pick', 'anvil', 3, [['steel_ingot', 3], ['wood', 2]], ['pick_steel', 1], 'tool', ''],

  // ── alchemy ──
  ['alchemy', 'Alchemy Table', 'none', 2, [['plank', 6], ['glass_pane', 2], ['clay', 3]], ['place:alchemy', 1], 'station', ''],
  ['potion_minor', 'Minor Tonic', 'alchemy', 2, [['herb', 2], ['mushroom', 1], ['glass_pane', 1]], ['potion_minor', 1], 'consumable', ''],
  ['potion_major', 'Greater Tonic', 'alchemy', 3, [['rare_herb', 2], ['honey', 1], ['glass_pane', 1]], ['potion_major', 1], 'consumable', ''],
  ['stamina_draught', 'Wind Draught', 'alchemy', 2, [['herb', 2], ['fiber', 2], ['glass_pane', 1]], ['stamina_draught', 1], 'consumable', ''],
  ['antidote', 'Antidote', 'alchemy', 2, [['mushroom', 2], ['herb', 1], ['glass_pane', 1]], ['antidote', 1], 'consumable', ''],
  ['warm_tonic', 'Ember Draught', 'alchemy', 2, [['emberstone', 1], ['herb', 1], ['glass_pane', 1]], ['warm_tonic', 1], 'consumable', ''],
  ['ash_cloak', 'Ashweave Cloak', 'alchemy', 3, [['cloth', 3], ['ash', 6], ['sulfur', 1]], ['ash_cloak', 1], 'armor', ''],

  // ── resonance (advanced) ──
  ['resonance_bench', 'Resonance Bench', 'none', 4, [['crystal', 4], ['plank', 8], ['iron_ingot', 2]], ['place:resonance', 1], 'station', ''],
  ['resonant_plate', 'Resonant Plate', 'resonance', 4, [['crystal', 2], ['steel_ingot', 1]], ['resonant_plate', 1], 'building', ''],
  ['wpn_sword_crystal', 'Resonant Blade', 'resonance', 4, [['crystal', 5], ['steel_ingot', 2]], ['wpn:sword:crystal', 1], 'weapon', ''],
  ['wpn_staff_crystal', 'Resonant Staff', 'resonance', 4, [['crystal', 4], ['ancient_wood', 2]], ['wpn:staff:crystal', 1], 'weapon', ''],
  ['wpn_bow_crystal', 'Resonant Bow', 'resonance', 4, [['crystal', 3], ['ancient_wood', 3], ['sinew', 2]], ['wpn:bow:crystal', 1], 'weapon', ''],
  ['attune_weapon', 'Attune Weapon', 'resonance', 4, [['echo_shard', 1], ['crystal', 2]], ['attune', 1], 'special', 'Permanently upgrade the weapon you are holding.'],
];

export const RECIPES = R.map(r => ({
  id: r[0], name: r[1], station: r[2], tier: r[3],
  ingredients: r[4], output: r[5], category: r[6], hint: r[7] || '',
}));

/** Recipes a brand new wanderer already knows. */
export const STARTER_RECIPES = ['torch', 'campfire', 'bandage', 'stone_knife', 'wooden_club', 'wooden_spear', 'rope', 'cooked_meat', 'workbench', 'plank', 'axe_wood', 'pick_wood', 'storage_chest', 'arrow'];

export class Crafting {
  constructor() {
    this.known = new Set(STARTER_RECIPES);
    this.listeners = [];
  }
  onChange(fn) { this.listeners.push(fn); }
  _emit() { for (const f of this.listeners) f(this); }

  knows(id) { return this.known.has(id); }
  discover(id) {
    if (this.known.has(id)) return false;
    this.known.add(id);
    this._emit();
    return true;
  }
  discoverRandom(rng, station, tierMax = 5) {
    const pool = RECIPES.filter(r => !this.known.has(r.id) && r.tier <= tierMax && (!station || r.station === station || r.station === 'none'));
    if (!pool.length) return null;
    const r = pool[rng.int(0, pool.length - 1)];
    this.discover(r.id);
    return r;
  }

  /** Recipes craftable at a station (all known ones for that station). */
  available(station, inventory) {
    return RECIPES.filter(r => this.known.has(r.id) && (station === 'any' || r.station === station || r.station === 'none'))
      .map(r => ({ recipe: r, can: this.canCraft(r, inventory), missing: this.missing(r, inventory) }));
  }

  missing(recipe, inventory) {
    const out = [];
    for (const [id, n] of recipe.ingredients) {
      const have = inventory.countOf(id);
      if (have < n) out.push({ id, need: n, have });
    }
    return out;
  }

  canCraft(recipe, inventory, station) {
    if (station && station !== 'any' && recipe.station !== 'none' && recipe.station !== station) return false;
    return this.missing(recipe, inventory).length === 0;
  }

  /** Craft. `rng` is needed for generated weapon outputs. Returns the result or null. */
  craft(recipeId, inventory, rng, station) {
    const recipe = RECIPES.find(r => r.id === recipeId);
    if (!recipe || !this.known.has(recipe.id)) return null;
    if (!this.canCraft(recipe, inventory, station)) return null;
    inventory.consume(recipe.ingredients);
    const [outId, count] = recipe.output;
    let produced = null;
    if (outId.startsWith('wpn:')) {
      const [, arch, material] = outId.split(':');
      const w = rollWeapon(rng, { arch, material });
      // crafted weapons are clean: no random affixes unless the material is exotic
      if (!['crystal', 'ancient', 'obsidian'].includes(material)) {
        w.name = w.baseName; w.rarity = 'common'; w.effects = {};
        w.desc = (WEAPON_ARCH_DESC[arch] || '') + ' Fresh from the bench.';
        w.value = Math.round(w.value * 0.6);
        w.id = `wpn:${arch}:${material}:common:none:none`;
      }
      for (let i = 0; i < count; i++) inventory.add(w, 1);
      produced = w;
    } else if (outId === 'attune') {
      produced = { attune: true };
    } else if (outId.startsWith('place:')) {
      produced = { placeable: outId.slice(6), count };
    } else {
      inventory.add(outId, count);
      produced = itemById(outId);
    }
    this._emit();
    return produced;
  }

  serialize() { return { known: [...this.known] }; }
  restore(d) { if (d && d.known) { this.known = new Set(d.known); this._emit(); } }
}

const WEAPON_ARCH_DESC = {
  sword: 'Balanced blade.', dagger: 'Fast, short, vicious.', axe: 'Heavy cleave.', spear: 'Long reach.',
  hammer: 'Slow and enormous.', bow: 'Precision at range.', crossbow: 'Flat and hard-hitting.',
  staff: 'Channels resonance.', shield: 'Defence first.',
};

export { WEAPON_ARCH_DESC };
export default Crafting;
