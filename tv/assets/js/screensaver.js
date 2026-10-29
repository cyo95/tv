// Carrusel de noticias cuando no se usa el equipo.
//
// Tras unos minutos sin tocar el touchpad ni el teclado, CyoTools TV pasa
// noticias a pantalla completa, con su foto. En cuanto se mueve el cursor o
// se pulsa una tecla, vuelve exactamente a donde estaba. Esa primera
// pulsación no hace nada más: solo despierta la pantalla.

import { showable, getNews, timeAgo, visualHTML, wireVisuals, preload } from './news.js';

const SLIDE_MS = 12000;
const WAKE_MOVE_PX = 10;      // movimiento mínimo para despertar (evita temblores)
const SWALLOW_MS = 700;       // tras despertar, se ignoran clics y teclas sueltas

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
const dateFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

export function initScreensaver({ delayMs, canStart, onOpen, onClose, slideMs = SLIDE_MS }) {
  const el = document.createElement('div');
  el.className = 'saver';
  el.id = 'saver';
  el.hidden = true;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="saver-stage"></div>
    <div class="saver-shade"></div>
    <div class="saver-top">
      <span class="saver-label">Noticias</span>
      <span class="saver-clock"><time class="saver-time"></time><span class="saver-date"></span></span>
    </div>
    <div class="saver-text"></div>
    <div class="saver-progress" aria-hidden="true"><span></span></div>
    <p class="saver-hint">Mueve el cursor o pulsa una tecla para volver</p>`;
  document.body.appendChild(el);

  const stage = el.querySelector('.saver-stage');
  const text = el.querySelector('.saver-text');
  const bar = el.querySelector('.saver-progress span');

  let active = false;
  let idleTimer = 0;
  let slideTimer = 0;
  let clockTimer = 0;
  let index = -1;
  let moved = 0;
  let swallowUntil = 0;
  let flip = false;

  function arm() {
    clearTimeout(idleTimer);
    const ms = delayMs();
    if (ms > 0 && document.visibilityState === 'visible') {
      idleTimer = setTimeout(() => (canStart() ? open() : arm()), ms);
    }
  }

  function tickClock() {
    const now = new Date();
    el.querySelector('.saver-time').textContent = timeFmt.format(now);
    el.querySelector('.saver-date').textContent = dateFmt.format(now);
  }

  function clockOnly() {
    stage.innerHTML = '';
    el.classList.add('saver--clock');
    text.innerHTML = `
      <p class="saver-big-time">${timeFmt.format(new Date())}</p>
      <p class="saver-big-date">${dateFmt.format(new Date())}</p>
      <p class="saver-meta">${getNews().status === 'loading' ? 'Cargando noticias…' : 'No hay noticias disponibles ahora mismo'}</p>`;
    bar.style.animation = 'none';
  }

  async function next() {
    const items = showable();
    if (!items.length) {
      clockOnly();
      slideTimer = setTimeout(next, slideMs);
      return;
    }
    el.classList.remove('saver--clock');
    index = (index + 1) % items.length;
    const item = items[index];
    const ok = await preload(item);
    if (!active) return;
    if (!ok) return next(); // foto rota: siguiente

    // Dos capas que se cruzan suavemente.
    flip = !flip;
    const layer = document.createElement('div');
    layer.className = `saver-slide${flip ? ' saver-slide--alt' : ''}`;
    layer.dataset.newsId = item.id;
    layer.innerHTML = visualHTML(item, { eager: true });
    stage.appendChild(layer);
    wireVisuals(layer);
    requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('is-in')));
    const old = [...stage.children].slice(0, -1);
    setTimeout(() => old.forEach((n) => n.remove()), 1400);

    const when = timeAgo(item.published);
    text.classList.remove('is-in');
    setTimeout(() => {
      text.dataset.newsId = item.id;
      text.innerHTML = `
        <p class="saver-meta"><span class="saver-source" style="--src:${esc(item.color)}">${esc(item.source)}</span>${when ? `<span>${esc(when)}</span>` : ''}</p>
        <h2 class="saver-title">${esc(item.title)}</h2>
        ${item.summary ? `<p class="saver-summary">${esc(item.summary)}</p>` : ''}`;
      text.classList.add('is-in');
    }, 350);

    bar.style.animation = 'none';
    void bar.offsetWidth;
    bar.style.animation = `saver-progress ${slideMs}ms linear forwards`;

    preload(items[(index + 1) % items.length]);
    slideTimer = setTimeout(next, slideMs);
  }

  function open() {
    if (active) return;
    active = true;
    moved = 0;
    el.hidden = false;
    el.classList.remove('saver--hint-off');
    setTimeout(() => el.classList.add('saver--hint-off'), 6000);
    tickClock();
    clockTimer = setInterval(tickClock, 15000);
    if (onOpen) onOpen();
    next();
  }

  // byPress: se cerró con un clic o una tecla. Entonces se ignora durante
  // un instante lo que venga detrás (el clic o la tecla al soltarse).
  function close(byPress = false) {
    if (!active) return;
    active = false;
    clearTimeout(slideTimer);
    clearInterval(clockTimer);
    el.hidden = true;
    stage.innerHTML = '';
    text.innerHTML = '';
    swallowUntil = byPress ? Date.now() + SWALLOW_MS : 0;
    if (onClose) onClose();
    arm();
  }

  // Cualquier actividad reinicia la cuenta atrás; si el carrusel está
  // visible, lo cierra y la pulsación no llega a la interfaz.
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
  return { open, close, arm, isActive: () => active };
}
