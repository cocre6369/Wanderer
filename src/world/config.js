/**
 * WANDERER — World configuration schema
 * -------------------------------------
 * Everything the world creation menu exposes, plus the presets behind each
 * "world type" and the randomiser. A world is fully described by
 * { name, seed, size, type, gen } — that tuple is what gets saved and what
 * makes a world reproducible (spec 40).
 */

export const VERSION = {
  major: 1,
  minor: 0,
  patch: 0,
  build: 'stable',
  schema: 3,
  get string() { return `${this.major}.${this.minor}.${this.patch}`; },
  get full() { return `${this.string}-${this.build}`; },
};

export const TILE_METERS = 128;      // one terrain tile is 128 m across
export const CELL_METERS = 4;        // LOD0 heightfield resolution
export const SEA_LEVEL = 0;          // world Y of the ocean surface
export const METERS_PER_UNIT = 1;    // 1 three.js unit = 1 metre

export const WORLD_SIZES = {
  small:    { id: 'small',    label: 'Small',       meters: 3072,   desc: 'A single great valley. ~3 km across. Good for a focused expedition.' },
  medium:   { id: 'medium',   label: 'Medium',      meters: 6144,   desc: 'A full region with several biomes. ~6 km across.' },
  large:    { id: 'large',    label: 'Large',       meters: 12288,  desc: 'A continent fragment. ~12 km across. Long journeys.' },
  huge:     { id: 'huge',     label: 'Huge',        meters: 24576,  desc: 'An enormous landmass. ~24 km. Days of travel.' },
  infinite: { id: 'infinite', label: 'Infinite',    meters: 0,      desc: 'Unbounded. The world never ends — generation streams forever.' },
};

export const WORLD_TYPES = {
  normal:   { id: 'normal',   label: 'Normal',   desc: 'The intended Wanderer experience. Balanced climate, danger and discovery.' },
  harsh:    { id: 'harsh',    label: 'Harsh',    desc: 'Scarce resources, brutal weather, hungry things in the dark.' },
  peaceful: { id: 'peaceful', label: 'Peaceful', desc: 'No hostile wildlife. A world for builders, cartographers and wanderers.' },
  extreme:  { id: 'extreme',  label: 'Extreme',  desc: 'Towering ranges, violent storms, deep caves. Not forgiving.' },
  explorer: { id: 'explorer', label: 'Explorer', desc: 'Dense with ruins, landmarks and dungeons. Built for discovery.' },
  custom:   { id: 'custom',   label: 'Custom',   desc: 'Every generation dial is yours.' },
};

/** Every generation dial. `g` values are 0..100 unless noted. */
export const GEN_FIELDS = [
  { key: 'mountainFrequency', label: 'Mountain Frequency', group: 'Terrain',    def: 50, hint: 'How often mountain ranges rise out of the land.' },
  { key: 'mountainHeight',    label: 'Mountain Height',    group: 'Terrain',    def: 55, hint: 'Peak elevation. High values create skylines visible for kilometres.' },
  { key: 'oceanSize',         label: 'Ocean Size',         group: 'Terrain',    def: 40, hint: 'How much of the world sits below sea level.' },
  { key: 'islandFrequency',   label: 'Island Frequency',   group: 'Terrain',    def: 40, hint: 'Scattered islands and archipelagos in open water.' },
  { key: 'canyonFrequency',   label: 'Canyon Frequency',   group: 'Terrain',    def: 45, hint: 'Deep ravines, gorges and red-rock country.' },
  { key: 'plateauFrequency',  label: 'Plateau Frequency',  group: 'Terrain',    def: 40, hint: 'Flat-topped mesas and terraced highlands.' },
  { key: 'riverFrequency',    label: 'River Frequency',    group: 'Water',      def: 55, hint: 'Number of river sources. Rivers always flow downhill.' },
  { key: 'lakeFrequency',     label: 'Lake Frequency',     group: 'Water',      def: 45, hint: 'Basin lakes in low ground.' },
  { key: 'swampFrequency',    label: 'Swamp Frequency',    group: 'Water',      def: 40, hint: 'Low, wet, murky ground.' },
  { key: 'forestDensity',     label: 'Forest Density',     group: 'Climate',    def: 55, hint: 'Tree cover where climate allows it.' },
  { key: 'desertFrequency',   label: 'Desert Frequency',   group: 'Climate',    def: 40, hint: 'Arid belts.' },
  { key: 'snowFrequency',     label: 'Snow Frequency',     group: 'Climate',    def: 45, hint: 'Cold at altitude and towards the poles.' },
  { key: 'jungleFrequency',   label: 'Jungle Frequency',   group: 'Climate',    def: 40, hint: 'Hot, wet tropical growth.' },
  { key: 'caveFrequency',     label: 'Cave Frequency',     group: 'Underground', def: 50, hint: 'Entrances to the underground.' },
  { key: 'caveSize',          label: 'Cave Size',          group: 'Underground', def: 50, hint: 'How vast the caverns run.' },
  { key: 'dungeonFrequency',  label: 'Dungeon Frequency',  group: 'Underground', def: 40, hint: 'Built things buried deep.' },
  { key: 'resourceAbundance', label: 'Resource Abundance', group: 'Life',       def: 55, hint: 'Ore, wood, stone and plant wealth.' },
  { key: 'wildlifeDensity',   label: 'Wildlife Density',   group: 'Life',       def: 55, hint: 'Deer, boar, foxes, birds, fish.' },
  { key: 'enemyDensity',      label: 'Enemy Density',      group: 'Life',       def: 50, hint: 'Hostile creatures per region.' },
  { key: 'ruinFrequency',     label: 'Ruin Frequency',     group: 'Civilisation', def: 50, hint: 'What the previous inhabitants left behind.' },
  { key: 'villageFrequency',  label: 'Village Frequency',  group: 'Civilisation', def: 45, hint: 'Living settlements with people in them.' },
  { key: 'landmarkFrequency', label: 'Landmark Frequency', group: 'Civilisation', def: 50, hint: 'Giant arches, spires, craters and old statues.' },
  { key: 'mysteryFrequency',  label: 'Mystery Frequency',  group: 'Civilisation', def: 35, hint: 'How often the world does something unexplainable.' },
  { key: 'weatherIntensity',  label: 'Weather Intensity',  group: 'Atmosphere', def: 50, hint: 'Storms, blizzards, sandstorms and fog.' },
  { key: 'dayLength',         label: 'Day / Night Length', group: 'Atmosphere', def: 40, hint: 'Minutes of real time for one full day.' },
  { key: 'difficulty',        label: 'World Difficulty',   group: 'Atmosphere', def: 45, hint: 'Damage taken, hunger rate and cold.' },
];

