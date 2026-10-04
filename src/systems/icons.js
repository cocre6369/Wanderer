/**
 * WANDERER — Item icons
 * ---------------------
 * Icons are drawn as SVG at runtime and cached as data URLs: crisp at any
 * size, a few hundred bytes each, and no image files to ship. Every shape
 * takes the item's two palette colours so a copper axe and an iron axe read
 * differently at a glance.
 */

const cache = new Map();

export function iconURL(item, size = 64) {
  const key = `${item.icon}|${item.colors ? item.colors[0] : '#fff'}|${item.colors ? item.colors[1] : '#000'}|${size}`;
  if (cache.has(key)) return cache.get(key);
  const svg = iconSVG(item, size);
  const url = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  cache.set(key, url);
  return url;
}

export function iconSVG(item, size = 64) {
  const a = (item.colors && item.colors[0]) || '#c8c8c8';
  const b = (item.colors && item.colors[1]) || '#6a6a6a';
  const shape = SHAPES[item.icon] || SHAPES.misc;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">${shape(a, b)}</svg>`;
}

const S = {
  poly: (pts, fill, stroke) => `<polygon points="${pts}" fill="${fill}" stroke="${stroke || 'none'}" stroke-width="1.5" stroke-linejoin="round"/>`,
  rect: (x, y, w, h, fill, rx = 2, rot) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${rot ? ` transform="rotate(${rot} ${x + w / 2} ${y + h / 2})"` : ''}/>`,
  circ: (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`,
  path: (d, fill, stroke, w = 2) => `<path d="${d}" fill="${fill}" stroke="${stroke || 'none'}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`,
};

