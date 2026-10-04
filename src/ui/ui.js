/**
 * WANDERER — In-game UI
 * ---------------------
 * HUD, inventory, crafting, map, journal, character, dialogue, build bar.
 * All of it is plain DOM over the WebGL canvas so it stays sharp, selectable
 * and cheap. The game calls into this; this never reaches into three.js.
 */

import { el, clear, show, svgIcon, fmtTime, compassLabel, bearingTo } from './dom.js';
import { iconURL } from '../systems/icons.js';
import { itemById, RARITY, allItems } from '../systems/items.js';
import { CATEGORIES } from '../systems/items.js';
import { STATIONS, RECIPES } from '../systems/crafting.js';
import { PIECES, MATERIALS, CROPS } from '../systems/building.js';
import { JOURNAL_KINDS, MYSTERIES } from '../systems/discovery.js';
import { SKIN_TONES, HAIR_COLORS, HAIR_STYLES, CLOTH_COLORS, FACES, restyle, defaultLook } from '../render/player_model.js';
import { HOTBAR, GRID_COLS, EQUIP_SLOTS } from '../systems/inventory.js';
import { REGION_CELL } from '../world/world.js';
import { Rng } from '../core/rng.js';

export class UI {
  constructor(root) {
    this.root = root;
    this.game = null;
    this.openPanel = null;
    this.craftingOpened = false;
    this.mapOpened = false;
    this.journalOpened = false;
    this.station = null;
    this.craftFilter = '';
    this.invFilter = '';
    this.invCategory = 'all';
    this.held = null;                 // slot index picked up with the mouse
    this.toasts = [];
    this.map = { zoom: 0.35, cx: 0, cz: 0, drag: null };
    this.build(null);
  }

  /* ── construction ────────────────────────────────────────────────── */

  build() {
    clear(this.root);
    this.root.appendChild(this.hud = this._buildHud());
    this.root.appendChild(this.layer = el('div', { class: 'ui-layer' }));
    this.root.appendChild(this.modal = el('div', { class: 'modal', style: { display: 'none' } }));
    this.root.appendChild(this.tooltip = el('div', { class: 'tooltip', style: { display: 'none' } }));
    this.root.appendChild(this.toastBox = el('div', { class: 'toasts' }));
    this.root.appendChild(this.hintBox = el('div', { class: 'hintbox', style: { display: 'none' } }));
    this.root.appendChild(this.dmgBox = el('div', { class: 'dmgbox' }));
  }

  _buildHud() {
    const g = el('div', { class: 'hud' });

    /* vitals */
    const vitals = el('div', { class: 'vitals' });
    this.bars = {};
    for (const [key, icon, cls] of [['health', 'heart', 'hp'], ['stamina', 'bolt', 'st'], ['hunger', 'meat', 'hu'], ['warmth', 'flame', 'wa']]) {
      const fill = el('div', { class: 'bar-fill' });
      const row = el('div', { class: 'vital ' + cls },
        el('span', { class: 'vital-ico', html: svgIcon(icon, 14) }),
        el('div', { class: 'bar' }, fill));
      this.bars[key] = fill;
      vitals.appendChild(row);
    }
    this.breathRow = el('div', { class: 'vital br', style: { display: 'none' } },
      el('span', { class: 'vital-ico', html: svgIcon('eye', 14) }),
      el('div', { class: 'bar' }, this.bars.breath = el('div', { class: 'bar-fill' })));
    vitals.appendChild(this.breathRow);
    g.appendChild(vitals);

    /* compass strip */
    this.compass = el('div', { class: 'compass' }, el('div', { class: 'compass-strip' }));
    g.appendChild(this.compass);

    /* clock + weather + place */
    this.status = el('div', { class: 'status' });
    this.clock = el('div', { class: 'clock' });
    this.weatherChip = el('div', { class: 'chip weather' });
    this.placeChip = el('div', { class: 'chip place' });
    this.tempChip = el('div', { class: 'chip temp' });
    this.status.append(this.clock, this.weatherChip, this.tempChip, this.placeChip);
    g.appendChild(this.status);

    /* hotbar */
    this.hotbar = el('div', { class: 'hotbar' });
    for (let i = 0; i < HOTBAR; i++) {
      this.hotbar.appendChild(el('div', { class: 'slot hot', dataset: { slot: i } },
        el('span', { class: 'keynum', text: String((i + 1) % 10) }),
        el('img', { class: 'slot-icon', style: { display: 'none' } }),
        el('span', { class: 'slot-count' })));
    }
    g.appendChild(this.hotbar);

    /* crosshair + prompt */
    this.crosshair = el('div', { class: 'crosshair' });
    this.promptEl = el('div', { class: 'prompt', style: { display: 'none' } });
    g.appendChild(this.crosshair);
    g.appendChild(this.promptEl);

    /* debug / stats */
    this.debug = el('div', { class: 'debug' });
    g.appendChild(this.debug);

    /* build bar */
    this.buildBar = el('div', { class: 'buildbar', style: { display: 'none' } });
    g.appendChild(this.buildBar);

    /* low-health vignette */
    this.vignette = el('div', { class: 'vignette' });
    g.appendChild(this.vignette);
    return g;
  }

  attach(game) {
    this.game = game;
    this._bindKeys();
    this.refreshHotbar();
  }

  _bindKeys() {
    const g = this.game;
    const press = (action, fn) => { this._keys = this._keys || []; this._keys.push([action, fn]); };
    press('inventory', () => this.togglePanel('inventory'));
    press('crafting', () => this.togglePanel('crafting'));
    press('map', () => this.togglePanel('map'));
    press('journal', () => this.togglePanel('journal'));
    press('character', () => this.togglePanel('character'));
    press('build', () => this.toggleBuild());
    press('settings', () => this.togglePanel('settings'));
    this._press = press;
  }

  /** Called by main.js each frame so UI keys route through the same input. */
  pollInput(input) {
    if (!this._keys) return;
    for (const [action, fn] of this._keys) if (input.wasPressed(action)) fn();
  }

  /* ── per-frame ───────────────────────────────────────────────────── */

