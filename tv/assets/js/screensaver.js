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
import { qrSVG, shortLink } from './qr.js';

const PHOTO_MS = 25000;   // cada fotografía
const READ_MS = 15000;    // cada noticia: tiempo para leerla…
const QR_MS = 5000;       // …y después, el código QR
const COUNTDOWN = 5;      // «¿Te interesa? Código QR en 5, 4, 3, 2, 1»
const HINT_EVERY_MS = 45000; // el aviso «pulsa cualquier tecla» aparece de vez en cuando…
const HINT_SHOW_MS = 6000;   // …y se va solo
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
  delayMs, canStart, onOpen, onClose, getPlaceName, photoMs = PHOTO_MS,
  readMs = READ_MS, qrMs = QR_MS, hintEveryMs = HINT_EVERY_MS,
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
    <div class="saver-news"></div>
    <p class="saver-hint"><span class="saver-hint-key">Pulsa cualquier tecla</span> o mueve el cursor para volver</p>`;
  document.body.appendChild(el);

  const stage = el.querySelector('.saver-stage');
  const caption = el.querySelector('.saver-caption');
  const newsBox = el.querySelector('.saver-news');
  const hint = el.querySelector('.saver-hint');
  const weatherBox = el.querySelector('.saver-weather');

  let active = false;
  let idleTimer = 0;
  let photoTimer = 0;
  let newsTimers = [];
  let hintTimers = [];
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

  /* --- Noticias, de una en una ---
     Cada noticia: 15 s para leerla (foto, medio, titular y entradilla).
     En los últimos 5 s de lectura, un aviso discreto cuenta atrás:
     «¿Te interesa? Código QR en 5…1». Después, durante 5 s, la entradilla
     deja sitio al código QR junto al titular, con la instrucción para
     leerla completa en el móvil. Luego pasa a la siguiente. */

  const later = (fn, ms) => newsTimers.push(setTimeout(fn, ms));
  const clearNews = () => { newsTimers.forEach(clearTimeout); newsTimers = []; };

  function orderedNews() {
    const all = showable();
    return [...all.filter((n) => n.image), ...all.filter((n) => !n.image)];
  }

  function panelHTML(n) {
    const when = timeAgo(n.published);
    const photo = n.image
      ? `<img src="${esc(n.image)}" alt="" referrerpolicy="no-referrer" decoding="async">`
      : `<span class="np-photo-source">${esc(n.source)}</span>`;
    let qr = '';
    try { qr = qrSVG(shortLink(n.link)); } catch { /* dirección demasiado larga: sin QR */ }
    return `
      <article class="np" data-phase="read" data-news-id="${esc(n.id)}" style="--src:${esc(n.color)}">
        <div class="np-photo">${photo}</div>
        <div class="np-body">
          <p class="np-meta">
            <span class="np-source">${esc(n.source)}</span>${when ? `<span class="np-when">${esc(when)}</span>` : ''}
            <span class="np-countdown" aria-hidden="true">¿Te interesa? Código QR en <b>${COUNTDOWN}</b></span>
          </p>
          <div class="np-layers">
            <div class="np-layer np-layer--read">
              <h2 class="np-title">${esc(n.title)}</h2>
              ${n.summary ? `<p class="np-summary">${esc(n.summary)}</p>` : ''}
            </div>
            ${qr ? `
            <div class="np-layer np-layer--qr">
              <div class="np-qr-text">
                <h2 class="np-title">${esc(n.title)}</h2>
                <p class="np-scan">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>
                  Escanea el código con el móvil para leer la noticia completa
                </p>
              </div>
              <div class="np-qr">${qr}</div>
            </div>` : ''}
          </div>
        </div>
        <div class="np-progress"><span></span></div>
      </article>`;
  }

  function nextNews() {
    clearNews();
    const list = orderedNews();
    if (!list.length) {
      newsBox.hidden = true;
      later(nextNews, 5000);
      return;
    }
    newsBox.hidden = false;
    const item = list[newsIndex % list.length];
    newsIndex = (newsIndex + 1) % list.length;
    const hasOld = !!newsBox.firstElementChild;
    newsBox.classList.remove('is-in');

    later(() => {
      if (!active) return;
      newsBox.innerHTML = panelHTML(item);
      const np = newsBox.firstElementChild;
      np.querySelector('.np-photo img')?.addEventListener('error', (e) => {
        e.target.replaceWith(Object.assign(document.createElement('span'), { className: 'np-photo-source', textContent: item.source }));
      }, { once: true });
      const hasQr = !!np.querySelector('.np-qr');
      const total = readMs + (hasQr ? qrMs : 0);
      np.querySelector('.np-progress span').style.animation = `np-progress ${total}ms linear forwards`;
      requestAnimationFrame(() => newsBox.classList.add('is-in'));

      if (hasQr) {
        const count = np.querySelector('.np-countdown');
        const num = count.querySelector('b');
        for (let i = 0; i < COUNTDOWN; i += 1) {
          later(() => {
            num.textContent = String(COUNTDOWN - i);
            count.classList.add('is-on');
          }, readMs - (COUNTDOWN - i) * 1000);
        }
        later(() => {
          count.classList.remove('is-on');
          np.dataset.phase = 'qr';
        }, readMs);
      }
      later(nextNews, total);
    }, hasOld ? 700 : 0);
  }

  /* --- Aviso «pulsa cualquier tecla», de vez en cuando --- */

  function scheduleHint(first) {
    hintTimers.push(setTimeout(() => {
      if (!active) return;
      hint.classList.add('is-on');
      hintTimers.push(setTimeout(() => hint.classList.remove('is-on'), HINT_SHOW_MS));
      scheduleHint(false);
    }, first ? Math.min(12000, hintEveryMs) : hintEveryMs));
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
    newsBox.innerHTML = '';
    nextNews();
    scheduleHint(true);
  }

  function close(byPress = false) {
    if (!active) return;
    active = false;
    clearTimeout(photoTimer);
    clearNews();
    hintTimers.forEach(clearTimeout);
    hintTimers = [];
    hint.classList.remove('is-on');
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