const SHAPES = {
  misc: (a, b) => S.poly('20,16 44,16 50,34 32,52 14,34', a, b),
  log: (a, b) => S.rect(12, 24, 40, 16, a, 7) + S.circ(52, 32, 8, b) + S.circ(52, 32, 4, a) + S.rect(12, 24, 40, 4, b, 2),
  rock: (a, b) => S.poly('14,40 22,20 40,14 52,26 48,44 28,50', a, b) + S.poly('22,20 40,14 34,30', b),
  clump: (a, b) => S.path('M16 44 q4 -16 16 -18 q14 -2 18 12 q2 10 -10 12 q-18 3 -24 -6 z', a, b),
  fiber: (a, b) => S.path('M20 50 q6 -22 12 -34 M32 50 q2 -22 6 -32 M44 50 q0 -18 2 -26', 'none', a, 4) + S.path('M16 50 h32', 'none', b, 4),
  cloth: (a, b) => S.path('M14 18 h36 v28 q-9 6 -18 0 q-9 -6 -18 0 z', a, b) + S.path('M14 26 h36 M14 34 h36', 'none', b, 2),
  hide: (a, b) => S.path('M20 12 q12 6 24 0 q6 12 2 24 q-4 14 -14 16 q-10 -2 -14 -16 q-4 -12 2 -24 z', a, b) + S.circ(32, 30, 5, b),
  bone: (a, b) => S.rect(18, 28, 28, 8, a, 4) + S.circ(18, 28, 6, a) + S.circ(18, 40, 6, a) + S.circ(46, 28, 6, a) + S.circ(46, 40, 6, a),
  ore: (a, b) => S.poly('12,42 20,22 38,16 52,28 46,46 26,52', b) + S.poly('24,30 34,24 40,32 32,40', a) + S.poly('34,36 42,34 44,42', a),
  ingot: (a, b) => S.poly('12,40 22,26 42,26 52,40 42,48 22,48', a, b) + S.poly('22,26 42,26 46,32 18,32', b),
  shard: (a, b) => S.poly('32,8 44,28 38,54 26,54 20,28', a, b) + S.poly('32,8 38,28 32,54 26,28', b),
  gem: (a, b) => S.poly('32,10 50,26 42,52 22,52 14,26', a, b) + S.poly('32,10 42,26 32,52 22,26', b) + S.path('M14 26 h36', 'none', b, 1.5),
  hex: (a, b) => S.poly('32,8 50,18 50,42 32,54 14,42 14,18', a, b) + S.poly('32,18 42,24 42,38 32,45 22,38 22,24', b),
  mushroom: (a, b) => S.path('M16 30 q0 -16 16 -16 q16 0 16 16 z', a, b) + S.rect(28, 30, 8, 20, '#e8dcc4', 3) + S.circ(24, 24, 3, b) + S.circ(38, 22, 2.5, b),
  herb: (a, b) => S.path('M32 52 V26', 'none', b, 3) + S.path('M32 34 q-14 -4 -16 -18 q14 0 16 18 z', a, b) + S.path('M32 28 q14 -4 16 -16 q-14 -2 -16 16 z', a, b),
  flower: (a, b) => S.circ(32, 26, 7, '#f0d060') + S.circ(20, 22, 7, a) + S.circ(44, 22, 7, a) + S.circ(24, 36, 7, a) + S.circ(40, 36, 7, a) + S.path('M32 32 V54', 'none', b, 3),
  berry: (a, b) => S.circ(24, 38, 10, a) + S.circ(40, 34, 9, a) + S.circ(34, 46, 8, a) + S.circ(21, 35, 3, b) + S.path('M30 24 q4 -10 10 -12', 'none', b, 3),
  wheat: (a, b) => S.path('M32 54 V20', 'none', b, 3) + S.path('M32 22 q-8 -2 -10 -10 q10 0 10 10 z M32 30 q-9 -2 -11 -10 q11 0 11 10 z M32 22 q8 -2 10 -10 q-10 0 -10 10 z M32 30 q9 -2 11 -10 q-11 0 -11 10 z', a, b),
  bread: (a, b) => S.path('M12 34 q0 -14 20 -14 q20 0 20 14 q0 12 -20 12 q-20 0 -20 -12 z', a, b) + S.path('M22 26 q4 6 0 14 M32 24 q4 8 0 16 M42 26 q4 6 0 14', 'none', b, 2),
  meat: (a, b) => S.path('M18 24 q14 -10 26 -2 q10 8 4 20 q-6 12 -20 10 q-14 -2 -14 -14 q0 -8 4 -14 z', a, b) + S.path('M14 44 q-4 6 2 8 q6 2 8 -4', 'none', '#e8dcc4', 5),
  fish: (a, b) => S.path('M12 32 q10 -14 24 -10 q14 4 16 10 q-2 6 -16 10 q-14 4 -24 -10 z', a, b) + S.poly('52,32 62,22 62,42', a, b) + S.circ(22, 28, 2.5, '#222'),
  shell: (a, b) => S.path('M12 44 q0 -22 20 -22 q20 0 20 22 z', a, b) + S.path('M22 44 q2 -16 10 -20 M32 22 v22 M42 44 q-2 -16 -10 -20', 'none', b, 2),
  egg: (a, b) => S.path('M32 12 q14 12 14 24 q0 16 -14 16 q-14 0 -14 -16 q0 -12 14 -24 z', a, b),
  bowl: (a, b) => S.path('M12 28 h40 q-2 22 -20 22 q-18 0 -20 -22 z', a, b) + S.path('M18 28 q6 -8 14 -8 q8 0 14 8', '#8a5a2a', b, 2),
  potion: (a, b) => S.rect(26, 10, 12, 10, '#c8c0a8', 2) + S.path('M24 22 h16 l6 22 q2 10 -14 10 q-16 0 -14 -10 z', '#d8e8ee', b) + S.path('M22 34 h20 l2 10 q2 10 -12 10 q-14 0 -12 -10 z', a),
  torch: (a, b) => S.rect(28, 26, 8, 30, a, 3) + S.path('M32 6 q10 10 6 18 q-3 6 -6 6 q-3 0 -6 -6 q-4 -8 6 -18 z', '#ffb35c', '#e07a1a') + S.path('M32 14 q5 6 2 10 q-2 3 -2 3 q0 0 -2 -3 q-3 -4 2 -10 z', '#ffe08a'),
  lantern: (a, b) => S.rect(20, 18, 24, 32, a, 4) + S.rect(24, 24, 16, 20, '#ffd88a', 3) + S.rect(28, 10, 8, 8, b, 2) + S.path('M24 10 q8 -8 16 0', 'none', b, 3),
  coil: (a, b) => S.circ(32, 32, 18, 'none') + S.path('M32 14 a18 18 0 1 1 -0.1 0 M32 22 a10 10 0 1 1 -0.1 0', 'none', a, 5) + S.path('M48 40 q6 8 2 14', 'none', a, 4),
  pick: (a, b) => S.rect(29, 20, 6, 38, b, 3, -20) + S.path('M12 22 q20 -12 40 0 q-20 6 -40 0 z', a, b),
  axe: (a, b) => S.rect(29, 14, 6, 44, b, 3) + S.path('M35 16 q18 4 18 16 q0 12 -18 14 q6 -14 0 -30 z', a, b),
  hammer: (a, b) => S.rect(29, 22, 6, 36, b, 3) + S.rect(16, 10, 32, 16, a, 4),
  hoe: (a, b) => S.rect(29, 14, 6, 44, b, 3, 12) + S.rect(14, 44, 24, 8, a, 3, 12),
  can: (a, b) => S.rect(18, 24, 26, 26, a, 5) + S.path('M44 30 q12 -4 10 8', 'none', b, 4) + S.rect(26, 16, 10, 8, b, 2),
  rod: (a, b) => S.path('M14 52 q22 -34 40 -38', 'none', b, 4) + S.path('M54 14 q2 18 -6 26', 'none', a, 2) + S.circ(48, 44, 3, a),
  sickle: (a, b) => S.rect(28, 30, 7, 26, b, 3) + S.path('M18 30 q0 -18 20 -18 q-8 8 -8 18 z', a, b),
  spy: (a, b) => S.rect(10, 26, 44, 14, a, 6) + S.rect(6, 22, 12, 22, b, 4) + S.rect(46, 28, 12, 10, b, 3),
  compass: (a, b) => S.circ(32, 32, 22, a) + S.circ(32, 32, 17, '#e8e0c8') + S.poly('32,18 37,32 32,46 27,32', '#c04a3a'),
  chest: (a, b) => S.rect(12, 22, 40, 28, a, 4) + S.rect(12, 22, 40, 8, b, 4) + S.rect(28, 32, 8, 10, '#c8b078', 2),
  cloak: (a, b) => S.path('M20 14 q12 -6 24 0 q8 12 8 34 q-20 6 -40 0 q0 -22 8 -34 z', a, b) + S.path('M26 16 q6 8 12 0', 'none', b, 3),
  helm: (a, b) => S.path('M14 34 q0 -20 18 -20 q18 0 18 20 q0 10 -6 14 h-24 q-6 -4 -6 -14 z', a, b) + S.rect(26, 24, 12, 24, '#222', 2),
  boots: (a, b) => S.path('M20 12 h12 v22 l14 6 q6 3 6 10 h-32 z', a, b) + S.rect(18, 48, 34, 6, b, 2),
  gloves: (a, b) => S.path('M22 20 h6 v14 h4 V16 h6 v18 h4 V20 h6 v20 q0 12 -13 12 q-13 0 -13 -12 z', a, b),
  pack: (a, b) => S.rect(16, 18, 32, 34, a, 6) + S.rect(22, 10, 20, 12, b, 4) + S.rect(24, 30, 16, 12, b, 3),
  plank: (a, b) => S.rect(8, 24, 48, 16, a, 2) + S.path('M14 24 v16 M26 24 v16 M38 24 v16 M50 24 v16', 'none', b, 1.5),
  brick: (a, b) => S.rect(10, 20, 20, 12, a, 2) + S.rect(32, 20, 22, 12, a, 2) + S.rect(10, 34, 12, 12, a, 2) + S.rect(24, 34, 20, 12, a, 2) + S.rect(46, 34, 8, 12, a, 2),
  glass: (a, b) => S.rect(14, 14, 36, 36, a, 3) + S.rect(14, 14, 36, 36, 'none', 3) + S.path('M18 46 L46 18 M18 30 L30 18', '#ffffff', 'none', 3),
  nails: (a, b) => S.path('M20 14 v30 M32 14 v30 M44 14 v30', 'none', a, 4) + S.path('M16 14 h8 M28 14 h8 M40 14 h8', 'none', b, 4),
  plate: (a, b) => S.poly('32,10 54,22 54,42 32,54 10,42 10,22', a, b) + S.poly('32,20 44,27 44,39 32,46 20,39 20,27', b),
  coin: (a, b) => S.circ(32, 32, 20, a) + S.circ(32, 32, 14, b) + S.path('M26 26 h12 M26 32 h12 M26 38 h12', 'none', a, 3),
  scroll: (a, b) => S.rect(14, 14, 36, 36, a, 3) + S.path('M14 14 q-6 4 0 8 M50 50 q6 -4 0 -8', 'none', b, 4) + S.path('M20 24 h24 M20 32 h24 M20 40 h16', 'none', b, 2),
  key: (a, b) => S.circ(22, 22, 10, 'none') + S.path('M22 12 a10 10 0 1 1 0 20 a10 10 0 1 1 0 -20', 'none', a, 5) + S.path('M28 28 L48 48 M42 42 l6 -6 M46 46 l5 -5', 'none', a, 5),
  relic: (a, b) => S.poly('32,8 46,20 46,44 32,56 18,44 18,20', a, b) + S.circ(32, 32, 8, '#8fd8e8') + S.circ(32, 32, 4, '#e8ffff'),
  totem: (a, b) => S.rect(26, 26, 12, 30, b, 3) + S.circ(32, 18, 12, a) + S.circ(27, 16, 3, '#222') + S.circ(37, 16, 3, '#222'),
  bulb: (a, b) => S.path('M32 10 q14 6 14 18 q0 10 -6 16 h-16 q-6 -6 -6 -16 q0 -12 14 -18 z', a, b) + S.rect(25, 44, 14, 10, '#b0a894', 2),
  arrow: (a, b) => S.rect(14, 30, 34, 4, b, 1) + S.poly('48,24 60,32 48,40', a) + S.poly('14,26 22,32 14,38', a),
  seed: (a, b) => S.path('M32 14 q10 10 10 20 q0 14 -10 18 q-10 -4 -10 -18 q0 -10 10 -20 z', a, b) + S.path('M32 20 v28', 'none', b, 2),
  sword: (a, b) => S.poly('32,6 37,14 37,42 32,48 27,42 27,14', '#d8e0e8', b) + S.rect(20, 44, 24, 6, a, 2) + S.rect(29, 48, 6, 12, b, 2) + S.circ(32, 60, 4, a),
  dagger: (a, b) => S.poly('32,14 36,20 36,40 32,44 28,40 28,20', '#d8e0e8', b) + S.rect(22, 42, 20, 5, a, 2) + S.rect(29, 46, 6, 12, b, 2),
  spear: (a, b) => S.rect(30, 12, 4, 46, b, 1) + S.poly('32,4 38,18 32,24 26,18', a, b) + S.rect(26, 24, 12, 4, a, 1),
  bow: (a, b) => S.path('M20 10 q26 22 0 44', 'none', a, 5) + S.path('M20 10 L20 54', 'none', '#e8e0c8', 2) + S.rect(30, 30, 22, 3, b, 1),
  crossbow: (a, b) => S.rect(16, 28, 34, 8, b, 3) + S.path('M14 16 q18 12 0 32', 'none', a, 5) + S.rect(30, 30, 26, 4, '#d8e0e8', 1) + S.rect(24, 36, 8, 12, b, 2),
  staff: (a, b) => S.rect(30, 16, 5, 42, b, 2, 8) + S.circ(24, 14, 9, a) + S.circ(24, 14, 4, '#e8ffff'),
  shield: (a, b) => S.path('M32 8 q18 4 18 12 q0 20 -18 34 q-18 -14 -18 -34 q0 -8 18 -12 z', a, b) + S.path('M32 16 v30 M20 26 h24', 'none', b, 3),
};

export const ICON_KEYS = Object.keys(SHAPES);
export default iconURL;