  update(dt, game) {
    const p = game.player;
    if (!p) return;
    this.pollInput(game.input);

    const set = (k, v) => { this.bars[k].style.width = Math.max(0, Math.min(100, v)) + '%'; };
    set('health', p.health);
    set('stamina', p.stamina);
    set('hunger', p.hunger);
    set('warmth', p.warmth);
    show(this.breathRow, p.swimming);
    if (p.swimming) set('breath', p.breath);

    /* compass */
    const strip = this.compass.firstChild;
    const yawDeg = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
    strip.style.transform = `translateX(${-(yawDeg / 360) * 1440 + 360}px)`;
    if (!strip.childElementCount) this._fillCompass(strip);

    /* status chips */
    this.clock.textContent = `${fmtTime(game.world.timeOfDay)}  ·  Day ${game.world.day}`;
    const w = game.weather.def;
    this.weatherChip.textContent = w.name;
    const col = game.world.columnAt(p.pos.x, p.pos.z, {});
    this.tempChip.textContent = `${Math.round(col.temp + game.weather.temperatureMod)}°C`;
    this.tempChip.classList.toggle('cold', col.temp + game.weather.temperatureMod < 2);
    this.tempChip.classList.toggle('hot', col.temp + game.weather.temperatureMod > 32);
    this.placeChip.textContent = col.biome.replace(/_/g, ' ');

    /* debug */
    if (game.settings.showFps) {
      this.debug.style.display = '';
      this.debug.textContent = `${Math.round(game.fps)} fps · ${Math.round(game.stats.tris / 1000)}k tris · ${game.stats.calls} calls · ${Math.round(p.pos.x)}, ${Math.round(p.pos.y)}, ${Math.round(p.pos.z)} · ${compassLabel(p.yaw)}`;
    } else this.debug.style.display = 'none';

    /* vignette */
    const hurt = Math.max(0, 1 - p.health / 45);
    this.vignette.style.opacity = String(Math.min(0.85, hurt * 0.8 + (p.warmth < 20 ? 0.2 : 0)));

    /* weight warning */
    if (p.carryWeight > p.maxCarry && this.frame % 120 === 0) this.toast('Overburdened — you move slower.', 'warn');
    this.frame = (this.frame || 0) + 1;

    if (this.openPanel === 'map') this._drawMap();
    if (this.openPanel === 'crafting') this._refreshCraftingList();
  }

  _fillCompass(strip) {
    for (let d = 0; d < 360; d += 15) {
      const major = d % 45 === 0;
      const label = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[d];
      for (let rep = 0; rep < 4; rep++) {
        strip.appendChild(el('div', { class: 'tick' + (major ? ' major' : ''), style: { left: ((d + rep * 360) / 360) * 1440 + 'px' } },
          major ? el('span', { text: label }) : null));
      }
    }
  }

  /* ── transient overlays ──────────────────────────────────────────── */

