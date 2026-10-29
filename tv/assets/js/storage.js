// Preferencias guardadas en localStorage. Sin cuentas ni servidores.
// Todo lo que se lee se valida: si el dato guardado está dañado, se
// recupera lo que sea válido y el resto vuelve al valor por defecto.

import {
  DEFAULT_ORDER, DEFAULT_FAVORITES, DEFAULT_EXTRAS, DEFAULT_HIDDEN, SERVICE_BY_ID,
} from './services.js';

const KEY = 'cyotools-tv:settings:v2';
const OLD_KEY = 'cyotools-tv:settings:v1';
// Favoritos por defecto de la versión 1: si siguen así, no se tocaron.
const OLD_DEFAULT_FAVORITES = ['netflix', 'youtube', 'disney', 'spotify'];

export const THEMES = [
  { id: 'medianoche', label: 'Medianoche' },
  { id: 'grafito', label: 'Grafito' },
  { id: 'negro', label: 'Negro total' },
];

export const CARD_SIZES = [
  { id: 'grande', label: 'Grandes' },
  { id: 'normal', label: 'Normales' },
];

// Minutos sin usar el equipo antes de mostrar el carrusel de noticias.
export const SAVER_DELAYS = [
  { id: '1', label: '1 min' },
  { id: '2', label: '2 min' },
  { id: '5', label: '5 min' },
  { id: 'off', label: 'Nunca' },
];

export function defaultSettings() {
  return {
    theme: 'medianoche',
    cardSize: 'grande',
    showDate: true,
    bigCursor: true,
    hideIdleCursor: true,
    showReturnHint: true,
    saverDelay: '2',
    order: [...DEFAULT_ORDER],
    favorites: [...DEFAULT_FAVORITES],
    extras: [...DEFAULT_EXTRAS],
    hidden: [...DEFAULT_HIDDEN],
  };
}

let storageAvailable = true;

function readJSON(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    if (key === KEY) storageAvailable = false;
    return null;
  }
}

const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const oneOf = (v, list, d) => (list.some((x) => x.id === v) ? v : d);
const knownIds = (arr) => (Array.isArray(arr) ? [...new Set(arr.filter((id) => SERVICE_BY_ID[id]))] : null);

// La versión 1 no tenía Extras y el catálogo era distinto: se conservan
// los gustos visuales y los favoritos elegidos, y el resto se renueva.
function migrateFromV1(old) {
  const d = defaultSettings();
  const favs = knownIds(old.favorites);
  const untouched = Array.isArray(old.favorites)
    && old.favorites.length === OLD_DEFAULT_FAVORITES.length
    && OLD_DEFAULT_FAVORITES.every((id) => old.favorites.includes(id));
  return {
    ...d,
    theme: old.theme,
    cardSize: old.cardSize,
    showDate: old.showDate,
    bigCursor: old.bigCursor,
    hideIdleCursor: old.hideIdleCursor,
    showReturnHint: old.showReturnHint,
    favorites: untouched || !favs ? d.favorites : favs,
  };
}

export function loadSettings() {
  const d = defaultSettings();
  let raw = readJSON(KEY);
  if (!raw) {
    const old = readJSON(OLD_KEY);
    if (old && typeof old === 'object') raw = migrateFromV1(old);
  }
  if (!raw || typeof raw !== 'object') return d;

  // El orden guardado se respeta; los servicios nuevos se añaden al final.
  const savedOrder = knownIds(raw.order) ?? [];
  const order = [...savedOrder, ...d.order.filter((id) => !savedOrder.includes(id))];
  const hidden = knownIds(raw.hidden) ?? d.hidden;
  const extras = (knownIds(raw.extras) ?? d.extras).filter((id) => !hidden.includes(id));

  return {
    theme: oneOf(raw.theme, THEMES, d.theme),
    cardSize: oneOf(raw.cardSize, CARD_SIZES, d.cardSize),
    showDate: bool(raw.showDate, d.showDate),
    bigCursor: bool(raw.bigCursor, d.bigCursor),
    hideIdleCursor: bool(raw.hideIdleCursor, d.hideIdleCursor),
    showReturnHint: bool(raw.showReturnHint, d.showReturnHint),
    saverDelay: oneOf(raw.saverDelay, SAVER_DELAYS, d.saverDelay),
    order,
    favorites: knownIds(raw.favorites) ?? d.favorites,
    extras,
    hidden,
  };
}

export function saveSettings(settings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
    window.localStorage.removeItem(OLD_KEY);
    storageAvailable = true;
    return true;
  } catch {
    storageAvailable = false;
    return false;
  }
}

export function clearSettings() {
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(OLD_KEY);
  } catch {
    storageAvailable = false;
  }
}

export function isStorageAvailable() {
  return storageAvailable;
}

// Dónde está cada app: 'home' (Inicio), 'extra' (Extras) o 'hidden'.
export function placementOf(settings, id) {
  if (settings.hidden.includes(id)) return 'hidden';
  if (settings.extras.includes(id)) return 'extra';
  return 'home';
}

function favFirst(settings, ids) {
  const favs = ids.filter((id) => settings.favorites.includes(id));
  const rest = ids.filter((id) => !settings.favorites.includes(id));
  return [...favs, ...rest];
}

// Apps principales, con los favoritos primero.
export function mainServiceIds(settings) {
  return favFirst(settings, settings.order.filter((id) => placementOf(settings, id) === 'home'));
}

// Apps en Extras, con los favoritos primero.
export function extraServiceIds(settings) {
  return favFirst(settings, settings.order.filter((id) => placementOf(settings, id) === 'extra'));
}
