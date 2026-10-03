/**
 * WANDERER — boot
 * ---------------
 * Wires the title screen, the world creator and the game together, and owns
 * the pointer-lock contract (the browser only lets us grab the pointer from
 * a real click, so every transition back into play goes through one).
 */

import { Game } from './game.js';
import { UI } from './ui/ui.js';
import { Screens } from './ui/screens.js';
import { SaveSystem } from './systems/save.js';

const canvas = document.getElementById('gl');
const uiRoot = document.getElementById('ui');
const screensRoot = document.getElementById('screens');
const previewCanvas = document.getElementById('preview');

const screens = new Screens(screensRoot, previewCanvas);
const save = new SaveSystem();

let game = null;
let ui = null;

async function boot() {
  await save.init();
  const recovered = await save.recover();
  if (recovered !== null) console.info('[wanderer] recovered an interrupted save into slot', recovered);
  const slots = await save.list();
  showTitle(slots);
}

function showTitle(slots) {
  if (game) { game.stop(); game = null; }
  screens.title({
    slots: slots.filter(s => s.slot !== 0),
    onNew: () => {
      screens.worldCreate({
        onBack: () => showTitle(slots),
        onStart: (desc) => startNew(desc),
      });
      if (screens._preview) {
        screens._preview.onHover = (info) => screens.showPreviewInfo(info);
      }
    },
    onContinue: (slot) => loadSlot(slot),
    onSettings: () => {
      screens.worldCreate({ onBack: () => showTitle(slots), onStart: startNew });
      if (screens._preview) screens._preview.onHover = (info) => screens.showPreviewInfo(info);
    },
  });
}

async function startNew(desc) {
  screens.loading();
  ui = new UI(uiRoot);
  game = new Game(canvas, ui);
  try {
    await game.init();
    await game.createWorld(desc, (p, label) => screens.progress(p, label));
  } catch (e) {
    console.error(e);
    screens.error(e.message || String(e), () => showTitle([]));
    return;
  }
  enterPlay();
}

async function loadSlot(slot) {
  screens.loading();
  ui = new UI(uiRoot);
  game = new Game(canvas, ui);
  try {
    await game.init();
    const rec = await save.read(slot);
    screens.progress(0.1, 'Opening save');
    await game.createWorld(rec.data.desc, (p, label) => screens.progress(0.1 + p * 0.6, label));
    await game.loadFrom(slot);
    screens.progress(1, 'Ready');
  } catch (e) {
    console.error(e);
    screens.error(e.message || String(e), () => showTitle([]));
    return;
  }
  enterPlay();
}

function enterPlay() {
  screensRoot.style.display = 'none';
  uiRoot.style.display = '';
  canvas.style.display = '';
  game.start();
  const lock = () => {
    if (game.paused) return;
    if (canvas.requestPointerLock) canvas.requestPointerLock();
  };
  canvas.addEventListener('click', lock);
  // first gesture also unlocks audio
  const unlock = async () => {
    await game.audio.init();
    game.audio.resume();
    game.applySettings(game.settings);
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  if (ui && ui.toast) ui.toast('Click to capture the mouse. Esc opens settings.', 'neutral');
  requestAnimationFrame(lock);
}

/* Esc: release the pointer and open settings; Esc again closes. */
window.addEventListener('keydown', (e) => {
  if (!game) return;
  if (e.code === 'Escape') {
    if (game.paused) { ui.closePanel(); return; }
    ui.togglePanel('settings');
  }
  if (e.code === 'F5' && e.shiftKey) { e.preventDefault(); game.saveTo(1); }
});

window.addEventListener('resize', () => { if (game) game.resize(); });

document.addEventListener('pointerlockchange', () => {
  if (!game) return;
  if (!document.pointerLockElement && !game.paused) {
    // losing the pointer without pausing would leave the player unable to look
    if (!ui.openPanel) ui.togglePanel('settings');
  }
});

window.addEventListener('beforeunload', () => {
  if (game && game.settings.autosave) game.autosaveNow();
});

boot();
