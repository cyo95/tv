import { SERVICES, SERVICE_BY_ID, isValidServiceUrl } from './services.js';
import {
  THEMES, CARD_SIZES, SAVER_DELAYS, loadSettings, saveSettings, clearSettings,
  defaultSettings, isStorageAvailable, mainServiceIds, extraServiceIds, placementOf,
} from './storage.js';
import { findNext, isArrowKey } from './spatial-nav.js';
import {
  startNews, getNews, onNews, showable, timeAgo, visualHTML, wireVisuals, isStale, isRecent,
} from './news.js';
import { initScreensaver } from './screensaver.js';
import { startWallpapers } from './wallpapers.js';
import { startWeather, loadWeather, onWeather, searchPlaces } from './weather.js';

/* ------------------------------------------------------------------ *
 * Estado
 * ------------------------------------------------------------------ */

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const root = document.documentElement;

const ROUTES = ['home', 'apps', 'settings', 'settings/apps', 'settings/city', 'help', 'news'];
let settings = loadSettings();
let route = parseRoute(location.hash);
let launching = false;
const lastFocusByRoute = new Map(); // ruta -> valor de data-focus-key
const LAST_OPENED_KEY = 'cyotools-tv:last-opened';
const LAST_QUERY_KEY = 'cyotools-tv:last-query';

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
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/></svg>',
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
    const parent = route.startsWith('settings/') ? 'settings' : 'home';
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

