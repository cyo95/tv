// Salvapantallas de CyoTools TV.
//
// Tras unos minutos sin tocar el touchpad ni el teclado, aparece un
// carrusel de fotografías (paisajes, naturaleza, lugares del mundo) con la
// hora, la fecha, el tiempo y unos pocos recuadros de noticias. Está
// pensado para mirarse, no para usarse: no tiene botones. En cuanto se
// mueve el cursor o se pulsa una tecla, vuelve exactamente a donde estaba,
// y esa primera pulsación no hace nada más.

import { getWallpapers, wallpaperUrl } from './wallpapers.js';
import { showable, timeAgo } from './news.js';
import { getWeather, describe, iconSVG } from './weather.js';

const PHOTO_MS = 25000;   // cada fotografía
const NEWS_MS = 15000;    // cada grupo de noticias
const NEWS_PER_GROUP = 3;
const WAKE_MOVE_PX = 10;  // movimiento mínimo para despertar (evita temblores)
const SWALLOW_MS = 700;   // tras despertar, se ignora lo que venga justo detrás

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function preloadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

export function initScreensaver({
  delayMs, canStart, onOpen, onClose, getPlaceName, photoMs = PHOTO_MS, newsMs = NEWS_MS,
}) {
  const el = document.createElement('div');
  el.className = 'saver';
  el.id = 'saver';
  el.hidden = true;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="saver-stage"></div>
    <div class="saver-vignette"></div>
    <p class="saver-caption"></p>
    <div class="saver-info">
      <time class="saver-time"></time>
      <p class="saver-date"></p>
      <div class="saver-weather"></div>
    </div>
    <div class="saver-news"></div>`;
  document.body.appendChild(el);

  const stage = el.querySelector('.saver-stage');
  const caption = el.querySelector('.saver-caption');
  const newsBox = el.querySelector('.saver-news');
  const weatherBox = el.querySelector('.saver-weather');

  let active = false;
  let idleTimer = 0;
  let photoTimer = 0;
  let newsTimer = 0;
  let clockTimer = 0;
  let photoIndex = -1;
  let newsIndex = 0;
  let moved = 0;
  let swallowUntil = 0;
  let flip = false;

  /* --- Cuenta atrás --- */

  function arm() {
    clearTimeout(idleTimer);
    const ms = delayMs();
    if (ms > 0 && document.visibilityState === 'visible') {
      idleTimer = setTimeout(() => (canStart() ? open() : arm()), ms);
    }
  }

  /* --- Hora, fecha y tiempo --- */

  function tickClock() {
    const now = new Date();
    el.querySelector('.saver-time').textContent = timeFmt.format(now);
    el.querySelector('.saver-date').textContent = capital(dateFmt.format(now));
  }

  function renderWeather() {
    const w = getWeather();
    if (!w) {
      weatherBox.hidden = true;
      return;
    }
    const d = describe(w.code);
    const range = Number.isFinite(w.max) && Number.isFinite(w.min) ? `Máx. ${w.max}° · Mín. ${w.min}°` : '';
    weatherBox.hidden = false;
    weatherBox.innerHTML = `
      <span class="sw-icon">${iconSVG(d.kind, w.isDay)}</span>
      <span class="sw-temp">${w.temp}°</span>
      <span class="sw-text">
        <span class="sw-desc">${esc(d.text)}</span>
        <span class="sw-meta">${esc([getPlaceName(), range].filter(Boolean).join(' · '))}</span>
      </span>`;
  }

  /* --- Fotografías --- */

  async function nextPhoto() {
    const list = getWallpapers();
    if (!list.length) {
      // Sin fotos: fondo en calma con degradados que se mueven despacio.
      stage.classList.add('saver-stage--ambient');
      caption.textContent = '';
      photoTimer = setTimeout(nextPhoto, photoMs);
      return;
    }
    stage.classList.remove('saver-stage--ambient');
    photoIndex = (photoIndex + 1) % list.length;
    const item = list[photoIndex];
    const url = wallpaperUrl(item);
    const ok = await preloadImage(url);
    if (!active) return;
    if (!ok) {
      item.broken = true;
      return nextPhoto();
    }
    flip = !flip;
    const layer = document.createElement('div');
    layer.className = `saver-photo${flip ? ' saver-photo--alt' : ''}`;
    layer.dataset.id = item.id;
    layer.style.setProperty('--photo-ms', `${photoMs + 3000}ms`);
    layer.innerHTML = `<img src="${esc(url)}" alt="" referrerpolicy="no-referrer" decoding="async">`;
    stage.appendChild(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('is-in')));
    const old = [...stage.querySelectorAll('.saver-photo')].slice(0, -1);
    setTimeout(() => old.forEach((n) => n.remove()), 2600);

    caption.classList.remove('is-in');
    setTimeout(() => {
      caption.innerHTML = item.place
        ? `<span class="saver-place">${esc(item.place)}</span>${item.credit ? `<span class="saver-credit">${esc(item.credit)}</span>` : ''}`
        : '';
      caption.classList.add('is-in');
    }, 900);

    const nextItem = list[(photoIndex + 1) % list.length];
    if (nextItem) preloadImage(wallpaperUrl(nextItem));
    photoTimer = setTimeout(nextPhoto, photoMs);
  }

  /* --- Noticias en recuadros --- */

  function newsGroup() {
    const all = showable();
    if (!all.length) return [];
    // Primero las que tienen foto, que lucen más en pequeño.
    const list = [...all.filter((n) => n.image), ...all.filter((n) => !n.image)];
    const group = [];
    for (let i = 0; i < Math.min(NEWS_PER_GROUP, list.length); i += 1) {
      group.push(list[(newsIndex + i) % list.length]);
    }
    newsIndex = (newsIndex + NEWS_PER_GROUP) % list.length;
    return group;
  }

  function cardHTML(n) {
    const when = timeAgo(n.published);
    const thumb = n.image
      ? `<img src="${esc(n.image)}" alt="" referrerpolicy="no-referrer" loading="eager" decoding="async">`
      : '';
    return `
      <article class="sn-card" data-news-id="${esc(n.id)}">
        <div class="sn-thumb" style="--src:${esc(n.color)}">${thumb}</div>
        <div class="sn-body">
          <p class="sn-meta"><span class="sn-source">${esc(n.source)}</span>${when ? `<span>${esc(when)}</span>` : ''}</p>
          <p class="sn-title">${esc(n.title)}</p>
        </div>
      </article>`;
  }

  function nextNews() {
    const group = newsGroup();
    if (!group.length) {
      newsBox.hidden = true;
      newsTimer = setTimeout(nextNews, newsMs);
      return;
    }
    newsBox.hidden = false;
    newsBox.classList.remove('is-in');
    setTimeout(() => {
      if (!active) return;
      newsBox.innerHTML = group.map(cardHTML).join('');
      newsBox.querySelectorAll('.sn-thumb img').forEach((img) => {
        img.addEventListener('error', () => img.remove(), { once: true });
      });
      newsBox.classList.add('is-in');
    }, newsBox.innerHTML ? 600 : 0);
    newsTimer = setTimeout(nextNews, newsMs);
  }

  /* --- Abrir y cerrar --- */

  function open() {
    if (active) return;
    active = true;
    moved = 0;
    el.hidden = false;
    tickClock();
    clockTimer = setInterval(tickClock, 10000);
    renderWeather();
    if (onOpen) onOpen();
    nextPhoto();
    nextNews();
  }

  function close(byPress = false) {
    if (!active) return;
    active = false;
    clearTimeout(photoTimer);
    clearTimeout(newsTimer);
    clearInterval(clockTimer);
    el.hidden = true;
    stage.querySelectorAll('.saver-photo').forEach((n) => n.remove());
    newsBox.innerHTML = '';
    caption.innerHTML = '';
    // Tras despertar se ignoran un instante los clics y teclas: el toque que
    // despierta la pantalla no debe abrir lo que haya debajo del cursor.
    swallowUntil = Date.now() + (byPress ? SWALLOW_MS : SWALLOW_MS / 2 + 200);
    if (onClose) onClose();
    arm();
  }

  /* --- Despertar --- */

  const swallow = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  window.addEventListener('pointermove', (e) => {
    if (active) {
      moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (moved > WAKE_MOVE_PX) close();
      return;
    }
    if (e.movementX || e.movementY) arm();
  }, { capture: true, passive: true });

  ['pointerdown', 'mousedown', 'click', 'keydown', 'keyup', 'wheel', 'contextmenu'].forEach((type) => {
    window.addEventListener(type, (e) => {
      if (active) {
        swallow(e);
        if (type !== 'keyup') close(type !== 'wheel');
        return;
      }
      if (Date.now() < swallowUntil && type !== 'wheel') {
        swallow(e);
        return;
      }
      arm();
    }, { capture: true, passive: false });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(idleTimer);
      if (active) close();
    } else {
      arm();
    }
  });

  arm();
  return { open, close, arm, isActive: () => active, refreshWeather: () => active && renderWeather() };
}
