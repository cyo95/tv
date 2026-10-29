import { SERVICES, SERVICE_BY_ID, isValidServiceUrl } from './services.js';
import {
  THEMES, CARD_SIZES, loadSettings, saveSettings, clearSettings,
  defaultSettings, isStorageAvailable, visibleServiceIds,
} from './storage.js';
import { findNext, isArrowKey } from './spatial-nav.js';

/* ------------------------------------------------------------------ *
 * Estado
 * ------------------------------------------------------------------ */

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const root = document.documentElement;

const ROUTES = ['home', 'apps', 'settings', 'settings/apps', 'help'];
let settings = loadSettings();
let route = parseRoute(location.hash);
let launching = false;
const lastFocusByRoute = new Map(); // ruta -> valor de data-focus-key
const LAST_OPENED_KEY = 'cyotools-tv:last-opened';

// La extensión opcional «CyoTools TV – Inicio» marca el documento al cargar.
const hasExtension = () => root.dataset.cyoExtension === 'on';

// Servicios con URL inválida no se muestran (protege de errores al editar).
const SAFE_SERVICES = SERVICES.filter((s) => {
  const ok = isValidServiceUrl(s.url);
  if (!ok) console.warn(`[CyoTools TV] URL no válida para ${s.id}: se omite.`);
  return ok;
});
const SAFE_IDS = new Set(SAFE_SERVICES.map((s) => s.id));

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */

const esc = (str) => String(str).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8l2.83 5.73 6.32.92-4.57 4.46 1.08 6.3L12 17.24l-5.66 2.97 1.08-6.3L2.85 9.45l6.32-.92z"/></svg>',
  starLine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.8l2.83 5.73 6.32.92-4.57 4.46 1.08 6.3L12 17.24l-5.66 2.97 1.08-6.3L2.85 9.45l6.32-.92z"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 15l7-7 7 7"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10.4 10.4 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
};

let toastTimer = 0;
function toast(message, ms = 3200) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function persist() {
  if (!saveSettings(settings)) {
    toast('No se han podido guardar los ajustes. Se mantendrán hasta que se recargue la página.', 5000);
  }
}

function returnKeysHTML() {
  return hasExtension()
    ? 'lleva el cursor a la <strong>esquina superior izquierda</strong> o pulsa <kbd>Ctrl</kbd> <kbd>Mayús</kbd> <kbd>Inicio</kbd>'
    : 'pulsa <kbd>Alt</kbd> <kbd>Inicio</kbd>';
}

/* ------------------------------------------------------------------ *
 * Rutas internas
 * Cada pantalla tiene su propia entrada en el historial, así que tanto
 * Escape como el «atrás» del navegador vuelven a la pantalla anterior,
 * y «Inicio» vuelve directamente a la principal.
 * ------------------------------------------------------------------ */

