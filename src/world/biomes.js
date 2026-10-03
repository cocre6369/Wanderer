/**
 * WANDERER — Biome catalogue
 * --------------------------
 * Biomes are chosen with a Whittaker-style climate lookup (temperature x
 * humidity x altitude x slope) and *blended* at their borders so there are no
 * visible seams (spec 1, 5). Rare variants are gated behind a low-probability
 * anomaly field so they stay uncommon and memorable.
 *
 * Everything here is data: the generator, mesher, vegetation, audio and UI all
 * read this one table.
 *
 *  temp  : [min,max] degrees C at sea level
 *  humid : [min,max] 0..1
 *  h     : [min,max] metres relative to sea level
 *  slope : max slope it tolerates (0 flat, 1 cliff)
 *  w     : base weight in the lookup
 */

export const BIOMES = {
  /* ── water ─────────────────────────────────────────────────────────── */
  deep_ocean: {
    id: 'deep_ocean', name: 'Open Ocean', kind: 'water',
    temp: [-60, 45], humid: [0, 1], h: [-600, -22], slope: 2, w: 1,
    color: '#0f3346', rock: '#0b222e', fog: '#9fc4d4',
    tree: 0, treeSet: [], grassD: 0, bush: 0, rocks: 0.04,
    resources: [['salt_crystal', 3], ['driftwood', 2], ['pearl', 1]],
    ambient: 'ocean', enemies: [], wildlife: [['fish', 6]],
    poi: [], tags: ['water', 'deep'], move: 1,
  },
  ocean: {
    id: 'ocean', name: 'Shallow Sea', kind: 'water',
    temp: [-60, 45], humid: [0, 1], h: [-26, -0.5], slope: 2, w: 1,
    color: '#1a586d', rock: '#14404f', fog: '#a8ccd8',
    tree: 0, treeSet: [], grassD: 0.08, bush: 0, rocks: 0.05,
    resources: [['salt_crystal', 3], ['driftwood', 3], ['kelp', 3], ['pearl', 1]],
    ambient: 'ocean', enemies: [['drowned', 1]], wildlife: [['fish', 8], ['gull', 3]],
    poi: [['shipwreck', 3]], tags: ['water'], move: 1,
  },
  coast: {
    id: 'coast', name: 'Coast', kind: 'land',
    temp: [-25, 45], humid: [0.18, 1], h: [-2, 8], slope: 0.8, w: 6,
    color: '#d9c99c', rock: '#9c9079', fog: '#c4d7dd',
    tree: 0.05, treeSet: ['palm', 'pine'], grassD: 0.34, bush: 0.06, rocks: 0.16,
    resources: [['driftwood', 5], ['clam', 4], ['salt_crystal', 3], ['stone', 4]],
    ambient: 'coast', enemies: [['crawler', 1]], wildlife: [['gull', 5], ['crab', 4], ['rabbit', 2]],
    poi: [['shipwreck', 4], ['camp', 3], ['watchtower', 2], ['cave', 3]],
    tags: ['coast'], move: 0.96,
  },

  /* ── temperate ─────────────────────────────────────────────────────── */
  plains: {
    id: 'plains', name: 'Windward Plains', kind: 'land',
    temp: [-6, 32], humid: [0.12, 0.52], h: [-2, 340], slope: 0.55, w: 6,
    color: '#8fa65c', rock: '#7d7463', fog: '#c9d6cf',
    tree: 0.05, treeSet: ['oak', 'birch'], grassD: 0.85, bush: 0.1, rocks: 0.07,
    resources: [['fiber', 5], ['stone', 4], ['wood', 3], ['herb', 3], ['clay', 2]],
    ambient: 'plains', enemies: [['boar', 2], ['wolf', 1]], wildlife: [['deer', 4], ['rabbit', 5], ['bird', 5], ['boar', 2]],
    poi: [['farm', 4], ['camp', 3], ['ruin', 3], ['village', 2], ['monolith', 2]],
    tags: ['open'], move: 1.02,
  },
  hills: {
    id: 'hills', name: 'Rolling Downs', kind: 'land',
    temp: [-8, 26], humid: [0.25, 0.68], h: [10, 420], slope: 0.85, w: 4,
    color: '#7d9a55', rock: '#8a8272', fog: '#c4d1cb',
    tree: 0.18, treeSet: ['oak', 'pine', 'birch'], grassD: 0.7, bush: 0.14, rocks: 0.14,
    resources: [['stone', 5], ['wood', 4], ['copper', 3], ['herb', 2], ['clay', 2]],
    ambient: 'hills', enemies: [['wolf', 2], ['boar', 1]], wildlife: [['deer', 4], ['goat', 3], ['bird', 4], ['fox', 2]],
    poi: [['mine', 4], ['watchtower', 3], ['ruin', 3], ['camp', 2], ['cave', 3]],
    tags: ['hilly'], move: 0.98,
  },
  temperate: {
    id: 'temperate', name: 'Temperate Forest', kind: 'land',
    temp: [-4, 24], humid: [0.42, 0.82], h: [-4, 380], slope: 0.8, w: 6,
    color: '#5c8040', rock: '#79725f', fog: '#bccdc2',
    tree: 0.82, treeSet: ['oak', 'birch', 'pine'], grassD: 0.6, bush: 0.24, rocks: 0.1,
    resources: [['wood', 6], ['mushroom', 4], ['herb', 3], ['fiber', 3], ['stone', 2], ['iron', 2]],
    ambient: 'forest', enemies: [['wolf', 3], ['boar', 2], ['guardian', 1]], wildlife: [['deer', 4], ['rabbit', 4], ['fox', 3], ['bird', 5], ['boar', 2]],
    poi: [['cabin', 4], ['camp', 3], ['ruin', 3], ['cave', 3], ['shrine', 2], ['village', 2]],
    tags: ['forest'], move: 0.97,
  },
  ancient: {
    id: 'ancient', name: 'Ancient Forest', kind: 'land',
    temp: [2, 20], humid: [0.6, 1], h: [5, 300], slope: 0.7, w: 3,
    color: '#3f6b3a', rock: '#5f5a49', fog: '#a9bfb2',
    tree: 1.0, treeSet: ['giant_oak', 'oak', 'pine'], grassD: 0.42, bush: 0.3, rocks: 0.12,
    resources: [['ancient_wood', 5], ['mushroom', 4], ['rare_herb', 3], ['silver', 2], ['crystal', 2]],
    ambient: 'deepforest', enemies: [['guardian', 3], ['wolf', 1], ['wisp', 2]], wildlife: [['deer', 3], ['fox', 2], ['bird', 3], ['stag', 1]],
    poi: [['oldruin', 5], ['shrine', 3], ['cave', 2], ['hollowspire', 3]],
    tags: ['forest', 'old'], move: 0.94,
  },

  /* ── cold ──────────────────────────────────────────────────────────── */
  tundra: {
    id: 'tundra', name: 'Tundra', kind: 'land',
    temp: [-40, 2], humid: [0, 0.75], h: [-3, 300], slope: 0.85, w: 5,
    color: '#c9d4d2', rock: '#7e8a90', fog: '#d3dee2',
    tree: 0.04, treeSet: ['pine_snow'], grassD: 0.22, bush: 0.04, rocks: 0.16,
    resources: [['ice', 4], ['stone', 4], ['iron', 3], ['fur', 3], ['frostbloom', 2]],
    ambient: 'tundra', enemies: [['icestalker', 3], ['wolf_white', 2]], wildlife: [['hare_snow', 4], ['goat', 2], ['owl', 2], ['deer', 1]],
    poi: [['camp', 3], ['icecave', 4], ['ruin', 2], ['monolith', 2]],
    tags: ['snow', 'cold'], move: 0.86,
  },
  taiga: {
    id: 'taiga', name: 'Frozen Taiga', kind: 'land',
    temp: [-34, 4], humid: [0.3, 0.95], h: [-3, 380], slope: 0.85, w: 5,
    color: '#7f9a86', rock: '#6f7a80', fog: '#ccd9dc',
    tree: 0.72, treeSet: ['pine_snow', 'pine'], grassD: 0.3, bush: 0.1, rocks: 0.14,
    resources: [['wood', 5], ['pine_resin', 4], ['iron', 3], ['fur', 3], ['mushroom', 2]],
    ambient: 'taiga', enemies: [['wolf_white', 3], ['icestalker', 2]], wildlife: [['deer', 3], ['hare_snow', 3], ['owl', 2], ['fox', 2]],
    poi: [['cabin', 4], ['camp', 3], ['cave', 3], ['ruin', 2]],
    tags: ['snow', 'forest', 'cold'], move: 0.84,
  },
  alpine: {
    id: 'alpine', name: 'Alpine Mountains', kind: 'land',
    temp: [-45, 12], humid: [0, 1], h: [220, 1400], slope: 3, w: 8,
    color: '#9aa2a6', rock: '#6e747a', fog: '#c8d2d8',
    tree: 0.05, treeSet: ['pine_snow'], grassD: 0.16, bush: 0.02, rocks: 0.4,
    resources: [['stone', 6], ['iron', 4], ['silver', 3], ['gold', 2], ['crystal', 2]],
    ambient: 'alpine', enemies: [['harpy', 3], ['stonegolem', 2], ['goat_feral', 1]], wildlife: [['goat', 4], ['owl', 2], ['hare_snow', 2]],
    poi: [['monastery', 3], ['mine', 4], ['cave', 4], ['arch', 2], ['watchtower', 2]],
    tags: ['mountain', 'cold', 'steep'], move: 0.8,
  },
  glacier: {
    id: 'glacier', name: 'Glacier', kind: 'land',
    temp: [-60, -2], humid: [0, 1], h: [300, 1600], slope: 3, w: 4,
    color: '#d8e9f2', rock: '#8fa2ad', fog: '#dbe7ee',
    tree: 0, treeSet: [], grassD: 0.02, bush: 0, rocks: 0.22,
    resources: [['ice', 6], ['crystal', 3], ['silver', 2], ['stone', 3]],
    ambient: 'glacier', enemies: [['icestalker', 3], ['harpy', 1]], wildlife: [['hare_snow', 2], ['owl', 1]],
    poi: [['icecave', 4], ['monolith', 2]],
    tags: ['snow', 'ice', 'cold', 'steep'], move: 0.62, ice: true,
  },
};

