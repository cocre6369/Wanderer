/**
 * WANDERER — DOM helpers
 * Minimal element/attribute helpers so the UI code reads like markup.
 */

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else e.setAttribute(k, v);
  }
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    e.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return e;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

export function show(node, on) { if (node) node.style.display = on ? '' : 'none'; return node; }

export function svgIcon(name, size = 20, color = 'currentColor') {
  const paths = {
    heart: 'M12 21s-7-4.6-9.3-9C1 8.4 3 5 6.5 5 9 5 11 7 12 8.5 13 7 15 5 17.5 5 21 5 23 8.4 21.3 12 19 16.4 12 21 12 21z',
    bolt: 'M13 2 4 14h6l-1 8 9-12h-6l1-8z',
    meat: 'M4 14c0-5 4-9 9-9s7 3 7 6-3 5-6 5-4 2-6 2-4-1-4-4z',
    flame: 'M12 2s5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3s0 3 2 3 2-4-1-9z',
    eye: 'M12 5c-5 0-9 5-9 7s4 7 9 7 9-5 9-7-4-7-9-7zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6z',
    bag: 'M6 8h12l1 12H5L6 8zm3 0V6a3 3 0 0 1 6 0v2',
    hammer: 'M14 3l7 7-3 3-7-7 3-3zM11 8 3 16l3 3 8-8',
    map: 'M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2zm0 0v16m6-14v16',
    book: 'M4 4h7v16H4V4zm9 0h7v16h-7V4z',
    gear: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 4-2 1 1 2-2 2-2-1-1 2h-2l-1-2-2 1-2-2 1-2-2-1v-2l2-1-1-2 2-2 2 1 1-2h2l1 2 2-1 2 2-1 2 2 1v2z',
    compass: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4 6-2.5 5.5L8 16l2.5-5.5L16 8z',
    person: 'M12 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm-6 16c0-4 3-6 6-6s6 2 6 6',
    x: 'M6 6l12 12M18 6 6 18',
    plus: 'M12 5v14M5 12h14',
    dice: 'M5 5h14v14H5V5zm3 3h2v2H8V8zm6 6h2v2h-2v-2z',
    save: 'M5 4h11l3 3v13H5V4zm3 0v6h8V4M8 20v-6h8v6',
    play: 'M8 5l11 7-11 7V5z',
    trash: 'M6 7h12l-1 13H7L6 7zm3-3h6M10 10v7m4-7v7',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm5 12 4 4',
    coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v10m-3-7h6m-6 4h6',
  };
  const d = paths[name] || paths.eye;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

export function bar(value, max, cls) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(0.0001, max)) * 100));
  return el('div', { class: 'bar ' + (cls || '') }, el('div', { class: 'bar-fill', style: { width: pct + '%' } }));
}

export function fmtTime(tod) {
  const total = tod * 24 * 60;
  const h = Math.floor(total / 60) % 24;
  const m = Math.floor(total % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function compassLabel(yaw) {
  const deg = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

/** Which way is a target relative to the way we are facing? */
export function bearingTo(yaw, tx, tz, px, pz) {
  const a = Math.atan2(tx - px, tz - pz);
  let d = (a - yaw) * 180 / Math.PI;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}
