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

// Tiempo sin usar el equipo antes de mostrar el salvapantallas.
export const SAVER_DELAYS = [
  { id: '10s', label: '10 s', ms: 10000 },
  { id: '1', label: '1 min', ms: 60000 },
  { id: '3', label: '3 min', ms: 180000 },
  { id: '10', label: '10 min', ms: 600000 },
  { id: 'off', label: 'Nunca', ms: 0 },
];

// Revisión de los ajustes. Los cambios de valores por defecto solo se
// aplican a ajustes guardados con una revisión anterior, para no pisar
// nunca algo que se haya elegido a mano después.
const REV = 3;

// Ciudad para el tiempo del salvapantallas (se cambia en Ajustes).
export const DEFAULT_PLACE = { name: 'Barcelona', region: 'Cataluña, España', lat: 41.3874, lon: 2.1686 };
// Ciudad por defecto de la versión anterior: si sigue guardada, es que no se
// eligió a mano, y se cambia a la nueva.
const OLD_DEFAULT_PLACE = { lat: 40.4165, lon: -3.7026 };

function validPlace(p) {
  if (!p || typeof p.name !== 'string' || !p.name.trim()) return null;
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { name: p.name.slice(0, 60), region: typeof p.region === 'string' ? p.region.slice(0, 80) : '', lat, lon };
}

function placeOrDefault(saved, fallback, rev) {
  const p = validPlace(saved);
  if (!p) return fallback;
  if (rev >= 2) return p;
  const wasOldDefault = Math.abs(p.lat - OLD_DEFAULT_PLACE.lat) < 0.001 && Math.abs(p.lon - OLD_DEFAULT_PLACE.lon) < 0.001;
  return wasOldDefault ? fallback : p;
}

export function defaultSettings() {
  return {
    theme: 'medianoche',
    cardSize: 'grande',
    showDate: true,
    bigCursor: true,
    hideIdleCursor: true,
    showReturnHint: true,
    rev: REV,
    saverDelay: '10s',
    weatherPlace: { ...DEFAULT_PLACE },
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

  const rev = Number.isInteger(raw.rev) ? raw.rev : 1;

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
    rev: REV,
    // Antes, 3 minutos era el valor por defecto: pasa a los nuevos 10 s.
    saverDelay: (rev < 3 && raw.saverDelay === '3') ? d.saverDelay : oneOf(raw.saverDelay, SAVER_DELAYS, d.saverDelay),
    weatherPlace: placeOrDefault(raw.weatherPlace, d.weatherPlace, rev),
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