/* ── dry ─────────────────────────────────────────────────────────── */
Object.assign(BIOMES, {
  desert: {
    id: 'desert', name: 'Desert', kind: 'land',
    temp: [8, 52], humid: [0, 0.2], h: [-3, 320], slope: 0.75, w: 6,
    color: '#d8b878', rock: '#b99457', fog: '#e6d3ac',
    tree: 0.02, treeSet: ['palm', 'cactus'], grassD: 0.06, bush: 0.05, rocks: 0.1,
    resources: [['sand', 6], ['clay', 3], ['gold', 3], ['copper', 2], ['sunstone', 2], ['cactus_fruit', 2]],
    ambient: 'desert', enemies: [['scorpion', 4], ['sandworm', 2], ['bandit', 2]], wildlife: [['lizard', 4], ['vulture', 3], ['camel_wild', 1]],
    poi: [['oasis', 5], ['pyramid', 3], ['buried', 4], ['camp', 3], ['ruin', 3]],
    tags: ['dry', 'hot'], move: 0.9, sand: true,
  },
  canyon: {
    id: 'canyon', name: 'Red Canyon', kind: 'land',
    temp: [2, 44], humid: [0, 0.34], h: [-10, 520], slope: 3, w: 6,
    color: '#b5623c', rock: '#8f4526', fog: '#d9a98c',
    tree: 0.03, treeSet: ['deadpine'], grassD: 0.08, bush: 0.04, rocks: 0.32,
    resources: [['stone', 5], ['redstone_ore', 4], ['copper', 4], ['gold', 2], ['clay', 2]],
    ambient: 'canyon', enemies: [['scorpion', 3], ['stonegolem', 2], ['harpy', 2]], wildlife: [['vulture', 4], ['lizard', 3], ['goat', 2]],
    poi: [['arch', 4], ['cave', 5], ['mine', 3], ['oldruin', 3], ['bridge', 2]],
    tags: ['dry', 'steep', 'canyon'], move: 0.94,
  },
  badlands: {
    id: 'badlands', name: 'Badlands', kind: 'land',
    temp: [0, 40], humid: [0, 0.3], h: [-5, 380], slope: 1.4, w: 4,
    color: '#a98a5e', rock: '#7d6242', fog: '#d6c4a4',
    tree: 0.01, treeSet: ['deadpine'], grassD: 0.07, bush: 0.03, rocks: 0.26,
    resources: [['stone', 5], ['clay', 4], ['coal', 4], ['iron', 3], ['bone', 2]],
    ambient: 'badlands', enemies: [['bandit', 3], ['scorpion', 2]], wildlife: [['vulture', 4], ['lizard', 2]],
    poi: [['mine', 4], ['ruin', 3], ['camp', 3], ['fossil', 3]],
    tags: ['dry', 'barren'], move: 0.95,
  },

  /* ── wet ─────────────────────────────────────────────────────────── */
  swamp: {
    id: 'swamp', name: 'Swamp', kind: 'land',
    temp: [2, 36], humid: [0.68, 1], h: [-6, 26], slope: 0.45, w: 5,
    color: '#4a5b3a', rock: '#4c5340', fog: '#9fb09a',
    tree: 0.5, treeSet: ['mangrove', 'deadpine'], grassD: 0.5, bush: 0.2, rocks: 0.08,
    resources: [['mud', 5], ['swamp_wood', 5], ['toxic_gland', 3], ['mushroom', 4], ['iron', 2], ['rare_herb', 2]],
    ambient: 'swamp', enemies: [['lurker', 4], ['infected', 3], ['crawler', 2]], wildlife: [['frog', 5], ['bird', 3], ['fish', 3], ['insect', 4]],
    poi: [['sunkenruin', 5], ['shack', 4], ['shrine', 2], ['cave', 2]],
    tags: ['wet', 'murky'], move: 0.72, mud: true,
  },
  jungle: {
    id: 'jungle', name: 'Tropical Jungle', kind: 'land',
    temp: [22, 48], humid: [0.62, 1], h: [-4, 420], slope: 1.1, w: 5,
    color: '#3f7a3c', rock: '#6d6a52', fog: '#b6cdae',
    tree: 1.05, treeSet: ['jungle', 'palm', 'giant_oak'], grassD: 0.8, bush: 0.4, rocks: 0.1,
    resources: [['jungle_wood', 6], ['exotic_fruit', 4], ['rare_herb', 3], ['jade', 3], ['fiber', 3]],
    ambient: 'jungle', enemies: [['panther', 3], ['crawler', 2], ['spitter', 2]], wildlife: [['bird', 6], ['monkey', 3], ['frog', 3], ['insect', 5], ['boar', 2]],
    poi: [['temple', 5], ['oldruin', 3], ['cave', 3], ['shrine', 2]],
    tags: ['wet', 'hot', 'dense'], move: 0.88,
  },

  /* ── hostile ─────────────────────────────────────────────────────── */
  volcanic: {
    id: 'volcanic', name: 'Volcanic Region', kind: 'land',
    temp: [12, 90], humid: [0, 0.4], h: [-20, 900], slope: 3, w: 4,
    color: '#3a3230', rock: '#241f1e', fog: '#8d6a5c',
    tree: 0.02, treeSet: ['deadpine'], grassD: 0.05, bush: 0.02, rocks: 0.34,
    resources: [['obsidian', 6], ['basalt', 5], ['sulfur', 4], ['emberstone', 4], ['gold', 2]],
    ambient: 'volcanic', enemies: [['ashbeast', 4], ['lavaling', 3], ['magmite', 2]], wildlife: [['lizard', 2], ['vulture', 1]],
    poi: [['forge_temple', 4], ['cave', 4], ['obsidian_spire', 3]],
    tags: ['hot', 'lava', 'danger'], move: 0.95, lava: true,
  },
  ashfield: {
    id: 'ashfield', name: 'Ashfield', kind: 'land',
    temp: [6, 60], humid: [0, 0.35], h: [-10, 500], slope: 1.6, w: 3,
    color: '#5c5450', rock: '#3d3735', fog: '#9a8b83',
    tree: 0.02, treeSet: ['deadpine'], grassD: 0.04, bush: 0.02, rocks: 0.2,
    resources: [['ash', 6], ['sulfur', 4], ['obsidian', 3], ['coal', 4]],
    ambient: 'ashfield', enemies: [['ashbeast', 3], ['magmite', 2]], wildlife: [['vulture', 2]],
    poi: [['ruin', 3], ['cave', 3], ['obsidian_spire', 2]],
    tags: ['hot', 'barren', 'danger'], move: 0.9,
  },

  /* ── rare variants (spec 5) ──────────────────────────────────────── */
  frozen_jungle: {
    id: 'frozen_jungle', name: 'Frozen Jungle', kind: 'land', rare: true,
    temp: [-60, 45], humid: [0, 1], h: [-20, 700], slope: 2, w: 1,
    color: '#a9c8c4', rock: '#7c908f', fog: '#cfe2e2',
    tree: 0.8, treeSet: ['frosted_jungle'], grassD: 0.3, bush: 0.16, rocks: 0.14,
    resources: [['ice', 4], ['jungle_wood', 4], ['crystal', 4], ['frostbloom', 3]],
    ambient: 'frozenjungle', enemies: [['icestalker', 3], ['wisp', 2]], wildlife: [['hare_snow', 3], ['owl', 2]],
    poi: [['oldruin', 4], ['hollowspire', 3]], tags: ['rare', 'snow', 'cold'], move: 0.85,
  },
  red_snow: {
    id: 'red_snow', name: 'Red Snow Valley', kind: 'land', rare: true,
    temp: [-60, 45], humid: [0, 1], h: [-20, 700], slope: 2, w: 1,
    color: '#d9a3a0', rock: '#a56a63', fog: '#e5c9c6',
    tree: 0.12, treeSet: ['pine_snow'], grassD: 0.2, bush: 0.05, rocks: 0.2,
    resources: [['redstone_ore', 5], ['ice', 4], ['crystal', 3], ['gold', 2]],
    ambient: 'tundra', enemies: [['icestalker', 3], ['bloodhound', 2]], wildlife: [['hare_snow', 3], ['owl', 2]],
    poi: [['monolith', 4], ['icecave', 3]], tags: ['rare', 'snow'], move: 0.86,
  },
  crystal_forest: {
    id: 'crystal_forest', name: 'Crystal Forest', kind: 'land', rare: true,
    temp: [-60, 45], humid: [0, 1], h: [-20, 700], slope: 2, w: 1,
    color: '#9fb6d8', rock: '#6f7fa8', fog: '#c9d8ef',
    tree: 0.6, treeSet: ['crystal_tree'], grassD: 0.3, bush: 0.1, rocks: 0.3,
    resources: [['crystal', 8], ['echo_shard', 4], ['silver', 3], ['stone', 2]],
    ambient: 'crystal', enemies: [['wisp', 4], ['shardling', 3]], wildlife: [['bird', 3]],
    poi: [['hollowspire', 5], ['crystal_cavern', 4]], tags: ['rare', 'resonant'], move: 0.95,
  },
  volcanic_swamp: {
    id: 'volcanic_swamp', name: 'Volcanic Swamp', kind: 'land', rare: true,
    temp: [-60, 90], humid: [0, 1], h: [-20, 200], slope: 1.2, w: 1,
    color: '#4a4034', rock: '#2e2a24', fog: '#9c8b74',
    tree: 0.45, treeSet: ['deadpine', 'mangrove'], grassD: 0.3, bush: 0.16, rocks: 0.2,
    resources: [['sulfur', 5], ['mud', 4], ['obsidian', 4], ['toxic_gland', 3]],
    ambient: 'volcanicswamp', enemies: [['lurker', 3], ['lavaling', 3]], wildlife: [['frog', 3], ['insect', 4]],
    poi: [['sunkenruin', 4], ['forge_temple', 3]], tags: ['rare', 'lava', 'wet'], move: 0.7,
  },
  dead_forest: {
    id: 'dead_forest', name: 'Dead Forest', kind: 'land', rare: true,
    temp: [-60, 45], humid: [0, 1], h: [-20, 600], slope: 2, w: 1,
    color: '#6b6259', rock: '#4e4842', fog: '#b0a79c',
    tree: 0.7, treeSet: ['deadtree'], grassD: 0.12, bush: 0.05, rocks: 0.16,
    resources: [['deadwood', 6], ['bone', 4], ['ash', 3], ['echo_shard', 2]],
    ambient: 'deadforest', enemies: [['hollow', 4], ['crow_swarm', 2]], wildlife: [['crow', 4]],
    poi: [['oldruin', 4], ['barrow', 4]], tags: ['rare', 'cursed'], move: 0.95,
  },
  flooded_desert: {
    id: 'flooded_desert', name: 'Flooded Desert', kind: 'land', rare: true,
    temp: [-60, 60], humid: [0, 1], h: [-20, 200], slope: 1.2, w: 1,
    color: '#c8b184', rock: '#9c8355', fog: '#ded0ae',
    tree: 0.08, treeSet: ['palm'], grassD: 0.3, bush: 0.1, rocks: 0.14,
    resources: [['sand', 5], ['clay', 4], ['kelp', 3], ['gold', 2]],
    ambient: 'floodeddesert', enemies: [['crawler', 3], ['scorpion', 2]], wildlife: [['fish', 4], ['gull', 3]],
    poi: [['oasis', 4], ['shipwreck', 3], ['buried', 3]], tags: ['rare', 'wet', 'dry'], move: 0.8,
  },
  mushroom_valley: {
    id: 'mushroom_valley', name: 'Giant Mushroom Valley', kind: 'land', rare: true,
    temp: [-60, 45], humid: [0, 1], h: [-20, 400], slope: 1.4, w: 1,
    color: '#7a6a86', rock: '#5b4f66', fog: '#c3b6cf',
    tree: 0.7, treeSet: ['giant_mushroom'], grassD: 0.5, bush: 0.2, rocks: 0.1,
    resources: [['mushroom', 8], ['spore', 5], ['rare_herb', 4], ['glowcap', 4]],
    ambient: 'mushroom', enemies: [['spitter', 3], ['shardling', 2]], wildlife: [['insect', 5], ['frog', 3]],
    poi: [['shrine', 4], ['hollowspire', 3]], tags: ['rare', 'spores'], move: 0.92,
  },
});