function allAppsCardHTML(mainMore, extrasCount) {
  const parts = [];
  if (mainMore) parts.push(`${mainMore} ${mainMore === 1 ? 'app más' : 'apps más'}`);
  if (extrasCount) parts.push(`${extrasCount} ${extrasCount === 1 ? 'extra' : 'extras'}`);
  return `
    <button class="card card--all" type="button" data-nav data-action="apps" data-focus-key="all-apps"
      aria-label="Ver todas las apps">
      <span class="card-face">
        <span class="all-icon" aria-hidden="true">${'<span></span>'.repeat(9)}</span>
      </span>
      <span class="card-caption">
        <span class="card-title">Todas las apps</span>
        <span class="card-tag">${parts.join(' y ')}</span>
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

const mainIds = () => mainServiceIds(settings).filter((id) => SAFE_IDS.has(id));
const extraIds = () => extraServiceIds(settings).filter((id) => SAFE_IDS.has(id));

// Inicio muestra las apps principales. Si no caben, o si hay Extras, la
// última tarjeta lleva a «Todas las apps».
function renderHome() {
  const ids = mainIds();
  const extras = extraIds();
  view.className = 'view view--center';
  if (!ids.length && !extras.length) return emptyHTML();
  const slots = slotsOnHome();
  const needTile = ids.length > slots || extras.length > 0;
  const shown = needTile ? ids.slice(0, slots - 1) : ids;
  const tile = needTile ? allAppsCardHTML(ids.length - shown.length, extras.length) : '';
  return `<div class="grid" data-grid>${shown.map((id) => cardHTML(SERVICE_BY_ID[id])).join('')}${tile}</div>`;
}

function renderApps() {
  const ids = mainIds();
  const extras = extraIds();
  view.className = 'view';
  const grid = (list) => `<div class="grid" data-grid>${list.map((id) => cardHTML(SERVICE_BY_ID[id])).join('')}</div>`;
  if (!ids.length && !extras.length) {
    return `<div class="screen-head">${backHTML()}<h1 class="screen-title">Todas las apps</h1></div>${emptyHTML()}`;
  }
  return `
    <div class="screen-head">${backHTML()}<h1 class="screen-title">Todas las apps</h1></div>
    ${ids.length ? grid(ids) : ''}
    ${extras.length ? `
      <h2 class="section-title">Extras</h2>
      <p class="section-note">Apps que no aparecen en Inicio. Puedes moverlas desde Ajustes.</p>
      ${grid(extras)}` : ''}`;
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
  const counts = [];
  if (settings.extras.length) counts.push(`En Extras: ${settings.extras.length}`);
  if (settings.hidden.length) counts.push(`Ocultas: ${settings.hidden.length}`);
  return `
    <div class="screen-head">${backHTML()}<h1 class="screen-title">Ajustes</h1></div>
    <div class="settings">
      ${storageNote}
      <section class="group">
        <h2>Apps</h2>
        <div class="rows">
          <button class="row" type="button" data-nav data-action="settings-apps" data-focus-key="go-apps">
            <span class="row-label">Ordenar, favoritos y extras
              <span class="row-hint">Los favoritos aparecen primero${counts.length ? `. ${counts.join('. ')}` : ''}</span>
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
          ${switchRow('showDate', 'Mostrar la fecha')}
          ${switchRow('showReturnHint', 'Recordar cómo volver', 'Muestra en Inicio cómo regresar desde una app')}
        </div>
      </section>
      <section class="group">
        <h2>Salvapantallas</h2>
        <div class="rows">
          ${choiceRow('saverDelay', 'Aparece si no se usa durante', SAVER_DELAYS)}
          <button class="row" type="button" data-nav data-action="settings-city" data-focus-key="go-city">
            <span class="row-label">Ciudad del tiempo
              <span class="row-hint">${esc(settings.weatherPlace.name)}${settings.weatherPlace.region ? `, ${esc(settings.weatherPlace.region)}` : ''}</span>
            </span>
            <span aria-hidden="true" style="transform:rotate(180deg);display:inline-flex;width:1.75rem">${ICON.back}</span>
          </button>
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
    const place = placementOf(settings, id);
    const hidden = place === 'hidden';
    const placeLabel = { home: 'En Inicio', extra: 'En Extras', hidden: 'Oculta' }[place];
    const placeIcon = { home: ICON.home, extra: ICON.grid, hidden: ICON.eyeOff }[place];
    return `
      <div class="app-row${hidden ? ' is-hidden' : ''}">
        <span class="app-swatch" style="--bg-card:${esc(s.bg)};--fg-card:${esc(s.fg)}" aria-hidden="true">${esc(s.name)}</span>
        <span class="app-row-name">${esc(s.name)}</span>
        <span class="app-actions">
          <button class="icon-btn icon-btn--wide" type="button" data-nav data-fav="${id}" data-focus-key="f:${id}"
            aria-pressed="${fav}">${fav ? ICON.star : ICON.starLine}<span>${fav ? 'Favorito' : 'Favorito'}</span></button>
          <button class="icon-btn icon-btn--place" type="button" data-nav data-place-btn="${id}" data-place="${place}" data-focus-key="p:${id}"
            aria-label="${esc(s.name)}: ${placeLabel}. Pulsa para cambiar">${placeIcon}<span>${placeLabel}</span></button>
          <button class="icon-btn" type="button" data-nav data-move="${id}" data-dir="-1" data-focus-key="u:${id}"
            aria-label="Subir ${esc(s.name)}" ${i === 0 ? 'disabled' : ''}>${ICON.up}</button>
          <button class="icon-btn" type="button" data-nav data-move="${id}" data-dir="1" data-focus-key="d:${id}"
            aria-label="Bajar ${esc(s.name)}" ${i === order.length - 1 ? 'disabled' : ''}>${ICON.down}</button>
        </span>
      </div>`;
  }).join('');
  return `
    <div class="screen-head">${backHTML()}<h1 class="screen-title">Ordenar, favoritos y extras</h1></div>
    <div class="settings">
      <p class="help-lead">Pulsa el botón de ubicación para pasar cada app de Inicio a Extras, a oculta y otra vez a Inicio.</p>
      <div class="rows">${rows}</div>
    </div>`;
}

/* Pantalla de Noticias: una noticia grande y, debajo, la tira con todas.
   Es una pantalla más de CyoTools TV: Esc o «Volver» regresan siempre.
   «Leer la noticia» abre la web del medio, como cualquier app. */

let newsIndex = 0;

/* Ciudad del tiempo */

let cityResults = [];
let cityStatus = '';
let cityQuery = '';

function renderCity() {
  view.className = 'view';
  const p = settings.weatherPlace;
  let results = '';
  if (cityStatus === 'loading') results = '<p class="help-lead">Buscando…</p>';
  else if (cityStatus === 'error') results = '<p class="note">No se ha podido buscar. Comprueba la conexión.</p>';
  else if (cityStatus === 'none') results = '<p class="help-lead">No se ha encontrado ninguna ciudad con ese nombre.</p>';
  else if (cityResults.length) {
    results = `<div class="rows">${cityResults.map((c, i) => `
      <button class="row" type="button" data-nav data-city-idx="${i}" data-focus-key="city:${i}">
        <span class="row-label">${esc(c.name)}<span class="row-hint">${esc(c.region)}</span></span>
      </button>`).join('')}</div>`;
  }
  return `
    <div class="screen-head">${backHTML()}<h1 class="screen-title">Ciudad del tiempo</h1></div>
    <div class="settings">
      <p class="help-lead">Ahora: <strong>${esc(p.name)}</strong>${p.region ? `, ${esc(p.region)}` : ''}</p>
      <div class="city-search">
        <input class="city-input" id="city-input" type="text" data-nav data-focus-key="city-input" value="${esc(cityQuery)}"
          placeholder="Escribe tu ciudad" aria-label="Buscar ciudad" autocomplete="off" spellcheck="false" maxlength="60">
        <button class="btn" type="button" data-nav data-action="city-search" data-focus-key="city-search">Buscar</button>
      </div>
      ${results}
    </div>`;
}