function parseRoute(hash) {
  const r = (hash || '').replace(/^#\/?/, '');
  return ROUTES.includes(r) ? r : 'home';
}
const hashFor = (r) => (r === 'home' ? '#/' : `#/${r}`);
const depth = () => (history.state && Number.isInteger(history.state.depth) ? history.state.depth : 0);

function rememberFocus() {
  const el = document.activeElement;
  if (el && el.dataset && el.dataset.focusKey && view.contains(el)) {
    lastFocusByRoute.set(route, el.dataset.focusKey);
  }
}

function go(next) {
  if (next === route) return;
  rememberFocus();
  if (next === 'home') return goHome();
  history.pushState({ depth: depth() + 1 }, '', hashFor(next));
  route = next;
  render({ focus: 'first' });
}

function goBack() {
  if (route === 'home') return;
  rememberFocus();
  if (depth() > 0) {
    history.back(); // el resto lo hace popstate
  } else {
    // Se llegó directamente a una pantalla interna (p. ej. recargando):
    // «atrás» lleva a su pantalla superior.
    const parent = route === 'settings/apps' ? 'settings' : 'home';
    history.replaceState({ depth: 0 }, '', hashFor(parent));
    route = parent;
    render({ focus: 'restore' });
  }
}

function goHome() {
  if (route === 'home') return;
  rememberFocus();
  const d = depth();
  if (d > 0) {
    // Retrocede todas las pantallas internas: el historial queda limpio.
    history.go(-d);
  } else {
    history.replaceState({ depth: 0 }, '', hashFor('home'));
    route = 'home';
    render({ focus: 'restore' });
  }
}

window.addEventListener('popstate', () => {
  route = parseRoute(location.hash);
  render({ focus: 'restore' });
});

/* ------------------------------------------------------------------ *
 * Tarjetas
 * ------------------------------------------------------------------ */

function cardHTML(s) {
  const fav = settings.favorites.includes(s.id);
  const face = s.logo
    ? `<img class="card-logo" src="${esc(s.logo)}" alt="" draggable="false" data-fallback="${esc(s.name)}">`
    : `<span class="card-name">${esc(s.name)}</span>`;
  return `
    <button class="card" type="button" data-nav data-service="${esc(s.id)}" data-focus-key="svc:${esc(s.id)}"
      style="--bg-card:${esc(s.bg)};--fg-card:${esc(s.fg)};--glow-card:${esc(s.glow)}"
      aria-label="Abrir ${esc(s.name)}${fav ? ', favorito' : ''}">
      <span class="card-face">
        ${face}
        ${fav ? `<span class="fav-badge">${ICON.star}</span>` : ''}
      </span>
      <span class="card-caption">
        <span class="card-title">${esc(s.name)}</span>
        <span class="card-tag">${esc(s.tagline)}</span>
      </span>
    </button>`;
}

function allAppsCardHTML(total) {
  return `
    <button class="card card--all" type="button" data-nav data-action="apps" data-focus-key="all-apps"
      aria-label="Ver todas las apps">
      <span class="card-face">
        <span class="all-icon" aria-hidden="true">${'<span></span>'.repeat(9)}</span>
      </span>
      <span class="card-caption">
        <span class="card-title">Todas las apps</span>
        <span class="card-tag">${total} disponibles</span>
      </span>
    </button>`;
}

function emptyHTML() {
  return `
    <div class="empty">
      <h2>No hay apps visibles</h2>
      <p>Todas las apps están ocultas. Puedes volver a mostrarlas desde Ajustes.</p>
      <button class="btn" type="button" data-nav data-action="settings-apps" data-focus-key="empty-cta">Mostrar apps</button>
    </div>`;
}

const slotsOnHome = () => {
  const cols = parseInt(getComputedStyle(root).getPropertyValue('--cols'), 10) || 4;
  return cols * 2;
};

/* ------------------------------------------------------------------ *
 * Pantallas
 * ------------------------------------------------------------------ */

function backHTML(label = 'Volver') {
  return `<button class="back" type="button" data-nav data-action="back" data-focus-key="back">${ICON.back}<span>${label}</span></button>`;
}

function renderHome() {
  const ids = visibleServiceIds(settings).filter((id) => SAFE_IDS.has(id));
  view.className = 'view view--center';
  if (!ids.length) return emptyHTML();
  const slots = slotsOnHome();
  let shown = ids;
  let extra = '';
  if (ids.length > slots) {
    shown = ids.slice(0, slots - 1);
    extra = allAppsCardHTML(ids.length);
  }
  return `<div class="grid" data-grid>${shown.map((id) => cardHTML(SERVICE_BY_ID[id])).join('')}${extra}</div>`;
}

function renderApps() {
  const ids = visibleServiceIds(settings).filter((id) => SAFE_IDS.has(id));
  view.className = 'view';
  return `
    <div class="screen-head">${backHTML()}<h1 class="screen-title">Todas las apps</h1></div>
    ${ids.length ? `<div class="grid" data-grid>${ids.map((id) => cardHTML(SERVICE_BY_ID[id])).join('')}</div>` : emptyHTML()}`;
}

function switchRow(key, label, hint = '') {
  const on = !!settings[key];
  return `
    <button class="row" type="button" role="switch" aria-checked="${on}" data-nav data-toggle="${key}" data-focus-key="t:${key}">
      <span class="row-label">${label}${hint ? `<span class="row-hint">${hint}</span>` : ''}</span>
      <span class="switch"><span>${on ? 'Sí' : 'No'}</span><span class="switch-track" aria-hidden="true"></span></span>
    </button>`;
}

function choiceRow(key, label, options) {
  return `
    <div class="choice-row" role="group" aria-label="${esc(label)}">
      <span>${label}</span>
      <span class="choices">
        ${options.map((o) => `
          <button class="choice" type="button" data-nav data-choice="${key}" data-value="${o.id}"
            data-focus-key="c:${key}:${o.id}" aria-pressed="${settings[key] === o.id}">${esc(o.label)}</button>`).join('')}
      </span>
    </div>`;
}

let resetArmed = false;
let resetTimer = 0;

function renderSettings() {
  view.className = 'view';
  const storageNote = isStorageAvailable() ? '' : `
    <p class="note">Este navegador no permite guardar datos. Los cambios funcionarán hasta que se recargue la página. Comprueba que Chrome no se abre en modo incógnito ni como invitado.</p>`;
  const hiddenCount = settings.hidden.length;
  return `
    <div class="screen-head">${backHTML()}<h1 class="screen-title">Ajustes</h1></div>
    <div class="settings">
      ${storageNote}
      <section class="group">
        <h2>Apps</h2>
        <div class="rows">
          <button class="row" type="button" data-nav data-action="settings-apps" data-focus-key="go-apps">
            <span class="row-label">Ordenar, favoritos y ocultar
              <span class="row-hint">Los favoritos aparecen primero en Inicio${hiddenCount ? `. Ocultas: ${hiddenCount}` : ''}</span>
            </span>
            <span aria-hidden="true" style="transform:rotate(180deg);display:inline-flex;width:1.75rem">${ICON.back}</span>
          </button>
        </div>
      </section>
      <section class="group">
        <h2>Pantalla</h2>
        <div class="rows">
          ${choiceRow('theme', 'Tema', THEMES)}
          ${choiceRow('cardSize', 'Tamaño de las tarjetas', CARD_SIZES)}
          ${switchRow('showClock', 'Mostrar la hora')}
          ${switchRow('showDate', 'Mostrar la fecha')}
          ${switchRow('showReturnHint', 'Recordar cómo volver', 'Muestra en Inicio cómo regresar desde una app')}
        </div>
      </section>
      <section class="group">
        <h2>Cursor</h2>
        <div class="rows">
          ${switchRow('bigCursor', 'Cursor grande', 'Más fácil de ver en la pared')}
          ${switchRow('hideIdleCursor', 'Ocultar el cursor si no se mueve', 'Desaparece a los 4 segundos y vuelve al tocar el touchpad')}
        </div>
      </section>
      <section class="group">
        <h2>Restaurar</h2>
        <div class="rows">
          <div>
            <button class="btn btn--danger${resetArmed ? ' btn--armed' : ''}" type="button" data-nav data-action="reset" data-focus-key="reset">
              ${resetArmed ? 'Pulsa otra vez para restaurar' : 'Restaurar ajustes originales'}
            </button>
          </div>
        </div>
      </section>
    </div>`;
}

function renderSettingsApps() {
  view.className = 'view';
  const order = settings.order.filter((id) => SAFE_IDS.has(id));
  const rows = order.map((id, i) => {
    const s = SERVICE_BY_ID[id];
    const fav = settings.favorites.includes(id);
    const hidden = settings.hidden.includes(id);
    return `
      <div class="app-row${hidden ? ' is-hidden' : ''}">
        <span class="app-swatch" style="--bg-card:${esc(s.bg)};--fg-card:${esc(s.fg)}" aria-hidden="true">${esc(s.name)}</span>
        <span class="app-row-name">${esc(s.name)}${hidden ? '<span class="app-row-pos">Oculta</span>' : ''}</span>
        <span class="app-actions">
          <button class="icon-btn icon-btn--wide" type="button" data-nav data-fav="${id}" data-focus-key="f:${id}"
            aria-pressed="${fav}">${fav ? ICON.star : ICON.starLine}<span>${fav ? 'Favorito' : 'Favorito'}</span></button>
          <button class="icon-btn icon-btn--wide" type="button" data-nav data-hide="${id}" data-focus-key="h:${id}"
            aria-label="${hidden ? 'Mostrar' : 'Ocultar'} ${esc(s.name)}">${hidden ? ICON.eyeOff : ICON.eye}<span>${hidden ? 'Mostrar' : 'Ocultar'}</span></button>
          <button class="icon-btn" type="button" data-nav data-move="${id}" data-dir="-1" data-focus-key="u:${id}"
            aria-label="Subir ${esc(s.name)}" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
          <button class="icon-btn" type="button" data-nav data-move="${id}" data-dir="1" data-focus-key="d:${id}"
            aria-label="Bajar ${esc(s.name)}" ${i === order.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
        </span>
      </div>`;
  }).join('');
  return `
    <div class="screen-head">${backHTML()}<h1 class="screen-title">Ordenar y favoritos</h1></div>
    <div class="settings"><div class="rows">${rows}</div></div>`;
}

function renderHelp() {
  view.className = 'view';
  const ext = hasExtension();
  const extWay = `
    <div class="way way--main">
      <h3>Esquina superior izquierda</h3>
      <p>Lleva el cursor a la esquina superior izquierda de la pantalla. Aparecerá el botón Inicio; púlsalo. También puedes usar <span class="keys"><kbd>Ctrl</kbd> <kbd>Mayús</kbd> <kbd>Inicio</kbd></span></p>
    </div>`;
  const altHome = `
    <div class="way${ext ? '' : ' way--main'}">
      <h3>Tecla de inicio</h3>
      <p><span class="keys"><kbd>Alt</kbd> <kbd>Inicio</kbd></span> abre CyoTools TV desde cualquier app, si Chrome lo tiene configurado como página principal.</p>
    </div>`;
  return `
    <div class="screen-head">${backHTML()}<h1 class="screen-title">Cómo volver a CyoTools TV</h1></div>
    <div class="help">
      <p class="help-lead">Las apps se abren a pantalla completa en su web oficial. Para regresar a este menú desde cualquiera de ellas:</p>
      ${ext ? extWay : ''}
      ${altHome}
      <div class="way">
        <h3>Atrás</h3>
        <p><span class="keys"><kbd>Alt</kbd> <kbd>←</kbd></span> o desliza dos dedos hacia la derecha en el touchpad. Retrocede una página cada vez, así que puede hacer falta repetirlo.</p>
      </div>
      <div class="way">
        <h3>Salir de pantalla completa</h3>
        <p>Si un vídeo está a pantalla completa, pulsa <span class="keys"><kbd>Esc</kbd></span> antes de volver.</p>
      </div>
      ${ext ? '' : `<p class="note">La extensión opcional «CyoTools TV – Inicio» añade un botón de Inicio en la esquina superior izquierda de todas las apps. Las instrucciones de instalación están en el archivo LEEME del proyecto.</p>`}
    </div>`;
}

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

function applyDisplaySettings() {
  root.dataset.theme = settings.theme;
  root.dataset.size = settings.cardSize;
  root.classList.toggle('big-cursor', settings.bigCursor);
  $('#clock').hidden = !settings.showClock && !settings.showDate;
  $('#clock-time').hidden = !settings.showClock;
  $('#clock-date').hidden = !settings.showDate;
  updateClock();
}

function renderHint() {
  const hint = $('#hint');
  if (route === 'home' && settings.showReturnHint) {
    hint.innerHTML = `Para volver aquí desde cualquier app, ${returnKeysHTML()}.`;
  } else if (route === 'home') {
    hint.innerHTML = '';
  } else {
    hint.innerHTML = 'Pulsa <kbd>Esc</kbd> para volver a la pantalla anterior.';
  }
}

function render({ focus = 'restore' } = {}) {
  const html = {
    home: renderHome,
    apps: renderApps,
    settings: renderSettings,
    'settings/apps': renderSettingsApps,
    help: renderHelp,
  }[route]();
  view.innerHTML = html;
  view.scrollTop = 0;
  renderHint();
  wireLogos();

  if (route !== 'home') document.title = `${$('.screen-title')?.textContent ?? ''} · CyoTools TV`;
  else document.title = 'CyoTools TV';

  let target = null;
  if (focus === 'restore') {
    const key = lastFocusByRoute.get(route);
    if (key) target = view.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
  } else if (focus && focus !== 'first') {
    target = view.querySelector(`[data-focus-key="${CSS.escape(focus)}"]`);
  }
  if (!target) {
    target = view.querySelector('.card[data-nav]:not(.card--all)') || view.querySelector('[data-nav]');
  }
  if (target) focusEl(target);
  else setAmbient(null);
}

// Si un logotipo configurado no carga, se sustituye por el nombre.
function wireLogos() {
  view.querySelectorAll('img.card-logo').forEach((img) => {
    img.addEventListener('error', () => {
      const span = document.createElement('span');
      span.className = 'card-name';
      span.textContent = img.dataset.fallback;
      img.replaceWith(span);
    }, { once: true });
  });
}

function focusEl(el) {
  el.focus({ preventScroll: true });
  // Desplaza solo lo necesario para que el elemento quede visible.
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
}

function setAmbient(color) {
  root.style.setProperty('--ambient', color || 'transparent');
}

document.addEventListener('focusin', (e) => {
  const card = e.target.closest?.('.card');
  if (card) {
    setAmbient(card.style.getPropertyValue('--glow-card') || null);
  } else if (view.contains(e.target) || e.target.closest?.('.topbar')) {
    setAmbient(null);
  }
});

/* ------------------------------------------------------------------ *
 * Abrir un servicio
 * Se abre en esta misma pestaña. Es la opción más fiable en Chrome en
 * modo quiosco: no se acumulan ventanas y se puede volver con el
 * historial, con la página principal de Chrome (Alt+Inicio) o con la
 * extensión opcional.
 * ------------------------------------------------------------------ */

function launch(id) {
  if (launching) return;
  const s = SERVICE_BY_ID[id];
  if (!s || !SAFE_IDS.has(id)) return;
  if (!navigator.onLine) {
    toast('No hay conexión a Internet. Comprueba la red y vuelve a intentarlo.', 4500);
    return;
  }
  launching = true;
  try { sessionStorage.setItem(LAST_OPENED_KEY, id); } catch { /* sin almacenamiento: no pasa nada */ }

  const overlay = $('#launch');
  $('#launch-name').textContent = s.name;
  $('#launch-hint').innerHTML = `Para volver, ${returnKeysHTML()}.`;
  overlay.style.setProperty('--launch-glow', s.glow);
  overlay.hidden = false;

  // Pequeña pausa para que se vea la confirmación antes de cambiar de página.
  setTimeout(() => {
    try {
      window.location.assign(s.url);
    } catch (err) {
      console.error('[CyoTools TV] No se pudo abrir', s.url, err);
      resetLaunch();
      toast(`No se ha podido abrir ${s.name}.`);
    }
  }, 380);

  // Si la navegación no llega a producirse (bloqueo, error de red
  // inmediato), se recupera el menú en lugar de quedarse colgado.
  setTimeout(() => {
    if (document.visibilityState === 'visible' && launching) {
      resetLaunch();
    }
  }, 15000);
}

function resetLaunch() {
  launching = false;
  $('#launch').hidden = true;
}

// Al volver con «atrás», Chrome puede restaurar la página desde su caché
// (bfcache). Hay que quitar la pantalla de apertura y recolocar el foco.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    resetLaunch();
    route = parseRoute(location.hash);
    applyDisplaySettings();
    render({ focus: 'restore' });
  }
});

