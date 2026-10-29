// Noticias de España.
//
// Las recoge GitHub Actions cada 30 minutos (scripts/fetch_news.py) y las
// publica junto a la web como news.json. Aquí solo se lee ese archivo:
// ningún navegador puede leer directamente el RSS de otro sitio.

const NEWS_URL = './news.json';
const REFRESH_MS = 15 * 60 * 1000;
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

function normalize(raw) {
  if (!raw || typeof raw.title !== 'string') return null;
  const link = safeUrl(raw.link);
  if (!link) return null;
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
    state = { status: items.length ? 'ready' : 'empty', items, updated: json.updated ? new Date(json.updated) : null };
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

export function startNews() {
  loadNews();
  setInterval(loadNews, REFRESH_MS);
}

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
