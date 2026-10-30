// Fondos de pantalla para el salvapantallas.
//
// GitHub Actions publica wallpapers.json (scripts/fetch_wallpapers.py) con
// fotografías de paisajes, naturaleza y lugares del mundo. Aquí se leen,
// se barajan y se elige el tamaño adecuado para la pantalla.

const URL_JSON = './wallpapers.json';
const REFRESH_MS = 6 * 60 * 60 * 1000;
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

let items = [];

function safe(url) {
  try {
    const u = new URL(url, location.href);
    if (u.protocol === 'https:' || (LOCAL && u.protocol === 'http:')) return u.href;
  } catch { /* no válida */ }
  return null;
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function loadWallpapers() {
  try {
    const res = await fetch(URL_JSON, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const list = (Array.isArray(json.items) ? json.items : []).map((it) => {
      const image = safe(it && it.image);
      if (!image) return null;
      return {
        id: String(it.id || image),
        image,
        imageUhd: it.imageUhd ? safe(it.imageUhd) : null,
        place: typeof it.place === 'string' ? it.place : '',
        credit: typeof it.credit === 'string' ? it.credit : '',
        broken: false,
      };
    }).filter(Boolean);
    if (list.length) items = shuffle(list);
  } catch (err) {
    console.info('[CyoTools TV] Fondos no disponibles:', err.message);
  }
  return items;
}

export const getWallpapers = () => items.filter((i) => !i.broken);

// 4K solo si la pantalla lo aprovecha; si no, 1920 × 1080 (carga antes).
export function wallpaperUrl(item) {
  const px = Math.max(window.screen?.width || 0, window.innerWidth) * (window.devicePixelRatio || 1);
  return px > 2200 && item.imageUhd ? item.imageUhd : item.image;
}

export function startWallpapers() {
  loadWallpapers();
  setInterval(loadWallpapers, REFRESH_MS);
}