/* ------------------------------------------------------------------ *
 * Acciones
 * ------------------------------------------------------------------ */

function toggleFavorite(id) {
  const favs = new Set(settings.favorites);
  const name = SERVICE_BY_ID[id]?.name ?? '';
  if (favs.has(id)) {
    favs.delete(id);
    toast(`${name} ya no es favorito.`);
  } else {
    favs.add(id);
    toast(`${name} añadido a favoritos. Aparecerá entre los primeros.`);
  }
  settings.favorites = settings.order.filter((x) => favs.has(x));
  persist();
}

function toggleHidden(id) {
  const hidden = new Set(settings.hidden);
  if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
  settings.hidden = settings.order.filter((x) => hidden.has(x));
  persist();
}

function move(id, dir) {
  const order = [...settings.order];
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  settings.order = order;
  settings.favorites = order.filter((x) => settings.favorites.includes(x));
  settings.hidden = order.filter((x) => settings.hidden.includes(x));
  persist();
}

function handleReset() {
  if (!resetArmed) {
    resetArmed = true;
    render({ focus: 'reset' });
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetArmed = false;
      if (route === 'settings') render({ focus: document.activeElement?.dataset?.focusKey || 'reset' });
    }, 5000);
    return;
  }
  clearTimeout(resetTimer);
  resetArmed = false;
  clearSettings();
  settings = defaultSettings();
  persist();
  applyDisplaySettings();
  render({ focus: 'reset' });
  toast('Ajustes restaurados.');
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;

  if (t.dataset.service) return launch(t.dataset.service);

  const action = t.dataset.action;
  if (action === 'home') return goHome();
  if (action === 'back') return goBack();
  if (action === 'apps') return go('apps');
  if (action === 'settings') return go('settings');
  if (action === 'settings-apps') return go('settings/apps');
  if (action === 'help') return go('help');
  if (action === 'reset') return handleReset();

  if (t.dataset.toggle) {
    const k = t.dataset.toggle;
    settings[k] = !settings[k];
    persist();
    applyDisplaySettings();
    return render({ focus: t.dataset.focusKey });
  }
  if (t.dataset.choice) {
    settings[t.dataset.choice] = t.dataset.value;
    persist();
    applyDisplaySettings();
    return render({ focus: t.dataset.focusKey });
  }
  if (t.dataset.fav) {
    toggleFavorite(t.dataset.fav);
    return render({ focus: t.dataset.focusKey });
  }
  if (t.dataset.hide) {
    toggleHidden(t.dataset.hide);
    return render({ focus: t.dataset.focusKey });
  }
  if (t.dataset.move) {
    move(t.dataset.move, Number(t.dataset.dir));
    // El foco sigue al botón pulsado aunque la fila haya cambiado de sitio;
    // si llega al extremo (botón desactivado), pasa al otro botón de la fila.
    render({ focus: t.dataset.focusKey });
    if (document.activeElement === document.body || document.activeElement?.disabled) {
      const id = t.dataset.move;
      const other = view.querySelector(`[data-focus-key="${t.dataset.dir === '1' ? 'u' : 'd'}:${CSS.escape(id)}"]`);
      if (other) focusEl(other);
    }
  }
});