async function runCitySearch() {
  const input = $('#city-input');
  cityQuery = input ? input.value : cityQuery;
  if (cityQuery.trim().length < 2) {
    toast('Escribe al menos dos letras.');
    return;
  }
  cityStatus = 'loading';
  cityResults = [];
  render({ focus: 'city-input' });
  try {
    cityResults = await searchPlaces(cityQuery);
    cityStatus = cityResults.length ? '' : 'none';
  } catch {
    cityStatus = 'error';
  }
  if (route === 'settings/city') render({ focus: cityResults.length ? 'city:0' : 'city-input' });
}

function chooseCity(i) {
  const c = cityResults[i];
  if (!c) return;
  settings.weatherPlace = { name: c.name, region: c.region, lat: c.lat, lon: c.lon };
  persist();
  loadWeather(settings.weatherPlace);
  toast(`El tiempo será el de ${c.name}.`);
  cityResults = [];
  cityQuery = '';
  goBack();
}

// Teclas dentro del cuadro de la ciudad: se escribe con normalidad.
document.addEventListener('keydown', (e) => {
  if (e.target?.id !== 'city-input' || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
  e.stopPropagation();
  if (e.key === 'Enter') {
    e.preventDefault();
    runCitySearch();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    if (e.target.value) e.target.value = '';
    else goBack();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const next = findNext(e.target, e.key);
    if (next) focusEl(next);
  }
}, true);

let brokenTimer = 0;

function renderNews() {
  view.className = 'view view--news';
  const { status, updated } = getNews();
  const items = showable();
  const head = `
    <div class="screen-head">${backHTML()}<h1 class="screen-title">Noticias</h1>
      ${updated ? (isStale()
        ? `<p class="screen-meta screen-meta--warn">Sin actualizar desde ${esc(timeAgo(updated))}</p>`
        : `<p class="screen-meta">Actualizadas ${esc(timeAgo(updated))}</p>`) : ''}
    </div>`;
  if (!items.length) {
    const msg = status === 'loading'
      ? '<h2>Cargando noticias…</h2><p>Un momento.</p>'
      : '<h2>No hay noticias ahora mismo</h2><p>Se actualizan cada 30 minutos. Comprueba la conexión o vuelve a intentarlo más tarde.</p>';
    return `${head}<div class="empty">${msg}</div>`;
  }
  newsIndex = Math.min(Math.max(newsIndex, 0), items.length - 1);
  const it = items[newsIndex];
  const when = timeAgo(it.published);
  const strip = items.map((n, i) => `
    <button class="news-thumb" type="button" data-nav data-news-idx="${i}" data-focus-key="nt:${esc(n.id)}"
      ${i === newsIndex ? 'aria-current="true"' : ''} aria-label="${esc(n.title)}">
      <span class="news-thumb-img">${visualHTML(n)}</span>
      <span class="news-thumb-title">${esc(n.title)}</span>
    </button>`).join('');
  return `${head}
    <div class="news-hero">
      ${visualHTML(it, { eager: true })}
      <div class="news-shade"></div>
      <div class="news-text">
        <p class="news-meta">${isRecent(it) ? '<span class="np-new">Última hora</span>' : ''}<span class="saver-source" style="--src:${esc(it.color)}">${esc(it.source)}</span>${when ? `<span>${esc(when)}</span>` : ''}</p>
        <h2 class="news-title">${esc(it.title)}</h2>
        ${it.summary ? `<p class="news-summary">${esc(it.summary)}</p>` : ''}
        <button class="btn btn--light" type="button" data-nav data-action="news-read" data-focus-key="news-read">Leer en ${esc(it.source || 'la web')}</button>
      </div>
      <button class="news-arrow news-arrow--prev" type="button" data-nav data-action="news-prev" data-focus-key="news-prev" aria-label="Noticia anterior">${ICON.back}</button>
      <button class="news-arrow news-arrow--next" type="button" data-nav data-action="news-next" data-focus-key="news-next" aria-label="Noticia siguiente">${ICON.back}</button>
      <p class="news-count">${newsIndex + 1} de ${items.length}</p>
    </div>
    <div class="news-strip" data-strip>${strip}</div>`;
}

function showNews(i, focusKey) {
  const items = showable();
  if (!items.length) return;
  newsIndex = (i + items.length) % items.length;
  const stripScroll = view.querySelector('[data-strip]')?.scrollLeft ?? 0;
  render({ focus: focusKey || document.activeElement?.dataset?.focusKey || 'news-read', keepScroll: true });
  const strip = view.querySelector('[data-strip]');
  if (strip) {
    strip.scrollLeft = stripScroll;
    strip.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function readNews() {
  const it = showable()[newsIndex];
  if (!it) return;
  openExternal({ url: it.link, title: it.source || 'la noticia', label: 'Abriendo la noticia en', glow: it.color, lastKey: 'news' });
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
  $('#clock-date').hidden = !settings.showDate;
  updateClock();
}

function renderHint() {
  const hint = $('#hint');
  if (route === 'home' && settings.showReturnHint) {
    hint.innerHTML = `Para volver aquí desde cualquier app, ${returnKeysHTML()}.`;
  } else if (route === 'home') {
    hint.innerHTML = '';
  } else if (route === 'news') {
    hint.innerHTML = '<kbd>←</kbd> <kbd>→</kbd> cambian de noticia. Pulsa <kbd>Esc</kbd> para volver.';
  } else {
    hint.innerHTML = 'Pulsa <kbd>Esc</kbd> para volver a la pantalla anterior.';
  }
}

function render({ focus = 'restore', keepScroll = false } = {}) {
  const html = {
    home: renderHome,
    apps: renderApps,
    settings: renderSettings,
    'settings/apps': renderSettingsApps,
    help: renderHelp,
    news: renderNews,
    'settings/city': renderCity,
  }[route]();
  const scroll = view.scrollTop;
  view.innerHTML = html;
  view.scrollTop = keepScroll ? scroll : 0;
  renderHint();
  wireLogos();
  wireVisuals(view, () => {
    // Una foto rota: esa noticia se quita de la lista (agrupando cambios).
    if (route !== 'news') return;
    clearTimeout(brokenTimer);
    brokenTimer = setTimeout(() => showNews(newsIndex), 250);
  });

  if (route !== 'home') document.title = `${$('.screen-title')?.textContent ?? ''} · CyoTools TV`;
  else document.title = 'CyoTools TV';

  let target = null;
  if (focus === 'restore') {
    const key = lastFocusByRoute.get(route);
    if (key) target = view.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
  } else if (focus && focus !== 'first') {
    target = view.querySelector(`[data-focus-key="${CSS.escape(focus)}"]`);
  }
  if (!target && route === 'news') target = view.querySelector('[data-focus-key="news-read"]');
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

// Abre una dirección externa en esta misma pestaña, con la pantalla de
// confirmación. Lo usan las tarjetas y la búsqueda.
function openExternal({ url, title, label, glow, lastKey }) {
  if (launching) return;
  if (!navigator.onLine) {
    toast('No hay conexión a Internet. Comprueba la red y vuelve a intentarlo.', 4500);
    return;
  }
  launching = true;
  try { sessionStorage.setItem(LAST_OPENED_KEY, lastKey); } catch { /* sin almacenamiento: no pasa nada */ }

  const overlay = $('#launch');
  $('.launch-label').textContent = label;
  $('#launch-name').textContent = title;
  $('#launch-hint').innerHTML = `Para volver, ${returnKeysHTML()}.`;
  overlay.style.setProperty('--launch-glow', glow);
  overlay.hidden = false;

  // Pequeña pausa para que se vea la confirmación antes de cambiar de página.
  setTimeout(() => {
    try {
      window.location.assign(url);
    } catch (err) {
      console.error('[CyoTools TV] No se pudo abrir', url, err);
      resetLaunch();
      toast(`No se ha podido abrir ${title}.`);
    }
  }, 380);

  // Si la navegación no llega a producirse, se recupera el menú.
  setTimeout(() => {
    if (document.visibilityState === 'visible' && launching) resetLaunch();
  }, 15000);
}

function launch(id) {
  const s = SERVICE_BY_ID[id];
  if (!s || !SAFE_IDS.has(id)) return;
  openExternal({ url: s.url, title: s.name, label: 'Abriendo', glow: s.glow, lastKey: id });
}

/* ------------------------------------------------------------------ *
 * Búsqueda
 * Lo que se escribe se busca en Google. Si parece una dirección web
 * (marca.com, rtve.es/play…), se abre directamente.
 * ------------------------------------------------------------------ */

const searchInput = $('#search');
const searchGo = $('#search-go');
const LOOKS_LIKE_URL = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i;

function searchTarget(query) {
  const text = query.trim().replace(/\s+/g, ' ');
  if (!text) return null;
  if (!text.includes(' ') && LOOKS_LIKE_URL.test(text)) {
    const url = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    return { kind: 'web', url, label: text.replace(/^https?:\/\//i, '').replace(/\/$/, '') };
  }
  return { kind: 'search', url: `https://www.google.com/search?q=${encodeURIComponent(text)}`, label: text };
}

function runSearch() {
  const t = searchTarget(searchInput.value);
  if (!t) {
    searchInput.focus();
    toast('Escribe lo que quieres buscar.');
    return;
  }
  try { sessionStorage.setItem(LAST_QUERY_KEY, searchInput.value.trim()); } catch { /* ignorar */ }
  openExternal({
    url: t.url,
    title: t.kind === 'search' ? `«${t.label}»` : t.label,
    label: t.kind === 'search' ? 'Buscando en Google' : 'Abriendo',
    glow: '#4c8bf5',
    lastKey: 'search',
  });
}

function syncSearchButton() {
  searchGo.hidden = !searchInput.value.trim();
}
searchInput.addEventListener('input', syncSearchButton);

// Teclas dentro de la barra de búsqueda: el texto se edita con normalidad
// (izquierda, derecha, Inicio, Fin, Retroceso…); solo se usan Enter,
// Escape y la flecha abajo.
searchInput.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    runSearch();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    if (searchInput.value) {
      searchInput.value = '';
      syncSearchButton();
    } else {
      const first = view.querySelector('[data-nav]');
      if (first) focusEl(first);
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    hideCursorNow();
    const next = findNext(searchInput, 'ArrowDown');
    if (next) focusEl(next);
  }
  e.stopPropagation(); // el resto de atajos no se aplican mientras se escribe
});

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
    let last = null;
    try { last = sessionStorage.getItem(LAST_OPENED_KEY); } catch { /* ignorar */ }
    if (route === 'home' && last === 'search') focusSearch(true);
    syncSearchButton();
    keepAwake();
  }
});

// Al volver de una búsqueda, el texto anterior queda seleccionado: se
// puede corregir o escribir encima directamente.
function focusSearch(selectAll = false) {
  if (!searchInput.value) {
    try { searchInput.value = sessionStorage.getItem(LAST_QUERY_KEY) || ''; } catch { /* ignorar */ }
    syncSearchButton();
  }
  searchInput.focus({ preventScroll: true });
  if (selectAll) searchInput.select();
}

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

// Inicio → Extras → Oculta → Inicio
function cyclePlacement(id) {
  const place = placementOf(settings, id);
  const extras = new Set(settings.extras);
  const hidden = new Set(settings.hidden);
  if (place === 'home') { extras.add(id); }
  else if (place === 'extra') { extras.delete(id); hidden.add(id); }
  else { hidden.delete(id); }
  settings.extras = settings.order.filter((x) => extras.has(x));
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
  settings.extras = order.filter((x) => settings.extras.includes(x));
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
  if (action === 'news') return go('news');
  if (action === 'settings-city') { cityStatus = ''; cityResults = []; return go('settings/city'); }
  if (action === 'city-search') return runCitySearch();
  if (t.dataset.cityIdx) return chooseCity(Number(t.dataset.cityIdx));
  if (action === 'news-prev') return showNews(newsIndex - 1, 'news-prev');
  if (action === 'news-next') return showNews(newsIndex + 1, 'news-next');
  if (action === 'news-read') return readNews();
  if (t.dataset.newsIdx) return showNews(Number(t.dataset.newsIdx), t.dataset.focusKey);
  if (action === 'reset') return handleReset();
  if (action === 'search') return runSearch();

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
  if (t.dataset.placeBtn) {
    cyclePlacement(t.dataset.placeBtn);
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
  // Mientras se escribe una búsqueda, rozar el touchpad no quita el foco
  // de la barra (si no, Enter abriría la tarjeta sobre la que pasó el cursor).
  const ae = document.activeElement;
  if (ae && ae.tagName === 'INPUT' && ae.value.trim()) return;

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

  // En Noticias, ← y → cambian de noticia mientras se está en la noticia grande.
  if (route === 'news' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && active?.dataset?.action === 'news-read') {
    e.preventDefault();
    hideCursorNow();
    showNews(newsIndex + (e.key === 'ArrowRight' ? 1 : -1), 'news-read');
    return;
  }

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

  // Escribir en cualquier momento empieza una búsqueda, como en un
  // televisor: la letra pulsada pasa directamente a la barra.
  if (e.key.length === 1 && e.key !== ' ' && route !== 'settings/apps') {
    hideCursorNow();
    searchInput.focus({ preventScroll: true });
    return; // sin preventDefault: Chrome escribe la letra en la barra
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
 * Mantener el equipo despierto
 * Mientras CyoTools TV está en pantalla, se pide a Chrome que no apague
 * la pantalla ni deje que Windows suspenda el equipo (Screen Wake Lock).
 * Chrome lo libera solo al cambiar de página, y se vuelve a pedir al
 * regresar. Para mantenerlo también dentro de las apps, la extensión hace
 * lo mismo de forma permanente.
 * ------------------------------------------------------------------ */

let wakeLock = null;

async function keepAwake() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  if (wakeLock && !wakeLock.released) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    root.dataset.wakeLock = 'on';
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
      root.dataset.wakeLock = 'off';
    });
  } catch (err) {
    root.dataset.wakeLock = 'off';
    console.info('[CyoTools TV] No se pudo mantener la pantalla encendida:', err.message);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepAwake();
});
// Algunos sistemas lo deniegan hasta la primera interacción: se reintenta.
['pointerdown', 'keydown'].forEach((type) => {
  document.addEventListener(type, () => { if (!wakeLock) keepAwake(); }, { passive: true });
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
  if (route === 'home' && last === 'search') focusSearch(true);
  syncSearchButton();
  scheduleClock();
  showCursor();
  keepAwake();

  // Pruebas: ?newsevery=5 relee las noticias cada 5 s.
  const newsEvery = Number(new URLSearchParams(location.search).get('newsevery'));
  startNews(newsEvery >= 2 && newsEvery <= 600 ? newsEvery * 1000 : undefined);
  onNews(() => { if (route === 'news') render({ focus: 'restore', keepScroll: true }); });

  startWallpapers();
  startWeather(() => settings.weatherPlace);

  // Para pruebas: ?idle=10&slide=4 abre el salvapantallas tras 10 s y
  // cambia de foto cada 4 s.
  const params = new URLSearchParams(location.search);
  const testIdle = Number(params.get('idle'));
  const testSlide = Number(params.get('slide'));
  const quick = testSlide >= 2 && testSlide <= 60 ? testSlide * 1000 : undefined;
  const num = (v, min, max) => {
    const n = Number(v);
    return n >= min && n <= max ? n * 1000 : undefined;
  };
  const saver = initScreensaver({
    photoMs: quick,
    // Pruebas: ?read=8&qr=4&hint=10 acortan los tiempos de las noticias y del aviso.
    readMs: num(params.get('read'), 6, 60),
    qrMs: num(params.get('qr'), 2, 30),
    hintEveryMs: num(params.get('hint'), 3, 300),
    getPlaceName: () => settings.weatherPlace.name,
    delayMs: () => {
      if (settings.saverDelay === 'off') return 0;
      if (testIdle > 0 && testIdle <= 600) return testIdle * 1000;
      return SAVER_DELAYS.find((o) => o.id === settings.saverDelay)?.ms ?? 10000;
    },
    // No salta mientras se escribe ni mientras se lee la pantalla Noticias.
    canStart: () => {
      const ae = document.activeElement;
      const typing = ae && ae.tagName === 'INPUT' && ae.value.trim();
      return !launching && !typing && route !== 'news' && document.visibilityState === 'visible';
    },
    onOpen: () => root.classList.add('cursor-off'),
    onClose: () => showCursor(),
  });
  onWeather(() => saver.refreshWeather());
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