  toast(text, kind = 'neutral') {
    const t = el('div', { class: 'toast ' + kind }, text);
    this.toastBox.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 3200);
    while (this.toastBox.childElementCount > 6) this.toastBox.firstChild.remove();
  }

  hint(text) {
    this.hintBox.textContent = text;
    this.hintBox.style.display = '';
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => { this.hintBox.style.display = 'none'; }, 9000);
  }

  prompt(p) {
    if (!p) { this.promptEl.style.display = 'none'; return; }
    this.promptEl.style.display = '';
    if (this._promptText !== p.label) { this.promptEl.textContent = `[E] ${p.label}`; this._promptText = p.label; }
  }

  damageNumber(amount, crit) {
    const d = el('div', { class: 'dmg' + (crit ? ' crit' : ''), text: String(Math.round(amount)) });
    d.style.left = 50 + (Math.random() * 12 - 6) + '%';
    d.style.top = 42 + (Math.random() * 8 - 4) + '%';
    this.dmgBox.appendChild(d);
    setTimeout(() => d.remove(), 900);
  }

  onDeath() {
    this.openModal(el('div', { class: 'dialog death' },
      el('h2', { text: 'You died' }),
      el('p', { text: 'The Drifting Lands keep what they take. Your things are where you fell.' }),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', text: 'Wake at last camp', onclick: () => { this.closeModal(); this.game.player.spawnAt(this.game.spawnPoint.x, this.game.spawnPoint.z); } }),
        el('button', { class: 'btn', text: 'Main menu', onclick: () => location.reload() }))));
  }

  lore(it) {
    const g = this.game;
    const lines = {
      skull_post: 'Skulls on a post. Whoever stacked them wanted you to stop here.',
      statue: 'A figure with no face, worn smooth by weather and hands.',
      sign: 'The paint has gone. You can just make out an arrow pointing inland.',
      target: 'Arrow holes, tight groupings. Somebody practised here every day.',
    }[it.poiType] || 'Something old, and somebody else\'s.';
    this.openModal(el('div', { class: 'dialog' }, el('h3', { text: it.label }), el('p', { text: lines }),
      el('div', { class: 'row' }, el('button', { class: 'btn primary', text: 'Close', onclick: () => this.closeModal() }))));
    g.discovery.record('poi', it.poiId + ':lore');
  }

  /* ── panels ──────────────────────────────────────────────────────── */

  togglePanel(name) {
    if (this.openPanel === name) { this.closePanel(); return; }
    this.closePanel();
    this.openPanel = name;
    this.game.paused = true;
    this.game.input.enabled = false;
    this.game.input.releaseLock();
    const panel = el('div', { class: 'panel ' + name });
    this.layer.appendChild(panel);
    if (name === 'inventory') { this.inventoryOpened = true; this._renderInventory(panel); }
    else if (name === 'crafting') { this.craftingOpened = true; this._renderCrafting(panel); }
    else if (name === 'map') { this.mapOpened = true; this._renderMap(panel); }
    else if (name === 'journal') { this.journalOpened = true; this._renderJournal(panel); }
    else if (name === 'character') this._renderCharacter(panel);
    else if (name === 'settings') this._renderSettings(panel);
    this.game.audio.ui('open');
  }

  closePanel() {
    if (!this.openPanel) return;
    clear(this.layer);
    this.openPanel = null;
    this.game.paused = false;
    this.game.input.enabled = true;
    this.game.audio.ui('close');
    if (this.game.settings.thirdPerson === false) this.game.input.requestLock();
    else this.game.canvas.requestPointerLock && this.game.canvas.requestPointerLock();
  }

  openModal(node) {
    clear(this.modal);
    this.modal.appendChild(node);
    this.modal.style.display = '';
    this.game.paused = true;
    this.game.input.enabled = false;
    this.game.input.releaseLock();
  }
  closeModal() {
    this.modal.style.display = 'none';
    clear(this.modal);
    if (!this.openPanel) { this.game.paused = false; this.game.input.enabled = true; this.game.canvas.requestPointerLock && this.game.canvas.requestPointerLock(); }
  }

  /* ── inventory ───────────────────────────────────────────────────── */

  _renderInventory(panel) {
    const inv = this.game.inventory;
    panel.appendChild(el('div', { class: 'panel-head' },
      el('h2', { text: 'Pack' }),
      el('div', { class: 'row grow' },
        el('input', { class: 'search', placeholder: 'Search…', value: this.invFilter, oninput: e => { this.invFilter = e.target.value; this._refreshInvGrid(); } }),
        this._select('category', ['all', ...Object.keys(CATEGORIES)], this.invCategory, v => { this.invCategory = v; this._refreshInvGrid(); })),
      el('div', { class: 'row' },
        el('button', { class: 'btn', text: 'Sort', onclick: () => { inv.sort(); this._refreshInvGrid(); this.refreshHotbar(); } }),
        el('button', { class: 'btn', text: '×', onclick: () => this.closePanel() }))));

    const body = el('div', { class: 'inv-body' });
    /* equipment column */
    const eq = el('div', { class: 'equip' });
    for (const slot of EQUIP_SLOTS) {
      eq.appendChild(this._slotEl('equip:' + slot, slot));
    }
    this.weightEl = el('div', { class: 'weight' });
    eq.appendChild(this.weightEl);
    body.appendChild(eq);

    /* grid */
    const gridWrap = el('div', { class: 'inv-grid-wrap' });
    this.invGrid = el('div', { class: 'inv-grid', style: { gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)` } });
    gridWrap.appendChild(this.invGrid);
    const hot = el('div', { class: 'inv-grid hotrow', style: { gridTemplateColumns: `repeat(${HOTBAR}, 1fr)` } });
    this.invHot = hot;
    gridWrap.appendChild(el('div', { class: 'subhead', text: 'Hotbar' }));
    gridWrap.appendChild(hot);
    body.appendChild(gridWrap);

    /* detail */
    this.invDetail = el('div', { class: 'inv-detail' });
    body.appendChild(this.invDetail);
    panel.appendChild(body);
    this._refreshInvGrid();
  }

  _slotEl(ref, label) {
    const inv = this.game.inventory;
    const isEquip = typeof ref === 'string';
    const idx = isEquip ? -1 : ref;
    const s = isEquip ? inv.equipment[ref.slice(6)] : inv.slots[idx];
    const node = el('div', {
      class: 'slot' + (isEquip ? ' equip-slot' : '') + (idx >= 0 && idx < HOTBAR ? ' hot' : '') + (this.held === ref ? ' held' : ''),
      dataset: { ref: String(ref) },
      onclick: (e) => this._clickSlot(ref, e),
      oncontextmenu: (e) => { e.preventDefault(); this._clickSlot(ref, e, true); },
      onmouseenter: (e) => this._showTooltip(s, e),
      onmouseleave: () => this.hideTooltip(),
    },
      el('img', { class: 'slot-icon', style: { display: s ? '' : 'none' }, src: s ? iconURL(s.item) : '' }),
      el('span', { class: 'slot-count', text: s && s.count > 1 ? String(s.count) : '' }),
      s && s.durability != null && s.item.maxDurability ? el('div', { class: 'dur' }, el('div', { class: 'dur-fill', style: { width: (s.durability / s.item.maxDurability * 100) + '%' } })) : null,
      isEquip ? el('span', { class: 'slot-label', text: label }) : null);
    if (s && s.item.rarity && s.item.rarity !== 'common') node.classList.add('r-' + s.item.rarity);
    return node;
  }

  _refreshInvGrid() {
    if (!this.invGrid) return;
    const inv = this.game.inventory;
    clear(this.invGrid); clear(this.invHot);
    const matches = new Set(inv.search(this.invFilter));
    for (let i = 0; i < inv.size; i++) {
      const s = inv.slots[i];
      if (this.invFilter && s && !matches.has(i)) continue;
      if (this.invCategory !== 'all' && s && s.item.cat !== this.invCategory) continue;
      const node = this._slotEl(i);
      (i < HOTBAR ? this.invHot : this.invGrid).appendChild(node);
    }
    // keep equipment column fresh
    const eqWrap = this.layer.querySelector('.equip');
    if (eqWrap) { clear(eqWrap); for (const slot of EQUIP_SLOTS) eqWrap.appendChild(this._slotEl('equip:' + slot, slot)); eqWrap.appendChild(this.weightEl); }
    this.weightEl.textContent = `${inv.weight().toFixed(1)} / ${inv.capacity} kg`;
    this.weightEl.classList.toggle('over', inv.overburdened());
    this._renderDetail();
  }

  refreshInventory() { if (this.openPanel === 'inventory') this._refreshInvGrid(); this.refreshHotbar(); }

  _renderDetail() {
    if (!this.invDetail) return;
    const s = this._lastHovered;
    clear(this.invDetail);
    if (!s) { this.invDetail.appendChild(el('p', { class: 'muted', text: 'Hover an item to inspect it.' })); return; }
    const it = s.item;
    this.invDetail.appendChild(el('h3', { class: 'rarity-' + (it.rarity || 'common'), text: it.name }));
    this.invDetail.appendChild(el('div', { class: 'muted', text: `${CATEGORIES[it.cat] ? CATEGORIES[it.cat].name : it.cat} · ${it.weight} kg · ${it.value} coin` }));
    if (it.desc) this.invDetail.appendChild(el('p', { text: it.desc }));
    if (it.stats) {
      const list = el('ul', { class: 'stats' });
      for (const k in it.stats) list.appendChild(el('li', {}, `${k}: ${it.stats[k]}`));
      this.invDetail.appendChild(list);
    }
    if (it.effects && Object.keys(it.effects).length) {
      const list = el('ul', { class: 'effects' });
      for (const k in it.effects) list.appendChild(el('li', {}, `${k} ${it.effects[k]}`));
      this.invDetail.appendChild(list);
    }
    if (s.durability != null) this.invDetail.appendChild(el('div', { class: 'muted', text: `Durability ${Math.round(s.durability)} / ${it.maxDurability || s.durability}` }));
  }

  _clickSlot(ref, e, right) {
    const inv = this.game.inventory;
    if (this.held === null || this.held === undefined) {
      const s = typeof ref === 'string' ? inv.equipment[ref.slice(6)] : inv.slots[ref];
      if (!s) return;
      if (right && s.count > 1) { inv.split(ref, false); this._refreshInvGrid(); this.refreshHotbar(); return; }
      if (typeof ref === 'number' && s.item.slot && e.shiftKey) { inv.equipFrom(ref); this._refreshInvGrid(); return; }
      this.held = ref;
    } else {
      if (this.held === ref) { this.held = null; }
      else {
        if (typeof ref === 'string' && this.held >= 0) {
          const s = inv.slots[this.held];
          if (s && s.item.slot && s.item.slot !== ref.slice(6)) { this.toast('That does not go there.', 'warn'); this._refreshInvGrid(); return; }
        }
        inv.move(this.held, ref);
        this.held = null;
      }
    }
    this._refreshInvGrid();
    this.refreshHotbar();
    this.game.audio.ui('click');
  }

  _showTooltip(s, e) {
    this._lastHovered = s;
    if (!s) { this.hideTooltip(); return; }
    const it = s.item;
    clear(this.tooltip);
    this.tooltip.appendChild(el('div', { class: 'tt-name rarity-' + (it.rarity || 'common'), text: it.name }));
    this.tooltip.appendChild(el('div', { class: 'tt-sub', text: `${CATEGORIES[it.cat] ? CATEGORIES[it.cat].name : it.cat}${it.weight ? ' · ' + it.weight + ' kg' : ''}` }));
    if (it.desc) this.tooltip.appendChild(el('div', { class: 'tt-desc', text: it.desc }));
    if (it.stats) for (const k in it.stats) this.tooltip.appendChild(el('div', { class: 'tt-stat', text: `${k} ${it.stats[k]}` }));
    this.tooltip.style.display = '';
    const r = this.root.getBoundingClientRect();
    this.tooltip.style.left = Math.min(r.width - 280, e.clientX - r.left + 16) + 'px';
    this.tooltip.style.top = Math.min(r.height - 160, e.clientY - r.top + 12) + 'px';
    this._renderDetail();
  }
  hideTooltip() { this.tooltip.style.display = 'none'; }

  _select(label, options, value, onchange) {
    const sel = el('select', { class: 'sel', onchange: e => onchange(e.target.value) });
    for (const o of options) sel.appendChild(el('option', { value: o, selected: o === value ? 'selected' : null, text: typeof o === 'string' ? (CATEGORIES[o] ? CATEGORIES[o].name : o) : String(o) }));
    return el('label', { class: 'sel-wrap' }, el('span', { text: label }), sel);
  }

  refreshHotbar() {
    if (!this.game) return;
    const inv = this.game.inventory;
    for (let i = 0; i < HOTBAR; i++) {
      const node = this.hotbar.children[i];
      if (!node) continue;
      const s = inv.slots[i];
      const img = node.querySelector('.slot-icon');
      const cnt = node.querySelector('.slot-count');
      if (s) {
        img.src = iconURL(s.item); img.style.display = '';
        cnt.textContent = s.count > 1 ? s.count : '';
        node.className = 'slot hot' + (s.item.rarity && s.item.rarity !== 'common' ? ' r-' + s.item.rarity : '');
      } else { img.style.display = 'none'; cnt.textContent = ''; node.className = 'slot hot'; }
      node.classList.toggle('sel', (inv._selected || 0) === i);
    }
  }

  /* ── crafting ────────────────────────────────────────────────────── */

  openCrafting(station) {
    this.station = station || 'workbench';
    this.togglePanel('crafting');
  }

  _renderCrafting(panel) {
    const g = this.game;
    panel.appendChild(el('div', { class: 'panel-head' },
      el('h2', { text: 'Crafting' }),
      el('div', { class: 'stations' }, ...Object.keys(STATIONS).map(id =>
        el('button', {
          class: 'btn station' + (this.station === id ? ' on' : ''),
          text: STATIONS[id].name,
          onclick: () => { this.station = id; this.closePanel(); this.togglePanel('crafting'); },
        }))),
      el('div', { class: 'row' },
        el('input', { class: 'search', placeholder: 'Search recipes…', value: this.craftFilter, oninput: e => { this.craftFilter = e.target.value; this._refreshCraftingList(); } }),
        el('button', { class: 'btn', text: '×', onclick: () => this.closePanel() }))));
    const body = el('div', { class: 'craft-body' });
    this.craftList = el('div', { class: 'craft-list' });
    this.craftDetail = el('div', { class: 'craft-detail' });
    body.append(this.craftList, this.craftDetail);
    panel.appendChild(body);
    this._refreshCraftingList();
  }

  refreshCrafting() { if (this.openPanel === 'crafting') this._refreshCraftingList(); }

  _refreshCraftingList() {
    if (!this.craftList) return;
    const g = this.game;
    clear(this.craftList);
    const f = this.craftFilter.trim().toLowerCase();
    const rows = RECIPES
      .filter(r => g.crafting.knows(r.id))
      .filter(r => this.station === 'any' || r.station === this.station || r.station === 'none')
      .filter(r => !f || r.name.toLowerCase().includes(f) || r.category.includes(f));
    if (!rows.length) this.craftList.appendChild(el('p', { class: 'muted', text: 'Nothing here yet. Recipes are learned from blueprints, people and ruins.' }));
    for (const r of rows) {
      const can = g.crafting.canCraft(r, g.inventory, this.station);
      const out = r.output;
      const item = out[0].startsWith('wpn:') ? null : itemById(out[0]);
      const row = el('div', { class: 'recipe' + (can ? '' : ' off'), onclick: () => this._selectRecipe(r) },
        el('img', { class: 'slot-icon', src: item ? iconURL(item) : iconURL({ icon: 'sword', colors: ['#aab', '#556'] }) }),
        el('div', { class: 'recipe-main' },
          el('div', { class: 'recipe-name', text: r.name }),
          el('div', { class: 'recipe-mats', text: r.ingredients.map(([id, n]) => `${n}× ${itemById(id) ? itemById(id).name : id}`).join('  ·  ') })),
        el('div', { class: 'recipe-tier', text: 'T' + r.tier }));
      if (this._selRecipe && this._selRecipe.id === r.id) row.classList.add('on');
      this.craftList.appendChild(row);
    }
    if (this._selRecipe) this._renderRecipeDetail(this._selRecipe);
  }

  _selectRecipe(r) { this._selRecipe = r; this._refreshCraftingList(); }

  _renderRecipeDetail(r) {
    const g = this.game;
    clear(this.craftDetail);
    const out = r.output;
    const item = out[0].startsWith('wpn:') ? null : itemById(out[0]);
    this.craftDetail.appendChild(el('h3', { text: r.name }));
    this.craftDetail.appendChild(el('div', { class: 'muted', text: `${STATIONS[r.station] ? STATIONS[r.station].name : r.station} · Tier ${r.tier} · ${r.category}` }));
    if (item && item.desc) this.craftDetail.appendChild(el('p', { text: item.desc }));
    if (r.hint) this.craftDetail.appendChild(el('p', { class: 'hint-inline', text: r.hint }));
    const list = el('ul', { class: 'mats' });
    for (const [id, n] of r.ingredients) {
      const have = g.inventory.countOf(id);
      list.appendChild(el('li', { class: have >= n ? 'ok' : 'no' }, `${have}/${n}  ${itemById(id) ? itemById(id).name : id}`));
    }
    this.craftDetail.appendChild(list);
    const can = g.crafting.canCraft(r, g.inventory, this.station);
    this.craftDetail.appendChild(el('button', {
      class: 'btn primary big', text: can ? `Craft ${out[1] > 1 ? '×' + out[1] : ''}` : 'Missing materials',
      disabled: can ? null : 'disabled',
      onclick: () => {
        const made = g.crafting.craft(r.id, g.inventory, g.rng, this.station);
        if (!made) { this.toast('Cannot craft that here.', 'warn'); return; }
        g.audio.craft();
        this.toast(`Crafted ${r.name}`, 'good');
        this._refreshCraftingList();
        this.refreshHotbar();
      },
    }));
  }

  /* ── map ─────────────────────────────────────────────────────────── */

  _renderMap(panel) {
    const g = this.game;
    panel.appendChild(el('div', { class: 'panel-head' },
      el('h2', { text: 'Chart' }),
      el('div', { class: 'row' },
        el('button', { class: 'btn', text: 'Mark here', onclick: () => this._addMarker() }),
        el('button', { class: 'btn', text: '−', onclick: () => { this.map.zoom = Math.max(0.06, this.map.zoom * 0.7); this._drawMap(); } }),
        el('button', { class: 'btn', text: '+', onclick: () => { this.map.zoom = Math.min(3, this.map.zoom * 1.4); this._drawMap(); } }),
        el('button', { class: 'btn', text: '×', onclick: () => this.closePanel() }))));
    const wrap = el('div', { class: 'map-wrap' });
    this.mapCanvas = el('canvas', { class: 'map-canvas', width: 900, height: 560 });
    wrap.appendChild(this.mapCanvas);
    this.mapInfo = el('div', { class: 'map-info' });
    wrap.appendChild(this.mapInfo);
    panel.appendChild(wrap);
    this._bindMapInput();
    this._drawMap();
  }

  _bindMapInput() {
    const c = this.mapCanvas;
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.map.zoom = Math.max(0.06, Math.min(3, this.map.zoom * (e.deltaY > 0 ? 0.85 : 1.18)));
      this._drawMap();
    }, { passive: false });
    c.addEventListener('mousedown', e => { this.map.drag = { x: e.offsetX, y: e.offsetY, cx: this.map.cx, cz: this.map.cz }; });
    c.addEventListener('mousemove', e => {
      if (!this.map.drag) return;
      const k = 1 / this.map.zoom;
      this.map.cx = this.map.drag.cx - (e.offsetX - this.map.drag.x) * k;
      this.map.cz = this.map.drag.cz - (e.offsetY - this.map.drag.y) * k;
      this._drawMap();
    });
    window.addEventListener('mouseup', () => { this.map.drag = null; });
    c.addEventListener('click', e => {
      const w = this._mapToWorld(e.offsetX, e.offsetY);
      this.mapInfo.textContent = `${Math.round(w.x)}, ${Math.round(w.z)} · ${this.game.world.biomeAt(w.x, w.z).replace(/_/g, ' ')} · ${Math.round(this.game.world.heightAt(w.x, w.z))} m`;
    });
  }

  _mapToWorld(px, py) {
    const c = this.mapCanvas;
    const k = 1 / this.map.zoom;
    return { x: this.map.cx + (px - c.width / 2) * k, z: this.map.cz + (py - c.height / 2) * k };
  }
  _worldToMap(x, z) {
    const c = this.mapCanvas;
    return { px: (x - this.map.cx) * this.map.zoom + c.width / 2, py: (z - this.map.cz) * this.map.zoom + c.height / 2 };
  }

  _addMarker() {
    const p = this.game.player.pos;
    this.game.world.markers.add ? this.game.world.markers.add(`${Math.round(p.x)},${Math.round(p.z)}`) : this.game.world.markers.push({ x: p.x, z: p.z });
    this.toast('Marked your position.', 'good');
    this._drawMap();
  }

  _drawMap() {
    const c = this.mapCanvas;
    if (!c) return;
    const ctx = c.getContext('2d');
    const g = this.game;
    const world = g.world;
    ctx.fillStyle = '#141a1e';
    ctx.fillRect(0, 0, c.width, c.height);

    // parchment-style terrain sampling of revealed cells
    const step = Math.max(6, Math.round(24 / this.map.zoom));
    const tl = this._mapToWorld(0, 0), br = this._mapToWorld(c.width, c.height);
    for (let z = Math.floor(tl.z / REGION_CELL) * REGION_CELL; z < br.z; z += REGION_CELL) {
      for (let x = Math.floor(tl.x / REGION_CELL) * REGION_CELL; x < br.x; x += REGION_CELL) {
        if (!world.visitedCells.has(`${Math.floor(x / REGION_CELL)},${Math.floor(z / REGION_CELL)}`)) continue;
        for (let sz = 0; sz < REGION_CELL; sz += step) {
          for (let sx = 0; sx < REGION_CELL; sx += step) {
            const wx = x + sx, wz = z + sz;
            const m = this._worldToMap(wx, wz);
            if (m.px < -4 || m.py < -4 || m.px > c.width + 4 || m.py > c.height + 4) continue;
            const col = world.columnAt(wx, wz, {});
            const [r, gg, b] = world.gen.groundColor(col);
            const h = col.h;
            const shade = Math.max(0.5, Math.min(1.35, 0.8 + h / 900));
            ctx.fillStyle = `rgb(${Math.min(255, r * 255 * shade) | 0},${Math.min(255, gg * 255 * shade) | 0},${Math.min(255, b * 255 * shade) | 0})`;
            const s = Math.max(1, step * this.map.zoom + 1);
            ctx.fillRect(m.px, m.py, s, s);
          }
        }
      }
    }

    // water shimmer under unexplored areas
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#1d3a48';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalAlpha = 1;

    // POIs
    for (const poi of world.poiSystem.list) {
      if (!world.knownPois.has(poi.id)) continue;
      const m = this._worldToMap(poi.x, poi.z);
      if (m.px < 0 || m.py < 0 || m.px > c.width || m.py > c.height) continue;
      ctx.fillStyle = POI_COLOR[poi.type] || '#e8d9a8';
      ctx.beginPath();
      ctx.arc(m.px, m.py, 4, 0, 6.283);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (this.map.zoom > 0.5) {
        ctx.fillStyle = 'rgba(240,230,200,0.9)';
        ctx.font = '10px serif';
        ctx.fillText(poi.name || poi.type, m.px + 6, m.py + 3);
      }
    }

    // markers
    ctx.fillStyle = '#f0a24a';
    const marks = world.markers instanceof Set ? [...world.markers] : world.markers;
    for (const mk of marks) {
      const [mx, mz] = typeof mk === 'string' ? mk.split(',').map(Number) : [mk.x, mk.z];
      const m = this._worldToMap(mx, mz);
      ctx.beginPath();
      ctx.moveTo(m.px, m.py - 7); ctx.lineTo(m.px + 5, m.py + 4); ctx.lineTo(m.px - 5, m.py + 4);
      ctx.closePath(); ctx.fill();
    }

    // player
    const p = g.player.pos;
    const m = this._worldToMap(p.x, p.z);
    ctx.save();
    ctx.translate(m.px, m.py);
    ctx.rotate(-g.player.yaw);
    ctx.fillStyle = '#4fd1c5';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(6, 7); ctx.lineTo(0, 4); ctx.lineTo(-6, 7);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // compass rose + frame
    ctx.strokeStyle = 'rgba(240,220,170,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(6, 6, c.width - 12, c.height - 12);
    ctx.fillStyle = 'rgba(240,220,170,0.7)';
    ctx.font = 'italic 13px Georgia, serif';
    ctx.fillText('N', c.width / 2 - 4, 22);
    ctx.fillText(`${Math.round(1 / this.map.zoom)} m / grid`, 14, c.height - 14);
  }

  /* ── journal ─────────────────────────────────────────────────────── */

  _renderJournal(panel) {
    const g = this.game;
    panel.appendChild(el('div', { class: 'panel-head' },
      el('h2', { text: 'Journal' }),
      el('div', { class: 'row' }, el('span', { class: 'muted', text: `${g.discovery.total()} entries · resonance ${g.discovery.resonance}` }),
        el('button', { class: 'btn', text: '×', onclick: () => this.closePanel() }))));
    const tabs = el('div', { class: 'tabs' });
    const body = el('div', { class: 'journal-body' });
    const kinds = Object.keys(JOURNAL_KINDS);
    const render = (kind) => {
      clear(body);
      [...tabs.children].forEach((c, i) => c.classList.toggle('on', kinds[i] === kind));
      if (kind === 'mystery') {
        for (const m of MYSTERIES) {
          const prog = g.discovery.mysteryProgress[m.id] || 0;
          const known = g.discovery.has('mystery', m.id);
          body.appendChild(el('div', { class: 'entry mystery' },
            el('h4', { text: known ? m.title : '— unknown —' }),
            el('p', { text: known ? m.hint : 'You have not found enough to understand this yet.' }),
            el('div', { class: 'bar thin' }, el('div', { class: 'bar-fill', style: { width: Math.min(100, prog / (m.tier * 2) * 100) + '%' } }))));
        }
        return;
      }
      const ids = g.discovery.found[kind] || [];
      if (!ids.length) { body.appendChild(el('p', { class: 'muted', text: 'Nothing recorded yet.' })); return; }
      for (const id of ids) {
        const note = g.discovery.notes.find(n => n.kind === kind && n.id === id);
        const item = kind === 'item' || kind === 'recipe' ? itemById(id) : null;
        body.appendChild(el('div', { class: 'entry' },
          item ? el('img', { class: 'slot-icon', src: iconURL(item) }) : null,
          el('div', {},
            el('h4', { text: (note && note.detail && (note.detail.name || note.detail.title)) || (item ? item.name : id) }),
            el('p', { text: (item && item.desc) || (note && note.detail && note.detail.hint) || '' }))));
      }
    };
    for (const k of kinds) tabs.appendChild(el('button', { class: 'tab', text: JOURNAL_KINDS[k].name, onclick: () => render(k) }));
    panel.appendChild(tabs);
    panel.appendChild(body);
    render(kinds[0]);
  }

  onDiscovery(e) { if (this.openPanel === 'journal') this._renderJournal(this.layer.firstChild); }

  /* ── character ───────────────────────────────────────────────────── */

  _renderCharacter(panel) {
    const g = this.game;
    const look = g.player.model.userData.look || defaultLook();
    panel.appendChild(el('div', { class: 'panel-head' }, el('h2', { text: 'Wanderer' }),
      el('button', { class: 'btn', text: '×', onclick: () => this.closePanel() })));
    const body = el('div', { class: 'char-body' });
    const stats = el('div', { class: 'char-stats' });
    const inv = g.inventory;
    const eq = inv.stats();
    stats.appendChild(el('h3', { text: 'Condition' }));
    for (const [k, v] of [['Health', g.player.health], ['Stamina', g.player.stamina], ['Hunger', g.player.hunger], ['Warmth', g.player.warmth]]) {
      stats.appendChild(el('div', { class: 'stat-row' }, el('span', { text: k }), el('div', { class: 'bar thin' }, el('div', { class: 'bar-fill', style: { width: v + '%' } }))));
    }
    stats.appendChild(el('h3', { text: 'Equipment bonuses' }));
    for (const k in eq) if (eq[k]) stats.appendChild(el('div', { class: 'stat-row' }, el('span', { text: k }), el('b', { text: String(eq[k]) })));
    stats.appendChild(el('h3', { text: 'Record' }));
    stats.appendChild(el('div', { class: 'stat-row' }, el('span', { text: 'Discoveries' }), el('b', { text: String(g.discovery.total()) })));
    stats.appendChild(el('div', { class: 'stat-row' }, el('span', { text: 'Resonance' }), el('b', { text: String(g.discovery.resonance) })));
    stats.appendChild(el('div', { class: 'stat-row' }, el('span', { text: 'Days survived' }), el('b', { text: String(g.world.day) })));
    body.appendChild(stats);

    const look2 = el('div', { class: 'char-look' });
    look2.appendChild(el('h3', { text: 'Appearance' }));
    const swatches = (label, arr, key, toCss) => {
      const row = el('div', { class: 'swatches' });
      arr.forEach((v, i) => row.appendChild(el('button', {
        class: 'swatch' + (look[key] === v ? ' on' : ''),
        style: toCss ? { background: toCss(v) } : null,
        text: toCss ? '' : String(v),
        onclick: () => { look[key] = v; g.player.model.userData.look = look; this._applyLook(look); this.closePanel(); this.togglePanel('character'); },
      })));
      return el('div', { class: 'swatch-row' }, el('label', { text: label }), row);
    };
    look2.appendChild(swatches('Skin', SKIN_TONES, 'skin', v => '#' + v.toString(16).padStart(6, '0')));
    look2.appendChild(swatches('Hair colour', HAIR_COLORS, 'hairColor', v => '#' + v.toString(16).padStart(6, '0')));
    look2.appendChild(swatches('Hair style', HAIR_STYLES, 'hair'));
    look2.appendChild(swatches('Cloth', CLOTH_COLORS, 'cloth', v => '#' + v.toString(16).padStart(6, '0')));
    look2.appendChild(swatches('Face', FACES, 'face'));
    body.appendChild(look2);
    panel.appendChild(body);
  }

  _applyLook(look) { restyle(this.game.player.model, look); }

  /* ── settings ────────────────────────────────────────────────────── */

  _renderSettings(panel) {
    const g = this.game;
    panel.appendChild(el('div', { class: 'panel-head' }, el('h2', { text: 'Settings' }),
      el('div', { class: 'row' },
        el('button', { class: 'btn', text: 'Save game', onclick: async () => { await g.saveTo(1); } }),
        el('button', { class: 'btn', text: '×', onclick: () => this.closePanel() }))));
    const s = g.settings;
    const body = el('div', { class: 'settings-body' });
    const slider = (label, key, min, max, step, fmt) => el('label', { class: 'set-row' },
      el('span', { text: label }),
      el('input', {
        type: 'range', min, max, step, value: s[key],
        oninput: e => { s[key] = parseFloat(e.target.value); g.applySettings({ [key]: s[key] }); out.textContent = fmt ? fmt(s[key]) : s[key]; },
      }),
      el('b', { class: 'set-val', text: fmt ? fmt(s[key]) : String(s[key]) }));
    const out = {};
    const toggle = (label, key) => el('label', { class: 'set-row' }, el('span', { text: label }),
      el('input', { type: 'checkbox', checked: s[key] ? 'checked' : null, onchange: e => { s[key] = e.target.checked; g.applySettings({ [key]: s[key] }); } }));
    const sel = (label, key, opts) => {
      const n = el('select', { onchange: e => { s[key] = isNaN(e.target.value) ? e.target.value : parseFloat(e.target.value); g.applySettings({ [key]: s[key] }); } });
      for (const o of opts) n.appendChild(el('option', { value: o[0], selected: String(o[0]) === String(s[key]) ? 'selected' : null, text: o[1] }));
      return el('label', { class: 'set-row' }, el('span', { text: label }), n);
    };

    body.appendChild(el('h3', { text: 'Graphics' }));
    body.appendChild(slider('Render distance', 'renderDistance', 0.4, 2, 0.1, v => v.toFixed(1) + '×'));
    body.appendChild(slider('Vegetation', 'vegDensity', 0, 1.5, 0.05, v => Math.round(v * 100) + '%'));
    body.appendChild(slider('Field of view', 'fov', 60, 100, 1, v => v + '°'));
    body.appendChild(toggle('Show FPS', 'showFps'));
    body.appendChild(el('h3', { text: 'Gameplay' }));
    body.appendChild(toggle('Third person', 'thirdPerson'));
    body.appendChild(slider('Mouse sensitivity', 'sensitivity', 0.2, 3, 0.05, v => v.toFixed(2)));
    body.appendChild(toggle('Invert Y', 'invertY'));
    body.appendChild(sel('Difficulty', 'difficulty', [['peaceful', 'Peaceful'], ['normal', 'Normal'], ['harsh', 'Harsh'], ['extreme', 'Extreme']]));
    body.appendChild(toggle('Autosave', 'autosave'));
    body.appendChild(el('h3', { text: 'Audio' }));
    for (const [k, label] of [['master', 'Master'], ['music', 'Music'], ['sfx', 'Effects'], ['ambient', 'Ambient']]) {
      body.appendChild(slider(label, k, 0, 1, 0.05, v => Math.round(v * 100) + '%'));
    }
    body.appendChild(el('h3', { text: 'Accessibility' }));
    body.appendChild(toggle('Tutorial hints', 'hints'));
    body.appendChild(toggle('Subtitles / captions', 'subtitles'));
    panel.appendChild(body);
  }

  /* ── dialogue & trade ────────────────────────────────────────────── */

  openDialogue(convo, npc, market, col) {
    const g = this.game;
    const box = el('div', { class: 'dialog dialogue' });
    const who = el('div', { class: 'who' }, el('b', { text: convo.npc.name }), el('span', { text: ' · ' + convo.npc.role + (convo.npc.settlement ? ' · ' + convo.npc.settlement : '') }));
    const lines = el('div', { class: 'lines' }, el('p', { text: convo.greeting }));
    const topics = el('div', { class: 'topics' });
    const finish = () => { npc.talking = false; this.closeModal(); };
    const renderTopics = () => {
      clear(topics);
      for (const t of convo.topics) {
        topics.appendChild(el('button', {
          class: 'btn topic', text: t.label,
          onclick: () => {
            g.audio.ui('click');
            if (t.trade) { this._renderTrade(box, npc, market, col, finish); return; }
            if (t.quests) { this._renderQuests(box, npc, finish); return; }
            clear(lines);
            for (const l of t.lines) lines.appendChild(el('p', { text: l }));
          },
        }));
      }
    };
    renderTopics();
    box.append(who, lines, topics, el('div', { class: 'row' }, el('button', { class: 'btn', text: 'Leave', onclick: finish })));
    this.openModal(box);
  }

  _renderTrade(box, npc, market, col, finish) {
    const g = this.game;
    clear(box);
    box.appendChild(el('h3', { text: `Trade with ${npc.name}` }));
    box.appendChild(el('p', { class: 'muted', text: `Prices follow what this place makes. ${col.biome.replace(/_/g, ' ')} goods are cheap here.` }));
    const grid = el('div', { class: 'trade-grid' });
    for (const entry of npc.trade) {
      const item = entry.weapon || itemById(entry.id);
      if (!item) continue;
      const price = market.price(item, entry.priceMult);
      grid.appendChild(el('div', { class: 'trade-row' },
        el('img', { class: 'slot-icon', src: iconURL(item) }),
        el('div', { class: 'trade-main' }, el('div', { text: item.name }), el('div', { class: 'muted', text: `${entry.count} available` })),
        el('button', {
          class: 'btn', text: `${price}c`,
          onclick: () => {
            if (g.inventory.countOf('coin') < price) { this.toast('Not enough coin.', 'warn'); g.audio.ui('error'); return; }
            g.inventory.remove('coin', price);
            g.inventory.add(item, 1);
            entry.count--;
            if (entry.count <= 0) npc.trade = npc.trade.filter(x => x !== entry);
            g.audio.pickup();
            this._renderTrade(box, npc, market, col, finish);
          },
        })));
    }
    /* sell */
    box.appendChild(el('h4', { text: 'Sell' }));
    const sell = el('div', { class: 'trade-grid' });
    for (const s of g.inventory.all().slice(0, 40)) {
      if (s.item.id === 'coin') continue;
      const price = market.buyPrice(s.item, col);
      sell.appendChild(el('div', { class: 'trade-row' },
        el('img', { class: 'slot-icon', src: iconURL(s.item) }),
        el('div', { class: 'trade-main' }, el('div', { text: s.item.name }), el('div', { class: 'muted', text: `you have ${s.count}` })),
        el('button', {
          class: 'btn', text: `+${price}c`,
          onclick: () => {
            g.inventory.remove(s.item.id, 1);
            g.inventory.add('coin', price);
            g.audio.pickup();
            this._renderTrade(box, npc, market, col, finish);
          },
        })));
    }
    box.append(grid, sell, el('div', { class: 'row' }, el('button', { class: 'btn', text: 'Done', onclick: finish })));
  }

  _renderQuests(box, npc, finish) {
    const g = this.game;
    clear(box);
    box.appendChild(el('h3', { text: 'Work' }));
    const ready = g.quests.active.filter(q => q.giver === npc.id && q.done);
    for (const q of ready) {
      box.appendChild(el('div', { class: 'quest' }, el('h4', { text: q.title }), el('p', { text: 'Done. Collect your reward.' }),
        el('button', {
          class: 'btn primary', text: 'Turn in',
          onclick: () => {
            const got = g.quests.turnIn(q.id, g.inventory, g.rng);
            if (got) { this.toast(`Reward: ${got.coin} coin`, 'good'); g.audio.pickup(); }
            this._renderQuests(box, npc, finish);
          },
        })));
    }
    if (!ready.length) {
      const offered = g.quests.generate(npc, g.player.pos, g.discovery);
      box.appendChild(el('div', { class: 'quest' }, el('h4', { text: offered.title }), el('p', { text: offered.text }),
        el('div', { class: 'muted', text: `Reward: ${offered.reward.coin} coin${offered.reward.item ? ' + ' + offered.reward.item : ''}` }),
        el('button', { class: 'btn primary', text: 'Accept', onclick: () => { this.toast('Quest accepted.', 'good'); finish(); } })));
    }
    box.appendChild(el('div', { class: 'row' }, el('button', { class: 'btn', text: 'Back', onclick: finish })));
  }

  /* ── build bar ───────────────────────────────────────────────────── */

  toggleBuild() {
    const on = this.buildBar.style.display === 'none';
    this.buildBar.style.display = on ? '' : 'none';
    this.buildMode = on;
    if (on) this.refreshBuild();
    this.toast(on ? 'Build mode. Left click places, right click removes. B exits.' : 'Build mode off.', 'neutral');
  }

  refreshBuild() {
    if (!this.buildMode) return;
    const g = this.game;
    clear(this.buildBar);
    const b = g.build;
    this.buildBar.appendChild(el('div', { class: 'build-piece' },
      el('b', { text: PIECES[b.cursor.piece].name }),
      el('span', { class: 'muted', text: PIECES[b.cursor.piece].desc })));
    this.buildBar.appendChild(el('div', { class: 'build-mat' },
      el('b', { text: MATERIALS[b.cursor.material].name }),
      el('span', { class: 'muted', text: Object.entries(b.costOf(b.cursor.piece, b.cursor.material)).map(([k, v]) => `${v}× ${itemById(k) ? itemById(k).name : k}`).join('  ') })));
    const pieces = el('div', { class: 'build-pieces' });
    for (const id in PIECES) {
      pieces.appendChild(el('button', {
        class: 'chipbtn' + (b.cursor.piece === id ? ' on' : ''), text: PIECES[id].name,
        onclick: () => { b.setCursor({ piece: id }); this.refreshBuild(); g.audio.ui('click'); },
      }));
    }
    this.buildBar.appendChild(pieces);
    const mats = el('div', { class: 'build-pieces' });
    for (const id in MATERIALS) {
      mats.appendChild(el('button', {
        class: 'chipbtn' + (b.cursor.material === id ? ' on' : ''), text: MATERIALS[id].name,
        onclick: () => { b.setCursor({ material: id }); this.refreshBuild(); g.audio.ui('click'); },
      }));
    }
    this.buildBar.appendChild(mats);
    this.buildBar.appendChild(el('div', { class: 'row' },
      el('button', { class: 'chipbtn' + (b.cursor.snap ? ' on' : ''), text: b.cursor.snap ? 'Snap: on' : 'Snap: free', onclick: () => { b.setCursor({ snap: !b.cursor.snap }); this.refreshBuild(); } }),
      el('button', { class: 'chipbtn', text: 'Rotate', onclick: () => { b.setCursor({ ry: (b.cursor.ry || 0) + Math.PI / 2 }); this.refreshBuild(); } })));
  }
}

const POI_COLOR = {
  village: '#f0d08a', farm: '#c8d88a', camp: '#d8b878', ruin: '#b0a894', oldruin: '#9a9280',
  dungeon: '#a06a5a', cave: '#8a7a6a', icecave: '#a8d8e8', shrine: '#8fd8e8', hollowspire: '#c8a8e8',
  pyramid: '#d8c078', castle: '#d8d0c0', cabin: '#c0a878', oasis: '#8ad8c0', banditcamp: '#c05a4a',
  mine: '#a89878', barrow: '#8a8070', buried: '#9a8a70', forge_temple: '#e08a4a',
};

export default UI;
