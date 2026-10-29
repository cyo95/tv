// Preferencias guardadas en localStorage. Sin cuentas ni servidores.
// Todo lo que se lee se valida: si el dato guardado está dañado o es de
// otra versión, se recupera lo que sea válido y el resto vuelve al valor
// por defecto.

import { DEFAULT_ORDER, DEFAULT_FAVORITES, DEFAULT_HIDDEN, SERVICE_BY_ID } from './services.js';

const KEY = 'cyotools-tv:settings:v1';

export const THEMES = [
  { id: 'medianoche', label: 'Medianoche', hint: 'Negro azulado' },
  { id: 'grafito', label: 'Grafito', hint: 'Gris neutro' },
  { id: 'negro', label: 'Negro total', hint: 'Máximo contraste' },
];

export const CARD_SIZES = [
  { id: 'grande', label: 'Grandes', hint: '8 por pantalla' },
  { id: 'normal', label: 'Normales', hint: '10 por pantalla' },
];

export function defaultSettings() {
  return {
    theme: 'medianoche',
    cardSize: 'grande',
    showClock: true,
    showDate: true,
    bigCursor: true,
    hideIdleCursor: true,
    showReturnHint: true,
    order: [...DEFAULT_ORDER],
    favorites: [...DEFAULT_FAVORITES],
    hidden: [...DEFAULT_HIDDEN],
  };
}

let storageAvailable = true;

function readRaw() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    storageAvailable = false;
    return null;
  }
}

const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const oneOf = (v, list, d) => (list.some((x) => x.id === v) ? v : d);
const knownIds = (arr) => (Array.isArray(arr) ? [...new Set(arr.filter((id) => SERVICE_BY_ID[id]))] : null);

export function loadSettings() {
  const d = defaultSettings();
  const raw = readRaw();
  if (!raw || typeof raw !== 'object') return d;

  // El orden guardado se respeta; los servicios nuevos que no estaban en él
  // se añaden al final para que nunca desaparezcan sin querer.
  const savedOrder = knownIds(raw.order) ?? [];
  const order = [...savedOrder, ...d.order.filter((id) => !savedOrder.includes(id))];

  return {
    theme: oneOf(raw.theme, THEMES, d.theme),
    cardSize: oneOf(raw.cardSize, CARD_SIZES, d.cardSize),
    showClock: bool(raw.showClock, d.showClock),
    showDate: bool(raw.showDate, d.showDate),
    bigCursor: bool(raw.bigCursor, d.bigCursor),
    hideIdleCursor: bool(raw.hideIdleCursor, d.hideIdleCursor),
    showReturnHint: bool(raw.showReturnHint, d.showReturnHint),
    order,
    favorites: knownIds(raw.favorites) ?? d.favorites,
    hidden: knownIds(raw.hidden) ?? d.hidden,
  };
}

export function saveSettings(settings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
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
  } catch {
    storageAvailable = false;
  }
}

export function isStorageAvailable() {
  return storageAvailable;
}

// Orden efectivo: favoritos primero (en su orden relativo), luego el resto.
// Los ocultos no aparecen.
export function visibleServiceIds(settings) {
  const visible = settings.order.filter((id) => !settings.hidden.includes(id));
  const favs = visible.filter((id) => settings.favorites.includes(id));
  const rest = visible.filter((id) => !settings.favorites.includes(id));
  return [...favs, ...rest];
}
