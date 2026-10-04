/**
 * WANDERER — Procedural naming
 * ----------------------------
 * Settlements, landmarks, NPCs and item variants all pull from here so the
 * world reads like somewhere with a history.
 */

import { Rng } from './rng.js';

const SETTLE_A = ['Hollow', 'Ash', 'Wind', 'Bracken', 'Thorn', 'Grey', 'Mourn', 'Salt', 'Ember', 'Frost',
  'Willow', 'Raven', 'Stag', 'Cinder', 'Alder', 'Bramble', 'Quiet', 'Long', 'Bitter', 'Gale',
  'Stone', 'Mere', 'Drift', 'Wold', 'Kettle', 'Farrow', 'Nine', 'Hallow', 'Pike', 'Rush'];
const SETTLE_B = ['ford', 'reach', 'march', 'hollow', 'stead', 'wick', 'bury', 'fell', 'mere', 'watch',
  'gate', 'bridge', 'field', 'rock', 'well', 'dell', 'moor', 'crest', 'landing', 'keep'];
const SETTLE_C = ['', '', '', ' Village', ' Camp', ' Crossing', ' Hold', ' Rest', ' Landing'];

const LAND_A = ['The Weeping', 'The Broken', 'The Silent', 'The Old', 'The Ninth', 'The Sunken',
  'The Waking', 'The Hollow', 'The Glass', 'The Last', 'The Whispering', 'The Burning'];
const LAND_B = ['Arch', 'Spire', 'Crown', 'Gate', 'Eye', 'Bone', 'Choir', 'Throne', 'Mirror', 'Verge',
  'Lantern', 'Finger', 'Maw', 'Circle', 'Reach'];

const FIRST = ['Bran', 'Sela', 'Odile', 'Marek', 'Yrsa', 'Cadel', 'Nima', 'Tobin', 'Rhea', 'Aldous',
  'Vesna', 'Corwin', 'Ilse', 'Doran', 'Mab', 'Perrin', 'Solveig', 'Hale', 'Wren', 'Osric',
  'Juno', 'Fen', 'Aveline', 'Cass', 'Rowan', 'Eme', 'Garrick', 'Tilda', 'Hesper', 'Lucan'];
const LAST = ['Ashdown', 'Vell', 'Marrow', 'Thorne', 'Quill', 'Halloway', 'Fenmore', 'Grimsby', 'Orr',
  'Sallow', 'Brightwater', 'Kesh', 'Underhill', 'Vance', 'Pike', 'Rook', 'Mireault', 'Dunmore'];

const ROLES = ['Farmer', 'Blacksmith', 'Trader', 'Hunter', 'Miner', 'Explorer', 'Guard', 'Scholar',
  'Herder', 'Fisher', 'Cartographer', 'Herbalist', 'Mason', 'Cook'];

const PERSONALITY = ['warm', 'guarded', 'curious', 'gruff', 'superstitious', 'cheerful', 'tired',
  'ambitious', 'gentle', 'wary', 'boisterous', 'quiet'];

const PREFIX = ['Rustbound', 'Frost-Touched', 'Emberforged', 'Hollow', 'Sunbleached', 'Thornwrapped',
  'Tideborn', 'Ashen', 'Gilded', 'Whispering', 'Stormcut', 'Rootbound', 'Glassheart', 'Ninth'];
const SUFFIX = ['of the Ninth Tide', 'of Quiet Water', 'of the Old Choir', 'of Broken Vows',
  'of the Long Dark', 'of Salt and Ash', 'of the Waking Stone', 'of Far Roads', ''];

export function settlementName(rng) {
  return rng.pick(SETTLE_A) + rng.pick(SETTLE_B) + (rng.chance(0.22) ? rng.pick(SETTLE_C) : '');
}

export function landmarkName(rng) {
  if (rng.chance(0.55)) return `${rng.pick(LAND_A)} ${rng.pick(LAND_B)}`;
  return `${rng.pick(SETTLE_A)}${rng.pick(SETTLE_B)} ${rng.pick(LAND_B)}`;
}

export function personName(rng) {
  return { first: rng.pick(FIRST), last: rng.pick(LAST) };
}

export function npcIdentity(rng) {
  const n = personName(rng);
  return {
    first: n.first, last: n.last, name: `${n.first} ${n.last}`,
    role: rng.pick(ROLES),
    personality: rng.pick(PERSONALITY),
  };
}

/** Procedural weapon/Artefact naming (spec 17). */
export function artifactName(rng, baseName) {
  const p = rng.chance(0.75) ? rng.pick(PREFIX) + ' ' : '';
  const s = rng.chance(0.2) ? ' ' + rng.pick(SUFFIX) : '';
  return `${p}${baseName}${s}`;
}

export const ROLE_LIST = ROLES;
export const PERSONALITY_LIST = PERSONALITY;
export { Rng };
