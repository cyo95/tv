// Noticias de España.
//
// Las recoge GitHub Actions cada 15 minutos (scripts/fetch_news.py) y las
// publica junto a la web como news.json. Aquí solo se lee ese archivo:
// ningún navegador puede leer directamente el RSS de otro sitio.
// La web lo vuelve a leer cada 5 minutos para que lo nuevo llegue pronto.

const NEWS_URL = './news.json';
let refreshMs = 5 * 60 * 1000;
let lastLoad = 0;
const pageStart = Date.now();
const arrived = new Map(); // id → cuándo la vio esta página por primera vez
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

let state = { status: 'loading', items: [], updated: null };
const listeners = new Set();

function safeUrl(url) {
  try {
    const u = new URL(url, location.href);
    if (u.protocol === 'https:') return u.href;
    if (LOCAL && u.protocol === 'http:') return u.href; // solo para pruebas
  } catch { /* URL no válida */ }
  return null;
}

// Sin deportes. El recolector ya los quita; esto cubre las noticias que
// ya estuvieran publicadas antes de activar el filtro.
const SPORTS_PATH = /\/(deportes?|sports?|futbol|baloncesto|motor|motogp|formula-?1|f1|tenis|ciclismo|golf|atletismo|balonmano|nba|laliga|liga|champions|mundial|eurocopa|real-madrid|fc-barcelona|atletico-de-madrid)(\/|-|\.|$)/i;
const SPORTS_TITLE = /\b(LaLiga|Liga F|Champions|Europa League|Copa del Rey|Supercopa|Eurocopa|Real Madrid|Barça|FC Barcelona|Atlético de Madrid|Fórmula 1|F1|MotoGP|Fernando Alonso|Alcaraz|Nadal|NBA|ACB|Euroliga|futbolista|fútbol|futbol|fichaje|seleccionador)\b/i;

function isSports(title, link) {
  try {
    if (SPORTS_PATH.test(new URL(link).pathname)) return true;
  } catch { /* enlace ya validado */ }
  return SPORTS_TITLE.test(title);
}

function normalize(raw) {
  if (!raw || typeof raw.title !== 'string') return null;
  const link = safeUrl(raw.link);
  if (!link || isSports(raw.title, link)) return null;
  return {
    id: String(raw.id || link),
    title: raw.title.trim(),
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
    link,
    image: raw.image ? safeUrl(raw.image) : null,
    imageWidth: Number(raw.imageWidth) || 0,
    source: typeof raw.source === 'string' ? raw.source : '',
    color: /^#[0-9a-f]{3,8}$/i.test(raw.color || '') ? raw.color : '#203048',
    published: raw.published ? new Date(raw.published) : null,
    broken: false,
  };
}

export async function loadNews() {
  try {
    const res = await fetch(NEWS_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const items = (Array.isArray(json.items) ? json.items : []).map(normalize).filter(Boolean);
    // Las más recientes primero.
    items.sort((a, b) => (b.published?.getTime() || 0) - (a.published?.getTime() || 0));
    const now = Date.now();
    items.forEach((it) => {
      if (!arrived.has(it.id)) arrived.set(it.id, now);
      it.arrivedAt = arrived.get(it.id);
      // Las fotos que ya fallaron siguen marcadas como rotas.
      const prev = state.items.find((p) => p.id === it.id);
      if (prev && prev.broken) it.broken = true;
    });
    state = {
      status: items.length ? 'ready' : 'empty',
      items,
      updated: json.updated ? new Date(json.updated) : null,
    };
    lastLoad = now;
  } catch (err) {
    // Si ya había noticias, se siguen mostrando las anteriores.
    if (!state.items.length) state = { status: 'error', items: [], updated: null };
    console.info('[CyoTools TV] Noticias no disponibles:', err.message);
  }
  listeners.forEach((fn) => fn(state));
  return state;
}

export const getNews = () => state;
export const onNews = (fn) => listeners.add(fn);

// Noticias que se pueden mostrar en el carrusel (las fotos rotas se saltan).
export const showable = () => state.items.filter((i) => !i.broken);

export function startNews(everyMs) {
  if (everyMs) refreshMs = everyMs;
  loadNews();
  setInterval(loadNews, refreshMs);
}

// Vuelve a leer las noticias si la última lectura es de hace más de ms.
export function refreshNewsIfOlderThan(ms) {
  if (Date.now() - lastLoad > ms) loadNews();
}

// Llegó después de abrir la página: es nueva de verdad (última hora).
export const arrivedLater = (item) => (item.arrivedAt || 0) > pageStart + 1000;

// Publicada hace menos de una hora.
export const isRecent = (item) => !!item.published && Date.now() - item.published.getTime() < 60 * 60 * 1000;

// Las noticias publicadas hace más de 2 horas indican que no se están
// actualizando (lo normal es cada 15 minutos).
export const isStale = () => !!state.updated && Date.now() - state.updated.getTime() > 2 * 60 * 60 * 1000;

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

export function timeAgo(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  const min = Math.round((Date.now() - date.getTime()) / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return rtf.format(-min, 'minute');
  const h = Math.round(min / 60);
  if (h < 24) return rtf.format(-h, 'hour');
  return rtf.format(-Math.round(h / 24), 'day');
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// Foto de una noticia. Detrás va la misma foto muy desenfocada y oscura,
// para rellenar la pantalla. Si la foto es grande, ocupa todo; si es
// pequeña, se muestra enmarcada (ampliarla la vería borrosa en la pared).
export function visualHTML(item, { eager = false } = {}) {
  if (!item.image) {
    return `<div class="nv nv--none" style="--src:${esc(item.color)}"></div>`;
  }
  const loading = eager ? 'eager' : 'lazy';
  return `
    <div class="nv" data-fit="${item.imageWidth >= 1000 ? 'cover' : 'pending'}" style="--src:${esc(item.color)}">
      <img class="nv-bg" src="${esc(item.image)}" alt="" referrerpolicy="no-referrer" loading="${loading}" decoding="async">
      <img class="nv-img" src="${esc(item.image)}" alt="" referrerpolicy="no-referrer" loading="${loading}" decoding="async" data-news-id="${esc(item.id)}">
    </div>`;
}

// Ajusta cada foto según su tamaño real y marca las que no cargan.
export function wireVisuals(root, onBroken) {
  root.querySelectorAll('.nv-img').forEach((img) => {
    const box = img.closest('.nv');
    const fit = () => {
      if (box.dataset.fit === 'pending') box.dataset.fit = img.naturalWidth >= 1000 ? 'cover' : 'framed';
    };
    if (img.complete && img.naturalWidth) fit();
    img.addEventListener('load', fit, { once: true });
    img.addEventListener('error', () => {
      box.className = 'nv nv--none';
      box.innerHTML = '';
      const item = state.items.find((i) => i.id === img.dataset.newsId);
      if (item) item.broken = true;
      if (onBroken) onBroken(item);
    }, { once: true });
  });
}

// Precarga la foto de una noticia; resuelve false si no se puede cargar.
export function preload(item) {
  return new Promise((resolve) => {
    if (!item || !item.image) return resolve(true);
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => resolve(true);
    img.onerror = () => { item.broken = true; resolve(false); };
    img.src = item.image;
  });
}