export function defaultGen() {
  const g = {};
  for (const f of GEN_FIELDS) g[f.key] = f.def;
  return g;
}

/** World type presets — applied over the defaults. */
const PRESETS = {
  normal:   {},
  harsh:    { resourceAbundance: 28, enemyDensity: 78, weatherIntensity: 74, difficulty: 72, caveFrequency: 62, mountainHeight: 66, wildlifeDensity: 35 },
  peaceful: { enemyDensity: 0, weatherIntensity: 25, difficulty: 20, resourceAbundance: 72, wildlifeDensity: 80, forestDensity: 65 },
  extreme:  { mountainHeight: 90, mountainFrequency: 74, canyonFrequency: 68, weatherIntensity: 92, enemyDensity: 85, caveFrequency: 78, caveSize: 74, difficulty: 88, resourceAbundance: 42, snowFrequency: 60 },
  explorer: { ruinFrequency: 80, villageFrequency: 65, dungeonFrequency: 72, landmarkFrequency: 82, mysteryFrequency: 62, resourceAbundance: 68, enemyDensity: 38, caveFrequency: 66 },
  custom:   {},
};

export function genForType(type) {
  const g = defaultGen();
  const p = PRESETS[type] || {};
  for (const k in p) g[k] = p[k];
  return g;
}

export function applyType(g, type) {
  const p = PRESETS[type] || {};
  for (const k in p) g[k] = p[k];
  return g;
}

/** "Randomize everything" — deliberately unusual but always playable. */
export function randomizeGen(rng) {
  const g = {};
  for (const f of GEN_FIELDS) {
    // Bias toward the extremes so the world feels strange, never mushy.
    let v;
    const roll = rng.float();
    if (roll < 0.42) v = rng.range(0, 22);
    else if (roll < 0.84) v = rng.range(78, 100);
    else v = rng.range(35, 65);
    g[f.key] = Math.round(v);
  }
  // Keep a few things sane no matter how odd the roll.
  g.dayLength = Math.round(rng.range(18, 70));
  g.difficulty = Math.round(rng.range(20, 85));
  g.enemyDensity = Math.min(100, g.enemyDensity);
  return g;
}

export const START_TYPES = ['normal', 'harsh', 'peaceful', 'extreme', 'explorer', 'custom'];

/** Difficulty multipliers used by gameplay systems. */
export function difficultyProfile(gen) {
  const d = gen.difficulty / 100;
  const peaceful = gen.enemyDensity <= 0;
  return {
    damageTaken: peaceful ? 0.35 : 0.55 + d * 1.15,
    damageDealt: 1.25 - d * 0.45,
    hungerRate: 0.6 + d * 0.9,
    coldRate: 0.5 + d * 1.2,
    staminaRegen: 1.15 - d * 0.35,
    enemyCount: peaceful ? 0 : 0.4 + d * 1.3,
    respawnMinutes: 6 + (1 - d) * 8,
    peaceful,
  };
}

/** Day length in real minutes (spec 22). */
export function dayLengthMinutes(gen) {
  return Math.max(6, Math.min(120, gen.dayLength));
}

export function clampGen(gen) {
  const out = {};
  for (const f of GEN_FIELDS) {
    const v = Number(gen[f.key]);
    out[f.key] = Number.isFinite(v) ? Math.round(Math.max(0, Math.min(100, v))) : f.def;
  }
  // dayLength is in minutes, not a percentage.
  out.dayLength = Math.round(Math.max(6, Math.min(120, Number(gen.dayLength) || 40)));
  return out;
}

export function genSignature(gen) {
  return GEN_FIELDS.map(f => `${f.key[0]}${f.key.slice(1, 3)}:${clampGen(gen)[f.key]}`).join('|');
}

export function worldSizeMeters(size) {
  return WORLD_SIZES[size] ? WORLD_SIZES[size].meters : 6144;
}
