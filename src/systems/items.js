/**
 * WANDERER — Items
 * ----------------
 * A handcrafted catalogue (resources, food, tools, armour, building parts,
 * quest objects) on top of which sits a procedural layer: any weapon can be
 * rolled with a material, a prefix and an affix, so "Frost-Touched Hunter Bow
 * of the Old Choir" is a real object with real effects, not just a label.
 *
 * Rarity colours progression but never gates it — a stone axe stays useful
 * forever because it is cheap to replace, not because it is weak.
 */

export const RARITY = {
  common:    { id: 'common',    name: 'Common',    color: '#c8c8c8', mult: 1.0,  affixes: 0 },
  uncommon:  { id: 'uncommon',  name: 'Uncommon',  color: '#5fbf5f', mult: 1.12, affixes: 1 },
  rare:      { id: 'rare',      name: 'Rare',      color: '#4f9fe0', mult: 1.28, affixes: 2 },
  epic:      { id: 'epic',      name: 'Epic',      color: '#a865d8', mult: 1.5,  affixes: 3 },
  legendary: { id: 'legendary', name: 'Legendary', color: '#e0a03c', mult: 1.8,  affixes: 4 },
  mythic:    { id: 'mythic',    name: 'Mythic',    color: '#e05a4a', mult: 2.2,  affixes: 5 },
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

export const CATEGORIES = {
  weapon: 'Weapons', tool: 'Tools', armor: 'Armor', food: 'Food', material: 'Materials',
  building: 'Building', resource: 'Resources', consumable: 'Consumables', quest: 'Quest Items', misc: 'Miscellaneous',
};

/** shape, colour set and stats come from these tables */
const W = {
  // materials: [name, dmg mult, speed mult, durability, value, rarity bias]
  wood:    { name: 'Wooden',    dmg: 0.72, spd: 1.10, dur: 60,  val: 0.5, tint: '#8a6a45' },
  stone:   { name: 'Stone',     dmg: 0.86, spd: 0.95, dur: 90,  val: 0.7, tint: '#8b8779' },
  copper:  { name: 'Copper',    dmg: 1.00, spd: 1.00, dur: 140, val: 1.4, tint: '#b07a48' },
  iron:    { name: 'Iron',      dmg: 1.16, spd: 0.96, dur: 220, val: 2.2, tint: '#9aa0a6' },
  silver:  { name: 'Silver',    dmg: 1.24, spd: 1.06, dur: 200, val: 3.4, tint: '#d0d8e0' },
  steel:   { name: 'Steel',     dmg: 1.40, spd: 0.98, dur: 320, val: 4.6, tint: '#c4ccd4' },
  gold:    { name: 'Gilded',    dmg: 1.10, spd: 1.02, dur: 160, val: 6.5, tint: '#e0b84a' },
  obsidian:{ name: 'Obsidian',  dmg: 1.62, spd: 0.88, dur: 260, val: 6.0, tint: '#3a3340' },
  crystal: { name: 'Resonant',  dmg: 1.48, spd: 1.12, dur: 300, val: 8.0, tint: '#8fd8e8' },
  ancient: { name: 'Ancient',   dmg: 1.72, spd: 1.05, dur: 420, val: 10,  tint: '#c8bc98' },
};
export const WEAPON_MATERIALS = W;

/** Weapon archetypes — each plays differently, none is a strict upgrade. */
const ARCH = {
  sword:   { name: 'Sword',   dmg: 16, spd: 1.00, reach: 2.3, stam: 9,  icon: 'sword',  desc: 'Balanced. Reliable combo finisher.' },
  longsword:{ name: 'Longsword', dmg: 21, spd: 0.82, reach: 2.7, stam: 13, icon: 'sword', desc: 'Long arc, punishing whiffs.' },
  dagger:  { name: 'Dagger',  dmg: 9,  spd: 1.85, reach: 1.5, stam: 5,  icon: 'dagger', desc: 'Very fast. Backstabs deal triple damage.' },
  axe:     { name: 'Axe',     dmg: 23, spd: 0.86, reach: 2.2, stam: 14, icon: 'axe',    desc: 'Heavy cleave. Also fells trees.' },
  spear:   { name: 'Spear',   dmg: 15, spd: 1.05, reach: 3.6, stam: 8,  icon: 'spear',  desc: 'Outreaches everything. Thrust combos.' },
  hammer:  { name: 'Hammer',  dmg: 34, spd: 0.55, reach: 2.1, stam: 20, icon: 'hammer', desc: 'Slow, staggering. Breaks guards and stone.' },
  bow:     { name: 'Bow',     dmg: 19, spd: 0.9,  reach: 60,  stam: 10, icon: 'bow',    desc: 'Rewards precision. Charged shots penetrate.' , ranged: 'arrow'},
  crossbow:{ name: 'Crossbow',dmg: 27, spd: 0.5,  reach: 55,  stam: 8,  icon: 'crossbow', desc: 'Slow reload, flat trajectory, high damage.', ranged: 'bolt' },
  staff:   { name: 'Staff',   dmg: 11, spd: 1.1,  reach: 2.8, stam: 7,  icon: 'staff',  desc: 'Channels resonance. Weak alone, potent attuned.' },
  shield:  { name: 'Shield',  dmg: 7,  spd: 0.9,  reach: 1.6, stam: 6,  icon: 'shield', desc: 'Blocks. A well timed block parries.', shield: true },
  thrown:  { name: 'Javelin', dmg: 20, spd: 0.8,  reach: 30,  stam: 12, icon: 'spear',  desc: 'Throw it. You will want a spare.', ranged: 'javelin' },
};
export const WEAPON_ARCHETYPES = ARCH;

const PREFIX = [
  { id: 'rustbound', name: 'Rustbound', effect: { bleed: 3 }, desc: 'Hits leave a bleeding wound.' },
  { id: 'frost', name: 'Frost-Touched', effect: { slow: 0.4 }, desc: 'Chills what it strikes.' },
  { id: 'ember', name: 'Emberforged', effect: { burn: 4 }, desc: 'Sets targets alight.' },
  { id: 'hollow', name: 'Hollow', effect: { drain: 3 }, desc: 'Steals health on hit.' },
  { id: 'sunbleached', name: 'Sunbleached', effect: { daylight: 0.35 }, desc: 'Stronger in daylight.' },
  { id: 'thorn', name: 'Thornwrapped', effect: { thorns: 5 }, desc: 'Reflects damage when blocking.' },
  { id: 'tide', name: 'Tideborn', effect: { wet: 0.4 }, desc: 'Faster in water and rain.' },
  { id: 'ashen', name: 'Ashen', effect: { ash: 1 }, desc: 'Blinds briefly on heavy hits.' },
  { id: 'gilded', name: 'Gilded', effect: { value: 2.2 }, desc: 'Worth far more to traders.' },
  { id: 'whisper', name: 'Whispering', effect: { quiet: 1 }, desc: 'Attacks make no noise.' },
  { id: 'stormcut', name: 'Stormcut', effect: { chain: 6 }, desc: 'Arcs to a second target in rain.' },
  { id: 'rootbound', name: 'Rootbound', effect: { stamina: 0.75 }, desc: 'Costs less stamina.' },
  { id: 'glass', name: 'Glassheart', effect: { crit: 0.18 }, desc: 'High critical chance, fragile.' },
  { id: 'ninth', name: 'Ninth', effect: { resonance: 1 }, desc: 'Hums near Hollow Spires.' },
];
const SUFFIX = [
  { id: 'tide', name: 'of the Ninth Tide', effect: { discovery: 1 }, desc: 'Reveals more of the map.' },
  { id: 'water', name: 'of Quiet Water', effect: { swim: 0.4 }, desc: 'Swim faster.' },
  { id: 'choir', name: 'of the Old Choir', effect: { resonance: 2 }, desc: 'Resonance gains doubled.' },
  { id: 'vows', name: 'of Broken Vows', effect: { dmg: 0.12 }, desc: '+12% damage.' },
  { id: 'dark', name: 'of the Long Dark', effect: { nightvision: 1 }, desc: 'See further at night.' },
  { id: 'salt', name: 'of Salt and Ash', effect: { cold: 0.5 }, desc: 'Resists cold.' },
  { id: 'stone', name: 'of the Waking Stone', effect: { stagger: 0.3 }, desc: 'More likely to stagger.' },
  { id: 'roads', name: 'of Far Roads', effect: { speed: 0.08 }, desc: '+8% movement speed.' },
];

/* ── handcrafted catalogue ─────────────────────────────────────────── */

function it(id, name, cat, o = {}) {
  return Object.assign({
    id, name, cat,
    rarity: 'common', icon: o.icon || 'misc', colors: o.colors || ['#b0a894', '#8a8272'],
    desc: o.desc || '', stack: o.stack === undefined ? 20 : o.stack,
    weight: o.weight === undefined ? 0.5 : o.weight,
    value: o.value === undefined ? 2 : o.value,
    tags: o.tags || [], tier: o.tier || 1,
    stats: o.stats || null, slot: o.slot || null,
    food: o.food || null, fuel: o.fuel || 0, station: o.station || null,
    blueprint: o.blueprint || null, tool: o.tool || null,
  }, o.extra || {});
}

export const CATALOG = {
  /* resources */
  wood: it('wood', 'Timber', 'resource', { icon: 'log', colors: ['#8a6a45', '#6a4e30'], desc: 'Cut from a tree. The backbone of every build.', weight: 1.2, value: 2, fuel: 6, tags: ['wood'] }),
  ancient_wood: it('ancient_wood', 'Ancient Timber', 'resource', { icon: 'log', colors: ['#5a4a34', '#3f3424'], desc: 'Wood from a tree older than the ruins around it.', weight: 1.6, value: 14, fuel: 10, tier: 3 }),
  jungle_wood: it('jungle_wood', 'Jungle Hardwood', 'resource', { icon: 'log', colors: ['#6a7a3a', '#4a5a2a'], desc: 'Dense, oily, nearly rot-proof.', weight: 1.8, value: 8, fuel: 8, tier: 2 }),
  swamp_wood: it('swamp_wood', 'Bog Wood', 'resource', { icon: 'log', colors: ['#4a4a34', '#33331f'], desc: 'Blackened by the water it grew in.', weight: 1.5, value: 5, fuel: 5 }),
  deadwood: it('deadwood', 'Deadwood', 'resource', { icon: 'log', colors: ['#7a7268', '#5a544c'], desc: 'Dry and brittle. Burns fast.', weight: 0.8, value: 1, fuel: 4 }),
  driftwood: it('driftwood', 'Driftwood', 'resource', { icon: 'log', colors: ['#c0b49c', '#9a8f7a'], desc: 'Bleached by salt and sun.', weight: 0.9, value: 2, fuel: 5 }),
  stone: it('stone', 'Stone', 'resource', { icon: 'rock', colors: ['#8b8779', '#6a675c'], desc: 'Everything begins with a sharp rock.', weight: 1.5, value: 1 }),
  clay: it('clay', 'Clay', 'resource', { icon: 'clump', colors: ['#a8705a', '#8a5844'], desc: 'Wet river mud. Fires into brick.', weight: 1.4, value: 2 }),
  mud: it('mud', 'Mud', 'resource', { icon: 'clump', colors: ['#5a4a34', '#3f3424'], desc: 'Thick, cold and useful.', weight: 1.6, value: 1 }),
  sand: it('sand', 'Sand', 'resource', { icon: 'clump', colors: ['#e0d0a0', '#c0b080'], desc: 'Melted into glass, packed into mortar.', weight: 1.5, value: 1 }),
  fiber: it('fiber', 'Plant Fibre', 'resource', { icon: 'fiber', colors: ['#a8a05a', '#8a8444'], desc: 'Twisted into cord and cloth.', weight: 0.2, value: 1 }),
  cloth: it('cloth', 'Cloth', 'material', { icon: 'cloth', colors: ['#d8d0bc', '#b0a894'], desc: 'Woven fibre.', weight: 0.3, value: 4 }),
  leather: it('leather', 'Leather', 'material', { icon: 'hide', colors: ['#a8785a', '#8a5f45'], desc: 'Cured hide.', weight: 0.8, value: 6 }),
  fur: it('fur', 'Fur', 'material', { icon: 'hide', colors: ['#c0a888', '#9a8264'], desc: 'Warm. Essential up north.', weight: 0.9, value: 8, tags: ['warm'] }),
  bone: it('bone', 'Bone', 'material', { icon: 'bone', colors: ['#e0d8c0', '#b8b098'], desc: 'Carved into points and needles.', weight: 0.4, value: 3 }),
  sinew: it('sinew', 'Sinew', 'material', { icon: 'fiber', colors: ['#c8b098', '#a89078'], desc: 'Bowstring material.', weight: 0.1, value: 4 }),
  coal: it('coal', 'Coal', 'resource', { icon: 'ore', colors: ['#2f2f33', '#1a1a1e'], desc: 'Burns hot enough to work metal.', weight: 1.2, value: 4, fuel: 14 }),
  copper_ore: it('copper_ore', 'Copper Ore', 'resource', { icon: 'ore', colors: ['#b07a48', '#8a5c34'], desc: 'Green-flecked rock.', weight: 2.2, value: 5, tier: 1 }),
  iron_ore: it('iron_ore', 'Iron Ore', 'resource', { icon: 'ore', colors: ['#9a8272', '#6a5a4c'], desc: 'Heavy and rust-streaked.', weight: 2.6, value: 8, tier: 2 }),
  silver_ore: it('silver_ore', 'Silver Ore', 'resource', { icon: 'ore', colors: ['#d0d8e0', '#a0a8b0'], desc: 'Bright veins in cold stone.', weight: 2.4, value: 18, tier: 3 }),
  gold_ore: it('gold_ore', 'Gold Ore', 'resource', { icon: 'ore', colors: ['#e0b84a', '#b08c2a'], desc: 'Soft, useless for edges, loved by traders.', weight: 3.0, value: 34, tier: 3 }),
  copper_ingot: it('copper_ingot', 'Copper Ingot', 'material', { icon: 'ingot', colors: ['#c08850', '#9a6a3c'], desc: 'Workable and warm-toned.', weight: 1.8, value: 12, tier: 1 }),
  iron_ingot: it('iron_ingot', 'Iron Ingot', 'material', { icon: 'ingot', colors: ['#a8b0b8', '#7a828a'], desc: 'The spine of every tool.', weight: 2.0, value: 22, tier: 2 }),
  steel_ingot: it('steel_ingot', 'Steel Ingot', 'material', { icon: 'ingot', colors: ['#c8d0d8', '#9aa2aa'], desc: 'Folded iron. Holds an edge.', weight: 2.0, value: 46, tier: 3 }),
  silver_ingot: it('silver_ingot', 'Silver Ingot', 'material', { icon: 'ingot', colors: ['#e0e8f0', '#b0b8c0'], desc: 'Hurts things that should not exist.', weight: 1.9, value: 40, tier: 3 }),
  gold_ingot: it('gold_ingot', 'Gold Ingot', 'material', { icon: 'ingot', colors: ['#f0cc5a', '#c09a2a'], desc: 'Currency in bar form.', weight: 2.4, value: 90, tier: 3 }),
  obsidian: it('obsidian', 'Obsidian Shard', 'resource', { icon: 'shard', colors: ['#3a3340', '#1e1a24'], desc: 'Volcanic glass. Ridiculously sharp.', weight: 1.1, value: 26, tier: 4 }),
  crystal: it('crystal', 'Echo Crystal', 'resource', { icon: 'gem', colors: ['#8fd8e8', '#5aa8bc'], desc: 'Hums when struck. Powers resonance.', weight: 0.7, value: 30, tier: 3, tags: ['resonant'] }),
  echo_shard: it('echo_shard', 'Echo Shard', 'quest', { icon: 'hex', colors: ['#a8f0e8', '#5ac0c8'], desc: 'A splinter of the old choir. Spend it at a Hollow Spire.', weight: 0.3, value: 60, tier: 4, tags: ['resonant'] }),
  emberstone: it('emberstone', 'Emberstone', 'resource', { icon: 'gem', colors: ['#ff8a4a', '#c04a1a'], desc: 'Warm to the touch, always.', weight: 0.9, value: 34, tier: 4, fuel: 30 }),
  sunstone: it('sunstone', 'Sunstone', 'resource', { icon: 'gem', colors: ['#ffd87a', '#d0a03a'], desc: 'Stores daylight. Handy underground.', weight: 0.6, value: 28, tier: 3 }),
  salt_crystal: it('salt_crystal', 'Salt Crystal', 'resource', { icon: 'gem', colors: ['#e8f0f4', '#b8c8d0'], desc: 'Preserves food.', weight: 0.8, value: 5 }),
  ice: it('ice', 'Ice Block', 'resource', { icon: 'gem', colors: ['#c8e8f4', '#90c0d8'], desc: 'Melts slowly. Cools anything.', weight: 1.4, value: 3 }),
  sulfur: it('sulfur', 'Sulfur', 'resource', { icon: 'clump', colors: ['#e0d050', '#b0a030'], desc: 'Smells of the volcanic fields.', weight: 0.9, value: 8 }),
  basalt: it('basalt', 'Basalt', 'resource', { icon: 'rock', colors: ['#4a4750', '#2f2c34'], desc: 'Volcanic rock. Excellent foundations.', weight: 2.2, value: 6 }),
  ash: it('ash', 'Ash', 'resource', { icon: 'clump', colors: ['#8a8480', '#5f5a56'], desc: 'Makes lye, mortar and mess.', weight: 0.4, value: 1 }),
  redstone_ore: it('redstone_ore', 'Cinnabar Ore', 'resource', { icon: 'ore', colors: ['#c04a3a', '#8a2a20'], desc: 'Pigment and poison in equal measure.', weight: 2.0, value: 14 }),
  jade: it('jade', 'Jade', 'resource', { icon: 'gem', colors: ['#5aa878', '#3a7a54'], desc: 'Traded highly in the south.', weight: 0.8, value: 32 }),
  pearl: it('pearl', 'Pearl', 'resource', { icon: 'gem', colors: ['#f0ece0', '#c8c0b0'], desc: 'Found in shallow beds.', weight: 0.2, value: 26 }),
  pine_resin: it('pine_resin', 'Pine Resin', 'resource', { icon: 'clump', colors: ['#c89040', '#9a6a28'], desc: 'Sticky, flammable, waterproofing.', weight: 0.3, value: 4, fuel: 8 }),
  spore: it('spore', 'Spore Pod', 'resource', { icon: 'bulb', colors: ['#a888c0', '#7a5a94'], desc: 'Puffs when thrown.', weight: 0.2, value: 6 }),
  glowcap: it('glowcap', 'Glowcap', 'resource', { icon: 'mushroom', colors: ['#7fe8d0', '#4aa898'], desc: 'Lights a room for a night.', weight: 0.2, value: 9 }),
  kelp: it('kelp', 'Kelp', 'resource', { icon: 'fiber', colors: ['#4a7a5a', '#2f5a3f'], desc: 'Edible once dried.', weight: 0.3, value: 2 }),

  /* plants & food */
  mushroom: it('mushroom', 'Field Mushroom', 'food', { icon: 'mushroom', colors: ['#c08a6a', '#9a6a4c'], desc: 'Cook it. Probably fine.', weight: 0.1, value: 2, food: { hunger: 8, health: 0 } }),
  herb: it('herb', 'Wild Herb', 'resource', { icon: 'herb', colors: ['#6a9a5a', '#4a7a3c'], desc: 'Poultice ingredient.', weight: 0.1, value: 3 }),
  rare_herb: it('rare_herb', 'Silverleaf', 'resource', { icon: 'herb', colors: ['#a8d8c8', '#7ab0a0'], desc: 'Grows where nothing else will.', weight: 0.1, value: 18, tier: 3 }),
  frostbloom: it('frostbloom', 'Frostbloom', 'resource', { icon: 'flower', colors: ['#c8e8f8', '#90c0e0'], desc: 'Cold enough to burn.', weight: 0.1, value: 16 }),
  berry: it('berry', 'Wild Berries', 'food', { icon: 'berry', colors: ['#a03a4a', '#7a2434'], desc: 'A handful keeps you walking.', weight: 0.1, value: 2, food: { hunger: 6, health: 1 } }),
  exotic_fruit: it('exotic_fruit', 'Sunfruit', 'food', { icon: 'berry', colors: ['#f0b03a', '#c0801a'], desc: 'Sweet, filling, jungle-grown.', weight: 0.3, value: 6, food: { hunger: 16, health: 3 } }),
  cactus_fruit: it('cactus_fruit', 'Cactus Fruit', 'food', { icon: 'berry', colors: ['#c84a6a', '#9a2a4a'], desc: 'Worth the spines.', weight: 0.2, value: 5, food: { hunger: 12, health: 2 } }),
  apple: it('apple', 'Orchard Apple', 'food', { icon: 'berry', colors: ['#c8402a', '#9a2a1a'], desc: 'Keeps well in a pack.', weight: 0.2, value: 3, food: { hunger: 12, health: 2 } }),
  wheat: it('wheat', 'Wheat Sheaf', 'resource', { icon: 'wheat', colors: ['#d8c068', '#b09a44'], desc: 'Grind into flour.', weight: 0.3, value: 3 }),
  flour: it('flour', 'Flour', 'material', { icon: 'clump', colors: ['#e8e0c8', '#c0b89c'], desc: 'Bread begins here.', weight: 0.4, value: 5 }),
  bread: it('bread', 'Bread', 'food', { icon: 'bread', colors: ['#c89a5a', '#a87a3c'], desc: 'The most reliable meal there is.', weight: 0.3, value: 7, food: { hunger: 30, health: 4 } }),
  raw_meat: it('raw_meat', 'Raw Meat', 'food', { icon: 'meat', colors: ['#b05a5a', '#8a3a3a'], desc: 'Cook it unless you are desperate.', weight: 0.8, value: 4, food: { hunger: 12, health: -6 } }),
  cooked_meat: it('cooked_meat', 'Cooked Meat', 'food', { icon: 'meat', colors: ['#8a5a3a', '#6a4028'], desc: 'Proper food.', weight: 0.8, value: 10, food: { hunger: 38, health: 8 } }),
  fish_raw: it('fish_raw', 'Raw Fish', 'food', { icon: 'fish', colors: ['#8ab0c0', '#5a8090'], desc: 'Silver and slippery.', weight: 0.6, value: 4, food: { hunger: 10, health: -4 } }),
  fish_cooked: it('fish_cooked', 'Cooked Fish', 'food', { icon: 'fish', colors: ['#c0a888', '#9a8264'], desc: 'Crisp skin, good meal.', weight: 0.6, value: 9, food: { hunger: 30, health: 7 } }),
  clam: it('clam', 'Clam', 'food', { icon: 'shell', colors: ['#c8c0a8', '#9a927c'], desc: 'Shuck and eat, or bake.', weight: 0.3, value: 3, food: { hunger: 8, health: 1 } }),
  egg: it('egg', 'Bird Egg', 'food', { icon: 'egg', colors: ['#e8dcc0', '#c0b49c'], desc: 'Cook it in a pan or ash.', weight: 0.2, value: 3, food: { hunger: 10, health: 1 } }),
  stew: it('stew', 'Hunter Stew', 'food', { icon: 'bowl', colors: ['#a8683a', '#7a4820'], desc: 'Everything in one pot.', weight: 0.7, value: 18, food: { hunger: 60, health: 14 } }),
  jerky: it('jerky', 'Dried Jerky', 'food', { icon: 'meat', colors: ['#7a4a2a', '#5a3218'], desc: 'Lasts for weeks.', weight: 0.3, value: 12, food: { hunger: 26, health: 4 } }),
  honey: it('honey', 'Honeycomb', 'food', { icon: 'clump', colors: ['#e8b03a', '#c08818'], desc: 'Energy in its purest form.', weight: 0.3, value: 10, food: { hunger: 18, health: 6 } }),

  /* consumables */
  potion_minor: it('potion_minor', 'Minor Tonic', 'consumable', { icon: 'potion', colors: ['#c8485a', '#9a2a3a'], desc: 'Restores 30 health.', weight: 0.4, value: 20, food: { hunger: 0, health: 30 } }),
  potion_major: it('potion_major', 'Greater Tonic', 'consumable', { icon: 'potion', colors: ['#e05a6a', '#b03a4a'], desc: 'Restores 70 health.', weight: 0.4, value: 55, tier: 3, food: { hunger: 0, health: 70 } }),
  stamina_draught: it('stamina_draught', 'Wind Draught', 'consumable', { icon: 'potion', colors: ['#5ac8a0', '#2a9a78'], desc: 'Refills stamina at once.', weight: 0.4, value: 24, tags: ['stamina'] }),
  antidote: it('antidote', 'Antidote', 'consumable', { icon: 'potion', colors: ['#8ac85a', '#5a9a2a'], desc: 'Clears poison and rot.', weight: 0.3, value: 22, tags: ['cure'] }),
  warm_tonic: it('warm_tonic', 'Ember Draught', 'consumable', { icon: 'potion', colors: ['#f0a03a', '#c0701a'], desc: 'Floods you with warmth.', weight: 0.4, value: 26, tags: ['warm'] }),
  torch: it('torch', 'Torch', 'tool', { icon: 'torch', colors: ['#8a6a45', '#ffb35c'], desc: 'Light and a poor weapon. 6 minutes of burn.', weight: 0.6, value: 4, fuel: 12, slot: 'off', stats: { light: 14 } }),
  lantern: it('lantern', 'Lantern', 'tool', { icon: 'lantern', colors: ['#c8b078', '#ffd88a'], desc: 'Brighter and slower to burn out.', weight: 1.0, value: 18, slot: 'off', stats: { light: 22 } }),
  rope: it('rope', 'Rope', 'material', { icon: 'coil', colors: ['#b0a078', '#8a7a54'], desc: 'Climb, bind, build.', weight: 0.8, value: 6 }),
  bandage: it('bandage', 'Bandage', 'consumable', { icon: 'cloth', colors: ['#e8e0d0', '#c0b8a8'], desc: 'Stops bleeding, heals a little.', weight: 0.1, value: 8, food: { hunger: 0, health: 12 } }),

  /* tools */
  pick_wood: it('pick_wood', 'Wooden Pick', 'tool', { icon: 'pick', colors: ['#8a6a45', '#6a4e30'], desc: 'Chips at stone. Slowly.', weight: 1.6, value: 6, tool: 'pick', stats: { mine: 1, dmg: 5, spd: 1.0 }, slot: 'hand' }),
  pick_stone: it('pick_stone', 'Stone Pick', 'tool', { icon: 'pick', colors: ['#8a6a45', '#8b8779'], desc: 'Real mining starts here.', weight: 2.2, value: 12, tool: 'pick', stats: { mine: 2, dmg: 8, spd: 0.9 }, slot: 'hand' }),
  pick_iron: it('pick_iron', 'Iron Pick', 'tool', { icon: 'pick', colors: ['#6a4e30', '#a8b0b8'], desc: 'Cuts through ore seams.', weight: 2.6, value: 40, tool: 'pick', tier: 2, stats: { mine: 3.4, dmg: 12, spd: 1.05 }, slot: 'hand' }),
  pick_steel: it('pick_steel', 'Steel Pick', 'tool', { icon: 'pick', colors: ['#4a3a28', '#c8d0d8'], desc: 'Deep rock, quickly.', weight: 2.6, value: 90, tool: 'pick', tier: 3, stats: { mine: 5, dmg: 16, spd: 1.15 }, slot: 'hand' }),
  axe_wood: it('axe_wood', 'Wooden Axe', 'tool', { icon: 'axe', colors: ['#8a6a45', '#6a4e30'], desc: 'Fells saplings.', weight: 1.5, value: 6, tool: 'axe', stats: { chop: 1, dmg: 6, spd: 1.0 }, slot: 'hand' }),
  axe_stone: it('axe_stone', 'Stone Axe', 'tool', { icon: 'axe', colors: ['#8a6a45', '#8b8779'], desc: 'A real axe now.', weight: 2.0, value: 12, tool: 'axe', stats: { chop: 2, dmg: 10, spd: 0.95 }, slot: 'hand' }),
  axe_iron: it('axe_iron', 'Iron Axe', 'tool', { icon: 'axe', colors: ['#6a4e30', '#a8b0b8'], desc: 'Ancient trees fall to this.', weight: 2.4, value: 42, tool: 'axe', tier: 2, stats: { chop: 3.6, dmg: 15, spd: 1.05 }, slot: 'hand' }),
  hammer_stone: it('hammer_stone', 'Stone Maul', 'tool', { icon: 'hammer', colors: ['#8a6a45', '#8b8779'], desc: 'Shapes stone and skulls.', weight: 3.0, value: 14, tool: 'hammer', stats: { build: 1.4, dmg: 18, spd: 0.7 }, slot: 'hand' }),
  hoe: it('hoe', 'Hoe', 'tool', { icon: 'hoe', colors: ['#8a6a45', '#a8b0b8'], desc: 'Tills soil for planting.', weight: 1.4, value: 14, tool: 'hoe', slot: 'hand' }),
  watering_can: it('watering_can', 'Watering Can', 'tool', { icon: 'can', colors: ['#a8b0b8', '#7a828a'], desc: 'Crops grow twice as fast watered.', weight: 1.2, value: 16, tool: 'water', slot: 'hand' }),
  fishing_rod: it('fishing_rod', 'Fishing Rod', 'tool', { icon: 'rod', colors: ['#8a6a45', '#c0b8a8'], desc: 'Cast into any water.', weight: 1.0, value: 18, tool: 'fish', slot: 'hand' }),
  sickle: it('sickle', 'Sickle', 'tool', { icon: 'sickle', colors: ['#8a6a45', '#c8d0d8'], desc: 'Harvests crops and fibre fast.', weight: 0.9, value: 16, tool: 'sickle', slot: 'hand' }),
  spyglass: it('spyglass', 'Spyglass', 'tool', { icon: 'spy', colors: ['#c8b078', '#8a7a4a'], desc: 'See landmarks from further away.', weight: 0.6, value: 34, slot: 'off', stats: { zoom: 2.4 } }),
  compass: it('compass', 'Compass', 'tool', { icon: 'compass', colors: ['#c8b078', '#e8e0c8'], desc: 'Always knows north.', weight: 0.2, value: 22, slot: 'misc' }),

  /* armour */
  cloth_tunic: it('cloth_tunic', 'Cloth Tunic', 'armor', { icon: 'chest', colors: ['#8a8a6a', '#6a6a4c'], desc: 'Barely armour. Better than nothing.', weight: 1.6, value: 10, slot: 'chest', stats: { armor: 4 } }),
  leather_vest: it('leather_vest', 'Leather Vest', 'armor', { icon: 'chest', colors: ['#a8785a', '#7a5238'], desc: 'Turns a glancing blow.', weight: 3.2, value: 30, tier: 2, slot: 'chest', stats: { armor: 11 } }),
  iron_plate: it('iron_plate', 'Iron Plate', 'armor', { icon: 'chest', colors: ['#a8b0b8', '#6a727a'], desc: 'Heavy, loud, effective.', weight: 9.0, value: 90, tier: 3, slot: 'chest', stats: { armor: 24, speed: -0.06 } }),
  fur_cloak: it('fur_cloak', 'Fur Cloak', 'armor', { icon: 'cloak', colors: ['#c0a888', '#8a7258'], desc: 'Keeps the cold out.', weight: 2.6, value: 34, slot: 'back', stats: { armor: 6, cold: 40 } }),
  ash_cloak: it('ash_cloak', 'Ashweave Cloak', 'armor', { icon: 'cloak', colors: ['#5a5450', '#3a3632'], desc: 'Shrugs off heat and embers.', weight: 2.2, value: 60, tier: 3, slot: 'back', stats: { armor: 8, heat: 45 } }),
  leather_cap: it('leather_cap', 'Leather Cap', 'armor', { icon: 'helm', colors: ['#a8785a', '#7a5238'], desc: 'Basic head protection.', weight: 1.0, value: 16, slot: 'head', stats: { armor: 5 } }),
  iron_helm: it('iron_helm', 'Iron Helm', 'armor', { icon: 'helm', colors: ['#a8b0b8', '#6a727a'], desc: 'Narrows your vision, saves your skull.', weight: 2.6, value: 46, tier: 2, slot: 'head', stats: { armor: 12, speed: -0.02 } }),
  boots: it('boots', 'Traveler Boots', 'armor', { icon: 'boots', colors: ['#7a5a3a', '#4a3520'], desc: 'Long roads are shorter in good boots.', weight: 1.4, value: 22, slot: 'feet', stats: { armor: 4, speed: 0.05 } }),
  gloves: it('gloves', 'Work Gloves', 'armor', { icon: 'gloves', colors: ['#8a6a4a', '#5a4028'], desc: 'Gather faster, hurt less.', weight: 0.5, value: 14, slot: 'hands', stats: { armor: 3, gather: 0.2 } }),
  backpack_big: it('backpack_big', 'Hauller Pack', 'armor', { icon: 'pack', colors: ['#8a6a45', '#5a4530'], desc: '+40 carrying capacity.', weight: 2.0, value: 48, slot: 'back', stats: { carry: 40 } }),

  /* building */
  plank: it('plank', 'Plank', 'building', { icon: 'plank', colors: ['#b08a5a', '#8a6a40'], desc: 'Milled timber.', weight: 0.9, value: 4, tags: ['build'] }),
  brick: it('brick', 'Fired Brick', 'building', { icon: 'brick', colors: ['#a8604a', '#7a4030'], desc: 'Strong wall material.', weight: 1.6, value: 6, tags: ['build'] }),
  glass_pane: it('glass_pane', 'Glass Pane', 'building', { icon: 'glass', colors: ['#c8e8f0', '#90c0d0'], desc: 'Lets the light in.', weight: 0.8, value: 12, tags: ['build'] }),
  mortar: it('mortar', 'Mortar', 'building', { icon: 'clump', colors: ['#c8c0b0', '#a09888'], desc: 'Binds stone together.', weight: 1.0, value: 5, tags: ['build'] }),
  nail: it('nail', 'Iron Nails', 'building', { icon: 'nails', colors: ['#a8b0b8', '#6a727a'], desc: 'A hundred joints.', weight: 0.4, value: 6, tags: ['build'] }),
  beam: it('beam', 'Support Beam', 'building', { icon: 'plank', colors: ['#8a6a45', '#5a4530'], desc: 'Holds up roofs and bridges.', weight: 2.4, value: 10, tags: ['build'] }),
  resonant_plate: it('resonant_plate', 'Resonant Plate', 'building', { icon: 'plate', colors: ['#8fd8e8', '#5aa8bc'], desc: 'Advanced building material. Hums.', weight: 2.0, value: 70, tier: 4, tags: ['build', 'resonant'] }),

  /* misc & quest */
  coin: it('coin', 'Tide Coin', 'misc', { icon: 'coin', colors: ['#e0c060', '#b0902a'], desc: 'Old currency. Still accepted.', weight: 0.02, value: 1, stack: 500 }),
  map_fragment: it('map_fragment', 'Map Fragment', 'quest', { icon: 'scroll', colors: ['#e0d4b0', '#b0a484'], desc: 'Part of a treasure map.', weight: 0.1, value: 15, tags: ['map'] }),
  treasure_map: it('treasure_map', 'Treasure Map', 'quest', { icon: 'scroll', colors: ['#e0d4b0', '#8a5a3a'], desc: 'Marks a buried cache somewhere in this world.', weight: 0.1, value: 40, tags: ['map'] }),
  blueprint_scroll: it('blueprint_scroll', 'Blueprint', 'quest', { icon: 'scroll', colors: ['#d8e0e8', '#8aa0b0'], desc: 'Teaches a recipe when read.', weight: 0.1, value: 25, tags: ['blueprint'] }),
  old_key: it('old_key', 'Rusted Key', 'quest', { icon: 'key', colors: ['#a8804a', '#7a5a2a'], desc: 'Fits something, somewhere.', weight: 0.1, value: 12 }),
  relic: it('relic', 'Choir Relic', 'quest', { icon: 'relic', colors: ['#c8bc98', '#8fd8e8'], desc: 'Someone lost this. Or hid it.', weight: 0.8, value: 80, tier: 4, tags: ['resonant'] }),
  skull_totem: it('skull_totem', 'Bone Totem', 'misc', { icon: 'totem', colors: ['#e0d8c0', '#8a8272'], desc: 'Unsettling. Traders pay for it.', weight: 1.2, value: 26 }),
  arrow: it('arrow', 'Arrow', 'resource', { icon: 'arrow', colors: ['#8a6a45', '#c8c8c8'], desc: 'Ammunition for bows.', weight: 0.05, value: 1, stack: 99 }),
  bolt: it('bolt', 'Bolt', 'resource', { icon: 'arrow', colors: ['#6a6a72', '#c8c8c8'], desc: 'Ammunition for crossbows.', weight: 0.07, value: 2, stack: 99 }),
  seed_wheat: it('seed_wheat', 'Wheat Seeds', 'resource', { icon: 'seed', colors: ['#d8c068', '#a89440'], desc: 'Plant in tilled soil.', weight: 0.05, value: 2, tags: ['seed'], crop: 'wheat' }),
  seed_root: it('seed_root', 'Root Cuttings', 'resource', { icon: 'seed', colors: ['#a8683a', '#7a4820'], desc: 'Plant in tilled soil.', weight: 0.05, value: 2, tags: ['seed'], crop: 'root' }),
  seed_gourd: it('seed_gourd', 'Gourd Seeds', 'resource', { icon: 'seed', colors: ['#7a9a4a', '#5a7a2a'], desc: 'Likes warm soil.', weight: 0.05, value: 3, tags: ['seed'], crop: 'gourd' }),
  seed_herb: it('seed_herb', 'Herb Seeds', 'resource', { icon: 'seed', colors: ['#6a9a5a', '#4a7a3c'], desc: 'Grows almost anywhere.', weight: 0.05, value: 3, tags: ['seed'], crop: 'herb' }),
  seed_berry: it('seed_berry', 'Berry Cuttings', 'resource', { icon: 'seed', colors: ['#a03a4a', '#6a7a3a'], desc: 'Likes cool, wet ground.', weight: 0.05, value: 3, tags: ['seed'], crop: 'berry' }),
  seed_flax: it('seed_flax', 'Flax Seeds', 'resource', { icon: 'seed', colors: ['#8aa86a', '#5a7a3c'], desc: 'Grows into fibre. Dries fast.', weight: 0.05, value: 2, tags: ['seed'], crop: 'fiber' }),
};

/* ── procedural weapons ───────────────────────────────────────────── */

/** Generate a weapon instance from an archetype + material + rolls. */
export function rollWeapon(rng, opts = {}) {
  const archKeys = opts.archetypes || Object.keys(ARCH);
  const archKey = opts.arch || archKeys[rng.int(0, archKeys.length - 1)];
  const arch = ARCH[archKey];
  const matKeys = opts.materials || ['wood', 'stone', 'copper', 'iron', 'silver', 'steel', 'obsidian', 'crystal', 'ancient'];
  const matKey = opts.material || matKeys[rng.int(0, matKeys.length - 1)];
  const m = W[matKey] || W.iron;

  // luck stretches the roll upward: 0 -> 0..1, 1 -> 0..2, so the top tiers are
  // only reachable from lucky sources (bosses, hollow spires, attuned chests).
  const tierRoll = rng.float() * (1 + Math.min(1, Math.max(0, opts.luck || 0)));
  const rarity = tierRoll > 1.85 ? 'mythic' : tierRoll > 1.55 ? 'legendary' : tierRoll > 1.2 ? 'epic'
    : tierRoll > 0.95 ? 'rare' : tierRoll > 0.55 ? 'uncommon' : 'common';
  const rar = RARITY[rarity];

  const prefixes = rng.shuffle(PREFIX.slice()).slice(0, Math.ceil(rar.affixes / 2));
  const suffixes = rng.shuffle(SUFFIX.slice()).slice(0, Math.floor(rar.affixes / 2));
  const name = `${m.name} ${arch.name}`;
  const full = `${prefixes.map(p => p.name).join(' ')}${prefixes.length ? ' ' : ''}${name}${suffixes.length ? ' ' + suffixes.map(s => s.name).join(' ') : ''}`;

  const effects = {};
  for (const p of prefixes) for (const k in p.effect) effects[k] = (effects[k] || 0) + p.effect[k];
  for (const s of suffixes) for (const k in s.effect) effects[k] = (effects[k] || 0) + s.effect[k];

  const id = `wpn:${archKey}:${matKey}:${rarity}:${(prefixes.map(p => p.id).join('-') || 'none')}:${(suffixes.map(s => s.id).join('-') || 'none')}`;
  const stats = weaponStats(id, archKey, matKey, rarity, effects);

  return {
    id,
    key: `${archKey}_${matKey}`,
    name: full,
    baseName: name,
    cat: 'weapon',
    rarity,
    icon: arch.icon,
    colors: [m.tint, '#4a3a28'],
    desc: [arch.desc, ...prefixes.map(p => p.desc), ...suffixes.map(s => s.desc)].filter(Boolean).join(' '),
    stack: 1,
    weight: stats.weight,
    value: stats.value,
    durability: stats.durability,
    maxDurability: stats.durability,
    stats: stats.stats,
    effects,
    arch: archKey,
    material: matKey,
    ranged: arch.ranged || null,
    slot: arch.shield ? 'off' : 'hand',
    tier: stats.tier,
    generated: true,
  };
}

/**
 * Every number a weapon has, derived from its id alone. rollWeapon and
 * rehydrateWeapon both call this, so a weapon that goes through a save file
 * comes back identical — the small damage variance is a hash of the id, not a
 * dice roll.
 */
const MAT_TIER = ['wood', 'stone', 'copper', 'iron', 'silver', 'steel', 'obsidian', 'crystal', 'ancient'];

function idHash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export function weaponStats(id, archKey, matKey, rarity, effects) {
  const a = ARCH[archKey] || ARCH.sword;
  const m = W[matKey] || W.iron;
  const rar = RARITY[rarity] || RARITY.common;
  const jitter = 0.94 + (idHash(id) % 10000) / 10000 * 0.14;
  const dmg = Math.max(1, Math.round(a.dmg * m.dmg * rar.mult * (1 + (effects.dmg || 0)) * jitter));
  const durability = Math.max(1, Math.round(m.dur * (0.8 + rar.mult * 0.35)));
  return {
    stats: {
      dmg,
      spd: Math.round(a.spd * m.spd * 100) / 100,
      reach: a.reach,
      stam: Math.max(1, Math.round(a.stam * (effects.stamina || 1))),
      block: a.shield ? 40 + dmg : 0,
    },
    durability,
    value: Math.max(1, Math.round((6 + a.dmg * 1.2) * m.val * rar.mult * (effects.value || 1))),
    weight: Math.round((1.2 + (a.shield ? 2.4 : 0) + (m.dmg - 1) * 1.6) * 100) / 100,
    tier: 1 + MAT_TIER.indexOf(matKey) * 0.5,
  };
}

/** Starter weapon for a brand new world. */
export function starterWeapon(rng) {
  const w = rollWeapon(rng, { arch: 'sword', material: 'wood' });
  w.rarity = 'common';
  w.name = 'Chipped Wooden Sword';
  w.baseName = 'Wooden Sword';
  w.desc = 'Somebody left this against a tree. It still cuts.';
  w.value = 3;
  return w;
}

/* ── lookups ──────────────────────────────────────────────────────── */

const byId = new Map(Object.values(CATALOG).map(i => [i.id, i]));

export function itemById(id) {
  if (byId.has(id)) return byId.get(id);
  if (id && id.startsWith('wpn:')) return rehydrateWeapon(id);
  return null;
}

/** Rebuild a generated weapon from its compact id (used by saves). */
export function rehydrateWeapon(id) {
  const parts = id.split(':');
  if (parts.length < 6) return null;
  const [, arch, material, rarity, pre, suf] = parts;
  const m = W[material] || W.iron;
  const a = ARCH[arch] || ARCH.sword;
  const rar = RARITY[rarity] || RARITY.common;
  const prefixes = pre === 'none' ? [] : pre.split('-').map(p => PREFIX.find(x => x.id === p)).filter(Boolean);
  const suffixes = suf === 'none' ? [] : suf.split('-').map(p => SUFFIX.find(x => x.id === p)).filter(Boolean);
  const effects = {};
  for (const p of [...prefixes, ...suffixes]) for (const k in p.effect) effects[k] = (effects[k] || 0) + p.effect[k];
  const st = weaponStats(id, arch, material, rarity, effects);
  return {
    id, key: `${arch}_${material}`,
    name: `${prefixes.map(p => p.name).join(' ')}${prefixes.length ? ' ' : ''}${m.name} ${a.name}${suffixes.length ? ' ' + suffixes.map(s => s.name).join(' ') : ''}`,
    baseName: `${m.name} ${a.name}`, cat: 'weapon', rarity, icon: a.icon, colors: [m.tint, '#4a3a28'],
    desc: [a.desc, ...prefixes.map(p => p.desc), ...suffixes.map(s => s.desc)].filter(Boolean).join(' '),
    stack: 1, weight: st.weight, value: st.value,
    durability: st.durability, maxDurability: st.durability,
    stats: st.stats,
    effects, arch, material, ranged: a.ranged || null, slot: a.shield ? 'off' : 'hand',
    tier: st.tier, generated: true,
  };
}

export function itemRarityColor(item) { return RARITY[item.rarity || 'common'].color; }
export function itemByName(name) { return Object.values(CATALOG).find(i => i.name === name) || null; }
export function allItems() { return Object.values(CATALOG); }

/** What a resource node yields, by biome-weighted table. */
export const RESOURCE_NODE = {
  tree: { item: 'wood', tool: 'axe', hits: 4, amount: [3, 6], also: [['pine_resin', 0.2], ['fiber', 0.25], ['apple', 0.12]] },
  ancient_tree: { item: 'ancient_wood', tool: 'axe', hits: 7, amount: [3, 6], also: [['rare_herb', 0.2]] },
  rock: { item: 'stone', tool: 'pick', hits: 4, amount: [3, 7], also: [['coal', 0.12], ['flint', 0.1]] },
  ore_iron: { item: 'iron_ore', tool: 'pick', hits: 6, amount: [2, 5], also: [['stone', 0.5]] },
  ore_copper: { item: 'copper_ore', tool: 'pick', hits: 5, amount: [2, 5], also: [['stone', 0.4]] },
  ore_silver: { item: 'silver_ore', tool: 'pick', hits: 7, amount: [2, 4], also: [['gold_ore', 0.12]] },
  ore_gold: { item: 'gold_ore', tool: 'pick', hits: 8, amount: [1, 3], also: [] },
  crystal_node: { item: 'crystal', tool: 'pick', hits: 6, amount: [1, 3], also: [['echo_shard', 0.1]] },
  ember_node: { item: 'emberstone', tool: 'pick', hits: 7, amount: [1, 3], also: [['sulfur', 0.4]] },
  clay_deposit: { item: 'clay', tool: null, hits: 3, amount: [3, 6], also: [['mud', 0.4]] },
  bush: { item: 'berry', tool: null, hits: 2, amount: [1, 3], also: [['fiber', 0.5], ['seed_berry', 0.2]] },
  plant: { item: 'fiber', tool: null, hits: 1, amount: [1, 3], also: [['herb', 0.3], ['seed_herb', 0.15]] },
  mushroom_cluster: { item: 'mushroom', tool: null, hits: 1, amount: [2, 4], also: [['glowcap', 0.12]] },
  cactus: { item: 'cactus_fruit', tool: null, hits: 2, amount: [1, 2], also: [['fiber', 0.3]] },
  corpse: { item: 'raw_meat', tool: null, hits: 3, amount: [1, 3], also: [['leather', 0.6], ['bone', 0.5], ['sinew', 0.35], ['fur', 0.3]] },
  flint: { item: 'stone', tool: null, hits: 1, amount: [1, 2], also: [] },
  kelp_bed: { item: 'kelp', tool: null, hits: 2, amount: [2, 4], also: [['pearl', 0.05]] },
  wreck: { item: 'driftwood', tool: 'axe', hits: 3, amount: [2, 5], also: [['nail', 0.3], ['coin', 0.4]] },
  crate: { item: null, tool: null, hits: 1, amount: [0, 0], loot: true },
};

export default CATALOG;
