// Botón de Inicio en la esquina superior izquierda.
//
// Las esquinas de la pantalla son el sitio más fácil de alcanzar con un
// touchpad: el cursor se detiene solo en el borde, así que basta con
// «lanzarlo» hacia arriba a la izquierda. El botón aparece al llegar ahí
// y desaparece al alejarse; no tapa nada mientras se ve una película.

(() => {
  if (window.top !== window) return; // solo en la página principal, no en iframes
  if (window.__cyotoolsTvOverlay) return;
  window.__cyotoolsTvOverlay = true;

  // ¿Es el propio lanzador? Entonces no se muestra el botón: se avisa a la
  // página de que la extensión está activa y se recuerda su dirección.
  if (document.querySelector('meta[name="cyotools-tv"][content="launcher"]')) {
    if (cyoIsTrustedHome(location.href)) {
      document.documentElement.dataset.cyoExtension = 'on';
      chrome.storage.local.set({ homeUrl: new URL('./', location.href).href });
    }
    return;
  }

  const ZONE = 56;        // px desde la esquina que activan el botón
  const HIDE_DELAY = 1200; // ms tras alejarse el cursor

  const host = document.createElement('cyotools-tv-home');
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;z-index:2147483647;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .home {
        all: initial;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 14px;
        height: 84px;
        padding: 0 34px 0 26px;
        border-radius: 0 0 26px 0;
        background: rgba(8, 12, 20, 0.94);
        color: #ffffff;
        font: 700 28px/1 'Segoe UI', system-ui, Arial, sans-serif;
        box-shadow: inset -3px -3px 0 #ffffff, 0 12px 40px rgba(0, 0, 0, 0.6);
        cursor: pointer;
        pointer-events: none;
        opacity: 0;
        transform: translate(-24px, -24px);
        transition: opacity 0.14s ease, transform 0.14s ease;
      }
      .home.show { opacity: 1; transform: none; pointer-events: auto; }
      .home:hover, .home:focus-visible { background: #ffffff; color: #080c14; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6); }
      .home svg { width: 34px; height: 34px; flex: none; }
      @media (prefers-reduced-motion: reduce) { .home { transition: none; } }
    </style>
    <button class="home" type="button" aria-label="Volver a CyoTools TV">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>
      </svg>
      <span>Inicio</span>
    </button>`;
  const btn = shadow.querySelector('.home');

  let visible = false;
  let hideTimer = 0;

  function show(autoHideMs) {
    clearTimeout(hideTimer);
    if (!visible) {
      visible = true;
      btn.classList.add('show');
    }
    if (autoHideMs) hideTimer = setTimeout(hide, autoHideMs);
  }
  function hide() {
    clearTimeout(hideTimer);
    visible = false;
    btn.classList.remove('show');
  }
  function overButton(x, y) {
    const r = btn.getBoundingClientRect();
    return x <= r.right + 24 && y <= r.bottom + 24;
  }

  document.addEventListener('mousemove', (e) => {
    if (e.clientX <= ZONE && e.clientY <= ZONE) {
      show();
    } else if (visible && !overButton(e.clientX, e.clientY)) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, HIDE_DELAY);
    } else if (visible) {
      clearTimeout(hideTimer);
    }
  }, { capture: true, passive: true });

  document.addEventListener('mouseleave', () => {
    if (visible) hideTimer = setTimeout(hide, HIDE_DELAY);
  });

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.querySelector('span').textContent = 'Volviendo…';
    try {
      chrome.runtime.sendMessage({ type: 'cyotools-tv:go-home' });
    } catch {
      // Si la extensión se ha recargado, el canal se pierde: navegación directa.
      cyoGetHome().then((url) => { window.location.href = url; });
    }
  });

  // Durante la reproducción a pantalla completa, solo se ve el elemento que
  // está en pantalla completa. Si es un contenedor (lo habitual en los
  // reproductores web), el botón se mueve dentro para seguir disponible.
  // Si es directamente un <video> o un <iframe>, no es posible: hay que
  // pulsar Esc primero.
  function placeHost() {
    const fs = document.fullscreenElement;
    const parent = fs && !(fs instanceof HTMLVideoElement) && !(fs instanceof HTMLIFrameElement)
      ? fs
      : document.documentElement;
    if (host.parentNode !== parent) parent.appendChild(host);
  }
  document.addEventListener('fullscreenchange', placeHost);

  placeHost();
  // Recordatorio breve al entrar en una app.
  show(2500);
})();