/* ------------------------------------------------------------------ *
 * Selección tolerante con el touchpad
 * - Pasar el cursor por encima de cualquier control lo selecciona.
 * - Dentro de la cuadrícula no hay huecos muertos: el cursor siempre
 *   selecciona la tarjeta más cercana, y un clic en el espacio entre
 *   tarjetas abre la que está seleccionada.
 * ------------------------------------------------------------------ */

function nearestCard(grid, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const card of grid.querySelectorAll('.card')) {
    const r = card.getBoundingClientRect();
    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = card; }
  }
  return best;
}

function pointerMoved(e) {
  return e.movementX !== 0 || e.movementY !== 0;
}

document.addEventListener('pointermove', (e) => {
  if (!pointerMoved(e) || launching) return;
  showCursor();

  const grid = e.target.closest?.('[data-grid]');
  if (grid) {
    const card = nearestCard(grid, e.clientX, e.clientY);
    if (card && document.activeElement !== card) card.focus({ preventScroll: true });
    return;
  }
  const nav = e.target.closest?.('[data-nav]');
  if (nav && document.activeElement !== nav && !nav.disabled) nav.focus({ preventScroll: true });
}, { passive: true });

document.addEventListener('click', (e) => {
  const grid = e.target.closest?.('[data-grid]');
  if (!grid || e.target.closest('button')) return;
  const card = nearestCard(grid, e.clientX, e.clientY);
  if (card) card.click();
});