/* ─────────────────────────── lookup ─────────────────────────────────── */

export const BIOME_IDS = Object.keys(BIOMES);
export const LAND_IDS = BIOME_IDS.filter(id => BIOMES[id].kind === 'land' && !BIOMES[id].rare);
export const RARE_IDS = BIOME_IDS.filter(id => BIOMES[id].rare);

export function biome(id) { return BIOMES[id] || BIOMES.plains; }
export function biomeName(id) { return biome(id).name; }
export function isWaterBiome(id) { return biome(id).kind === 'water'; }

/**
 * Soft membership: 1 inside [lo,hi], smooth falloff to zero at 2*soft.
 * Bounded support keeps the lookup cheap — most biomes reject immediately.
 */
function band(v, lo, hi, soft) {
  if (v >= lo && v <= hi) return 1;
  const d = v < lo ? (lo - v) : (v - hi);
  const span = soft * 2;
  if (d >= span) return 0;
  const t = d / span;
  const u = 1 - t;
  return u * u * (3 - 2 * u);
}

const RARE_BY_KIND = {
  0: 'frozen_jungle', 1: 'red_snow', 2: 'crystal_forest', 3: 'volcanic_swamp',
  4: 'dead_forest', 5: 'flooded_desert', 6: 'mushroom_valley',
};

