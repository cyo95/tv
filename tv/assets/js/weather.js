// El tiempo para el salvapantallas.
//
// Datos de Open-Meteo (gratuito, sin clave y accesible desde el navegador).
// La ciudad se elige en Ajustes. La última previsión se guarda para
// mostrarla aunque no haya conexión.

const CACHE_KEY = 'cyotools-tv:weather:v1';
const REFRESH_MS = 30 * 60 * 1000;
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // más antigua que esto no se muestra

let state = readCache();
let timer = 0;
let currentPlace = null;
const listeners = new Set();

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY));
    return raw && typeof raw.temp === 'number' ? raw : null;
  } catch {
    return null;
  }
}

const samePlace = (a, b) => a && b && Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01;

export function getWeather() {
  if (!state || !samePlace(state.place, currentPlace)) return null;
  if (Date.now() - state.fetchedAt > MAX_AGE_MS) return null;
  return state;
}
export const onWeather = (fn) => listeners.add(fn);

export async function loadWeather(place) {
  currentPlace = place;
  if (!place) return null;
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${place.lat.toFixed(4)}&longitude=${place.lon.toFixed(4)}`
    + '&current=temperature_2m,weather_code,is_day'
    + '&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const c = j.current || {};
    if (typeof c.temperature_2m !== 'number') throw new Error('respuesta incompleta');
    state = {
      place,
      temp: Math.round(c.temperature_2m),
      code: Number(c.weather_code),
      isDay: c.is_day !== 0,
      max: Math.round(j.daily?.temperature_2m_max?.[0]),
      min: Math.round(j.daily?.temperature_2m_min?.[0]),
      fetchedAt: Date.now(),
    };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch { /* sin almacenamiento */ }
  } catch (err) {
    console.info('[CyoTools TV] El tiempo no está disponible:', err.message);
  }
  listeners.forEach((fn) => fn(getWeather()));
  return getWeather();
}

export function startWeather(getPlace) {
  clearInterval(timer);
  loadWeather(getPlace());
  timer = setInterval(() => loadWeather(getPlace()), REFRESH_MS);
}

// Buscar ciudades por nombre (Ajustes).
export async function searchPlaces(query) {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=es&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return (j.results || [])
    .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number')
    .map((r) => ({
      name: String(r.name || '').slice(0, 60),
      region: [r.admin1, r.country].filter(Boolean).join(', ').slice(0, 80),
      lat: r.latitude,
      lon: r.longitude,
    }));
}

// Códigos WMO → texto en español y tipo de icono.
const CODES = [
  [[0], 'Despejado', 'clear'],
  [[1], 'Poco nuboso', 'partly'],
  [[2], 'Nubes y claros', 'partly'],
  [[3], 'Nublado', 'cloudy'],
  [[45, 48], 'Niebla', 'fog'],
  [[51, 53, 55], 'Llovizna', 'rain'],
  [[56, 57], 'Llovizna helada', 'rain'],
  [[61], 'Lluvia débil', 'rain'],
  [[63], 'Lluvia', 'rain'],
  [[65], 'Lluvia fuerte', 'rain'],
  [[66, 67], 'Lluvia helada', 'rain'],
  [[71], 'Nieve débil', 'snow'],
  [[73, 75], 'Nieve', 'snow'],
  [[77], 'Granizo fino', 'snow'],
  [[80, 81], 'Chubascos', 'rain'],
  [[82], 'Chubascos fuertes', 'rain'],
  [[85, 86], 'Chubascos de nieve', 'snow'],
  [[95], 'Tormenta', 'storm'],
  [[96, 99], 'Tormenta con granizo', 'storm'],
];

export function describe(code) {
  const row = CODES.find(([codes]) => codes.includes(code));
  return row ? { text: row[1], kind: row[2] } : { text: '', kind: 'cloudy' };
}

const S = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const SUN = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>';
const MOON = '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>';
const CLOUD = '<path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 11 3.75 3.75 0 0 0 7 18.5z"/>';
const SMALL_SUN = '<circle cx="8" cy="8" r="3"/><path d="M8 2v1.4M2 8h1.4M3.8 3.8l1 1M12.2 3.8l-1 1"/>';
const SMALL_MOON = '<path d="M11 9.8A4.6 4.6 0 0 1 5.2 4a4.6 4.6 0 1 0 5.8 5.8z"/>';

export function iconSVG(kind, isDay = true) {
  const body = {
    clear: isDay ? SUN : MOON,
    partly: (isDay ? SMALL_SUN : SMALL_MOON) + '<path d="M9 19.5h8.5a3.5 3.5 0 0 0 .5-6.96A4.8 4.8 0 0 0 9.1 12.3 3.3 3.3 0 0 0 9 19.5z"/>',
    cloudy: CLOUD,
    fog: '<path d="M7 13.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 6 3.75 3.75 0 0 0 7 13.5z"/><path d="M4 17h16M6 20.5h12"/>',
    rain: '<path d="M7 14.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 7 3.75 3.75 0 0 0 7 14.5z"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>',
    snow: '<path d="M7 14.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 7 3.75 3.75 0 0 0 7 14.5z"/><path d="M8.5 18.5h.01M12 20h.01M15.5 18.5h.01M10.2 21.5h.01M13.8 21.5h.01" stroke-width="2.4"/>',
    storm: '<path d="M7 14.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 7 3.75 3.75 0 0 0 7 14.5z"/><path d="M12.5 15.5l-2 3.5h3l-2 3.5"/>',
  }[kind] || CLOUD;
  return `<svg viewBox="0 0 24 24" ${S} aria-hidden="true">${body}</svg>`;
}