/* ------------------------------------------------------------------ *
 * Cursor: se oculta tras unos segundos sin moverse
 * ------------------------------------------------------------------ */

let idleTimer = 0;
function showCursor() {
  root.classList.remove('cursor-off');
  clearTimeout(idleTimer);
  if (settings.hideIdleCursor) {
    idleTimer = setTimeout(() => root.classList.add('cursor-off'), 4000);
  }
}
function hideCursorNow() {
  if (settings.hideIdleCursor) {
    clearTimeout(idleTimer);
    root.classList.add('cursor-off');
  }
}

/* ------------------------------------------------------------------ *
 * Teclado
 * Solo se capturan las teclas que la interfaz usa, y nunca combinaciones
 * con Ctrl, Alt o Windows: esas pertenecen a Chrome y al sistema.
 * ------------------------------------------------------------------ */

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
  if (launching) return;

  const active = document.activeElement;
  const inUI = active === document.body || active === view || active?.hasAttribute?.('data-nav');

  if (isArrowKey(e.key) && inUI) {
    hideCursorNow();
    const next = findNext(active?.hasAttribute?.('data-nav') ? active : null, e.key);
    e.preventDefault();
    if (next) focusEl(next);
    return;
  }

  if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'BrowserBack') {
    if (route !== 'home') {
      e.preventDefault();
      goBack();
    }
    return;
  }

  if (e.key === 'Home' || e.key === 'BrowserHome') {
    e.preventDefault();
    if (route !== 'home') goHome();
    else {
      const first = view.querySelector('[data-nav]');
      if (first) focusEl(first);
    }
    return;
  }

  if ((e.key === 'f' || e.key === 'F') && active?.dataset?.service) {
    e.preventDefault();
    const id = active.dataset.service;
    toggleFavorite(id);
    render({ focus: `svc:${id}` });
    return;
  }

  if ((e.key === 'Enter' || e.key === ' ') && (active === document.body || active === view)) {
    e.preventDefault();
    const first = view.querySelector('[data-nav]');
    if (first) focusEl(first);
  }

  if (e.key === 'Tab') hideCursorNow();
});