/**
 * Choose biome + blend weights for one world column.
 * ctx = { temp, humid, h, slope, canyon, volcanic, oldGrowth, nearCoast,
 *         anomaly (0..1), anomalyKind (int) }
 */
export function selectBiome(ctx) {
  const { temp, humid, h, slope } = ctx;

  if (h < -24) return single('deep_ocean');
  if (h < -0.4) return single('ocean');

  // Rare variants: the anomaly field has to be extreme, so these are rare.
  if (ctx.anomaly > 0.985) {
    const id = RARE_BY_KIND[ctx.anomalyKind % RARE_IDS.length] || 'crystal_forest';
    const edge = (ctx.anomaly - 0.985) / 0.015;      // 0 at rim, 1 at core
    const partner = baseLandScore(ctx).id;
    return { id, weights: [{ id, w: 0.25 + 0.75 * edge }, { id: partner, w: 0.75 * (1 - edge) }] };
  }

  return baseLandScore(ctx);
}

function single(id) { return { id, weights: [{ id, w: 1 }] }; }

/** Scored lookup over the ordinary land biomes, returns blended result. */
function baseLandScore(ctx) {
  const { temp, humid, h, slope, canyon, volcanic, oldGrowth, nearCoast } = ctx;
  const scores = [];

  for (let i = 0; i < LAND_IDS.length; i++) {
    const b = BIOMES[LAND_IDS[i]];
    // cheap rejection on hard bounds first
    if (temp < b.temp[0] - 10 || temp > b.temp[1] + 10) continue;
    if (humid < b.humid[0] - 0.22 || humid > b.humid[1] + 0.22) continue;
    const hsoft = Math.max(14, (b.h[1] - b.h[0]) * 0.22);
    if (h < b.h[0] - hsoft * 2 || h > b.h[1] + hsoft * 2) continue;

    let s = b.w;
    s *= band(temp, b.temp[0], b.temp[1], 5.0);
    s *= band(humid, b.humid[0], b.humid[1], 0.11);
    s *= band(h, b.h[0], b.h[1], hsoft);
    if (slope > b.slope) {
      const over = (slope - b.slope) * 3.2;
      s *= Math.max(0, 1 - over * over * 0.35);
    }
    if (s < 0.004) continue;

    // Contextual rules — geography must make sense (spec 39).
    switch (b.id) {
      case 'canyon':   s *= 0.15 + canyon * 2.4; break;
      case 'badlands': s *= 0.35 + canyon * 1.2; break;
      case 'volcanic': s *= volcanic > 0.5 ? 0.2 + (volcanic - 0.5) * 5 : 0.02; break;
      case 'ashfield': s *= volcanic > 0.28 ? 0.1 + (volcanic - 0.28) * 2.2 : 0.02; break;
      case 'ancient':  s *= Math.pow(Math.max(0, oldGrowth), 1.7) * 3.4; break;
      case 'coast':    s *= nearCoast ? 2.4 : 0.02; break;
      case 'swamp':    s *= humid > 0.72 && h < 22 ? 1.9 : 0.05; break;
      case 'glacier':  s *= temp < -1 && h > 340 ? 1.6 : 0.03; break;
      case 'alpine':   s *= h > 200 ? 1 + slope * 0.9 : 0.05; break;
      case 'desert':   s *= humid < 0.26 ? 1.7 : 0.1; break;
      case 'jungle':   s *= temp > 23 && humid > 0.64 ? 1.9 : 0.05; break;
      case 'tundra':   s *= temp < 3 ? 1.5 : 0.08; break;
      case 'taiga':    s *= temp < 6 ? 1.4 : 0.1; break;
      default: break;
    }
    if (s > 0.004) scores.push([b.id, s]);
  }

  if (!scores.length) return single('plains');
  scores.sort((a, b) => b[1] - a[1]);

  const top = scores[0];
  const second = scores[1];
  const weights = [{ id: top[0], w: top[1] }];
  if (second && second[1] > top[1] * 0.34) weights.push({ id: second[0], w: second[1] * 0.8 });
  const third = scores[2];
  if (third && third[1] > top[1] * 0.5) weights.push({ id: third[0], w: third[1] * 0.55 });

  let sum = 0;
  for (const w of weights) sum += w.w;
  for (const w of weights) w.w /= sum;
  return { id: top[0], weights };
}

/** Aggregate a numeric/string field across blended biomes. */
export function blendField(weights, field) {
  let v = 0, sum = 0;
  for (const w of weights) {
    const b = BIOMES[w.id];
    if (!b) continue;
    const f = b[field];
    if (typeof f === 'number') { v += f * w.w; sum += w.w; }
  }
  return sum ? v / sum : 0;
}

export function blendColor(weights, field) {
  let r = 0, g = 0, b = 0, sum = 0;
  for (const w of weights) {
    const def = BIOMES[w.id];
    if (!def || typeof def[field] !== 'string') continue;
    const c = parseInt(def[field].slice(1), 16);
    r += ((c >> 16) & 255) * w.w;
    g += ((c >> 8) & 255) * w.w;
    b += (c & 255) * w.w;
    sum += w.w;
  }
  if (!sum) return [128, 128, 128];
  return [r / sum, g / sum, b / sum];
}

/** Merged resource table for a column (used by deposit placement). */
export function resourceTable(weights) {
  const table = new Map();
  for (const w of weights) {
    const def = BIOMES[w.id];
    if (!def || !def.resources) continue;
    for (const [id, wt] of def.resources) table.set(id, (table.get(id) || 0) + wt * w.w);
  }
  return [...table.entries()];
}

/** Merged creature table. */
export function creatureTable(weights, field) {
  const table = new Map();
  for (const w of weights) {
    const def = BIOMES[w.id];
    if (!def || !def[field]) continue;
    for (const [id, wt] of def[field]) table.set(id, (table.get(id) || 0) + wt * w.w);
  }
  return [...table.entries()].filter(e => e[1] > 0.02);
}

export function biomeTags(id) { return BIOMES[id] ? BIOMES[id].tags || [] : []; }
export function hasTag(id, tag) { return biomeTags(id).includes(tag); }