/* ------------------------------------------------------------------ *
 * Reloj
 * ------------------------------------------------------------------ */

const timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

function updateClock() {
  const now = new Date();
  const t = $('#clock-time');
  t.textContent = timeFmt.format(now);
  t.dateTime = now.toISOString();
  $('#clock-date').textContent = dateFmt.format(now);
}

function scheduleClock() {
  updateClock();
  // Se sincroniza con el cambio de minuto.
  const ms = 60000 - (Date.now() % 60000) + 50;
  setTimeout(scheduleClock, ms);
}

/* ------------------------------------------------------------------ *
 * Conexión
 * ------------------------------------------------------------------ */

window.addEventListener('offline', () => toast('Sin conexión a Internet. Las apps no se podrán abrir hasta que vuelva.', 5000));
window.addEventListener('online', () => toast('Conexión recuperada.'));

// Otro proceso (o la propia app en otra pestaña) cambió los ajustes.
window.addEventListener('storage', (e) => {
  if (e.key && e.key.startsWith('cyotools-tv:settings')) {
    settings = loadSettings();
    applyDisplaySettings();
    render({ focus: 'restore' });
  }
});

// Al cambiar el tamaño de la ventana puede cambiar el número de columnas.
let resizeTimer = 0;
let lastCols = slotsOnHome();
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const cols = slotsOnHome();
    if (cols !== lastCols && route === 'home') {
      lastCols = cols;
      rememberFocus();
      render({ focus: 'restore' });
    }
  }, 150);
});

/* ------------------------------------------------------------------ *
 * Arranque
 * ------------------------------------------------------------------ */

function init() {
  applyDisplaySettings();
  // Normaliza la entrada actual del historial.
  history.replaceState({ depth: 0 }, '', hashFor(route));

  // Al volver de una app, la selección queda en la que se abrió.
  let last = null;
  try { last = sessionStorage.getItem(LAST_OPENED_KEY); } catch { /* ignorar */ }
  if (route === 'home' && last && SAFE_IDS.has(last)) lastFocusByRoute.set('home', `svc:${last}`);

  render({ focus: 'restore' });
  scheduleClock();
  showCursor();
  // Persistencia: guarda la versión normalizada (repara datos dañados).
  persist();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.info('[CyoTools TV] Sin copia para arranque sin conexión:', err.message);
    });
  }
}

// La extensión marca el documento en document_start; si se instala o
// activa con la página abierta, se actualizan los textos.
new MutationObserver(() => { renderHint(); if (route === 'help') render({ focus: 'restore' }); })
  .observe(root, { attributes: true, attributeFilter: ['data-cyo-extension'] });

init();
